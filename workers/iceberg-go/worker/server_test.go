package worker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestHealthAndCapabilities(t *testing.T) {
	server := NewServer(testCatalogs(), "", "test", func(context.Context, CatalogProfile, JobSubmission) (map[string]any, error) {
		return nil, nil
	})
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/health", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("health status = %d, want 200", response.Code)
	}
	var health struct {
		ProtocolVersion int    `json:"protocolVersion"`
		Status          string `json:"status"`
		Runtime         struct {
			Language      string `json:"language"`
			Engine        string `json:"engine"`
			EngineVersion string `json:"engineVersion"`
		} `json:"runtime"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &health); err != nil {
		t.Fatal(err)
	}
	if health.ProtocolVersion != 1 || health.Status != "ready" || health.Runtime.Language != "go" || health.Runtime.Engine != "apache/iceberg-go" || health.Runtime.EngineVersion == "" {
		t.Fatalf("unexpected health response: %#v", health)
	}

	response = httptest.NewRecorder()
	server.Handler().ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/capabilities", nil))
	var capabilities struct {
		ProtocolVersion int      `json:"protocolVersion"`
		Operations      []string `json:"operations"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &capabilities); err != nil {
		t.Fatal(err)
	}
	if response.Code != http.StatusOK || capabilities.ProtocolVersion != 1 || strings.Join(capabilities.Operations, ",") != "catalog.validate,table.inspect,table.sample" {
		t.Fatalf("unexpected capabilities response: status=%d body=%s", response.Code, response.Body)
	}
}

func TestLearningLabOperationsRequireExplicitLocalProfile(t *testing.T) {
	t.Run("keeps tutorial writes hidden and rejects them by default", func(t *testing.T) {
		server := httptest.NewServer(NewServer(testCatalogs(), "", "test", nil).Handler())
		defer server.Close()

		response, err := http.Get(server.URL + "/v1/capabilities")
		if err != nil {
			t.Fatal(err)
		}
		var capabilities struct {
			Operations []string `json:"operations"`
		}
		if err := json.NewDecoder(response.Body).Decode(&capabilities); err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if strings.Join(capabilities.Operations, ",") != "catalog.validate,table.inspect,table.sample" {
			t.Fatalf("default capabilities = %v", capabilities.Operations)
		}

		submission := testSubmission(uuid.NewString(), "tutorial.append")
		response = postSubmission(t, server.URL, submission)
		response.Body.Close()
		if response.StatusCode != http.StatusUnprocessableEntity {
			t.Fatalf("unconfigured tutorial operation status = %d, want 422", response.StatusCode)
		}
	})

	t.Run("advertises and accepts fixed local tutorial jobs", func(t *testing.T) {
		started := make(chan string, 2)
		executor := func(_ context.Context, _ CatalogProfile, submission JobSubmission) (map[string]any, error) {
			started <- submission.Operation
			return map[string]any{"action": submission.Operation}, nil
		}
		server := httptest.NewServer(NewServer(testLearningLabCatalogs(), "", "test", executor).Handler())
		defer server.Close()

		response, err := http.Get(server.URL + "/v1/capabilities")
		if err != nil {
			t.Fatal(err)
		}
		var capabilities struct {
			Operations []string `json:"operations"`
		}
		if err := json.NewDecoder(response.Body).Decode(&capabilities); err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if strings.Join(capabilities.Operations, ",") != "catalog.validate,table.inspect,table.sample,tutorial.append,tutorial.reset" {
			t.Fatalf("learning lab capabilities = %v", capabilities.Operations)
		}

		invalid := testSubmission(uuid.NewString(), "tutorial.reset")
		invalid.Table = &TableIdentifier{Namespace: []string{"analytics"}, Name: "other"}
		response = postSubmission(t, server.URL, invalid)
		response.Body.Close()
		if response.StatusCode != http.StatusBadRequest {
			t.Fatalf("tutorial job with caller-provided table status = %d, want 400", response.StatusCode)
		}

		for _, operation := range []string{"tutorial.append", "tutorial.reset"} {
			submission := testSubmission(uuid.NewString(), operation)
			accepted := decodeAccepted(t, postSubmission(t, server.URL, submission))
			select {
			case got := <-started:
				if got != operation {
					t.Fatalf("executor operation = %q, want %q", got, operation)
				}
			case <-time.After(time.Second):
				t.Fatalf("executor did not run %s job %s", operation, accepted.JobID)
			}
		}
	})

	t.Run("does not enable remote profiles even with the flag set", func(t *testing.T) {
		catalogs := map[string]CatalogProfile{"remote": {ID: "remote", URI: "https://catalog.example.com", LearningLab: true}}
		server := httptest.NewServer(NewServer(catalogs, "", "test", nil).Handler())
		defer server.Close()

		response, err := http.Get(server.URL + "/v1/capabilities")
		if err != nil {
			t.Fatal(err)
		}
		var capabilities struct {
			Operations []string `json:"operations"`
		}
		if err := json.NewDecoder(response.Body).Decode(&capabilities); err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if strings.Contains(strings.Join(capabilities.Operations, ","), "tutorial.") {
			t.Fatalf("remote profile advertised tutorial writes: %v", capabilities.Operations)
		}
	})
}

