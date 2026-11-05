package worker

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"os"
	"regexp"
)

var (
	catalogIDPattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_-]*$`)
	envNamePattern   = regexp.MustCompile(`^[A-Z][A-Z0-9_]*$`)
)

type catalogConfigJSON struct {
	ID             string `json:"id"`
	URI            string `json:"uri"`
	Warehouse      string `json:"warehouse,omitempty"`
	BearerTokenEnv string `json:"bearerTokenEnv,omitempty"`
}

// CatalogProfile is worker-local connection information. It is never returned
// by the worker API or sent by the control plane.
type CatalogProfile struct {
	ID        string `json:"-"`
	URI       string `json:"-"`
	Warehouse string `json:"-"`
	Token     string `json:"-"`
}

func ParseCatalogProfiles(raw string, environment func(string) string) (map[string]CatalogProfile, error) {
	if raw == "" {
		return nil, fmt.Errorf("ICEBERG_GO_CATALOGS_JSON is required")
	}

	var input []catalogConfigJSON
	decoder := json.NewDecoder(bytes.NewBufferString(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		return nil, fmt.Errorf("ICEBERG_GO_CATALOGS_JSON must contain valid catalog definitions")
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return nil, fmt.Errorf("ICEBERG_GO_CATALOGS_JSON must contain one JSON value")
	}
	if len(input) == 0 || len(input) > 100 {
		return nil, fmt.Errorf("ICEBERG_GO_CATALOGS_JSON must contain between 1 and 100 catalogs")
	}

	profiles := make(map[string]CatalogProfile, len(input))
	for _, entry := range input {
		if !catalogIDPattern.MatchString(entry.ID) {
			return nil, fmt.Errorf("catalog id has an invalid format")
		}
		if _, exists := profiles[entry.ID]; exists {
			return nil, fmt.Errorf("catalog ids must be unique")
		}

		parsedURI, err := url.Parse(entry.URI)
		if err != nil || (parsedURI.Scheme != "http" && parsedURI.Scheme != "https") || parsedURI.Host == "" ||
			parsedURI.User != nil || parsedURI.RawQuery != "" || parsedURI.ForceQuery || parsedURI.Fragment != "" {
			return nil, fmt.Errorf("catalog %q must have an HTTP or HTTPS URI without credentials, query, or fragment", entry.ID)
		}
		if entry.BearerTokenEnv != "" && !envNamePattern.MatchString(entry.BearerTokenEnv) {
			return nil, fmt.Errorf("catalog %q has an invalid bearerTokenEnv name", entry.ID)
		}

		profile := CatalogProfile{ID: entry.ID, URI: entry.URI, Warehouse: entry.Warehouse}
		if entry.BearerTokenEnv != "" {
			profile.Token = environment(entry.BearerTokenEnv)
			if profile.Token == "" {
				return nil, fmt.Errorf("catalog %q is missing its configured bearer token", entry.ID)
			}
		}
		profiles[entry.ID] = profile
	}

	return profiles, nil
}

func ParseCatalogProfilesFromEnv() (map[string]CatalogProfile, error) {
	return ParseCatalogProfiles(os.Getenv("ICEBERG_GO_CATALOGS_JSON"), os.Getenv)
}
