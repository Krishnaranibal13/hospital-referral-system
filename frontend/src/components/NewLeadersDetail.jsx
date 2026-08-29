import { useEffect, useRef, useState } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import EmptyState from "./EmptyState";
import api from "../api/client";
import { formatDateTime } from "../utils/date";

// Sits inside the Dashboard's "New leaders" card when expanded — shows which marketing
// person brought in this period's new leaders (a stable summary, unaffected by search) and
// the individual leader list below it (searchable + paginated, since a bulk-import day can
// mean hundreds of rows).
export default function NewLeadersDetail({ period }) {
  const [rows, setRows] = useState([]);
  const [marketingBreakdown, setMarketingBreakdown] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(pageOverride) {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/doctors/new-in-period", {
        params: { period, search: search || undefined, page: pageOverride || page },
      });
      setRows(data.rows);
      setMarketingBreakdown(data.marketingBreakdown);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch {
      setError("Could not load this period's new leaders. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  // Reload from scratch whenever the period (weekly/monthly) changes; clear any leftover
  // search text from before the switch too, so it doesn't look like it's filtering the new
  // period by an old search term.
  useEffect(() => { setSearch(""); }, [period]);

  // Search changes jump back to page 1 and reload; a plain page change just reloads. The
  // mount guard stops this effect's first run from double-fetching alongside the page effect
  // below, which also runs on mount.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) return;
    if (page !== 1) { setPage(1); return; }
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, search]);
  useEffect(() => {
    load(page);
    isFirstRender.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
      {error && <p className="error">{error}</p>}

      {marketingBreakdown.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>
            Brought in by
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {marketingBreakdown.map((m) => (
              <div key={m.name} style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--teal-50)", borderRadius: 8, padding: "6px 12px" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</span>
                <span style={{ fontSize: 12, color: "var(--teal-700)", fontWeight: 700 }}>{m.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 12, maxWidth: 360 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 11, color: "var(--ink-soft)" }} />
          <input
            style={{ paddingLeft: 30, fontSize: 13 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leader name…"
          />
        </div>
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={Search} title="No leaders match" subtitle={search ? "Try a different search" : "None added yet this period"} />
      ) : (
        <>
          <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 8 }}>{total} leader{total === 1 ? "" : "s"}</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Leader</th>
                  <th>Marketing person</th>
                  <th>Added</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.name}</div>
                      {r.clinicName && <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{r.clinicName}</div>}
                    </td>
                    <td>{r.marketingPersonName || "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{formatDateTime(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="pagination" style={{ marginTop: 12 }}>
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
