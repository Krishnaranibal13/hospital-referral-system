import { useEffect, useState, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Plus, X, LogIn, KeyRound, Trash2, Users, Stethoscope } from "lucide-react";
import api from "../api/client";
import { formatDate } from "../utils/date";
import Sidebar from "../components/Sidebar";

const ROUTES = { SUPER_ADMIN: "/super-admin", ADMIN: "/admin", RECEPTION: "/reception", STAFF: "/staff" };
const NAV_ITEMS = [{ key: "Hospitals", label: "Hospitals", icon: Building2 }];

export default function SuperAdminDashboard() {
  const [activeTab] = useState("Hospitals");
  const [hospitals, setHospitals] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", branchName: "", address: "", adminName: "", adminEmail: "", adminPassword: "" });
  const [expandedId, setExpandedId] = useState(null);
  const [expandedSection, setExpandedSection] = useState("staff"); // "staff" | "doctors"
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "null");

  async function load() {
    const { data } = await api.get("/hospitals");
    setHospitals(data);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      await api.post("/hospitals", form);
      setMessage(`${form.name} created. Admin login: ${form.adminEmail} — write this down, the form will now clear.`);
      setForm({ name: "", branchName: "", address: "", adminName: "", adminEmail: "", adminPassword: "" });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error?.formErrors?.join(", ") || err.response?.data?.error || "Failed to create hospital");
    }
  }

  async function removeHospital(h) {
    if (!confirm(`Remove ${h.name}${h.branchName ? ` (${h.branchName})` : ""}? This only works if it has no doctors yet.`)) return;
    try {
      await api.delete(`/hospitals/${h.id}`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to remove hospital");
    }
  }

  async function resetStaffPassword(staffId, staffName) {
    const password = prompt(`Set a new password for ${staffName} (min 6 characters):`);
    if (!password) return;
    setError("");
    setMessage("");
    try {
      await api.post(`/hospitals/staff/${staffId}/reset-password`, { password });
      setMessage(`Password updated for ${staffName}. New password: ${password}`);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to update password");
    }
  }

  async function loginAs(staffId, staffName) {
    setError("");
    try {
      const { data } = await api.post(`/hospitals/staff/${staffId}/impersonate`);
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      navigate(ROUTES[data.user.role] || "/login");
    } catch (err) {
      setError(err.response?.data?.error || `Failed to log in as ${staffName}`);
    }
  }

  function logout() {
    localStorage.clear();
    navigate("/login");
  }

  function toggleExpand(hospitalId, section) {
    if (expandedId === hospitalId && expandedSection === section) {
      setExpandedId(null);
    } else {
      setExpandedId(hospitalId);
      setExpandedSection(section);
    }
  }

  return (
    <div className="app-shell">
      <Sidebar
        items={NAV_ITEMS}
        activeKey={activeTab}
        onSelect={() => {}}
        brandName="Referral Platform"
        subtitle="Super Admin"
        userName={user?.name}
        userRole="Super Admin"
        onLogout={logout}
      />

      <div className="main-area">
        <div className="page-header">
          <div>
            <h2>Hospitals</h2>
            <p>Every hospital on the platform, their staff, and their doctors</p>
          </div>
        </div>

        {message && <p className="success">{message}</p>}
        {error && <p className="error">{error}</p>}

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Hospitals</h3>
            <button style={{ width: "auto", padding: "8px 16px" }} onClick={() => setShowForm(!showForm)}>
              {showForm ? <X size={16} /> : <Plus size={16} />}
              {showForm ? "Cancel" : "Add hospital"}
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleCreate} style={{ marginTop: 16 }}>
              <label>Hospital name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Vedansh Medicare" />
              <label>Branch name (optional)</label>
              <input value={form.branchName} onChange={(e) => setForm({ ...form, branchName: e.target.value })} placeholder="e.g. Surya Hospital" />
              <label>Address (optional)</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />

              <div style={{ borderTop: "1px solid var(--border)", margin: "16px 0", paddingTop: 16 }}>
                <p style={{ fontSize: 13, color: "var(--ink-soft)", fontWeight: 600, margin: "0 0 8px" }}>First admin account for this hospital</p>
                <label>Admin name</label>
                <input value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} required />
                <label>Admin email (used to log in)</label>
                <input type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} required />
                <label>Admin password</label>
                <input type="password" value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} required minLength={6} />
              </div>

              <button type="submit">Create hospital & admin</button>
            </form>
          )}

          <div className="table-wrap">
            <table style={{ marginTop: 16 }}>
              <thead>
                <tr><th>Hospital</th><th>Branch</th><th>Staff</th><th>Doctors</th><th>Created</th><th></th></tr>
              </thead>
              <tbody>
                {hospitals.map((h) => (
                  <Fragment key={h.id}>
                    <tr>
                      <td>{h.name}</td>
                      <td>{h.branchName || "—"}</td>
                      <td>
                        <button className="secondary" style={{ width: "auto", padding: "4px 10px" }} onClick={() => toggleExpand(h.id, "staff")}>
                          <Users size={13} />{h.staffCount} {expandedId === h.id && expandedSection === "staff" ? "▲" : "▼"}
                        </button>
                      </td>
                      <td>
                        <button className="secondary" style={{ width: "auto", padding: "4px 10px" }} onClick={() => toggleExpand(h.id, "doctors")}>
                          <Stethoscope size={13} />{h.doctorCount} {expandedId === h.id && expandedSection === "doctors" ? "▲" : "▼"}
                        </button>
                      </td>
                      <td>{formatDate(h.createdAt)}</td>
                      <td>
                        <button className="danger" style={{ width: "auto", padding: "6px 10px" }} onClick={() => removeHospital(h)}><Trash2 size={14} />Remove</button>
                      </td>
                    </tr>

                    {expandedId === h.id && expandedSection === "staff" && (
                      <tr>
                        <td colSpan={6} style={{ background: "var(--sky-50)" }}>
                          <div style={{ padding: "8px 0" }}>
                            {h.staff.length === 0 && <span style={{ color: "var(--ink-soft)" }}>No staff yet.</span>}
                            {h.staff.map((s) => (
                              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0", flexWrap: "wrap" }}>
                                <span style={{ minWidth: 140 }}>{s.name}</span>
                                <span style={{ minWidth: 220, color: "var(--ink-soft)" }}>{s.email}</span>
                                <span className="badge PENDING">{s.role === "STAFF" ? (s.customRole?.name || "Custom") : s.role}</span>
                                <button style={{ width: "auto", padding: "4px 10px" }} onClick={() => loginAs(s.id, s.name)}><LogIn size={13} />Log in as</button>
                                <button className="secondary" style={{ width: "auto", padding: "4px 10px" }} onClick={() => resetStaffPassword(s.id, s.name)}>
                                  <KeyRound size={13} />Reset password
                                </button>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}

                    {expandedId === h.id && expandedSection === "doctors" && (
                      <tr>
                        <td colSpan={6} style={{ background: "var(--green-50)" }}>
                          <div style={{ padding: "8px 0" }}>
                            {h.doctors.length === 0 && <span style={{ color: "var(--ink-soft)" }}>No doctors yet.</span>}
                            {h.doctors.map((d) => (
                              <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0", flexWrap: "wrap" }}>
                                <span style={{ minWidth: 160 }}>{d.name}</span>
                                <span style={{ minWidth: 160, color: "var(--ink-soft)" }}>{d.clinicName || "—"}</span>
                                <span style={{ minWidth: 120, color: "var(--ink-soft)" }}>{d.phone}</span>
                                <span className={`badge ${d.active ? "CREDITED" : "REJECTED"}`}>{d.active ? "Active" : "Inactive"}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {hospitals.length === 0 && (
                  <tr><td colSpan={6} style={{ color: "var(--ink-soft)" }}>No hospitals yet — create the first one above.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
