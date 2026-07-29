import { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";

// items: [{ label, icon: LucideIcon, onClick, danger? }]
export default function DropdownMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        className="secondary"
        style={{ width: "auto", padding: "6px 8px", borderRadius: 8 }}
        onClick={() => setOpen((o) => !o)}
        aria-label="Actions"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div
          style={{
            position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 50,
            background: "#fff", border: "1px solid var(--border)", borderRadius: 10,
            boxShadow: "0 8px 24px rgba(16,23,51,0.14)", minWidth: 180, padding: 6,
            animation: "popIn 0.12s ease",
          }}
        >
          {items.map((item, i) => (
            <button
              key={i}
              onClick={() => { setOpen(false); item.onClick(); }}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                background: "none", border: "none", padding: "8px 10px", borderRadius: 8,
                fontSize: 13, fontWeight: 600, textAlign: "left", cursor: "pointer",
                color: item.danger ? "var(--red-700)" : "var(--ink)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = item.danger ? "var(--red-50)" : "var(--teal-50)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              {item.icon && <item.icon size={15} />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
