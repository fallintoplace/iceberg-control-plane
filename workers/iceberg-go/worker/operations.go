package worker

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"math"
	"strconv"
	"time"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/scalar"
	"github.com/apache/iceberg-go/catalog/rest"
	"github.com/apache/iceberg-go/table"
	"github.com/fallintoplace/iceberg-control-plane/workers/iceberg-go/fixture"
)

func ExecuteIcebergJob(ctx context.Context, profile CatalogProfile, job JobSubmission) (map[string]any, error) {
	if isTutorialOperation(job.Operation) && (!profile.LearningLab || !fixture.IsLocalCatalogURI(profile.URI)) {
		return nil, errors.New("learning lab is not enabled for a local catalog")
	}
	options := make([]rest.Option, 0, 2)
	if profile.Warehouse != "" {
		options = append(options, rest.WithWarehouseLocation(profile.Warehouse))
	}
	if profile.Token != "" {
		options = append(options, rest.WithOAuthToken(profile.Token))
	}

	catalog, err := rest.NewCatalog(ctx, profile.ID, profile.URI, options...)
	if err != nil {
		return nil, err
	}
	defer catalog.Close()

	switch job.Operation {
	case "catalog.validate":
		namespaces, err := catalog.ListNamespaces(ctx, nil)
		if err != nil {
			return nil, err
		}
		listed := make([][]string, len(namespaces))
		for i, namespace := range namespaces {
			listed[i] = append([]string(nil), namespace...)
		}
		return map[string]any{
			"catalogId":      profile.ID,
			"namespaceCount": len(listed),
			"namespaces":     listed,
		}, nil
	case "table.inspect", "table.sample":
		identifier := append(append([]string(nil), job.Table.Namespace...), job.Table.Name)
		icebergTable, err := catalog.LoadTable(ctx, identifier)
		if err != nil {
			return nil, err
		}
		if job.Operation == "table.inspect" {
			return inspectTable(profile.ID, icebergTable), nil
		}
		return sampleTable(ctx, icebergTable, job.Options.RowLimit)
	case "tutorial.append":
		return fixture.AppendLearningEvent(ctx, catalog)
	case "tutorial.reset":
		return fixture.ResetLearningLab(ctx, catalog)
	default:
		return nil, fmt.Errorf("unsupported operation")
	}
}

func inspectTable(catalogID string, icebergTable *table.Table) map[string]any {
	fields := icebergTable.Schema().Fields()
	schema := make([]map[string]any, len(fields))
	for i, field := range fields {
		schema[i] = map[string]any{
			"id":       field.ID,
			"name":     field.Name,
			"type":     field.Type.String(),
			"required": field.Required,
		}
	}

	spec := icebergTable.Spec()
	partitionFields := make([]map[string]any, 0, spec.NumFields())
	for _, field := range spec.Fields() {
		partitionFields = append(partitionFields, map[string]any{
			"fieldId":   field.FieldID,
			"sourceIds": field.SourceIDs,
			"name":      field.Name,
			"transform": field.Transform.String(),
		})
	}

	metadata := icebergTable.Metadata()
	snapshots := metadata.Snapshots()
	identifier := icebergTable.Identifier()
	result := map[string]any{
		"catalogId":       catalogID,
		"namespace":       identifier[:len(identifier)-1],
		"name":            identifier[len(identifier)-1],
		"formatVersion":   metadata.FormatVersion(),
		"location":        icebergTable.Location(),
		"schema":          schema,
		"partitionFields": partitionFields,
		"snapshotCount":   len(snapshots),
	}
	if current := icebergTable.CurrentSnapshot(); current != nil {
		result["currentSnapshot"] = map[string]any{
			"snapshotId":  current.SnapshotID,
			"timestampMs": current.TimestampMs,
		}
	}
	return result
}

func sampleTable(ctx context.Context, icebergTable *table.Table, rowLimit int) (map[string]any, error) {
	schema, batches, err := icebergTable.Scan(table.WithLimit(int64(rowLimit))).ToArrowRecords(ctx)
	if err != nil {
		return nil, err
	}

	fields := make([]map[string]any, schema.NumFields())
	for i, field := range schema.Fields() {
		fields[i] = map[string]any{"name": field.Name, "type": field.Type.String()}
	}
	rows := make([]map[string]any, 0, rowLimit)
	identifier := icebergTable.Identifier()
	for batch, batchErr := range batches {
		if batchErr != nil {
			return nil, batchErr
		}
		for rowIndex := int64(0); rowIndex < batch.NumRows() && len(rows) < rowLimit; rowIndex++ {
			row := make(map[string]any, batch.NumCols())
			for columnIndex, field := range batch.Schema().Fields() {
				value, err := arrowValue(batch.Column(columnIndex), int(rowIndex))
				if err != nil {
					batch.Release()
					return nil, err
				}
				row[field.Name] = value
			}
			rows = append(rows, row)
		}
		batch.Release()
		if len(rows) == rowLimit {
			break
		}
	}

	return map[string]any{
		"namespace": identifier[:len(identifier)-1],
		"name":      identifier[len(identifier)-1],
		"schema":    fields,
		"rowCount":  len(rows),
		"rows":      rows,
	}, nil
}

func arrowValue(values arrow.Array, index int) (any, error) {
	value, err := scalar.GetScalar(values, index)
	if err != nil {
		return nil, err
	}
	if releasable, ok := value.(interface{ Release() }); ok {
		defer releasable.Release()
	}
	if !value.IsValid() {
		return nil, nil
	}

	switch typed := value.(type) {
	case *scalar.Boolean:
		return typed.Value, nil
	case *scalar.Int8:
		return typed.Value, nil
	case *scalar.Int16:
		return typed.Value, nil
	case *scalar.Int32:
		return typed.Value, nil
	case *scalar.Int64:
		return typed.Value, nil
	case *scalar.Uint8:
		return typed.Value, nil
	case *scalar.Uint16:
		return typed.Value, nil
	case *scalar.Uint32:
		return typed.Value, nil
	case *scalar.Uint64:
		return typed.Value, nil
	case *scalar.Float32:
		if math.IsNaN(float64(typed.Value)) || math.IsInf(float64(typed.Value), 0) {
			return typed.String(), nil
		}
		return typed.Value, nil
	case *scalar.Float64:
		if math.IsNaN(typed.Value) || math.IsInf(typed.Value, 0) {
			return typed.String(), nil
		}
		return typed.Value, nil
	case *scalar.String:
		return string(typed.Value.Bytes()), nil
	case *scalar.LargeString:
		return typed.String(), nil
	case *scalar.Timestamp:
		return typed.ToTime().Format(time.RFC3339Nano), nil
	case *scalar.Binary:
		return base64.StdEncoding.EncodeToString(typed.Value.Bytes()), nil
	default:
		if number, parseErr := strconv.ParseInt(value.String(), 10, 64); parseErr == nil {
			return number, nil
		}
		if number, parseErr := strconv.ParseUint(value.String(), 10, 64); parseErr == nil {
			return number, nil
		}
		return value.String(), nil
	}
}
