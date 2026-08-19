import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import Modal from "./Modal";
import api from "../api/client";

// Lets an admin fix up any leader's details after creation — most importantly, associating
// them with the hospital marketing-team member who manages that relationship. Needed since
// leaders can also be created without this (quick-add via Add Patient, bulk import) and
// someone has to be able to fill it in afterward.
export default function EditLeaderModal({ leader, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: leader.name || "",
    specialty: leader.specialty || "",
    phone: leader.phone || "",
    email: leader.email || "",
    clinicName: leader.clinicName || "",
    city: leader.city || "",
    marketingPersonId: leader.marketingPersonId || leader.marketingPerson?.id || "",
  });
  const [marketingPersons, setMarketingPersons] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/marketing-persons/lite");
        setMarketingPersons(data);
      } catch {
        // non-fatal — dropdown just stays empty besides "None"
      }
    })();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api.patch(`/doctors/${leader.id}`, form);
      onSaved?.();
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to save changes.");
      setSaving(false);
    }
  }

  return (
    <Modal title="Edit leader" onClose={onClose} width={440}>
      <form onSubmit={handleSubmit}>
        <label>Name</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />

        <label>Role / Specialty (optional)</label>
        <input value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} />

        <label>Phone</label>
        <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />

        <label>Email (optional)</label>
        <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />

        <label>Clinic name (optional)</label>
        <input value={form.clinicName} onChange={(e) => setForm({ ...form, clinicName: e.target.value })} />

        <label>City (optional)</label>
        <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />

        <label>Marketing person (optional)</label>
        <select value={form.marketingPersonId} onChange={(e) => setForm({ ...form, marketingPersonId: e.target.value })}>
          <option value="">— None —</option>
          {marketingPersons.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={saving} style={{ marginTop: 8 }}>
          <Save size={16} />
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </Modal>
  );
}
