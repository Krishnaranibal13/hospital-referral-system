import { useEffect, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { TrendingUp, Users, Loader2 } from "lucide-react";
import Modal from "./Modal";
import api from "../api/client";

// Full detail view for one marketing-team member: every leader associated with them, and
// weekly (last 8 weeks) / monthly (last 6 months) referral trend charts, so admin can see
// how their leaders are performing over time, not just a lifetime total.
export default function MarketingPersonDetailModal({ personId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/marketing-persons/${personId}`);
        setData(res.data);
      } catch (err) {
        setError(err?.response?.data?.error || "Failed to load details.");
      } finally {
        setLoading(false);
      }
    })();
  }, [personId]);

  return (
    <Modal title={data ? data.person.name : "Marketing person"} onClose={onClose} width={720}>
      {loading && (
        <p style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink-soft)" }}>
          <Loader2 size={16} className="spin" />Loading…
        </p>
      )}
      {error && <p className="error">{error}</p>}

      {data && (
        <div>
          <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: -8 }}>
            {data.person.phone || "No phone"}{data.person.email ? ` · ${data.person.email}` : ""}
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", fontWeight: 700, textTransform: "uppercase" }}>Leaders</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{data.leaders.length}</div>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", fontWeight: 700, textTransform: "uppercase" }}>Total leads</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{data.totalReferrals}</div>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", fontWeight: 700, textTransform: "uppercase" }}>Total credited</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{data.totalCredited.toFixed(2)} pts</div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <TrendingUp size={16} color="var(--teal-600)" />
            <h4 style={{ margin: 0 }}>Weekly — last 8 weeks</h4>
          </div>
          <div style={{ width: "100%", height: 140, marginBottom: 20 }}>
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

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <TrendingUp size={16} color="var(--teal-600)" />
            <h4 style={{ margin: 0 }}>Monthly — last 6 months</h4>
          </div>
          <div style={{ width: "100%", height: 140, marginBottom: 20 }}>
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

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Users size={16} color="var(--teal-600)" />
            <h4 style={{ margin: 0 }}>Leaders under {data.person.name}</h4>
          </div>
          {data.leaders.length === 0 ? (
            <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>No leaders associated with this person yet.</p>
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
      )}
    </Modal>
  );
}
