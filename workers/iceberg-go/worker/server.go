package worker

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"runtime/debug"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

const protocolVersion = 1

type JobSubmission struct {
	ProtocolVersion int              `json:"protocolVersion"`
	RequestID       string           `json:"requestId"`
	Operation       string           `json:"operation"`
	CatalogID       string           `json:"catalogId"`
	Table           *TableIdentifier `json:"table,omitempty"`
	Options         *SampleOptions   `json:"options,omitempty"`
}

type TableIdentifier struct {
	Namespace []string `json:"namespace"`
	Name      string   `json:"name"`
}

type SampleOptions struct {
	RowLimit int `json:"rowLimit"`
}

type JobAccepted struct {
	ProtocolVersion int    `json:"protocolVersion"`
	JobID           string `json:"jobId"`
	Status          string `json:"status"`
}

type JobError struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	Retryable bool   `json:"retryable"`
}

type JobStatus struct {
	ProtocolVersion int            `json:"protocolVersion"`
	JobID           string         `json:"jobId"`
	Status          string         `json:"status"`
	Progress        float64        `json:"progress,omitempty"`
	Result          map[string]any `json:"result,omitempty"`
	Error           *JobError      `json:"error,omitempty"`
}

type JobExecutor func(context.Context, CatalogProfile, JobSubmission) (map[string]any, error)

type storedJob struct {
	status  JobStatus
	payload string
}

type Server struct {
	catalogs      map[string]CatalogProfile
	workerToken   string
	workerVersion string
	executor      JobExecutor
	mu            sync.RWMutex
	jobs          map[string]*storedJob
	requests      map[string]string
}

func NewServer(catalogs map[string]CatalogProfile, workerToken, workerVersion string, executor JobExecutor) *Server {
	if workerVersion == "" {
		workerVersion = "0.1.0"
	}
	if executor == nil {
		executor = ExecuteIcebergJob
	}
	return &Server{
		catalogs:      catalogs,
		workerToken:   workerToken,
		workerVersion: workerVersion,
		executor:      executor,
		jobs:          make(map[string]*storedJob),
		requests:      make(map[string]string),
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/health", s.health)
	mux.HandleFunc("GET /v1/capabilities", s.capabilities)
	mux.HandleFunc("POST /v1/jobs", s.submitJob)
	mux.HandleFunc("GET /v1/jobs/{jobId}", s.getJob)
	return s.authorize(mux)
}

func (s *Server) authorize(next http.Handler) http.Handler {
	if s.workerToken == "" {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		provided := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if subtle.ConstantTimeCompare([]byte(provided), []byte(s.workerToken)) != 1 {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized."})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"protocolVersion": protocolVersion,
		"status":          "ready",
		"runtime": map[string]string{
			"language":      "go",
			"version":       s.workerVersion,
			"engine":        "apache/iceberg-go",
			"engineVersion": icebergGoVersion(),
		},
	})
}

func icebergGoVersion() string {
	build, ok := debug.ReadBuildInfo()
	if !ok {
		return "unknown"
	}
	for _, dependency := range build.Deps {
		if dependency.Path == "github.com/apache/iceberg-go" {
			return dependency.Version
		}
	}
	return "unknown"
}

func (s *Server) capabilities(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"protocolVersion": protocolVersion,
		"operations":      []string{"catalog.validate", "table.inspect", "table.sample"},
	})
}

