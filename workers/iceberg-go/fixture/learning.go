package fixture

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"
	"github.com/apache/arrow-go/v18/arrow/memory"
	iceberg "github.com/apache/iceberg-go"
	icebergcatalog "github.com/apache/iceberg-go/catalog"
	"github.com/apache/iceberg-go/catalog/rest"
	"github.com/apache/iceberg-go/table"
)

var learningTableIdentifier = []string{"analytics", "events"}

type event struct {
	id       int64
	typeName string
	occurred time.Time
}

// IsLocalCatalogURI limits learning-lab writes to the local fixture hosts.
func IsLocalCatalogURI(uri string) bool {
	parsed, err := url.Parse(uri)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" ||
		parsed.User != nil || parsed.RawQuery != "" || parsed.ForceQuery || parsed.Fragment != "" {
		return false
	}

	switch strings.ToLower(parsed.Hostname()) {
	case "localhost", "127.0.0.1", "::1", "iceberg-rest":
		return true
	default:
		return false
	}
}

// AppendLearningEvent adds one event to the fixed local lesson table.
func AppendLearningEvent(ctx context.Context, catalog *rest.Catalog) (map[string]any, error) {
	icebergTable, err := catalog.LoadTable(ctx, learningTableIdentifier)
	if err != nil {
		return nil, err
	}

	beforeSnapshot := snapshotID(icebergTable)
	beforeCount := len(icebergTable.Metadata().Snapshots())
	now := time.Now().UTC()
	row := event{
		id:       now.UnixNano(),
		typeName: "iceberg_learning_lab",
		occurred: now,
	}
	updated, err := appendEvents(ctx, icebergTable, []event{row})
	if err != nil {
		return nil, err
	}

	return map[string]any{
		"action":              "append",
		"namespace":           learningTableIdentifier[:1],
		"name":                learningTableIdentifier[1],
		"beforeSnapshotId":    beforeSnapshot,
		"afterSnapshotId":     snapshotID(updated),
		"snapshotCountBefore": beforeCount,
		"snapshotCountAfter":  len(updated.Metadata().Snapshots()),
		"appendedRow": map[string]any{
			"event_id":    row.id,
			"event_type":  row.typeName,
			"occurred_at": row.occurred.Format(time.RFC3339Nano),
		},
		"message": "Iceberg committed the new row in a new snapshot.",
	}, nil
}

// ResetLearningLab restores analytics.events to the three documented starter rows.
func ResetLearningLab(ctx context.Context, catalog *rest.Catalog) (map[string]any, error) {
	if err := catalog.CreateNamespace(ctx, []string{"analytics"}, iceberg.Properties{}); err != nil && !errors.Is(err, icebergcatalog.ErrNamespaceAlreadyExists) {
		return nil, err
	}
	location := ""
	existing, err := catalog.LoadTable(ctx, learningTableIdentifier)
	if err == nil {
		location, err = nextLearningTableLocation(existing.Location())
		if err != nil {
			return nil, err
		}
	} else if !errors.Is(err, icebergcatalog.ErrNoSuchTable) {
		return nil, err
	}
	if err := catalog.DropTable(ctx, learningTableIdentifier); err != nil && !errors.Is(err, icebergcatalog.ErrNoSuchTable) {
		return nil, err
	}

	schema := iceberg.NewSchema(0,
		iceberg.NestedField{ID: 1, Name: "event_id", Type: iceberg.PrimitiveTypes.Int64, Required: true},
		iceberg.NestedField{ID: 2, Name: "event_type", Type: iceberg.PrimitiveTypes.String, Required: true},
		iceberg.NestedField{ID: 3, Name: "occurred_at", Type: iceberg.PrimitiveTypes.TimestampTz},
	)
	spec := iceberg.UnpartitionedSpec
	createOptions := []icebergcatalog.CreateTableOpt{
		icebergcatalog.WithPartitionSpec(spec),
		icebergcatalog.WithProperties(iceberg.Properties{"write.format.default": "parquet"}),
	}
	if location != "" {
		createOptions = append(createOptions, icebergcatalog.WithLocation(location))
	}
	icebergTable, err := catalog.CreateTable(ctx, learningTableIdentifier, schema, createOptions...)
	if err != nil {
		return nil, err
	}

	updated, err := appendEvents(ctx, icebergTable, starterEvents())
	if err != nil {
		return nil, err
	}
	current := updated.CurrentSnapshot()
	var currentSnapshot any
	if current != nil {
		currentSnapshot = map[string]any{
			"snapshotId":  current.SnapshotID,
			"timestampMs": current.TimestampMs,
		}
	}

	return map[string]any{
		"action":          "reset",
		"namespace":       learningTableIdentifier[:1],
		"name":            learningTableIdentifier[1],
		"starterRowCount": 3,
		"snapshotCount":   len(updated.Metadata().Snapshots()),
		"currentSnapshot": currentSnapshot,
		"message":         "The lesson table is back to its three starter events.",
	}, nil
}

func nextLearningTableLocation(current string) (string, error) {
	location, err := url.Parse(current)
	if err != nil || location.Path == "" {
		return "", fmt.Errorf("learning table has an invalid location")
	}
	location.Path = path.Join(path.Dir(location.Path), fmt.Sprintf("events-learning-%d", time.Now().UTC().UnixNano()))
	location.RawPath = ""
	return location.String(), nil
}

func starterEvents() []event {
	return []event{
		{id: 1, typeName: "page_view", occurred: time.Date(2025, time.January, 15, 9, 0, 0, 0, time.UTC)},
		{id: 2, typeName: "purchase", occurred: time.Date(2025, time.January, 15, 9, 5, 0, 0, time.UTC)},
		{id: 3, typeName: "signup", occurred: time.Date(2025, time.January, 15, 9, 10, 0, 0, time.UTC)},
	}
}

func appendEvents(ctx context.Context, icebergTable *table.Table, events []event) (*table.Table, error) {
	arrowSchema, err := table.SchemaToArrowSchema(icebergTable.Schema(), nil, true, false)
	if err != nil {
		return nil, err
	}
	if arrowSchema.NumFields() != 3 || arrowSchema.Field(0).Name != "event_id" || arrowSchema.Field(1).Name != "event_type" || arrowSchema.Field(2).Name != "occurred_at" {
		return nil, fmt.Errorf("learning table schema does not match analytics.events")
	}

	builder := array.NewRecordBuilder(memory.DefaultAllocator, arrowSchema)
	defer builder.Release()
	ids, ok := builder.Field(0).(*array.Int64Builder)
	if !ok {
		return nil, fmt.Errorf("learning table event_id field is not a long")
	}
	types, ok := builder.Field(1).(*array.StringBuilder)
	if !ok {
		return nil, fmt.Errorf("learning table event_type field is not a string")
	}
	timestamps, ok := builder.Field(2).(*array.TimestampBuilder)
	if !ok {
		return nil, fmt.Errorf("learning table occurred_at field is not a timestamp")
	}
	for _, row := range events {
		ids.Append(row.id)
		types.Append(row.typeName)
		timestamps.AppendTime(row.occurred)
	}

	record := builder.NewRecordBatch()
	defer record.Release()
	data := array.NewTableFromRecords(arrowSchema, []arrow.RecordBatch{record})
	defer data.Release()
	return icebergTable.AppendTable(ctx, data, 128, nil)
}

func snapshotID(icebergTable *table.Table) any {
	if snapshot := icebergTable.CurrentSnapshot(); snapshot != nil {
		return snapshot.SnapshotID
	}
	return nil
}
