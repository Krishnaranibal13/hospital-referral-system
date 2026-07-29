// Consistent DD/MM/YY formatting for exports (Excel/PDF), matching the frontend's format.
export function formatDate(date) {
  if (!date) return "";
  const d = new Date(date);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

export function formatDateTime(date) {
  if (!date) return "";
  const d = new Date(date);
  const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  return `${formatDate(d)}, ${time}`;
}