func TestWorkerAuthorization(t *testing.T) {
	server := httptest.NewServer(NewServer(testCatalogs(), "worker-secret", "test", nil).Handler())
	defer server.Close()

	request, _ := http.NewRequest(http.MethodGet, server.URL+"/v1/health", nil)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusUnauthorized {
		t.Fatalf("unauthenticated status = %d, want 401", response.StatusCode)
	}

	request, _ = http.NewRequest(http.MethodGet, server.URL+"/v1/health", nil)
	request.Header.Set("Authorization", "Bearer worker-secret")
	response, err = http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("authenticated status = %d, want 200", response.StatusCode)
	}
}

func TestJobIdempotencyAndStatus(t *testing.T) {
	var executeCount atomic.Int32
	started := make(chan struct{}, 1)
	release := make(chan struct{})
	executor := func(context.Context, CatalogProfile, JobSubmission) (map[string]any, error) {
		executeCount.Add(1)
		started <- struct{}{}
		<-release
		return map[string]any{"namespaceCount": 1}, nil
	}
	server := httptest.NewServer(NewServer(testCatalogs(), "", "test", executor).Handler())
	defer server.Close()
	requestID := uuid.NewString()
	first := testSubmission(requestID, "catalog.validate")
	firstResponse := postSubmission(t, server.URL, first)
	if firstResponse.StatusCode != http.StatusAccepted {
		t.Fatalf("first submit status = %d, want 202: %s", firstResponse.StatusCode, firstResponse.Body)
	}
	accepted := decodeAccepted(t, firstResponse)

	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("job executor did not start")
	}
	duplicateResponse := postSubmission(t, server.URL, first)
	if duplicateResponse.StatusCode != http.StatusAccepted {
		t.Fatalf("duplicate submit status = %d, want 202", duplicateResponse.StatusCode)
	}
	duplicate := decodeAccepted(t, duplicateResponse)
	if duplicate.JobID != accepted.JobID || executeCount.Load() != 1 {
		t.Fatalf("duplicate started another job: first=%#v duplicate=%#v executions=%d", accepted, duplicate, executeCount.Load())
	}

	changed := first
	changed.CatalogID = "another"
	conflict := postSubmission(t, server.URL, changed)
	if conflict.StatusCode != http.StatusConflict {
		t.Fatalf("changed payload status = %d, want 409", conflict.StatusCode)
	}
	close(release)

	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		response, err := http.Get(server.URL + "/v1/jobs/" + accepted.JobID)
		if err != nil {
			t.Fatal(err)
		}
		var job JobStatus
		err = json.NewDecoder(response.Body).Decode(&job)
		response.Body.Close()
		if err != nil {
			t.Fatal(err)
		}
		if job.Status == "succeeded" {
			if job.Progress != 1 || job.Result["namespaceCount"] != float64(1) {
				t.Fatalf("unexpected completed job: %#v", job)
			}
			return
		}
		time.Sleep(time.Millisecond * 5)
	}
	t.Fatal("job did not finish")
}

