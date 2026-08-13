import { useEffect, useMemo, useState, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Stethoscope, Users, ClipboardList, Plus, Power,
  Wallet, Trash2, KeyRound, Download, Search, CheckCircle2,
  XCircle, MapPin, X, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Eye, TrendingUp, IndianRupee, UserCheck, Clock, Award, Activity, ArrowUpCircle, RotateCcw, Upload, LogOut, UserPlus, Pencil,
} from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import api from "../api/client";
import { formatDate, formatDateTime, formatShortDate } from "../utils/date";
import Sidebar from "../components/Sidebar";
import DateRangePicker from "../components/DateRangePicker";
import Avatar from "../components/Avatar";
import EmptyState from "../components/EmptyState";
import DropdownMenu from "../components/DropdownMenu";
import RedeemModal from "../components/RedeemModal";
import ConfirmLeadModal from "../components/ConfirmLeadModal";
import ConvertToIpdModal from "../components/ConvertToIpdModal";
import BulkImportLeadersModal from "../components/BulkImportLeadersModal";
import BulkImportReferralsModal from "../components/BulkImportReferralsModal";
import EditLeaderModal from "../components/EditLeaderModal";
import AddPatientModal from "../components/AddPatientModal";
import { PANEL_OPTIONS } from "../utils/panels";
import QrModal from "../components/QrModal";

