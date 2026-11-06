package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/fallintoplace/iceberg-control-plane/workers/iceberg-go/fixture"
)

func main() {
	uri := os.Getenv("ICEBERG_FIXTURE_URI")
	if uri == "" {
		uri = "http://iceberg-rest:8181"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	seeded, err := fixture.Seed(ctx, uri)
	if err != nil {
		fmt.Fprintln(os.Stderr, "Could not seed the local Iceberg fixture.")
		os.Exit(1)
	}
	if seeded {
		fmt.Printf("Seeded %s with 3 sample rows.\n", fixture.TableName())
		return
	}
	fmt.Printf("%s already contains data; left it unchanged.\n", fixture.TableName())
}
