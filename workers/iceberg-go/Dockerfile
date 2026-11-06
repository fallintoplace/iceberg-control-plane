FROM golang:1.26.3-bookworm AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/iceberg-go-worker ./cmd/worker \
    && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/seed-fixture ./cmd/seed-fixture

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /out/iceberg-go-worker /usr/local/bin/iceberg-go-worker
COPY --from=build /out/seed-fixture /usr/local/bin/seed-fixture
USER 1000:1000
EXPOSE 8090
ENTRYPOINT ["/usr/local/bin/iceberg-go-worker"]
