# MODEL.md

## 1. Multi-Tenancy Strategy

`Tenant` is the root ownership boundary. `DataSource`, `Facility`, and `EmissionRecord` all point to a tenant so one client company's data can be queried, reviewed, exported, and audited independently from another client's data.

The implementation is Node.js in `node-backend/`. It uses JSON-file persistence for the prototype so the data flow stays easy to inspect and explain. In production, these collections should map directly to database tables.

For the prototype I did not implement row-level database policies or organization-scoped authentication. The model still carries the tenant boundary everywhere it matters, so adding auth later would mean filtering by the logged-in user's tenant memberships rather than changing the schema.

## 2. Raw vs Normalized Data Separation

`RawRecord` stores the untouched source row as JSON. This is deliberately separate from `EmissionRecord`.

Why:

- analysts and auditors can trace any normalized number back to the exact source payload
- parser mistakes do not destroy the source of truth
- each source can remain messy without forcing every source-specific field into a shared relational table

`RawRecord.processing_status` and `error_message` explain whether the row normalized cleanly or failed.

## 3. Source-of-Truth Tracking

`DataSource` records the source type, filename, uploader, upload time, status, total rows, and failed rows. `RawRecord` links to `DataSource`; `EmissionRecord` links one-to-one to `RawRecord`.

The trace is:

```text
DataSource -> RawRecord -> EmissionRecord -> ReviewDecision / AuditLog
```

This answers: which source produced this emissions row, when did it arrive, and what raw row created it?

## 4. Scope 1/2/3 Handling

The app stores scope on `EmissionRecord` because scope is a normalized accounting classification, not just a source property.

- SAP fuel rows become Scope 1 fuel combustion.
- Utility electricity rows become Scope 2 purchased electricity.
- Travel platform rows become Scope 3 business travel.

The source type helps infer scope, but the final scope lives on the normalized record so analysts can review/export it directly.

## 5. Unit Normalization

The model stores both source and normalized measures:

- `activity_value`, `activity_unit`: what the source row said
- `normalized_value`, `normalized_unit`: standardized value used for calculation

Examples:

- SAP `120 GAL` becomes `454.249 liters`
- utility `42 MWh` becomes `42000 kWh`

Keeping both avoids losing evidence while allowing consistent emissions math.

## 6. Emissions Calculation

`EmissionRecord` stores `emission_factor` and `co2e_kg` at calculation time. In a production system I would version emission factor datasets separately. For this prototype, storing the factor on each row makes the calculation reproducible even if constants change later.

## 7. Review Workflow

Rows start as `PENDING`. Analysts can approve or reject them through `ReviewDecision`.

Statuses:

- `PENDING`: normalized but not signed off
- `APPROVED`: analyst accepted it
- `REJECTED`: analyst rejected it
- `LOCKED`: approved and frozen for audit export

Locked rows cannot be reviewed again through the review endpoint. Full immutability would be enforced more strictly in production by blocking edits at the model/service layer.

## 8. Audit Trail Approach

`AuditLog` captures entity type, entity id, action, old values, new values, actor, and timestamp.

The prototype logs:

- upload and normalization
- edits to normalized records
- review decisions
- bulk lock actions

I chose a custom audit log collection to keep the prototype dependency-light and easy to explain. For a larger system, an append-only event table or dedicated history mechanism would be preferable.

## 9. Why JSON Raw Storage

SAP, utility, and travel rows have different shapes. Even within one source, enterprise exports vary by configuration. JSON raw storage lets the system ingest realistic, source-specific payloads without pretending all fields are known in advance.

The tradeoff is weaker database-level validation on raw data. That is acceptable because validation happens when creating normalized records, and failed rows retain their raw payload plus error message.
