import jwt from "jsonwebtoken";

// Verifies a staff JWT and attaches { id, role, name, hospitalId, permissions } to req.user
export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }
  const token = header.split(" ")[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Restricts a route to specific system-level roles, e.g. requireRole("ADMIN")
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission to perform this action" });
    }
    next();
  };
}

// Allows either a fixed system role (e.g. ADMIN, RECEPTION) OR a STAFF account whose
// custom role grants at least one of the given permissions. This is what lets custom
// roles (like "Accountant") reach specific endpoints without a full ADMIN/RECEPTION grant.
export function requireAccess(roles = [], anyOfPermissions = []) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (roles.includes(req.user.role)) return next();
    if (req.user.role === "STAFF") {
      const perms = req.user.permissions || [];
      if (anyOfPermissions.some((p) => perms.includes(p))) return next();
    }
    return res.status(403).json({ error: "You do not have permission to perform this action" });
  };
}
