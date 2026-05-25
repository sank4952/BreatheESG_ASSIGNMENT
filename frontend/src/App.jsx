import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle, Check, Database, FileUp, Lock, RefreshCw, X } from "lucide-react";
import { api } from "./api";
import "./styles.css";

const sourceOptions = [
  { value: "SAP", label: "SAP fuel/procurement CSV" },
  { value: "UTILITY", label: "Utility electricity CSV" },
  { value: "TRAVEL", label: "Travel platform CSV" },
];

function formatKg(value) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function App() {
  const [tenants, setTenants] = useState([]);
  const [tenantId, setTenantId] = useState("");
  const [summary, setSummary] = useState(null);
  const [sources, setSources] = useState([]);
  const [records, setRecords] = useState([]);
  const [failuresOpen, setFailuresOpen] = useState(false);
  const [uploadState, setUploadState] = useState({ source_type: "SAP", file: null });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function loadData() {
    const [tenantRes, summaryRes, sourceRes, recordRes] = await Promise.all([
      api.get("/tenants/"),
      api.get("/summary/"),
      api.get("/data-sources/"),
      api.get("/emission-records/"),
    ]);
    setTenants(tenantRes.data);
    setTenantId((current) => current || tenantRes.data[0]?.id || "");
    setSummary(summaryRes.data);
    setSources(sourceRes.data);
    setRecords(recordRes.data);
  }

  useEffect(() => {
    loadData().catch(() => setMessage("Could not reach the API. Start the Node backend or set VITE_API_URL."));
  }, []);

  const filteredRecords = useMemo(
    () => records.filter((record) => !tenantId || String(record.tenant) === String(tenantId)),
    [records, tenantId],
  );

  async function uploadFile(event) {
    event.preventDefault();
    if (!tenantId || !uploadState.file) return;
    const form = new FormData();
    form.append("tenant", tenantId);
    form.append("source_type", uploadState.source_type);
    form.append("file", uploadState.file);
    setBusy(true);
    setMessage("");
    try {
      const response = await api.post("/data-sources/upload/", form);
      setMessage(`Uploaded ${response.data.file_name}: ${response.data.total_rows - response.data.failed_rows} normalized, ${response.data.failed_rows} failed.`);
      await loadData();
    } catch (error) {
      setMessage(error.response?.data?.detail || "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function review(record, decision) {
    await api.post(`/emission-records/${record.id}/review/`, { decision });
    await loadData();
  }

  async function lockApproved() {
    const response = await api.post("/emission-records/lock_approved/");
    setMessage(`Locked ${response.data.locked_count} approved records for audit.`);
    await loadData();
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Breathe ESG ingestion review</h1>
          <p>Raw source rows, normalized emissions, review decisions, and audit lock.</p>
        </div>
        <button className="icon-button" onClick={loadData} title="Refresh">
          <RefreshCw size={18} />
        </button>
      </header>

      <section className="controls">
        <label>
          Tenant
          <select value={tenantId} onChange={(event) => setTenantId(event.target.value)}>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
            ))}
          </select>
        </label>
        <form className="upload-form" onSubmit={uploadFile}>
          <select value={uploadState.source_type} onChange={(event) => setUploadState({ ...uploadState, source_type: event.target.value })}>
            {sourceOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <input type="file" accept=".csv" onChange={(event) => setUploadState({ ...uploadState, file: event.target.files?.[0] })} />
          <button disabled={busy || !uploadState.file}>
            <FileUp size={16} /> Upload
          </button>
        </form>
        <button className="lock-button" onClick={lockApproved}>
          <Lock size={16} /> Lock approved
        </button>
      </section>

      {message && <div className="message">{message}</div>}

      <section className="metrics">
        <Metric icon={<Database />} label="Normalized rows" value={summary?.total_records || 0} />
        <Metric icon={<AlertTriangle />} label="Flagged rows" value={summary?.flagged || 0} />
        <Metric icon={<X />} label="Failed raw rows" value={summary?.failed_raw_rows || 0} />
        <Metric icon={<Check />} label="Pending review" value={summary?.pending || 0} />
      </section>

      <section className="split">
        <div>
          <div className="section-title">
            <h2>Analyst review queue</h2>
            <span>{filteredRecords.length} rows</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Scope</th>
                  <th>Activity</th>
                  <th>Period</th>
                  <th>CO2e kg</th>
                  <th>Flags</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record) => (
                  <tr key={record.id}>
                    <td>{record.source_type}<small>{record.file_name} row {record.row_number}</small></td>
                    <td>{record.scope.replace("_", " ")}</td>
                    <td>{record.activity_type}<small>{record.normalized_value} {record.normalized_unit}</small></td>
                    <td>{record.start_date} to {record.end_date}</td>
                    <td>{formatKg(record.co2e_kg)}</td>
                    <td>{record.is_flagged ? <span className="flag">{record.flag_reason}</span> : <span className="muted">Clear</span>}</td>
                    <td><span className={`status ${record.status.toLowerCase()}`}>{record.status}</span></td>
                    <td className="row-actions">
                      <button title="Approve" disabled={record.status === "LOCKED"} onClick={() => review(record, "APPROVE")}><Check size={15} /></button>
                      <button title="Reject" disabled={record.status === "LOCKED"} onClick={() => review(record, "REJECT")}><X size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside>
          <div className="section-title">
            <h2>Ingestion monitor</h2>
          </div>
          {sources.map((source) => (
            <div className="source-row" key={source.id}>
              <strong>{source.source_type}</strong>
              <span>{source.file_name}</span>
              <small>{source.total_rows} rows, {source.failed_rows} failed</small>
            </div>
          ))}
          <button className="text-button" onClick={() => setFailuresOpen(!failuresOpen)}>Show failed row reasons</button>
          {failuresOpen && (
            <div className="failures">
              {(summary?.recent_failures || []).map((failure, index) => (
                <p key={index}>{failure.data_source__source_type} row {failure.row_number}: {failure.error_message}</p>
              ))}
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

function Metric({ icon, label, value }) {
  return (
    <div className="metric">
      {React.cloneElement(icon, { size: 19 })}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