const NAV_ITEMS = [
  { key: "Dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "Doctors", label: "Leaders", icon: Stethoscope },
  { key: "Staff", label: "Staff", icon: Users },
  { key: "All Referrals", label: "All Referrals", icon: ClipboardList },
];

const PERMISSION_LABELS = {
  VIEW_REFERRALS: "View all referrals & credit history (read-only)",
  EXPORT_REPORTS: "Export reports (PDF / Excel)",
  MANAGE_REFERRALS: "Confirm or reject referral arrivals",
  REDEEM_CREDITS: "Redeem (mark as paid out) doctor credit payouts",
};
const REFERRAL_TABS = [
  { key: "PENDING", label: "Pending" },
  { key: "CREDITED", label: "Credited" },
  { key: "REJECTED", label: "Rejected" },
  { key: "", label: "All" },
];
const DOCTORS_PAGE_SIZE = 8;
const RECENT_PAGE_SIZE = 7;
const REFERRALS_PAGE_SIZE = 50;

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [doctors, setDoctors] = useState([]);
  const [staff, setStaff] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [referralTotal, setReferralTotal] = useState(0);
  const [referralPage, setReferralPage] = useState(1);
  const [referralTab, setReferralTab] = useState("PENDING");
  const [referralSearch, setReferralSearch] = useState("");
  const [referralDoctorId, setReferralDoctorId] = useState("");
  const [referralDateFrom, setReferralDateFrom] = useState("");
  const [referralDateTo, setReferralDateTo] = useState("");

  const [dashboardData, setDashboardData] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [recentPage, setRecentPage] = useState(1);

  const [showDoctorForm, setShowDoctorForm] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showBulkImportReferrals, setShowBulkImportReferrals] = useState(false);
  const [editingLeader, setEditingLeader] = useState(null);
  const [doctorForm, setDoctorForm] = useState({ name: "", specialty: "", phone: "", email: "", clinicName: "", city: "", marketingPersonName: "", creditAmount: 0 });
  const [newDoctorQr, setNewDoctorQr] = useState(null);
  const [qrModalDoctor, setQrModalDoctor] = useState(null);
  const [qrLoadingId, setQrLoadingId] = useState(null);

  const [doctorSearch, setDoctorSearch] = useState("");
  const [doctorDateFrom, setDoctorDateFrom] = useState("");
  const [doctorDateTo, setDoctorDateTo] = useState("");
  const [doctorStatusFilter, setDoctorStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState("createdAt");
  const [sortDir, setSortDir] = useState("desc");
  const [doctorPage, setDoctorPage] = useState(1);

  const [showStaffForm, setShowStaffForm] = useState(false);
  const [staffForm, setStaffForm] = useState({ name: "", email: "", password: "", roleSelection: "RECEPTION" });
  const [customRoles, setCustomRoles] = useState([]);
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [roleForm, setRoleForm] = useState({ name: "", permissions: [] });
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [expandedRoleId, setExpandedRoleId] = useState(null);

  const [redeemModal, setRedeemModal] = useState(null); // { mode, doctor?, referral? }
  const [confirmModal, setConfirmModal] = useState(null); // referral being confirmed via IPD/OPD + file number
  const [convertModal, setConvertModal] = useState(null); // OPD referral being converted to IPD
  const [showAddPatient, setShowAddPatient] = useState(false);

  const [hospitalSettings, setHospitalSettings] = useState({ ipdAmount: 0, opdAmount: 0 });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "null");

  async function loadDoctorsAndStaff() {
    try {
      const [doctorsRes, staffRes, rolesRes] = await Promise.all([api.get("/doctors"), api.get("/staff"), api.get("/staff/roles")]);
      setDoctors(doctorsRes.data);
      setStaff(staffRes.data);
      setCustomRoles(rolesRes.data);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to load doctors/staff. Check the console for details.");
      console.error("loadDoctorsAndStaff failed:", err);
    }
  }

  async function loadDashboard() {
    setDashboardLoading(true);
    try {
      const { data } = await api.get("/dashboard/summary");
      setDashboardData(data);
    } catch {
      // non-fatal — dashboard tab will just show nothing
    } finally {
      setDashboardLoading(false);
    }
  }

  async function loadReferrals() {
    const { data } = await api.get("/referrals", {
      params: {
        status: referralTab || undefined,
        search: referralSearch || undefined,
        doctorId: referralDoctorId || undefined,
        from: referralDateFrom || undefined,
        to: referralDateTo || undefined,
        page: referralPage,
        pageSize: REFERRALS_PAGE_SIZE,
      },
    });
    setReferrals(data.referrals);
    setReferralTotal(data.total);
  }

  async function loadHospitalSettings() {
    try {
      const { data } = await api.get("/hospitals/settings");
      setHospitalSettings({ ipdAmount: Number(data.ipdAmount), opdAmount: Number(data.opdAmount) });
    } catch {
      // non-fatal — settings form just stays at defaults
    }
  }

  async function saveHospitalSettings(e) {
    e.preventDefault();
    setSettingsMessage("");
    setSavingSettings(true);
    try {
      const { data } = await api.patch("/hospitals/settings", {
        ipdAmount: Number(hospitalSettings.ipdAmount),
        opdAmount: Number(hospitalSettings.opdAmount),
      });
      setHospitalSettings({ ipdAmount: Number(data.ipdAmount), opdAmount: Number(data.opdAmount) });
      setSettingsMessage("Saved.");
    } catch (err) {
      setSettingsMessage(err.response?.data?.error || "Failed to save credit amounts");
    } finally {
      setSavingSettings(false);
    }
  }

  useEffect(() => { loadDoctorsAndStaff(); loadDashboard(); loadHospitalSettings(); }, []);
  useEffect(() => { if (activeTab === "All Referrals") setReferralPage(1); }, [activeTab, referralTab, referralDoctorId, referralDateFrom, referralDateTo]);
  useEffect(() => { if (activeTab === "All Referrals") loadReferrals(); }, [activeTab, referralTab, referralDoctorId, referralDateFrom, referralDateTo, referralPage]);
  useEffect(() => { setDoctorPage(1); }, [doctorSearch, doctorStatusFilter, doctorDateFrom, doctorDateTo]);
  useEffect(() => { setRecentPage(1); }, [dashboardData]);

  async function handleCreateDoctor(e) {
    e.preventDefault();
    setError("");
    try {
      const { data } = await api.post("/doctors", { ...doctorForm, creditAmount: Number(doctorForm.creditAmount) });
      setNewDoctorQr(data);
      setQrModalDoctor(data);
      setDoctorForm({ name: "", specialty: "", phone: "", email: "", clinicName: "", city: "", marketingPersonName: "", creditAmount: 0 });
      setShowDoctorForm(false);
      loadDoctorsAndStaff();
      loadDashboard();
    } catch (err) {
      setError(err.response?.data?.error?.formErrors?.join(", ") || "Failed to create doctor");
    }
  }

  async function handleViewQr(doctorId) {
    setQrLoadingId(doctorId);
    try {
      const { data } = await api.get(`/doctors/${doctorId}`);
      setQrModalDoctor(data);
    } catch {
      setError("Failed to load QR code");
    } finally {
      setQrLoadingId(null);
    }
  }

  async function toggleDoctorActive(doctor) {
    try {
      await api.patch(`/doctors/${doctor.id}`, { active: !doctor.active });
      loadDoctorsAndStaff();
    } catch {
      setError("Failed to update doctor status");
    }
  }

  async function confirmBulkRedeem({ paymentMethod, referenceNumber, remarks }) {
    const doctor = redeemModal.doctor;
    const { data } = await api.post(`/doctors/${doctor.id}/redeem-all`, { paymentMethod, referenceNumber, remarks });
    setMessage(data.message);
    setRedeemModal(null);
    loadDoctorsAndStaff();
    loadDashboard();
  }

  async function confirmSingleRedeem({ amount, paymentMethod, referenceNumber, remarks }) {
    const referral = redeemModal.referral;
    await api.post(`/referrals/${referral.id}/redeem`, { amount, paymentMethod, referenceNumber, remarks });
    setMessage("Marked as paid out.");
    setRedeemModal(null);
    loadReferrals();
    loadDoctorsAndStaff();
    loadDashboard();
  }

  async function handleCreateStaff(e) {
    e.preventDefault();
    setError("");
    const { roleSelection, ...rest } = staffForm;
    const payload =
      roleSelection === "ADMIN" || roleSelection === "RECEPTION"
        ? { ...rest, role: roleSelection }
        : { ...rest, role: "STAFF", customRoleId: roleSelection };
    try {
      await api.post("/staff", payload);
      setStaffForm({ name: "", email: "", password: "", roleSelection: "RECEPTION" });
      setShowStaffForm(false);
      setMessage("Staff account created.");
      loadDoctorsAndStaff();
    } catch (err) {
      setError(err.response?.data?.error?.formErrors?.join(", ") || err.response?.data?.error || "Failed to create staff account");
    }
  }

  async function resetStaffPassword(staffId, staffName) {
    const password = prompt(`Set a new password for ${staffName} (min 6 characters):`);
    if (!password) return;
    try {
      await api.post(`/staff/${staffId}/reset-password`, { password });
      setMessage(`Password updated for ${staffName}.`);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to update password");
    }
  }

  async function deleteStaff(staffId, staffName) {
    if (!confirm(`Remove ${staffName}'s account? This cannot be undone.`)) return;
    try {
      await api.delete(`/staff/${staffId}`);
      loadDoctorsAndStaff();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to delete account");
    }
  }

  function togglePermission(key) {
    setRoleForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key) ? f.permissions.filter((p) => p !== key) : [...f.permissions, key],
    }));
  }

  async function handleCreateRole(e) {
    e.preventDefault();
    setError("");
    try {
      if (editingRoleId) {
        await api.patch(`/staff/roles/${editingRoleId}`, roleForm);
        setMessage(`Role "${roleForm.name}" updated. Anyone already logged in with this role needs to log out and back in for the change to apply.`);
      } else {
        await api.post("/staff/roles", roleForm);
        setMessage(`Role "${roleForm.name}" created — you can now assign staff to it.`);
      }
      setRoleForm({ name: "", permissions: [] });
      setEditingRoleId(null);
      setShowRoleForm(false);
      loadDoctorsAndStaff();
    } catch (err) {
      setError(err.response?.data?.error?.formErrors?.permissions?.join(", ") || err.response?.data?.error || "Failed to save role");
    }
  }

  function startEditRole(role) {
    setRoleForm({ name: role.name, permissions: role.permissions });
    setEditingRoleId(role.id);
    setShowRoleForm(true);
  }

  function cancelRoleForm() {
    setShowRoleForm(false);
    setEditingRoleId(null);
    setRoleForm({ name: "", permissions: [] });
  }

  async function deleteRole(roleId, roleName) {
    if (!confirm(`Remove the "${roleName}" role? Only possible if no staff currently use it.`)) return;
    try {
      await api.delete(`/staff/roles/${roleId}`);
      loadDoctorsAndStaff();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to remove role");
    }
  }

  function openConfirmModal(referral) {
    setMessage("");
    setConfirmModal(referral);
  }

  async function handleConfirmLead({ fileNumber, visitType }) {
    const referral = confirmModal;
    await api.post(`/referrals/${referral.id}/arrive`, { fileNumber, visitType });
    setMessage(`Patient confirmed as ${visitType} (File No. ${fileNumber}) — credited to ${referral.doctor?.name}.`);
    setConfirmModal(null);
    loadReferrals();
    loadDoctorsAndStaff();
    loadDashboard();
  }

  function openConvertModal(referral) {
    setMessage("");
    setConvertModal(referral);
  }

  async function handleConvertToIpd({ fileNumber }) {
    const referral = convertModal;
    await api.post(`/referrals/${referral.id}/convert-to-ipd`, { fileNumber });
    setMessage(`${referral.patientName} converted to IPD (File No. ${fileNumber}) — ${referral.doctor?.name}'s credit updated.`);
    setConvertModal(null);
    loadReferrals();
    loadDoctorsAndStaff();
    loadDashboard();
  }

  async function reject(id) {
    const reason = prompt("Reason for rejecting this match (optional):") || "";
    try {
      await api.post(`/referrals/${id}/reject`, { reason });
      loadReferrals();
    } catch (err) {
      setMessage(err.response?.data?.error || "Failed to update referral");
    }
  }

  async function revertReferral(id) {
    if (!confirm("Revert this rejection? The lead will go back to Pending so reception can review it again.")) return;
    setMessage("");
    try {
      await api.post(`/referrals/${id}/revert`);
      setMessage("Rejection reverted — lead is back to Pending.");
      loadReferrals();
    } catch (err) {
      setMessage(err.response?.data?.error || "Failed to revert this referral");
    }
  }

  async function discharge(referral) {
    if (!confirm(`Mark ${referral.patientName} as discharged now?`)) return;
    setMessage("");
    try {
      await api.post(`/referrals/${referral.id}/discharge`);
      setMessage(`${referral.patientName} marked as discharged.`);
      loadReferrals();
    } catch (err) {
      setMessage(err.response?.data?.error || "Failed to mark as discharged");
    }
  }

  async function updatePanel(referralId, panel) {
    try {
      await api.patch(`/referrals/${referralId}/panel`, { panel: panel || null });
      loadReferrals();
    } catch (err) {
      setMessage(err.response?.data?.error || "Failed to update panel");
    }
  }

  async function exportReferrals(format) {
    setError("");
    try {
      const res = await api.get(`/referrals/export/${format}`, {
        params: {
          status: referralTab || undefined,
          search: referralSearch || undefined,
          doctorId: referralDoctorId || undefined,
          from: referralDateFrom || undefined,
        to: referralDateTo || undefined,
        },
        responseType: "blob",
      });
      const blob = new Blob([res.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `referrals.${format === "excel" ? "xlsx" : "pdf"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to export referrals");
    }
  }

  function logout() {
    localStorage.clear();
    navigate("/login");
  }

  function toggleSort(key) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  const filteredSortedDoctors = useMemo(() => {
    let list = doctors.filter((d) => {
      if (doctorStatusFilter === "active" && !d.active) return false;
      if (doctorStatusFilter === "inactive" && d.active) return false;
      if (doctorDateFrom && (!d.lastReferralAt || d.lastReferralAt.slice(0, 10) < doctorDateFrom)) return false;
      if (doctorDateTo && (!d.lastReferralAt || d.lastReferralAt.slice(0, 10) > doctorDateTo)) return false;
      if (doctorSearch) {
        const q = doctorSearch.toLowerCase();
        return d.name.toLowerCase().includes(q) || (d.clinicName || "").toLowerCase().includes(q) || (d.specialty || "").toLowerCase().includes(q);
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (sortKey === "createdAt" || sortKey === "lastReferralAt") { av = av ? new Date(av).getTime() : 0; bv = bv ? new Date(bv).getTime() : 0; }
      if (typeof av === "string") { av = av.toLowerCase(); bv = (bv || "").toLowerCase(); }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [doctors, doctorSearch, doctorStatusFilter, doctorDateFrom, doctorDateTo, sortKey, sortDir]);

  const doctorPageCount = Math.max(1, Math.ceil(filteredSortedDoctors.length / DOCTORS_PAGE_SIZE));
  const referralPageCount = Math.max(1, Math.ceil(referralTotal / REFERRALS_PAGE_SIZE));
  const recentPageCount = Math.max(1, Math.ceil((dashboardData?.recentReferrals?.length || 0) / RECENT_PAGE_SIZE));
  const paginatedDoctors = filteredSortedDoctors.slice((doctorPage - 1) * DOCTORS_PAGE_SIZE, doctorPage * DOCTORS_PAGE_SIZE);

  const pendingReferralsBadge = dashboardData?.kpis?.pendingReferrals || 0;

  function SortHeader({ label, sk }) {
    return (
      <th className="sortable" onClick={() => toggleSort(sk)}>
        {label}
        <span className="sort-arrow">
          {sortKey === sk ? (sortDir === "asc" ? <ChevronUp size={12} style={{ display: "inline" }} /> : <ChevronDown size={12} style={{ display: "inline" }} />) : ""}
        </span>
      </th>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        items={NAV_ITEMS}
        activeKey={activeTab}
        onSelect={setActiveTab}
        badges={{ "All Referrals": pendingReferralsBadge }}
        brandName={user?.hospitalName || "Hospital"}
        subtitle={user?.hospitalBranchName || "Admin"}
        userName={user?.name}
        userRole="Admin"
        onLogout={logout}
      />

      <div className="main-area">
        <div className="page-header">
          <div>
            <h2>{activeTab}</h2>
            <p>{user?.hospitalName}{user?.hospitalBranchName ? ` · ${user.hospitalBranchName}` : ""}</p>
          </div>
        </div>

        {message && <p className="success">{message}</p>}
        {error && <p className="error">{error}</p>}

        {/* ==================== DASHBOARD ==================== */}
        {activeTab === "Dashboard" && (
          <>
            <div className="card" style={{ marginBottom: 20 }}>
              <h3 style={{ marginTop: 0 }}>Lead credit amounts</h3>
              <p style={{ color: "var(--ink-soft)", fontSize: 14, marginTop: -8 }}>
                Fixed amounts credited to the referring doctor when reception confirms a lead, based on whether the patient was admitted (IPD) or seen as an outpatient (OPD).
              </p>
              <form onSubmit={saveHospitalSettings} style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div style={{ minWidth: 160 }}>
                  <label>OPD amount (pts)</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={hospitalSettings.opdAmount}
                    onChange={(e) => setHospitalSettings({ ...hospitalSettings, opdAmount: e.target.value })}
                    required
                  />
                </div>
                <div style={{ minWidth: 160 }}>
                  <label>IPD amount (pts)</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={hospitalSettings.ipdAmount}
                    onChange={(e) => setHospitalSettings({ ...hospitalSettings, ipdAmount: e.target.value })}
                    required
                  />
                </div>
                <button type="submit" style={{ width: "auto", padding: "8px 16px" }} disabled={savingSettings}>
                  {savingSettings ? "Saving…" : "Save"}
                </button>
                {settingsMessage && <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>{settingsMessage}</span>}
              </form>
            </div>

            {dashboardLoading && !dashboardData && <p style={{ color: "var(--ink-soft)" }}>Loading dashboard…</p>}
            {dashboardData && (
              <>
                <div className="kpi-grid">
                  <div className="kpi-card">
                    <div className="kpi-icon" style={{ background: "var(--navy-700)" }}><Stethoscope size={18} /></div>
                    <div className="kpi-label">Total Doctors</div>
                    <div className="kpi-value">{dashboardData.kpis.totalDoctors}</div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-icon" style={{ background: "var(--green-600)" }}><UserCheck size={18} /></div>
                    <div className="kpi-label">Active Doctors</div>
                    <div className="kpi-value">{dashboardData.kpis.activeDoctors}</div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-icon" style={{ background: "var(--teal-600)" }}><ClipboardList size={18} /></div>
                    <div className="kpi-label">Total Referrals</div>
                    <div className="kpi-value">{dashboardData.kpis.totalReferrals}</div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-icon" style={{ background: "#b45309" }}><Clock size={18} /></div>
                    <div className="kpi-label">Pending Payouts</div>
                    <div className="kpi-value">{dashboardData.kpis.totalPendingPayouts.toFixed(2)} pts</div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-icon" style={{ background: "var(--teal-700)" }}><IndianRupee size={18} /></div>
                    <div className="kpi-label">Total Credits Redeemed</div>
                    <div className="kpi-value">{dashboardData.kpis.totalCreditsRedeemed.toFixed(2)} pts</div>
                  </div>
                </div>

                <div className="card" style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <TrendingUp size={16} color="var(--teal-600)" />
                    <h3 style={{ margin: 0 }}>Referral trend — last 14 days</h3>
                  </div>
                  <div style={{ width: "100%", height: 160 }}>
                    <ResponsiveContainer>
                      <AreaChart data={dashboardData.trend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--teal-500)" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="var(--teal-500)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="date" tickFormatter={(d) => { const [, m, day] = d.split("-"); return `${day}/${m}`; }} fontSize={11} stroke="var(--ink-soft)" />
                        <YAxis allowDecimals={false} fontSize={11} stroke="var(--ink-soft)" width={28} />
                        <Tooltip labelFormatter={(d) => { const [y, m, day] = d.split("-"); return `${day}/${m}/${y.slice(2)}`; }} />
                        <Area type="monotone" dataKey="count" stroke="var(--teal-600)" fill="url(#trendFill)" strokeWidth={2} name="Referrals" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
                  <div className="card">
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <Award size={16} color="var(--teal-600)" />
                      <h3 style={{ margin: 0 }}>Top-performing doctors</h3>
                    </div>
                    {dashboardData.topDoctors.length === 0 ? (
                      <EmptyState icon={Award} title="No credited referrals yet" />
                    ) : (
                      <div style={{ maxHeight: 280, overflowY: "auto" }}>
                        {dashboardData.topDoctors.map((d, i) => (
                          <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", borderBottom: i < dashboardData.topDoctors.length - 1 ? "1px solid var(--border)" : "none" }}>
                            <Avatar name={d.name} size={30} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>{d.name}</div>
                              <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{d.clinicName || "—"} · {d.count} credit{d.count !== 1 ? "s" : ""}</div>
                            </div>
                            <div style={{ fontWeight: 700, color: "var(--teal-700)" }}>{d.total.toFixed(2)} pts</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="card">
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <Wallet size={16} color="#b45309" />
                      <h3 style={{ margin: 0 }}>Pending redemptions</h3>
                    </div>
                    {dashboardData.pendingRedemptions.length === 0 ? (
                      <EmptyState icon={CheckCircle2} title="All caught up" subtitle="No unpaid credits right now" />
                    ) : (
                      <div style={{ maxHeight: 280, overflowY: "auto" }}>
                        {dashboardData.pendingRedemptions.map((t, i) => (
                          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", borderBottom: i < dashboardData.pendingRedemptions.length - 1 ? "1px solid var(--border)" : "none" }}>
                            <Avatar name={t.doctor.name} size={30} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>{t.doctor.name}</div>
                              <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{t.referral?.patientName || "—"} · {formatDateTime(t.createdAt)}</div>
                            </div>
                            <div style={{ fontWeight: 700, color: "#b45309" }}>{Number(t.amount).toFixed(2)} pts</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="card" style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <Activity size={16} color="var(--teal-600)" />
                    <h3 style={{ margin: 0 }}>Recent referrals</h3>
                  </div>
                  {dashboardData.recentReferrals.length === 0 ? (
                    <EmptyState icon={ClipboardList} title="No referrals yet" subtitle="They'll show up here as doctors submit them" />
                  ) : (
                    <>
                      <div className="table-wrap">
                        <table>
                          <thead><tr><th>Patient</th><th>Referred by</th><th>Status</th><th>Submitted</th></tr></thead>
                          <tbody>
                            {dashboardData.recentReferrals
                              .slice((recentPage - 1) * RECENT_PAGE_SIZE, recentPage * RECENT_PAGE_SIZE)
                              .map((r) => (
                                <tr key={r.id}>
                                  <td>{r.patientName}</td>
                                  <td>{r.doctor?.name}{r.doctor?.clinicName ? ` (${r.doctor.clinicName})` : ""}</td>
                                  <td><span className={`badge ${r.status}`}>{r.status}</span></td>
                                  <td>{formatDateTime(r.createdAt)}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                      {recentPageCount > 1 && (
                        <div className="pagination">
                          <button disabled={recentPage === 1} onClick={() => setRecentPage((p) => p - 1)}><ChevronLeft size={14} /></button>
                          {Array.from({ length: recentPageCount }, (_, i) => i + 1).map((p) => (
                            <button key={p} className={p === recentPage ? "active" : ""} onClick={() => setRecentPage(p)}>{p}</button>
                          ))}
                          <button disabled={recentPage === recentPageCount} onClick={() => setRecentPage((p) => p + 1)}><ChevronRight size={14} /></button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="card">
                  <h3 style={{ marginTop: 0 }}>Quick actions</h3>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button style={{ width: "auto", padding: "10px 18px" }} onClick={() => { setActiveTab("Doctors"); setShowDoctorForm(true); }}>
                      <Plus size={15} />Add leader
                    </button>
                    <button className="secondary" style={{ width: "auto", padding: "10px 18px" }} onClick={() => { setActiveTab("Staff"); setShowStaffForm(true); }}>
                      <Plus size={15} />Add staff
                    </button>
                    <button className="secondary" style={{ width: "auto", padding: "10px 18px" }} onClick={() => setActiveTab("All Referrals")}>
                      <ClipboardList size={15} />View all referrals
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ==================== LEADERS ==================== */}
        {activeTab === "Doctors" && (
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <h3 style={{ margin: 0 }}>Leaders</h3>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="secondary" style={{ width: "auto", padding: "8px 16px" }} onClick={() => setShowBulkImport(true)}>
                  <Upload size={16} />Bulk import
                </button>
                <button style={{ width: "auto", padding: "8px 16px" }} onClick={() => { setShowDoctorForm(!showDoctorForm); setNewDoctorQr(null); }}>
                  {showDoctorForm ? <X size={16} /> : <Plus size={16} />}
                  {showDoctorForm ? "Cancel" : "Add leader"}
                </button>
              </div>
            </div>
            <p style={{ color: "var(--ink-soft)", fontSize: 13, marginTop: -6 }}>
              Doctors, ambulance staff, village Pradhans, or anyone else who refers patients to you.
            </p>

            {showDoctorForm && (
              <form onSubmit={handleCreateDoctor} style={{ marginTop: 16 }}>
                <label>Name</label>
                <input value={doctorForm.name} onChange={(e) => setDoctorForm({ ...doctorForm, name: e.target.value })} required />
                <label>Role / Specialty (optional)</label>
                <input value={doctorForm.specialty} onChange={(e) => setDoctorForm({ ...doctorForm, specialty: e.target.value })} placeholder="e.g. Ophthalmologist, Ambulance Staff, Village Pradhan" />
                <label>Phone</label>
                <input value={doctorForm.phone} onChange={(e) => setDoctorForm({ ...doctorForm, phone: e.target.value })} required />
                <label>Email (optional)</label>
                <input type="email" value={doctorForm.email} onChange={(e) => setDoctorForm({ ...doctorForm, email: e.target.value })} />
                <label>Clinic name (optional)</label>
                <input value={doctorForm.clinicName} onChange={(e) => setDoctorForm({ ...doctorForm, clinicName: e.target.value })} />
                <label>City (optional)</label>
                <input value={doctorForm.city} onChange={(e) => setDoctorForm({ ...doctorForm, city: e.target.value })} />
                <label>Marketing person (optional)</label>
                <input value={doctorForm.marketingPersonName} onChange={(e) => setDoctorForm({ ...doctorForm, marketingPersonName: e.target.value })} placeholder="Hospital marketing team member associated with this leader" />
                <p style={{ color: "var(--ink-soft)", fontSize: 12, marginTop: -8 }}>
                  Credit amounts are set once for the whole hospital under Dashboard → Lead credit amounts (IPD/OPD), not per leader.
                </p>
                <button type="submit">Create leader & generate QR</button>
              </form>
            )}

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16, alignItems: "flex-end" }}>
              <div style={{ flex: 2, minWidth: 220 }}>
                <label>Search leaders</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ position: "relative", flex: 1 }}>
                    <Search size={15} style={{ position: "absolute", left: 12, top: 13, color: "var(--ink-soft)" }} />
                    <input style={{ paddingLeft: 34 }} value={doctorSearch} onChange={(e) => setDoctorSearch(e.target.value)} placeholder="Name, clinic, or role…" />
                  </div>
                  <button style={{ width: "auto", padding: "11px 16px" }} onClick={() => setDoctorPage(1)}><Search size={15} />Search</button>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label>Status</label>
                <select value={doctorStatusFilter} onChange={(e) => setDoctorStatusFilter(e.target.value)}>
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: -8 }}>
              <DateRangePicker from={doctorDateFrom} to={doctorDateTo} onChange={({ from, to }) => { setDoctorDateFrom(from); setDoctorDateTo(to); }} />
              <p style={{ color: "var(--ink-soft)", fontSize: 12, marginTop: -12 }}>Filters by each leader's most recent referral date.</p>
            </div>

            {filteredSortedDoctors.length === 0 ? (
              <EmptyState
                icon={Stethoscope}
                title={doctors.length === 0 ? "No leaders yet" : "No leaders match your filters"}
                subtitle={doctors.length === 0 ? "Add your first leader to generate their referral QR code, or bulk import from Excel" : "Try a different search or filter"}
              />
            ) : (
              <>
                <div className="table-wrap">
                  <table style={{ marginTop: 8 }}>
                    <thead>
                      <tr>
                        <SortHeader label="Leader" sk="name" />
                        <SortHeader label="Referrals" sk="totalReferrals" />
                        <SortHeader label="Total Credited" sk="totalCredited" />
                        <SortHeader label="Pending Payout" sk="totalPending" />
                        <SortHeader label="Last Referral" sk="lastReferralAt" />
                        <th>Status</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedDoctors.map((d) => (
                        <tr key={d.id}>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <Avatar name={d.name} />
                              <div>
                                <div style={{ fontWeight: 600 }}>{d.name}</div>
                                <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{d.specialty || "General"} · {d.clinicName || "—"}</div>
                                <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>Through: {d.marketingPersonName || "—"}</div>
                              </div>
                            </div>
                          </td>
                          <td>{d.totalReferrals}</td>
                          <td>{Number(d.totalCredited).toFixed(2)} pts</td>
                          <td>
                            {Number(d.totalPending) > 0 ? (
                              <span className="chip pending">{Number(d.totalPending).toFixed(2)} pts</span>
                            ) : (
                              <span className="chip redeemed">0.00 pts</span>
                            )}
                          </td>
                          <td>{d.lastReferralAt ? formatDateTime(d.lastReferralAt) : "—"}</td>
                          <td><span className={`chip ${d.active ? "active" : "inactive"}`}>{d.active ? "Active" : "Inactive"}</span></td>
                          <td>
                            <DropdownMenu
                              items={[
                                { label: "Edit", icon: Pencil, onClick: () => setEditingLeader(d) },
                                { label: qrLoadingId === d.id ? "Loading QR…" : "View QR", icon: Eye, onClick: () => handleViewQr(d.id) },
                                { label: d.active ? "Deactivate" : "Activate", icon: Power, onClick: () => toggleDoctorActive(d) },
                                ...(Number(d.totalPending) > 0
                                  ? [{ label: "Redeem all pending", icon: Wallet, onClick: () => setRedeemModal({ mode: "bulk", doctor: d, defaultAmount: d.totalPending, count: d.pendingCount }) }]
                                  : []),
                              ]}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {doctorPageCount > 1 && (
                  <div className="pagination">
                    <button disabled={doctorPage === 1} onClick={() => setDoctorPage((p) => p - 1)}><ChevronLeft size={14} /></button>
                    {Array.from({ length: doctorPageCount }, (_, i) => i + 1).map((p) => (
                      <button key={p} className={p === doctorPage ? "active" : ""} onClick={() => setDoctorPage(p)}>{p}</button>
                    ))}
                    <button disabled={doctorPage === doctorPageCount} onClick={() => setDoctorPage((p) => p + 1)}><ChevronRight size={14} /></button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ==================== STAFF ==================== */}
        {activeTab === "Staff" && (
          <>
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0 }}>Custom roles</h3>
                <button className="secondary" style={{ width: "auto", padding: "8px 16px" }} onClick={() => (showRoleForm ? cancelRoleForm() : setShowRoleForm(true))}>
                  {showRoleForm ? <X size={16} /> : <Plus size={16} />}
                  {showRoleForm ? "Cancel" : "New role"}
                </button>
              </div>
              <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>
                Define roles like "Accountant" with exactly the access they need — separate from full Admin or Reception access.
              </p>

              {showRoleForm && (
                <form onSubmit={handleCreateRole} style={{ marginTop: 16 }}>
                  <label>Role name</label>
                  <input value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} required placeholder="e.g. Accountant" />
                  <label>Permissions</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "6px 0 16px" }}>
                    {Object.entries(PERMISSION_LABELS).map(([key, label]) => (
                      <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400, fontSize: 14, color: "var(--ink)" }}>
                        <input type="checkbox" style={{ width: "auto", margin: 0 }} checked={roleForm.permissions.includes(key)} onChange={() => togglePermission(key)} />
                        {label}
                      </label>
                    ))}
                  </div>
                  <button type="submit">{editingRoleId ? "Save changes" : "Create role"}</button>
                </form>
              )}

              {customRoles.length > 0 && (
                <div className="table-wrap">
                  <table style={{ marginTop: 16 }}>
                    <thead><tr><th>Role</th><th>Permissions</th><th>Staff using it</th><th></th></tr></thead>
                    <tbody>
                      {customRoles.map((r) => (
                        <Fragment key={r.id}>
                          <tr>
                            <td>{r.name}</td>
                            <td style={{ maxWidth: 320, whiteSpace: "normal" }}>{r.permissions.map((p) => PERMISSION_LABELS[p] || p).join(", ")}</td>
                            <td>
                              <button className="secondary" style={{ width: "auto", padding: "4px 10px" }} onClick={() => setExpandedRoleId(expandedRoleId === r.id ? null : r.id)}>
                                {r.staffCount} {expandedRoleId === r.id ? "▲" : "▼"}
                              </button>
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button className="secondary" style={{ width: "auto", padding: "6px 10px" }} onClick={() => startEditRole(r)}>Edit</button>
                                <button className="danger" style={{ width: "auto", padding: "6px 10px" }} onClick={() => deleteRole(r.id, r.name)}><Trash2 size={14} />Remove</button>
                              </div>
                            </td>
                          </tr>
                          {expandedRoleId === r.id && (
                            <tr>
                              <td colSpan={4} style={{ background: "var(--teal-50)" }}>
                                <div style={{ padding: "8px 0" }}>
                                  {r.staff.length === 0 && <span style={{ color: "var(--ink-soft)" }}>No one is assigned this role yet.</span>}
                                  {r.staff.map((s) => (
                                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0", flexWrap: "wrap" }}>
                                      <span style={{ minWidth: 140 }}>{s.name}</span>
                                      <span style={{ minWidth: 220, color: "var(--ink-soft)" }}>{s.email}</span>
                                      <button className="secondary" style={{ width: "auto", padding: "4px 10px" }} onClick={() => resetStaffPassword(s.id, s.name)}><KeyRound size={13} />Reset password</button>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0 }}>Staff accounts</h3>
                <button style={{ width: "auto", padding: "8px 16px" }} onClick={() => setShowStaffForm(!showStaffForm)}>
                  {showStaffForm ? <X size={16} /> : <Plus size={16} />}
                  {showStaffForm ? "Cancel" : "Add staff"}
                </button>
              </div>

              {showStaffForm && (
                <form onSubmit={handleCreateStaff} style={{ marginTop: 16 }}>
                  <label>Name</label>
                  <input value={staffForm.name} onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })} required />
                  <label>Email (used to log in)</label>
                  <input type="email" value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} required />
                  <label>Password</label>
                  <input type="password" value={staffForm.password} onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })} required minLength={6} />
                  <label>Role</label>
                  <select value={staffForm.roleSelection} onChange={(e) => setStaffForm({ ...staffForm, roleSelection: e.target.value })}>
                    <option value="RECEPTION">Reception</option>
                    <option value="ADMIN">Admin</option>
                    {customRoles.length > 0 && (
                      <optgroup label="Custom roles">
                        {customRoles.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <button type="submit">Create account</button>
                </form>
              )}

              <div className="table-wrap"><table style={{ marginTop: 16 }}>
                <thead>
                  <tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr>
                </thead>
                <tbody>
                  {staff.map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>{s.email}</td>
                      <td>{s.role === "STAFF" ? (s.customRole?.name || "Custom role") : s.role}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="secondary" style={{ width: "auto", padding: "6px 10px" }} onClick={() => resetStaffPassword(s.id, s.name)}><KeyRound size={14} />Reset password</button>
                          {s.id !== user?.id && (
                            <button className="danger" style={{ width: "auto", padding: "6px 10px" }} onClick={() => deleteStaff(s.id, s.name)}><Trash2 size={14} />Remove</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          </>
        )}

        {/* ==================== ALL REFERRALS ==================== */}
        {activeTab === "All Referrals" && (
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {REFERRAL_TABS.map((t) => (
                  <button
                    key={t.key}
                    className={`tab-btn ${referralTab === t.key ? "" : "secondary"}`}
                    style={{ width: "auto" }}
                    onClick={() => setReferralTab(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ width: "auto", padding: "6px 14px" }} onClick={() => setShowAddPatient(true)}><UserPlus size={14} />Add patient</button>
                <button className="secondary" style={{ width: "auto", padding: "6px 14px" }} onClick={() => setShowBulkImportReferrals(true)}><Upload size={14} />Bulk import</button>
                <button className="secondary" style={{ width: "auto", padding: "6px 14px" }} onClick={() => exportReferrals("excel")}><Download size={14} />Excel</button>
                <button className="secondary" style={{ width: "auto", padding: "6px 14px" }} onClick={() => exportReferrals("pdf")}><Download size={14} />PDF</button>
              </div>
            </div>
            {referralTotal > 0 && (
              <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: -4 }}>
                Showing {(referralPage - 1) * REFERRALS_PAGE_SIZE + 1}–{Math.min(referralPage * REFERRALS_PAGE_SIZE, referralTotal)} of {referralTotal}
              </p>
            )}

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
              <div style={{ flex: 1, minWidth: 200, maxWidth: 360 }}>
                <label>Doctor</label>
                <select value={referralDoctorId} onChange={(e) => setReferralDoctorId(e.target.value)}>
                  <option value="">All doctors</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}{d.clinicName ? ` (${d.clinicName})` : ""}</option>
                  ))}
                </select>
              </div>
            </div>
            <DateRangePicker from={referralDateFrom} to={referralDateTo} onChange={({ from, to }) => { setReferralDateFrom(from); setReferralDateTo(to); }} />


            <label>Search by patient name or phone</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={referralSearch} onChange={(e) => setReferralSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (referralPage === 1 ? loadReferrals() : setReferralPage(1))} placeholder="e.g. Ramesh or 98765..." />
              <button style={{ width: 120 }} onClick={() => (referralPage === 1 ? loadReferrals() : setReferralPage(1))}><Search size={15} />Search</button>
            </div>

            {referrals.length === 0 ? (
              <EmptyState icon={ClipboardList} title="No referrals found" subtitle="Try adjusting your filters or search" />
            ) : (
              <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Patient</th><th>File No.</th><th>Age</th><th>Gender</th><th>Phone</th><th>Referred by</th><th>Through</th><th>Status</th><th>Visit</th><th>Credit</th><th>Payout</th><th>Discharged</th><th>Panel</th><th>Location</th><th>Submitted</th><th></th></tr>
                </thead>
                <tbody>
                  {referrals.map((r) => (
                    <tr key={r.id}>
                      <td>{r.patientName}</td>
                      <td>{r.fileNumber || "—"}</td>
                      <td>{r.patientAge}</td>
                      <td>{r.patientGender ? r.patientGender.charAt(0) + r.patientGender.slice(1).toLowerCase() : "—"}</td>
                      <td>{r.patientPhone || "—"}</td>
                      <td>{r.doctor?.name}{r.doctor?.clinicName ? ` (${r.doctor.clinicName})` : ""}</td>
                      <td>{r.doctor?.marketingPersonName || "—"}</td>
                      <td><span className={`badge ${r.status}`}>{r.status}</span></td>
                      <td>{r.visitType || "—"}{r.convertedAt && r.visitType === "IPD" ? <span style={{ marginLeft: 4, fontSize: 11, color: "var(--ink-soft)" }}>(from OPD)</span> : null}</td>
                      <td>{r.transaction ? `${Number(r.transaction.amount).toFixed(2)} pts` : "—"}</td>
                      <td>
                        {r.transaction ? (
                          <span className={`chip ${r.transaction.redeemed ? "redeemed" : "pending"}`}>{r.transaction.redeemed ? "Paid" : "Unpaid"}</span>
                        ) : "—"}
                      </td>
                      <td>{r.dischargedAt ? formatDateTime(r.dischargedAt) : "—"}</td>
                      <td>
                        <select
                          value={r.panel || ""}
                          onChange={(e) => updatePanel(r.id, e.target.value)}
                          style={{ minWidth: 140, fontSize: 13, padding: "6px 8px" }}
                        >
                          <option value="">— None —</option>
                          {PANEL_OPTIONS.map((p) => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {r.scanLatitude != null ? (
                          <a href={`https://www.google.com/maps?q=${r.scanLatitude},${r.scanLongitude}`} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <MapPin size={13} />
                            {r.scanAddress ? r.scanAddress.slice(0, 30) + (r.scanAddress.length > 30 ? "…" : "") : "View on map"}
                          </a>
                        ) : (
                          <span style={{ color: "var(--ink-soft)" }}>Not shared</span>
                        )}
                      </td>
                      <td>{formatDate(r.createdAt)}</td>
                      <td className="row-hover-actions" style={{ whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          {r.status === "PENDING" && (
                            <>
                              <button style={{ width: "auto", padding: "6px 10px" }} onClick={() => openConfirmModal(r)}><CheckCircle2 size={14} />Confirm</button>
                              <button className="danger" style={{ width: "auto", padding: "6px 10px" }} onClick={() => reject(r.id)}><XCircle size={14} />Reject</button>
                            </>
                          )}
                          {r.status === "CREDITED" && r.visitType === "OPD" && (
                            <button style={{ width: "auto", padding: "6px 10px" }} onClick={() => openConvertModal(r)}><ArrowUpCircle size={14} />Convert to IPD</button>
                          )}
                          {r.status === "CREDITED" && !r.dischargedAt && (
                            <button style={{ width: "auto", padding: "6px 10px" }} onClick={() => discharge(r)}><LogOut size={14} />Discharge</button>
                          )}
                          {r.status === "REJECTED" && (
                            <button style={{ width: "auto", padding: "6px 10px" }} onClick={() => revertReferral(r.id)}><RotateCcw size={14} />Revert</button>
                          )}
                          {r.transaction && !r.transaction.redeemed && (
                            <button className="btn-redeem" style={{ width: "auto", padding: "6px 14px" }} onClick={() => setRedeemModal({ mode: "single", referral: r, defaultAmount: Number(r.transaction.amount) })}>
                              <Wallet size={14} />Redeem
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
            {referralPageCount > 1 && (
              <div className="pagination">
                <button disabled={referralPage === 1} onClick={() => setReferralPage((p) => p - 1)}><ChevronLeft size={14} /></button>
                {Array.from({ length: referralPageCount }, (_, i) => i + 1).map((p) => (
                  <button key={p} className={p === referralPage ? "active" : ""} onClick={() => setReferralPage(p)}>{p}</button>
                ))}
                <button disabled={referralPage === referralPageCount} onClick={() => setReferralPage((p) => p + 1)}><ChevronRight size={14} /></button>
              </div>
            )}
          </div>
        )}
      </div>

      {qrModalDoctor && (
        <QrModal
          doctor={qrModalDoctor.doctor}
          qrDataUrl={qrModalDoctor.qrDataUrl}
          referralUrl={qrModalDoctor.referralUrl}
          dashboardUrl={qrModalDoctor.dashboardUrl}
          onClose={() => setQrModalDoctor(null)}
        />
      )}

      {redeemModal && redeemModal.mode === "bulk" && (
        <RedeemModal
          mode="bulk"
          doctorName={redeemModal.doctor.name}
          defaultAmount={redeemModal.defaultAmount}
          count={redeemModal.count}
          onClose={() => setRedeemModal(null)}
          onConfirm={confirmBulkRedeem}
        />
      )}
      {redeemModal && redeemModal.mode === "single" && (
        <RedeemModal
          mode="single"
          doctorName={redeemModal.referral.doctor?.name}
          defaultAmount={redeemModal.defaultAmount}
          onClose={() => setRedeemModal(null)}
          onConfirm={confirmSingleRedeem}
        />
      )}
      {confirmModal && (
        <ConfirmLeadModal
          patientName={confirmModal.patientName}
          doctorName={confirmModal.doctor?.name}
          onClose={() => setConfirmModal(null)}
          onConfirm={handleConfirmLead}
        />
      )}
      {convertModal && (
        <ConvertToIpdModal
          patientName={convertModal.patientName}
          doctorName={convertModal.doctor?.name}
          currentAmount={convertModal.transaction ? Number(convertModal.transaction.amount) : 0}
          onClose={() => setConvertModal(null)}
          onConvert={handleConvertToIpd}
        />
      )}
      {showBulkImport && (
        <BulkImportLeadersModal
          onClose={() => setShowBulkImport(false)}
          onImported={loadDoctorsAndStaff}
        />
      )}
      {showBulkImportReferrals && (
        <BulkImportReferralsModal
          onClose={() => setShowBulkImportReferrals(false)}
          onImported={() => { loadReferrals(); loadDoctorsAndStaff(); loadDashboard(); }}
        />
      )}
      {editingLeader && (
        <EditLeaderModal
          leader={editingLeader}
          onClose={() => setEditingLeader(null)}
          onSaved={() => { setEditingLeader(null); setMessage("Leader updated."); loadDoctorsAndStaff(); }}
        />
      )}
      {showAddPatient && (
        <AddPatientModal
          onClose={() => setShowAddPatient(false)}
          onAdded={(data) => {
            setShowAddPatient(false);
            setMessage(
              data?.newLeaderCreated
                ? `Patient added — "${data.doctorName}" was created as a new leader. Now showing under Pending.`
                : "Patient added — now showing under Pending."
            );
            setReferralTab("PENDING");
            loadReferrals();
            loadDoctorsAndStaff();
          }}
        />
      )}
    </div>
  );
}
