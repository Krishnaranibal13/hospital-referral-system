import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, CheckCircle2, XCircle, MapPin, ChevronLeft, ChevronRight } from "lucide-react";
import api from "../api/client";
import { formatDate } from "../utils/date";

const PAGE_SIZE = 10;
const TABS = [
  { key: "PENDING", label: "Pending" },
  { key: "CREDITED", label: "Credited" },
  { key: "REJECTED", label: "Rejected" },
  { key: "", label: "All" },
];

export default function ReceptionDashboard() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("PENDING");
  const [doctorId, setDoctorId] = useState("");
  const [range, setRange] = useState("all");
  const [doctors, setDoctors] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "null");

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get("/referrals", {
        params: {
          status: tab || undefined,
          search: search || undefined,
          doctorId: doctorId || undefined,
          range: range !== "all" ? range : undefined,
        },
      });
      setReferrals(data);
    } finally {
      setLoading(false);
    }
  }

  async function loadDoctors() {
    try {
      const { data } = await api.get("/doctors/lite");
      setDoctors(data);
    } catch {
      // non-critical — filter dropdown just stays empty
    }
  }

  useEffect(() => { loadDoctors(); }, []);
  useEffect(() => { load(); }, [tab, doctorId, range]);
  useEffect(() => { setPage(1); }, [tab, doctorId, range, referrals.length]);

  async function markArrived(referral) {
    setMessage("");
    const defaultAmount = Number(referral.doctor?.creditAmount ?? 0);
    const input = prompt(
      `Credit amount for ${referral.doctor?.name} (default ₹${defaultAmount.toFixed(2)}). Edit if needed:`,
      defaultAmount.toFixed(2)
    );
    if (input === null) return;
    const amount = Number(input);
    if (Number.isNaN(amount) || amount < 0) {
      setMessage("Please enter a valid non-negative amount.");
      return;
    }
    try {
      await api.post(`/referrals/${referral.id}/arrive`, { amount });
      setMessage(`Patient confirmed — ₹${amount.toFixed(2)} credited to ${referral.doctor?.name}.`);
      load();
    } catch (err) {
      setMessage(err.response?.data?.error || "Failed to update referral");
    }
  }

  async function reject(id) {
    const reason = prompt("Reason for rejecting this match (optional):") || "";
    try {
      await api.post(`/referrals/${id}/reject`, { reason });
      load();
    } catch (err) {
      setMessage(err.response?.data?.error || "Failed to update referral");
    }
  }

  function logout() {
    localStorage.clear();
    navigate("/login");
  }

  return (
    <div>
      <div className="topbar">
        <div className="topbar-brand">
          <img src="/logo.png" alt="Vedansh Medicare" />
          <div><strong>Reception — Referral Matching</strong><span className="brand-sub">{user?.hospitalName}{user?.hospitalBranchName ? ` · ${user.hospitalBranchName}` : ""}</span></div>
        </div>
        <div>
          <span style={{ marginRight: 16, color: "#667085" }}>{user?.name}</span>
          <button className="secondary" style={{ width: "auto", padding: "6px 14px" }} onClick={logout}>Log out</button>
        </div>
      </div>

      <div className="container-wide">
        <div className="card">
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                className={`tab-btn ${tab === t.key ? "" : "secondary"}`}
                style={{ width: "auto" }}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label>Doctor</label>
              <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
                <option value="">All doctors</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}{d.clinicName ? ` (${d.clinicName})` : ""}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label>Date range</label>
              <select value={range} onChange={(e) => setRange(e.target.value)}>
                <option value="all">All time</option>
                <option value="today">Today</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 3 months</option>
              </select>
            </div>
          </div>

          <label>Search by patient name or phone</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="e.g. Ramesh or 98765..." />
            <button style={{ width: 120 }} onClick={load} disabled={loading}>{loading ? "…" : <><Search size={15} />Search</>}</button>
          </div>

          {message && <p className="success">{message}</p>}

          <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Patient</th><th>Age</th><th>Gender</th><th>Phone</th><th>Referred by</th><th>Status</th><th>Credit</th><th>Location</th><th>Submitted</th><th></th></tr>
            </thead>
            <tbody>
              {referrals.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r) => (
                <tr key={r.id}>
                  <td>{r.patientName}</td>
                  <td>{r.patientAge}</td>
                  <td>{r.patientGender ? r.patientGender.charAt(0) + r.patientGender.slice(1).toLowerCase() : "—"}</td>
                  <td>{r.patientPhone || "—"}</td>
                  <td>{r.doctor?.name}{r.doctor?.clinicName ? ` (${r.doctor.clinicName})` : ""}</td>
                  <td><span className={`badge ${r.status}`}>{r.status}</span></td>
                  <td>{r.transaction ? `₹${Number(r.transaction.amount).toFixed(2)}` : "—"}</td>
                  <td>
                    {r.scanLatitude != null ? (
                      <a href={`https://www.google.com/maps?q=${r.scanLatitude},${r.scanLongitude}`} target="_blank" rel="noreferrer">
                        {r.scanAddress ? r.scanAddress.slice(0, 30) + (r.scanAddress.length > 30 ? "…" : "") : "View on map"}
                      </a>
                    ) : (
                      <span style={{ color: "var(--ink-soft)" }}>Not shared</span>
                    )}
                  </td>
                  <td>{formatDate(r.createdAt)}</td>
                  <td style={{ display: "flex", gap: 6 }}>
                    {r.status === "PENDING" && (
                      <>
                        <button style={{ width: "auto", padding: "6px 10px" }} onClick={() => markArrived(r)}><CheckCircle2 size={14} />Confirm</button>
                        <button className="danger" style={{ width: "auto", padding: "6px 10px" }} onClick={() => reject(r.id)}><XCircle size={14} />Reject</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {referrals.length === 0 && !loading && (
                <tr><td colSpan={10} style={{ color: "var(--ink-soft)" }}>No referrals found.</td></tr>
              )}
            </tbody>
          </table>
          </div>

          {referrals.length > PAGE_SIZE && (
            <div className="pagination">
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /></button>
              {Array.from({ length: Math.ceil(referrals.length / PAGE_SIZE) }, (_, i) => i + 1).map((p) => (
                <button key={p} className={p === page ? "active" : ""} onClick={() => setPage(p)}>{p}</button>
              ))}
              <button disabled={page === Math.ceil(referrals.length / PAGE_SIZE)} onClick={() => setPage((p) => p + 1)}><ChevronRight size={14} /></button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
