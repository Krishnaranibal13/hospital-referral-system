export default function EmptyState({ icon: Icon, title, subtitle }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--ink-soft)" }}>
      {Icon && (
        <div style={{
          width: 52, height: 52, borderRadius: "50%", background: "var(--teal-50)",
          display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px",
          color: "var(--teal-600)",
        }}>
          <Icon size={24} />
        </div>
      )}
      <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: 15 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13, marginTop: 4 }}>{subtitle}</div>}
    </div>
  );
}
