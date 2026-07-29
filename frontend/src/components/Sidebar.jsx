import { LogOut } from "lucide-react";

// Shared sidebar shell for Admin and Super Admin dashboards.
// `items` is [{ key, label, icon: LucideIcon }], `activeKey` controls highlighting.
// `badges` is an optional { [itemKey]: number } map for small notification counts.
// `brandName` is the top line under the logo — "Vedansh Medicare" for a hospital admin,
// or a generic platform label for Super Admin, who isn't scoped to one hospital.
export default function Sidebar({ items, activeKey, onSelect, brandName, subtitle, badges = {}, userName, userRole, onLogout }) {
  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <img src="/logo.png" alt="Vedansh Medicare" />
        <div className="sidebar-logo-text">
          {brandName}
          {subtitle && <span>{subtitle}</span>}
        </div>
      </div>

      <nav className="sidebar-nav">
        {items.map((item) => (
          <button
            key={item.key}
            className={`sidebar-nav-item ${activeKey === item.key ? "active" : ""}`}
            onClick={() => onSelect(item.key)}
          >
            <item.icon size={18} />
            {item.label}
            {badges[item.key] > 0 && <span className="nav-badge">{badges[item.key]}</span>}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user-name">{userName}</div>
        {userRole && <div className="sidebar-user-role">{userRole}</div>}
        <button className="sidebar-logout" onClick={onLogout}>
          <LogOut size={15} />
          Log out
        </button>
      </div>
    </div>
  );
}
