import { useState } from "react";
import { Upload, Download, CheckCircle2, AlertTriangle } from "lucide-react";
import Modal from "./Modal";
import api from "../api/client";

// Lets an admin upload an Excel sheet of existing referrers (doctors, ambulance staff,
// village Pradhans, etc.) and create them all as leader profiles in one go, instead of
// adding each one by hand. Columns are matched by header name, so the sheet doesn't need
// to be in a specific column order — only Name and a phone column are required.
export default function BulkImportLeadersModal({ onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null); // { createdCount, skippedCount, skipped }
  const [error, setError] = useState("");

  async function downloadTemplate() {
    try {
      const res = await api.get("/doctors/bulk-import/template", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = "leader-bulk-import-template.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError("Could not download the template. Try again in a moment.");
    }
  }

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) {
      setError("Choose an Excel file first.");
      return;
    }
    setError("");
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post("/doctors/bulk-import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(data);
      if (data.createdCount > 0) onImported?.();
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to import this file.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Modal title="Bulk import leaders" onClose={onClose} width={520}>
      {!result ? (
        <form onSubmit={handleUpload}>
          <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: -4 }}>
            Upload an Excel file (.xlsx) with columns <strong>Name</strong>, <strong>Specialty</strong>,{" "}
            <strong>Phone</strong>, <strong>Clinic Name</strong> (optional), and <strong>City</strong> (optional).
            Column order doesn't matter.
          </p>

          <button type="button" className="secondary" style={{ width: "auto", padding: "8px 14px", marginBottom: 16 }} onClick={downloadTemplate}>
            <Download size={15} />Download template
          </button>

          <label>Excel file</label>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            required
          />

          {error && <p className="error">{error}</p>}

          <button type="submit" disabled={uploading} style={{ marginTop: 12 }}>
            <Upload size={16} />
            {uploading ? "Importing…" : "Import leaders"}
          </button>
        </form>
      ) : (
        <div>
          <p style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--green-700)", fontWeight: 600 }}>
            <CheckCircle2 size={18} />{result.createdCount} leader{result.createdCount === 1 ? "" : "s"} imported
          </p>

          {result.skippedCount > 0 && (
            <div style={{ marginTop: 12 }}>
              <p style={{ display: "flex", alignItems: "center", gap: 8, color: "#b45309", fontWeight: 600 }}>
                <AlertTriangle size={18} />{result.skippedCount} row{result.skippedCount === 1 ? "" : "s"} skipped
              </p>
              <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8, marginTop: 8 }}>
                <table style={{ margin: 0 }}>
                  <thead>
                    <tr><th>Row</th><th>Reason</th></tr>
                  </thead>
                  <tbody>
                    {result.skipped.map((s) => (
                      <tr key={s.row}><td>{s.row}</td><td>{s.reason}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 8 }}>
                Fix these rows in your sheet and re-upload just those — already-imported leaders won't be duplicated
                as long as you remove the successful rows first.
              </p>
            </div>
          )}

          <button style={{ marginTop: 16 }} onClick={onClose}>Done</button>
        </div>
      )}
    </Modal>
  );
}
