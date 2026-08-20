import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Lock, TrendingUp, Users, LogOut } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

// Standalone, read-only self-service portal for a hospital marketing-team member. Reached
// via their personal QR/link (/marketing/:id) + a password only they know. Deliberately
// has no referral-management actions of any kind — just their own stats, nothing else, and
// no way to see any other marketing person's data. Uses its own token storage (keyed by
// this person's id) rather than the shared staff `api` client, so it never collides with a
// hospital-staff login open in the same browser.
export default function MarketingPersonDashboard() {
  const { id } = useParams();
  const tokenKey = `marketing_token_${id}`;

  const [token, setToken] = useState(() => localStorage.getItem(tokenKey) || "");
  const [password, setPassword] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  async function loadReport(activeToken) {
    setLoading(true);
    setLoadError("");
    try {
      const res = await axios.get(`${API_BASE}/marketing-persons/public/me`, {
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      setData(res.data);
    } catch (err) {
      if (err.response?.status === 401) {
        // token expired or invalid — drop it and show the password screen again
        localStorage.removeItem(tokenKey);
        setToken("");
      } else {
        setLoadError(err.response?.data?.error || "Failed to load your report.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) loadReport(token);
  }, [token]);

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError("");
    setLoggingIn(true);
    try {
      const res = await axios.post(`${API_BASE}/marketing-persons/public/${id}/login`, { password });
      localStorage.setItem(tokenKey, res.data.token);
      setToken(res.data.token);
    } catch (err) {
      setLoginError(err.response?.data?.error || "Failed to log in.");
    } finally {
      setLoggingIn(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(tokenKey);
    setToken("");
    setData(null);
    setPassword("");
  }

  // -------------------- Password gate --------------------
  if (!token) {
    return (
      <div className="container" style={{ maxWidth: 420, paddingTop: 60 }}>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ display: "inline-flex", width: 48, height: 48, borderRadius: 12, background: "var(--teal-600)", color: "#fff", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
            <Lock size={22} />
          </div>
          <h2 style={{ margin: "0 0 4px" }}>Marketing Portal</h2>
          <p style={{ color: "var(--ink-soft)", fontSize: 14, marginTop: 0 }}>Enter your password to view your stats.</p>
          <form onSubmit={handleLogin} style={{ textAlign: "left" }}>
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required />
            {loginError && <p className="error">{loginError}</p>}
            <button type="submit" disabled={loggingIn} style={{ marginTop: 8 }}>{loggingIn ? "Checking…" : "View my stats"}</button>
          </form>
        </div>
      </div>
    );
  }

  // -------------------- Loading / error --------------------
  if (loading && !data) {
    return <div className="container" style={{ paddingTop: 60 }}><p>Loading…</p></div>;
  }
  if (loadError && !data) {
    return (
      <div className="container" style={{ maxWidth: 420, paddingTop: 60 }}>
        <div className="card">
          <p className="error">{loadError}</p>
          <button className="secondary" onClick={handleLogout}>Try again</button>
        </div>
      </div>
    );
  }
  if (!data) return null;

  // -------------------- Report --------------------
  return (
    <div>
      <div className="topbar">
        <div className="topbar-brand">
          <img src="/logo.png" alt="" />
          <div>
            <strong>{data.person.name}</strong>
            <span className="brand-sub">Marketing portal</span>
          </div>
        </div>
        <button className="secondary" style={{ width: "auto", padding: "8px 16px" }} onClick={handleLogout}>
          <LogOut size={15} />Log out
        </button>
      </div>

      <div className="container" style={{ maxWidth: 1000 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 12, color: "var(--ink-soft)", fontWeight: 700, textTransform: "uppercase" }}>Your leaders</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{data.leaders.length}</div>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 12, color: "var(--ink-soft)", fontWeight: 700, textTransform: "uppercase" }}>Total leads</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{data.totalReferrals}</div>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 12, color: "var(--ink-soft)", fontWeight: 700, textTransform: "uppercase" }}>Total credited</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{data.totalCredited.toFixed(2)} pts</div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <TrendingUp size={16} color="var(--teal-600)" />
            <h4 style={{ margin: 0 }}>Weekly — last 8 weeks</h4>
          </div>
          <div style={{ width: "100%", height: 180 }}>
            <ResponsiveContainer>
              <BarChart data={data.weekly} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="weekStart" tickFormatter={(d) => { const [, m, day] = d.split("-"); return `${day}/${m}`; }} fontSize={11} stroke="var(--ink-soft)" />
                <YAxis allowDecimals={false} fontSize={11} stroke="var(--ink-soft)" width={28} />
                <Tooltip labelFormatter={(d) => `Week of ${d}`} formatter={(value, name) => [value, name === "count" ? "Leads" : "Credited (pts)"]} />
                <Bar dataKey="count" fill="var(--teal-500)" radius={[4, 4, 0, 0]} name="count" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <TrendingUp size={16} color="var(--teal-600)" />
            <h4 style={{ margin: 0 }}>Monthly — last 6 months</h4>
          </div>
          <div style={{ width: "100%", height: 180 }}>
            <ResponsiveContainer>
              <BarChart data={data.monthly} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" fontSize={11} stroke="var(--ink-soft)" />
                <YAxis allowDecimals={false} fontSize={11} stroke="var(--ink-soft)" width={28} />
                <Tooltip formatter={(value, name) => [value, name === "count" ? "Leads" : "Credited (pts)"]} />
                <Bar dataKey="count" fill="var(--navy-700)" radius={[4, 4, 0, 0]} name="count" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Users size={16} color="var(--teal-600)" />
            <h4 style={{ margin: 0 }}>Your leaders</h4>
          </div>
          {data.leaders.length === 0 ? (
            <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>No leaders associated with you yet — ask your admin.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Leader</th><th>Leads</th><th>Credited</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {data.leaders.map((l) => (
                    <tr key={l.id}>
                      <td>{l.name}{l.clinicName ? ` (${l.clinicName})` : ""}</td>
                      <td>{l.totalReferrals}</td>
                      <td>{l.totalCredited.toFixed(2)} pts</td>
                      <td><span className={`badge ${l.active ? "CREDITED" : "REJECTED"}`}>{l.active ? "Active" : "Inactive"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