func (s *Server) submitJob(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var submission JobSubmission
	if err := decoder.Decode(&submission); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid job request."})
		return
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid job request."})
		return
	}
	if !supportedOperation(submission.Operation) {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": "Operation is not supported."})
		return
	}
	if err := validateSubmission(submission); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid job request."})
		return
	}
	encoded, _ := json.Marshal(submission)
	payload := string(encoded)
	s.mu.Lock()
	if existingID, exists := s.requests[submission.RequestID]; exists {
		existing := s.jobs[existingID]
		s.mu.Unlock()
		if existing.payload != payload {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "requestId was already used with a different payload."})
			return
		}
		writeJSON(w, http.StatusAccepted, JobAccepted{
			ProtocolVersion: protocolVersion,
			JobID:           existingID,
			Status:          "running",
		})
		return
	}
	if _, ok := s.catalogs[submission.CatalogID]; !ok {
		s.mu.Unlock()
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": "Catalog is not configured on this worker."})
		return
	}

	jobID := uuid.NewString()
	job := &storedJob{
		payload: payload,
		status: JobStatus{
			ProtocolVersion: protocolVersion,
			JobID:           jobID,
			Status:          "queued",
			Progress:        0,
		},
	}
	s.jobs[jobID] = job
	s.requests[submission.RequestID] = jobID
	s.mu.Unlock()

	go s.runJob(jobID, submission)
	writeJSON(w, http.StatusAccepted, JobAccepted{
		ProtocolVersion: protocolVersion,
		JobID:           jobID,
		Status:          "queued",
	})
}

func supportedOperation(operation string) bool {
	switch operation {
	case "catalog.validate", "table.inspect", "table.sample":
		return true
	default:
		return false
	}
}

func validateSubmission(submission JobSubmission) error {
	if submission.ProtocolVersion != protocolVersion || uuid.Validate(submission.RequestID) != nil ||
		!catalogIDPattern.MatchString(submission.CatalogID) {
		return errors.New("invalid job header")
	}
	switch submission.Operation {
	case "catalog.validate":
		if submission.Table != nil || submission.Options != nil {
			return errors.New("catalog validation does not accept table or options")
		}
	case "table.inspect":
		if !validTable(submission.Table) || submission.Options != nil {
			return errors.New("invalid table inspection request")
		}
	case "table.sample":
		if !validTable(submission.Table) || submission.Options == nil || submission.Options.RowLimit < 1 || submission.Options.RowLimit > 100 {
			return errors.New("invalid table sample request")
		}
	default:
		return errors.New("unsupported operation")
	}
	return nil
}

func validTable(identifier *TableIdentifier) bool {
	if identifier == nil || identifier.Name == "" || len(identifier.Name) > 255 || len(identifier.Namespace) == 0 || len(identifier.Namespace) > 50 {
		return false
	}
	for _, part := range identifier.Namespace {
		if part == "" {
			return false
		}
	}
	return true
}

func (s *Server) runJob(jobID string, submission JobSubmission) {
	s.mu.Lock()
	job := s.jobs[jobID]
	job.status.Status = "running"
	job.status.Progress = 0.1
	s.mu.Unlock()

	profile := s.catalogs[submission.CatalogID]
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	result, err := s.executor(ctx, profile, submission)

	s.mu.Lock()
	defer s.mu.Unlock()
	job = s.jobs[jobID]
	if err != nil {
		log.Printf("worker job failed: operation=%s catalogId=%s kind=%s", submission.Operation, submission.CatalogID, safeErrorKind(err))
		job.status.Status = "failed"
		job.status.Progress = 1
		job.status.Error = &JobError{
			Code:      "ICEBERG_OPERATION_FAILED",
			Message:   "The Iceberg operation failed. Check the catalog and worker logs.",
			Retryable: errors.Is(err, context.DeadlineExceeded) || isNetworkError(err),
		}
		return
	}
	job.status.Status = "succeeded"
	job.status.Progress = 1
	job.status.Result = result
}

func safeErrorKind(err error) string {
	if errors.Is(err, context.DeadlineExceeded) {
		return "timeout"
	}
	if isNetworkError(err) {
		return "network"
	}
	return "operation"
}

func isNetworkError(err error) bool {
	var networkError net.Error
	return errors.As(err, &networkError)
}

func (s *Server) getJob(w http.ResponseWriter, r *http.Request) {
	jobID := r.PathValue("jobId")
	s.mu.RLock()
	job, ok := s.jobs[jobID]
	if ok {
		status := job.status
		s.mu.RUnlock()
		writeJSON(w, http.StatusOK, status)
		return
	}
	s.mu.RUnlock()
	writeJSON(w, http.StatusNotFound, map[string]string{"error": "Job not found."})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		log.Printf("failed to encode worker response: %T", err)
	}
}
