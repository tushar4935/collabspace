import Membership from "../models/Membership.js";

// Role check for routes shaped like /api/teams/:teamId/...
// Looks up the caller's Membership in THAT team and checks its role — this is
// the whole point of putting roles on the membership: the same user gets
// different powers in different teams.
//
// requireMembership()          -> any member of the team may pass
// requireMembership("owner")   -> only the team's owner may pass
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
