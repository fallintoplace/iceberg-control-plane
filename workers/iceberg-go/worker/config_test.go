package worker

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestParseCatalogProfiles(t *testing.T) {
	t.Run("loads worker-local catalog settings", func(t *testing.T) {
		profiles, err := ParseCatalogProfiles(`[{"id":"local","uri":"http://iceberg-rest:8181","warehouse":"warehouse","bearerTokenEnv":"ICEBERG_LOCAL_TOKEN","learningLab":true}]`, func(name string) string {
			if name == "ICEBERG_LOCAL_TOKEN" {
				return "private-token"
			}
			return ""
		})
		if err != nil {
			t.Fatal(err)
		}
		profile := profiles["local"]
		if profile.URI != "http://iceberg-rest:8181" || profile.Warehouse != "warehouse" || profile.Token != "private-token" || !profile.LearningLab {
			t.Fatalf("unexpected profile values: %#v", profile)
		}
		encoded, err := json.Marshal(profile)
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(string(encoded), "private-token") || strings.Contains(string(encoded), "iceberg-rest") {
			t.Fatalf("catalog settings were serialized: %s", encoded)
		}
	})

	tests := []struct {
		name        string
		input       string
		environment map[string]string
	}{
		{name: "empty input", input: ""},
		{name: "invalid json", input: `[{"id":`},
		{name: "trailing json", input: `[] []`},
		{name: "empty catalog list", input: `[]`},
		{name: "invalid id", input: `[{"id":"../local","uri":"http://localhost"}]`},
		{name: "duplicate ids", input: `[{"id":"local","uri":"http://localhost"},{"id":"local","uri":"http://localhost:8182"}]`},
		{name: "unknown fields", input: `[{"id":"local","uri":"http://localhost","token":"private-token"}]`},
		{name: "non-http url", input: `[{"id":"local","uri":"ftp://localhost"}]`},
		{name: "embedded credentials", input: `[{"id":"local","uri":"http://user:password@localhost"}]`},
		{name: "query string", input: `[{"id":"local","uri":"http://localhost?token=private-token"}]`},
		{name: "empty query string", input: `[{"id":"local","uri":"http://localhost?"}]`},
		{name: "fragment", input: `[{"id":"local","uri":"http://localhost#private-token"}]`},
		{name: "learning lab on remote catalog", input: `[{"id":"local","uri":"https://catalog.example.com","learningLab":true}]`},
		{name: "missing token", input: `[{"id":"local","uri":"http://localhost","bearerTokenEnv":"ICEBERG_LOCAL_TOKEN"}]`},
		{name: "invalid token environment variable", input: `[{"id":"local","uri":"http://localhost","bearerTokenEnv":"token"}]`},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := ParseCatalogProfiles(test.input, func(name string) string {
				return test.environment[name]
			})
			if err == nil {
				t.Fatal("expected invalid configuration to fail")
			}
			if strings.Contains(err.Error(), "private-token") || strings.Contains(err.Error(), "password") {
				t.Fatalf("error leaked a secret: %v", err)
			}
		})
	}
}
