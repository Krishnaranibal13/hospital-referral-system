import { useEffect, useRef, useState } from "react";
import { Search, ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from "lucide-react";
import EmptyState from "./EmptyState";
import api from "../api/client";

const PERIOD_COLUMNS = [
  ["week", "Weekly"],
  ["fortnight", "Fortnightly"],
  ["month", "Monthly"],
  ["3months", "3 Months"],
  ["6months", "6 Months"],
];

// Leaders can number in the thousands, so — unlike the marketing-employee comparison table,
// which fits comfortably on one screen — search, sort, and pagination all happen server-side
// here. The frontend only ever holds one page (25 rows) in memory at a time.
export default function LeaderComparisonPanel() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortPeriod, setSortPeriod] = useState("month");
  const [sortDir, setSortDir] = useState("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(pageOverride) {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/doctors/comparison", {
        params: { search: search || undefined, sortPeriod, sortDir, page: pageOverride || page },
      });
      setRows(data.rows);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch {
      setError("Could not load the leader comparison. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  // Search/sort changes jump back to page 1 and reload; a plain page change just reloads.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) return;
    if (page !== 1) { setPage(1); return; }
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortPeriod, sortDir]);
  useEffect(() => {
    load(page);
    isFirstRender.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function runSearch() {
    if (page !== 1) setPage(1); else load(1);
  }

  function toggleSort(period) {
    if (sortPeriod === period) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortPeriod(period); setSortDir("desc"); }
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: -6, marginBottom: 12 }}>
        Leads and credit points per leader, across every window. Click a column to sort by it — handles any number of leaders since sorting and paging happen on the server.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, maxWidth: 420 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: 13, color: "var(--ink-soft)" }} />
          <input
            style={{ paddingLeft: 34 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Search leader name…"
          />
        </div>
        <button style={{ width: "auto", padding: "11px 16px" }} onClick={runSearch}><Search size={15} />Search</button>
      </div>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p style={{ fontSize: 14, color: "var(--ink-soft)" }}>Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={Search} title="No leaders match" subtitle="Try a different search" />
      ) : (
        <>
          <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 8 }}>{total} leader{total === 1 ? "" : "s"}</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Leader</th>
                  {PERIOD_COLUMNS.map(([key, label]) => (
                    <th key={key} className="sortable" onClick={() => toggleSort(key)}>
                      {label}
                      {sortPeriod === key ? (sortDir === "asc" ? <ChevronUp size={12} style={{ display: "inline" }} /> : <ChevronDown size={12} style={{ display: "inline" }} />) : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.name}</div>
                      {r.clinicName && <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{r.clinicName}</div>}
                    </td>
                    {PERIOD_COLUMNS.map(([key]) => (
                      <td key={key}>
                        <div>{r.byPeriod[key].leadsCount} lead{r.byPeriod[key].leadsCount !== 1 ? "s" : ""}</div>
                        <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{r.byPeriod[key].amount.toFixed(2)} pts</div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
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
