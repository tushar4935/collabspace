import { Router } from "express";
import Team from "../models/Team.js";
import Membership from "../models/Membership.js";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { requireMembership } from "../middleware/membership.js";
import { logActivity } from "../utils/activity.js";
import { notify } from "../utils/notify.js";

const router = Router();

router.use(requireAuth);

// POST /api/teams — create a team; creator becomes owner
router.post("/", async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) {
    return res.status(400).json({ message: "Team name is required" });
  }
  const team = await Team.create({ name: name.trim(), ownerId: req.userId });
  await Membership.create({ userId: req.userId, teamId: team._id, role: "owner" });
  await logActivity(team._id, req.userId, `created team "${team.name}"`);
  res.status(201).json({ team: { id: team._id, name: team.name } });
});

// GET /api/teams — teams the current user belongs to
router.get("/", async (req, res) => {
  const memberships = await Membership.find({ userId: req.userId }).populate("teamId");
  const teams = memberships
    .filter((m) => m.teamId) // skip memberships whose team no longer exists
    .map((m) => ({ id: m.teamId._id, name: m.teamId.name, role: m.role }));
  res.json({ teams });
});

// GET /api/teams/:teamId — team details + member list
router.get("/:teamId", requireMembership(), async (req, res) => {
  const team = await Team.findById(req.params.teamId);
  if (!team) {
    return res.status(404).json({ message: "Team not found" });
  }
  const memberships = await Membership.find({ teamId: team._id }).populate(
    "userId",
    "name email avatar"
  );
  const members = memberships
    .filter((m) => m.userId) // skip memberships whose user account was deleted
    .map((m) => ({
      id: m.userId._id,
      name: m.userId.name,
      email: m.userId.email,
      avatar: m.userId.avatar,
      role: m.role,
    }));
  res.json({
    team: { id: team._id, name: team.name },
    members,
    yourRole: req.membership.role,
  });
});

// POST /api/teams/:teamId/members — add a user by email (owner only)
router.post("/:teamId/members", requireMembership("owner"), async (req, res) => {
  const { email } = req.body;
  if (!email?.trim()) {
    return res.status(400).json({ message: "Email is required" });
  }
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    return res.status(404).json({ message: "No registered user with that email" });
  }
  const existing = await Membership.findOne({
    userId: user._id,
    teamId: req.params.teamId,
  });
  if (existing) {
    return res.status(409).json({ message: "That user is already a member" });
  }
  const membership = await Membership.create({
    userId: user._id,
    teamId: req.params.teamId,
    role: "member",
  });
  await logActivity(req.params.teamId, req.userId, `added ${user.name} to the team`);

  // notify the added user in-app
  const [adder, team] = await Promise.all([
    User.findById(req.userId).select("name"),
    Team.findById(req.params.teamId).select("name"),
  ]);
  await notify(user._id, {
    type: "team_invite",
    message: `${adder?.name ?? "Someone"} added you to "${team?.name ?? "a team"}"`,
    link: `/teams/${req.params.teamId}`,
  });

  res.status(201).json({
    member: {
      id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      role: membership.role,
    },
  });
});

// DELETE /api/teams/:teamId/members/:userId — remove a member (owner only)
router.delete(
  "/:teamId/members/:userId",
  requireMembership("owner"),
  async (req, res) => {
    const membership = await Membership.findOne({
      userId: req.params.userId,
      teamId: req.params.teamId,
    });
    if (!membership) {
      return res.status(404).json({ message: "That user is not a member of this team" });
    }
    if (membership.role === "owner") {
      return res.status(400).json({ message: "The team owner cannot be removed" });
    }
    await membership.deleteOne();
    const removed = await User.findById(req.params.userId);
    await logActivity(
      req.params.teamId,
      req.userId,
      `removed ${removed?.name ?? "a user"} from the team`
    );
    res.json({ ok: true });
  }
);

export default router;
