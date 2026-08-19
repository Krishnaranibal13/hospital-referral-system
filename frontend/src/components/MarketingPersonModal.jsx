import { useState } from "react";
import { Save, UserPlus } from "lucide-react";
import Modal from "./Modal";
import api from "../api/client";

// Add or edit a hospital marketing-team member. If `person` is passed, this edits that
// person (PATCH); otherwise it creates a new one (POST).
export default function MarketingPersonModal({ person, onClose, onSaved }) {
  const isEdit = Boolean(person);
  const [form, setForm] = useState({
    name: person?.name || "",
    phone: person?.phone || "",
    email: person?.email || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (isEdit) {
        await api.patch(`/marketing-persons/${person.id}`, form);
      } else {
        await api.post("/marketing-persons", form);
      }
      onSaved?.();
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to save.");
      setSaving(false);
    }
  }

  return (
    <Modal title={isEdit ? "Edit marketing person" : "Add marketing person"} onClose={onClose} width={420}>
      <form onSubmit={handleSubmit}>
        <label>Name</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />

        <label>Phone (optional)</label>
        <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />

        <label>Email (optional)</label>
        <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={saving} style={{ marginTop: 8 }}>
          {isEdit ? <Save size={16} /> : <UserPlus size={16} />}
          {saving ? "Saving…" : isEdit ? "Save changes" : "Add marketing person"}
        </button>
      </form>
    </Modal>
  );
}
