import { useEffect, useRef, useState } from "react";
import { History, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import EmptyState from "./EmptyState";
import DateRangePicker from "./DateRangePicker";
import api from "../api/client";
import { formatDateTime } from "../utils/date";

// Turns an action code like "referral.credited" or "credit.redeemed_all" into a readable
// label, and a stable color, without needing a giant lookup table kept in sync by hand.
const ACTION_COLORS = {
  referral: "#1f9dae",
  credit: "#15803d",
  doctor: "#7c3aed",
  marketing_person: "#c2410c",
  staff: "#0369a1",
  role: "#0369a1",
  hospital: "#6b7280",
};
function actionLabel(action) {
  if (!action) return "—";
  return action
    .split(".")
    .join(" ")
    .split("_")
    .join(" ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
function actionColor(action) {
  const group = (action || "").split(".")[0];
  return ACTION_COLORS[group] || "#1f9dae";
}

function formatValue(v) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return v.toFixed(2);
  // ISO-looking date strings print as a readable date/time instead of raw ISO text.
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return formatDateTime(v);
  return String(v);
}

export default function ActivityLogPanel() {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [filterOptions, setFilterOptions] = useState({ entityTypes: [], actions: [], actors: [] });
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    api.get("/activity-log/filters").then(({ data }) => setFilterOptions(data)).catch(() => {});
  }, []);

  async function load(pageOverride) {
    setLoading(true);
    setError("");
    try {
      const params = { page: pageOverride || page };
      if (entityType) params.entityType = entityType;
      if (action) params.action = action;
      if (actorUserId) params.actorUserId = actorUserId;
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;
      const { data } = await api.get("/activity-log", { params });
      setEntries(data.entries);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch {
      setError("Could not load the activity log. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  // Any filter change jumps back to page 1 and reloads; a plain page change just reloads.
  // The mount guard stops the filter-effect's initial run from double-fetching alongside
  // the page-effect's initial run — both fire on mount since all deps are "new" then.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) return;
    if (page !== 1) { setPage(1); return; }
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, action, actorUserId, dateFrom, dateTo]);
  useEffect(() => {
    load(page);
    isFirstRender.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function resetFilters() {
    setEntityType(""); setAction(""); setActorUserId(""); setDateFrom(""); setDateTo("");
  }
  const hasFilters = entityType || action || actorUserId || dateFrom || dateTo;

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <History size={18} color="var(--teal-600)" />
        <h3 style={{ margin: 0 }}>Activity Log</h3>
      </div>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 4, marginBottom: 16 }}>
        Every change across referrals, payouts, leaders, marketing team, and staff — who did it, when, and what it was before/after.
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 8 }}>
        <div>
          <label>Entity</label>
          <select value={entityType} onChange={(e) => setEntityType(e.target.value)} style={{ minWidth: 160 }}>
            <option value="">All entities</option>
            {filterOptions.entityTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label>Action</label>
          <select value={action} onChange={(e) => setAction(e.target.value)} style={{ minWidth: 200 }}>
            <option value="">All actions</option>
            {filterOptions.actions.map((a) => <option key={a} value={a}>{actionLabel(a)}</option>)}
          </select>
        </div>
        <div>
          <label>Done by</label>
          <select value={actorUserId} onChange={(e) => setActorUserId(e.target.value)} style={{ minWidth: 160 }}>
            <option value="">Everyone</option>
            {filterOptions.actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>

      <DateRangePicker from={dateFrom} to={dateTo} onChange={({ from, to }) => { setDateFrom(from); setDateTo(to); }} />

      {hasFilters && (
        <button type="button" className="secondary" style={{ width: "auto", padding: "6px 12px", marginTop: -8, marginBottom: 16 }} onClick={resetFilters}>
          <RotateCcw size={13} />Clear filters
        </button>
      )}

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p style={{ fontSize: 14, color: "var(--ink-soft)" }}>Loading…</p>
      ) : entries.length === 0 ? (
        <EmptyState icon={History} title="No activity found" subtitle={hasFilters ? "Try adjusting your filters" : "Actions will show up here as they happen"} />
      ) : (
        <>
          <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 8 }}>{total} entr{total === 1 ? "y" : "ies"}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {entries.map((e) => (
              <div key={e.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span
                      style={{
                        fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                        color: actionColor(e.action), background: `${actionColor(e.action)}15`,
                      }}
                    >
                      {actionLabel(e.action)}
                    </span>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{e.entityLabel || e.entityType}</span>
                  </div>
                  <span style={{ fontSize: 12, color: "var(--ink-soft)", whiteSpace: "nowrap" }}>{formatDateTime(e.createdAt)}</span>
                </div>

                <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 4 }}>
                  by <strong style={{ color: "var(--ink)" }}>{e.actorName}</strong>
                  {e.actorRole ? ` (${e.actorRole})` : ""}
                </div>

                {e.changes && Object.keys(e.changes).length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
                    {Object.entries(e.changes).map(([field, { from, to }]) => (
                      <div key={field} style={{ fontSize: 12.5 }}>
                        <span style={{ color: "var(--ink-soft)" }}>{field}:</span>{" "}
                        <span style={{ textDecoration: "line-through", color: "var(--ink-soft)" }}>{formatValue(from)}</span>
                        {" → "}
                        <span style={{ fontWeight: 600 }}>{formatValue(to)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {e.metadata && Object.keys(e.metadata).length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 12, color: "var(--ink-soft)" }}>
                    {Object.entries(e.metadata)
                      .filter(([, v]) => v !== null && v !== undefined && v !== "")
                      .map(([k, v]) => `${k}: ${formatValue(Array.isArray(v) ? v.join(", ") : v)}`)
                      .join("  ·  ")}
                  </div>
                )}
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="pagination" style={{ marginTop: 16 }}>
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /></button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                .reduce((acc, p, i, arr) => {
                  if (i > 0 && p - arr[i - 1] > 1) acc.push("…");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "…" ? (
                    <span key={`gap-${i}`} style={{ padding: "0 6px", color: "var(--ink-soft)" }}>…</span>
                  ) : (
                    <button key={p} className={p === page ? "active" : ""} onClick={() => setPage(p)}>{p}</button>
                  )
                )}
              <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight size={14} /></button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