func TestJobValidationAndSafeFailures(t *testing.T) {
	server := httptest.NewServer(NewServer(testCatalogs(), "", "test", func(context.Context, CatalogProfile, JobSubmission) (map[string]any, error) {
		return nil, errors.New("request failed with private-token and /private/path")
	}).Handler())
	defer server.Close()

	unsupported := testSubmission(uuid.NewString(), "table.delete")
	if response := postSubmission(t, server.URL, unsupported); response.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("unsupported operation status = %d, want 422", response.StatusCode)
	}

	invalidSample := testSubmission(uuid.NewString(), "table.sample")
	invalidSample.Table = &TableIdentifier{Namespace: []string{"analytics"}, Name: "events"}
	invalidSample.Options = &SampleOptions{RowLimit: 101}
	if response := postSubmission(t, server.URL, invalidSample); response.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid sample status = %d, want 400", response.StatusCode)
	}

	unknownCatalog := testSubmission(uuid.NewString(), "catalog.validate")
	unknownCatalog.CatalogID = "missing"
	if response := postSubmission(t, server.URL, unknownCatalog); response.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("unknown catalog status = %d, want 422", response.StatusCode)
	}

	valid := testSubmission(uuid.NewString(), "catalog.validate")
	accepted := decodeAccepted(t, postSubmission(t, server.URL, valid))
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		response, err := http.Get(server.URL + "/v1/jobs/" + accepted.JobID)
		if err != nil {
			t.Fatal(err)
		}
		var job JobStatus
		err = json.NewDecoder(response.Body).Decode(&job)
		response.Body.Close()
		if err != nil {
			t.Fatal(err)
		}
		if job.Status == "failed" {
			serialized, _ := json.Marshal(job)
			if strings.Contains(string(serialized), "private-token") || strings.Contains(string(serialized), "/private/path") || job.Error.Message == "" {
				t.Fatalf("worker error leaked private details: %s", serialized)
			}
			return
		}
		time.Sleep(time.Millisecond * 5)
	}
	t.Fatal("failed job did not complete")
}

func TestRejectsUnknownFieldsAndOversizedBodies(t *testing.T) {
	server := httptest.NewServer(NewServer(testCatalogs(), "", "test", nil).Handler())
	defer server.Close()

	body := fmt.Sprintf(`{"protocolVersion":1,"requestId":%q,"operation":"catalog.validate","catalogId":"local","catalogCredentials":{"token":"private"}}`, uuid.NewString())
	response, err := http.Post(server.URL+"/v1/jobs", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("unknown field status = %d, want 400", response.StatusCode)
	}

	response, err = http.Post(server.URL+"/v1/jobs", "application/json", strings.NewReader(strings.Repeat("x", (1<<20)+1)))
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("oversized body status = %d, want 400", response.StatusCode)
	}

	response, err = http.Get(server.URL + "/v1/jobs/missing")
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusNotFound {
		t.Fatalf("missing job status = %d, want 404", response.StatusCode)
	}
}

func testCatalogs() map[string]CatalogProfile {
	return map[string]CatalogProfile{"local": {ID: "local", URI: "http://localhost:8181"}}
}

func testLearningLabCatalogs() map[string]CatalogProfile {
	return map[string]CatalogProfile{"local": {ID: "local", URI: "http://iceberg-rest:8181", LearningLab: true}}
}

func testSubmission(requestID, operation string) JobSubmission {
	return JobSubmission{
		ProtocolVersion: 1,
		RequestID:       requestID,
		Operation:       operation,
		CatalogID:       "local",
	}
}

func postSubmission(t *testing.T, baseURL string, submission JobSubmission) *http.Response {
	t.Helper()
	body, err := json.Marshal(submission)
	if err != nil {
		t.Fatal(err)
	}
	response, err := http.Post(baseURL+"/v1/jobs", "application/json", strings.NewReader(string(body)))
	if err != nil {
		t.Fatal(err)
	}
	return response
}

func decodeAccepted(t *testing.T, response *http.Response) JobAccepted {
	t.Helper()
	defer response.Body.Close()
	var accepted JobAccepted
	if err := json.NewDecoder(response.Body).Decode(&accepted); err != nil {
		t.Fatal(err)
	}
	return accepted
}
