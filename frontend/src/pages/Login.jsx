import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";

const ROUTES = { SUPER_ADMIN: "/super-admin", ADMIN: "/admin", RECEPTION: "/reception", STAFF: "/staff" };

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      navigate(ROUTES[data.user.role] || "/login");
    } catch (err) {
      setError(err.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ paddingTop: 80 }}>
      <div className="card">
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <img src="/logo.png" alt="Vedansh Medicare" style={{ height: 52, marginBottom: 8 }} />
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--teal-600)", letterSpacing: "0.03em", textTransform: "uppercase" }}>Referral Platform</div>
        </div>
        <h2>Staff login</h2>
        <p style={{ color: "#667085", fontSize: 14, marginTop: -8 }}>
          For hospital admin and reception staff. Doctors use their personal QR link instead.
        </p>
        <form onSubmit={handleSubmit}>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
        </form>
      </div>
    </div>
  );
}
