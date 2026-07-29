const PALETTE = ["#252e69", "#26aec4", "#7c3aed", "#dc7c1f", "#16a34a", "#db2777", "#0891b2"];

function colorForName(name) {
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || "") + (parts[1]?.[0] || "");
}

export default function Avatar({ name, size = 36 }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%",
        background: colorForName(name),
        color: "#fff", fontWeight: 700, fontSize: size * 0.4,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, textTransform: "uppercase",
      }}
    >
      {initials(name)}
    </div>
  );
}
