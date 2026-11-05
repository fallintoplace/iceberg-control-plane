package fixture

import (
	"context"
	"fmt"
	"time"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"
	"github.com/apache/arrow-go/v18/arrow/memory"
	"github.com/apache/iceberg-go/catalog/rest"
	"github.com/apache/iceberg-go/table"
)

const fixtureTable = "analytics.events"

func Seed(ctx context.Context, uri string) (bool, error) {
	if !IsLocalCatalogURI(uri) {
		return false, fmt.Errorf("fixture seeding is limited to localhost and the local Docker fixture")
	}

	catalog, err := rest.NewCatalog(ctx, "local", uri)
	if err != nil {
		return false, err
	}
	defer catalog.Close()

	icebergTable, err := catalog.LoadTable(ctx, []string{"analytics", "events"})
	if err != nil {
		return false, err
	}
	if icebergTable.CurrentSnapshot() != nil {
		return false, nil
	}

	arrowSchema, err := table.SchemaToArrowSchema(icebergTable.Schema(), nil, true, false)
	if err != nil {
		return false, err
	}
	builder := array.NewRecordBuilder(memory.DefaultAllocator, arrowSchema)
	defer builder.Release()

	ids := builder.Field(0).(*array.Int64Builder)
	types := builder.Field(1).(*array.StringBuilder)
	timestamps := builder.Field(2).(*array.TimestampBuilder)
	events := []struct {
		id        int64
		typ       string
		timestamp time.Time
	}{
		{1, "page_view", time.Date(2025, time.January, 15, 9, 0, 0, 0, time.UTC)},
		{2, "purchase", time.Date(2025, time.January, 15, 9, 5, 0, 0, time.UTC)},
		{3, "signup", time.Date(2025, time.January, 15, 9, 10, 0, 0, time.UTC)},
	}
	for _, event := range events {
		ids.Append(event.id)
		types.Append(event.typ)
		timestamps.AppendTime(event.timestamp)
	}

	record := builder.NewRecordBatch()
	defer record.Release()
	data := array.NewTableFromRecords(arrowSchema, []arrow.RecordBatch{record})
	defer data.Release()

	if _, err := icebergTable.AppendTable(ctx, data, 128, nil); err != nil {
		return false, err
	}
	return true, nil
}

func TableName() string { return fixtureTable }
