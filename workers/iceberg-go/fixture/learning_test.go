package fixture

import "testing"

func TestIsLocalCatalogURI(t *testing.T) {
	tests := []struct {
		name string
		uri  string
		want bool
	}{
		{name: "localhost", uri: "http://localhost:8181", want: true},
		{name: "loopback IPv4", uri: "http://127.0.0.1:8181", want: true},
		{name: "loopback IPv6", uri: "http://[::1]:8181", want: true},
		{name: "compose fixture", uri: "http://iceberg-rest:8181", want: true},
		{name: "remote host", uri: "https://catalog.example.com", want: false},
		{name: "embedded credentials", uri: "http://user:secret@localhost:8181", want: false},
		{name: "query string", uri: "http://localhost:8181?token=secret", want: false},
		{name: "fragment", uri: "http://localhost:8181#catalog", want: false},
		{name: "invalid scheme", uri: "ftp://localhost:8181", want: false},
		{name: "missing host", uri: "http://", want: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := IsLocalCatalogURI(test.uri); got != test.want {
				t.Fatalf("IsLocalCatalogURI(%q) = %t, want %t", test.uri, got, test.want)
			}
		})
	}
}
