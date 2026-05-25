import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";

import { DATA_SOURCE_STATUS, RAW_STATUS, RECORD_STATUS } from "./constants.js";
import { normalizeRow } from "./normalization.js";
import { nextId, nowIso, readDb, resetDb, writeDb } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleDir = path.resolve(__dirname, "..", "..", "samples");

await resetDb();
const db = await readDb();

const tenant = {
  id: nextId(db, "tenants"),
  name: "Aster Manufacturing Ltd",
  industry: "Industrial manufacturing",
  created_at: nowIso(),
};
db.tenants.push(tenant);

[
  ["BLR-MFG-01", "Bengaluru Manufacturing Plant", "India"],
  ["PUN-WH-02", "Pune Warehouse", "India"],
  ["BER-OFF-01", "Berlin Office", "Germany"],
].forEach(([code, name, country]) => {
  db.facilities.push({ id: nextId(db, "facilities"), tenant: tenant.id, code, name, country });
});

for (const [sourceType, fileName] of [
  ["SAP", "sap_fuel_export.csv"],
  ["UTILITY", "utility_electricity_export.csv"],
  ["TRAVEL", "travel_platform_export.csv"],
]) {
  const rows = parse(await fs.readFile(path.join(sampleDir, fileName), "utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  });
  let failedRows = 0;
  const dataSource = {
    id: nextId(db, "dataSources"),
    tenant: tenant.id,
    source_type: sourceType,
    file_name: fileName,
    uploaded_by: "demo@breatheesg.com",
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
      tenant: tenant.id,
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
    performed_by: "demo@breatheesg.com",
    timestamp: nowIso(),
  });
}

await writeDb(db);
console.log("Seeded Node backend demo data");

