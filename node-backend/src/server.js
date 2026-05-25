import cors from "cors";
import express from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";

import { DATA_SOURCE_STATUS, RAW_STATUS, RECORD_STATUS, SOURCE_TYPES } from "./constants.js";
import { normalizeRow } from "./normalization.js";
import { ensureDb, nextId, nowIso, readDb, writeDb } from "./store.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const port = Number(process.env.PORT || 8001);

app.use(cors({ origin: true, allowedHeaders: ["Content-Type", "X-Analyst"] }));
app.use(express.json());

app.get("/api/health/", (_req, res) => res.json({ ok: true }));

app.get("/api/tenants/", async (_req, res) => {
  const db = await readDb();
  res.json(db.tenants);
});

app.get("/api/data-sources/", async (_req, res) => {
  const db = await readDb();
  res.json([...db.dataSources].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at)));
});

app.get("/api/emission-records/", async (_req, res) => {
  const db = await readDb();
  const records = db.emissionRecords
    .map((record) => {
      const raw = db.rawRecords.find((item) => item.id === record.raw_record);
      const source = db.dataSources.find((item) => item.id === raw?.data_source);
      return {
        ...record,
        source_type: source?.source_type || "",
        file_name: source?.file_name || "",
        row_number: raw?.row_number || null,
        raw_payload: raw?.raw_payload || {},
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json(records);
});

app.get("/api/raw-records/", async (_req, res) => {
  const db = await readDb();
  res.json(db.rawRecords);
});

app.get("/api/reviews/", async (_req, res) => {
  const db = await readDb();
  res.json(db.reviewDecisions);
});

app.get("/api/audit-logs/", async (_req, res) => {
  const db = await readDb();
  res.json([...db.auditLogs].sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
});

app.get("/api/summary/", async (_req, res) => {
  const db = await readDb();
  const records = db.emissionRecords;
  const byStatus = Object.values(
    records.reduce((acc, record) => {
      acc[record.status] ||= { status: record.status, count: 0 };
      acc[record.status].count += 1;
      return acc;
    }, {}),
  );
  const byScope = Object.values(
    records.reduce((acc, record) => {
      acc[record.scope] ||= { scope: record.scope, co2e_kg: 0 };
      acc[record.scope].co2e_kg += Number(record.co2e_kg);
      return acc;
    }, {}),
  );

  const recentFailures = db.rawRecords
    .filter((raw) => raw.processing_status === RAW_STATUS.FAILED)
    .slice(0, 10)
    .map((raw) => {
      const source = db.dataSources.find((item) => item.id === raw.data_source);
      return {
        data_source__source_type: source?.source_type || "",
        data_source__file_name: source?.file_name || "",
        row_number: raw.row_number,
        error_message: raw.error_message,
      };
    });

  res.json({
    total_records: records.length,
    pending: records.filter((record) => record.status === RECORD_STATUS.PENDING).length,
    flagged: records.filter((record) => record.is_flagged).length,
    failed_raw_rows: db.rawRecords.filter((raw) => raw.processing_status === RAW_STATUS.FAILED).length,
    sources: db.dataSources.length,
    by_status: byStatus,
    by_scope: byScope.map((item) => ({ ...item, co2e_kg: Math.round(item.co2e_kg * 1000) / 1000 })),
    recent_failures: recentFailures,
  });
});

app.post("/api/data-sources/upload/", upload.single("file"), async (req, res) => {
  const tenantId = Number(req.body.tenant);
  const sourceType = req.body.source_type;
  const uploadedBy = req.header("X-Analyst") || req.body.uploaded_by || "analyst@example.com";

  if (!tenantId || !sourceType || !req.file) {
    return res.status(400).json({ detail: "tenant, source_type, and file are required" });
  }
  if (!Object.values(SOURCE_TYPES).includes(sourceType)) {
    return res.status(400).json({ detail: "unsupported source_type" });
  }

  const db = await readDb();
  const tenant = db.tenants.find((item) => item.id === tenantId);
  if (!tenant) return res.status(404).json({ detail: "tenant not found" });

  const rows = parse(req.file.buffer.toString("utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  });
  let failedRows = 0;

  const dataSource = {
    id: nextId(db, "dataSources"),
    tenant: tenantId,
    source_type: sourceType,
    file_name: req.file.originalname,
    uploaded_by: uploadedBy,
    uploaded_at: nowIso(),
    status: DATA_SOURCE_STATUS.RECEIVED,
    total_rows: rows.length,
    failed_rows: 0,
    notes: "",
  };
  db.dataSources.push(dataSource);

  rows.forEach((row, index) => {
    const rawRecord = {
      id: nextId(db, "rawRecords"),
      data_source: dataSource.id,
      row_number: index + 1,
      raw_payload: row,
      processing_status: RAW_STATUS.PENDING,
      error_message: "",
      created_at: nowIso(),
    };
    db.rawRecords.push(rawRecord);

    const result = normalizeRow(sourceType, row);
    if (result.error) {
      failedRows += 1;
      rawRecord.processing_status = RAW_STATUS.FAILED;
      rawRecord.error_message = result.error;
      return;
    }

    db.emissionRecords.push({
      id: nextId(db, "emissionRecords"),
      tenant: tenantId,
      raw_record: rawRecord.id,
      ...result.payload,
      status: RECORD_STATUS.PENDING,
      edited_payload: {},
      created_at: nowIso(),
      updated_at: nowIso(),
      approved_at: null,
    });
    rawRecord.processing_status = RAW_STATUS.NORMALIZED;
  });

  dataSource.failed_rows = failedRows;
  dataSource.status = failedRows === rows.length ? DATA_SOURCE_STATUS.FAILED : DATA_SOURCE_STATUS.PROCESSED;
  db.auditLogs.push({
    id: nextId(db, "auditLogs"),
    entity_type: "DataSource",
    entity_id: String(dataSource.id),
    action: "UPLOAD_NORMALIZE",
    old_values: {},
    new_values: { source_type: sourceType, rows: rows.length, failed_rows: failedRows },
    performed_by: uploadedBy,
    timestamp: nowIso(),
  });

  await writeDb(db);
  res.status(201).json(dataSource);
});

app.post("/api/emission-records/:id/review/", async (req, res) => {
  const db = await readDb();
  const id = Number(req.params.id);
  const record = db.emissionRecords.find((item) => item.id === id);
  const decision = req.body.decision;
  const reviewedBy = req.header("X-Analyst") || req.body.reviewed_by || "analyst@example.com";

  if (!record) return res.status(404).json({ detail: "record not found" });
  if (record.status === RECORD_STATUS.LOCKED) return res.status(409).json({ detail: "locked records cannot be reviewed" });
  if (!["APPROVE", "REJECT"].includes(decision)) return res.status(400).json({ detail: "decision must be APPROVE or REJECT" });

  const before = structuredClone(record);
  if (decision === "APPROVE") {
    record.status = RECORD_STATUS.APPROVED;
    record.approved_at = nowIso();
  } else {
    record.status = RECORD_STATUS.REJECTED;
  }
  record.updated_at = nowIso();

  db.reviewDecisions.push({
    id: nextId(db, "reviewDecisions"),
    emission_record: record.id,
    reviewed_by: reviewedBy,
    decision,
    comment: req.body.comment || "",
    reviewed_at: nowIso(),
  });
  db.auditLogs.push({
    id: nextId(db, "auditLogs"),
    entity_type: "EmissionRecord",
    entity_id: String(record.id),
    action: `REVIEW_${decision}`,
    old_values: before,
    new_values: record,
    performed_by: reviewedBy,
    timestamp: nowIso(),
  });

  await writeDb(db);
  res.json(record);
});

app.post("/api/emission-records/lock_approved/", async (req, res) => {
  const db = await readDb();
  const performedBy = req.header("X-Analyst") || "analyst@example.com";
  let lockedCount = 0;
  for (const record of db.emissionRecords) {
    if (record.status === RECORD_STATUS.APPROVED) {
      record.status = RECORD_STATUS.LOCKED;
      record.updated_at = nowIso();
      lockedCount += 1;
    }
  }
  db.auditLogs.push({
    id: nextId(db, "auditLogs"),
    entity_type: "EmissionRecord",
    entity_id: "bulk",
    action: "LOCK_APPROVED",
    old_values: {},
    new_values: { locked_count: lockedCount },
    performed_by: performedBy,
    timestamp: nowIso(),
  });
  await writeDb(db);
  res.json({ locked_count: lockedCount });
});

await ensureDb();
app.listen(port, () => {
  console.log(`Node ESG API listening on http://127.0.0.1:${port}/api`);
});

