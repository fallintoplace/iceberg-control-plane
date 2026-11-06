package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/fallintoplace/iceberg-control-plane/workers/iceberg-go/worker"
)

func main() {
	catalogs, err := worker.ParseCatalogProfilesFromEnv()
	if err != nil {
		log.Fatal(err)
	}
	port := 8090
	if value := os.Getenv("PORT"); value != "" {
		port, err = strconv.Atoi(value)
		if err != nil || port < 1 || port > 65535 {
			log.Fatal("PORT must be an integer between 1 and 65535")
		}
	}

	server := &http.Server{
		Addr:              ":" + strconv.Itoa(port),
		Handler:           worker.NewServer(catalogs, os.Getenv("ICEBERG_GO_WORKER_TOKEN"), os.Getenv("ICEBERG_GO_WORKER_VERSION"), nil).Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}
	stopped := make(chan os.Signal, 1)
	signal.Notify(stopped, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-stopped
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(ctx); err != nil {
			log.Printf("worker shutdown failed: %v", err)
		}
	}()

	log.Printf("Iceberg Go worker listening on %s", server.Addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal("worker server failed")
	}
}
