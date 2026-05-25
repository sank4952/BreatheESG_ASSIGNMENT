import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "..", "data");
const dbPath = path.join(dataDir, "db.json");

const emptyDb = {
  counters: {
    tenants: 1,
    facilities: 1,
    dataSources: 1,
    rawRecords: 1,
    emissionRecords: 1,
    reviewDecisions: 1,
    auditLogs: 1,
  },
  tenants: [],
  facilities: [],
  dataSources: [],
  rawRecords: [],
  emissionRecords: [],
  reviewDecisions: [],
  auditLogs: [],
};

export async function ensureDb() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dbPath);
  } catch {
    await writeDb(emptyDb);
  }
}

export async function readDb() {
  await ensureDb();
  return JSON.parse(await fs.readFile(dbPath, "utf8"));
}

export async function writeDb(db) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
}

export async function resetDb() {
  await writeDb(structuredClone(emptyDb));
}

export function nextId(db, collectionName) {
  const id = db.counters[collectionName];
  db.counters[collectionName] += 1;
  return id;
}

export function nowIso() {
  return new Date().toISOString();
}

