import { useEffect, useState } from "react";
import { History, RotateCcw, AlertTriangle, CheckCircle2 } from "lucide-react";
import Modal from "./Modal";
import EmptyState from "./EmptyState";
import api from "../api/client";
import { formatDateTime } from "../utils/date";

// Lets an admin see past "Bulk import" uploads (All Referrals tab) and undo one — deleting
// every patient row (and any credit) it created — if it turns out to have been the wrong
// file, a duplicate upload, etc.
export default function ImportHistoryModal({ onClose, onReverted }) {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revertingId, setRevertingId] = useState(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/referrals/bulk-import/batches");
      setBatches(data.batches);
    } catch {
      setError("Could not load import history. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function revert(batch) {
    if (
      !confirm(
        `Undo this import? This will permanently delete the ${batch.remainingCount} patient` +
          `${batch.remainingCount === 1 ? "" : "s"} it added${batch.fileName ? ` from "${batch.fileName}"` : ""}, ` +
          `and any credit they generated. This can't be undone.`
      )
    ) {
      return;
    }
    setError("");
    setRevertingId(batch.id);
    try {
      const { data } = await api.post(`/referrals/bulk-import/batches/${batch.id}/revert`);
      onReverted?.();
      await load();
      setError("");
      alert(`${data.revertedCount} patient${data.revertedCount === 1 ? "" : "s"} removed.`);
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to revert this import.");
    } finally {
      setRevertingId(null);
    }
  }

  return (
    <Modal title="Import history" onClose={onClose} width={640}>
      <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: -4 }}>
        Every "Bulk import" upload on this tab, most recent first. Undoing one removes the
        patients it added — rows with a payout already marked "Paid" are protected and must be
        handled individually.
      </p>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p style={{ fontSize: 14, color: "var(--ink-soft)" }}>Loading…</p>
      ) : batches.length === 0 ? (
        <EmptyState icon={History} title="No imports yet" subtitle="Bulk-imported patients will show up here" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {batches.map((b) => (
            <div
              key={b.id}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: 12,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {b.fileName || "Bulk import"}
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 2 }}>
                  {formatDateTime(b.createdAt)} · by {b.importedByName} · {b.createdCount} imported
                  {b.skippedCount > 0 ? `, ${b.skippedCount} skipped` : ""}
                </div>
                {b.revertedAt ? (
                  <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                    <CheckCircle2 size={13} />Reverted {formatDateTime(b.revertedAt)}
                  </div>
                ) : b.redeemedCount > 0 ? (
                  <div style={{ fontSize: 12, color: "#b45309", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                    <AlertTriangle size={13} />{b.redeemedCount} already paid out — can't auto-revert
                  </div>
                ) : b.remainingCount === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>
                    Rows no longer present
                  </div>
                ) : null}
              </div>

              {!b.revertedAt && b.remainingCount > 0 && b.redeemedCount === 0 && (
                <button
                  className="danger"
                  style={{ width: "auto", padding: "6px 12px" }}
                  disabled={revertingId === b.id}
                  onClick={() => revert(b)}
                >
                  <RotateCcw size={14} />
                  {revertingId === b.id ? "Reverting…" : "Undo import"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <button className="secondary" style={{ marginTop: 16 }} onClick={onClose}>Close</button>
    </Modal>
  );
}
