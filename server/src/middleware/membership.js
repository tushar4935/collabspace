import Membership from "../models/Membership.js";

// role check for /api/teams/:teamId/... routes.
// requireMembership() = any member, requireMembership("owner") = owner only
export function requireMembership(...allowedRoles) {
  return async (req, res, next) => {
    const membership = await Membership.findOne({
      userId: req.userId,
      teamId: req.params.teamId,
    });
    if (!membership) {
      return res.status(403).json({ message: "You are not a member of this team" });
    }
    if (allowedRoles.length > 0 && !allowedRoles.includes(membership.role)) {
      return res.status(403).json({ message: "Your role does not allow this action" });
    }
    req.membership = membership;
    next();
  };
}
