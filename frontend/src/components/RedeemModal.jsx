import { useState } from "react";
import { Wallet } from "lucide-react";
import Modal from "./Modal";

const PAYMENT_METHODS = ["Cash", "Bank Transfer", "UPI", "Cheque", "Other"];

// mode: "single" (one referral's credit) or "bulk" (all pending for a doctor)
export default function RedeemModal({ mode, doctorName, defaultAmount, count, onClose, onConfirm }) {
  const [amount, setAmount] = useState(defaultAmount?.toFixed ? defaultAmount.toFixed(2) : defaultAmount);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const parsedAmount = mode === "single" ? Number(amount) : undefined;
    if (mode === "single" && (Number.isNaN(parsedAmount) || parsedAmount < 0)) {
      setError("Enter a valid non-negative amount.");
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm({ amount: parsedAmount, paymentMethod, referenceNumber, remarks });
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to record this payout.");
      setSubmitting(false);
    }
  }

  return (
    <Modal title={mode === "bulk" ? `Redeem all pending for ${doctorName}` : "Redeem credit"} onClose={onClose} width={420}>
      <form onSubmit={handleSubmit}>
        {mode === "bulk" ? (
          <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: -4 }}>
            This marks <strong>{count} pending credit(s)</strong> totalling{" "}
            <strong>₹{Number(defaultAmount).toFixed(2)}</strong> for {doctorName} as paid out.
          </p>
        ) : (
          <>
            <label>Amount (₹)</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </>
        )}

        <label>Payment method</label>
        <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
          {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>

        <label>Reference number (optional)</label>
        <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="e.g. UTR / cheque no." />

        <label>Remarks (optional)</label>
        <input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Any notes about this payout" />

        {error && <p className="error">{error}</p>}

        <button type="submit" className="btn-redeem" disabled={submitting}>
          <Wallet size={16} />
          {submitting ? "Recording…" : "Confirm payout"}
        </button>
      </form>
    </Modal>
  );
}
