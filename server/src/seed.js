import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import * as Y from "yjs";
import { connectDB } from "./config/db.js";
import User from "./models/User.js";
import Team from "./models/Team.js";
import Membership from "./models/Membership.js";
import Document from "./models/Document.js";
import DocumentVersion from "./models/DocumentVersion.js";
import Whiteboard from "./models/Whiteboard.js";
import Comment from "./models/Comment.js";
import Notification from "./models/Notification.js";
import ActivityLog from "./models/ActivityLog.js";

// ---------------------------------------------------------------------------
// Seed script. Wipes every collection this app owns and inserts a small, known
// data set so a fresh clone (or a fresh deploy) has something to log into and
// demo: three users, one team with three memberships, a document that already
// has text, and a whiteboard that already has shapes.
//
//   node src/seed.js        (or:  npm run seed)
//
// It is DESTRUCTIVE on purpose — see clearing step below. Run it against your
// own database only.
// ---------------------------------------------------------------------------

const PASSWORD = "password123"; // same for all seed users, printed at the end

const SEED_USERS = [
  { name: "Ava Owner", email: "ava@collabspace.dev", role: "owner" },
  { name: "Ben Member", email: "ben@collabspace.dev", role: "member" },
  { name: "Cara Member", email: "cara@collabspace.dev", role: "member" },
];

// Build a real Yjs document so the seeded doc opens with content already in it.
// Tiptap's Collaboration extension binds to the XmlFragment named "default";
// each block is an <paragraph> element holding one XmlText. We encode the whole
// doc to a single update and store it in Document.yjsState — exactly what the
// live editor writes and reloads. (Kept to plain paragraphs so it renders
// identically no matter the Tiptap node config.)
const DOC_PARAGRAPHS = [
  "Welcome to CollabSpace — this document is live and collaborative.",
  "Open it in two browser windows and type in both. Your edits merge instead of overwriting each other, because the text is a Yjs CRDT, not a whole-document broadcast.",
  "Try the toolbar for bold, italics, headings and lists, then use Save version and History to snapshot and restore.",
];

function buildYjsState(paragraphs) {
  const ydoc = new Y.Doc();
  const fragment = ydoc.getXmlFragment("default");
  const blocks = paragraphs.map((text) => {
    const p = new Y.XmlElement("paragraph");
    p.insert(0, [new Y.XmlText(text)]);
    return p;
  });
  fragment.insert(0, blocks);
  return Buffer.from(Y.encodeStateAsUpdate(ydoc));
}

// The matching ProseMirror JSON, stored as the first saved version so the
// History panel isn't empty on a fresh install.
function docJSON(paragraphs) {
  return {
    type: "doc",
    content: paragraphs.map((text) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    })),
  };
}

// A few whiteboard shapes in the exact shape the client draws and the socket
// layer persists: every element carries a client-style unique `id` (that id is
// what makes last-write-wins work in real time). Coordinates fit the fixed
// 1000×600 logical board.
function seedShapes() {
  return [
    { id: crypto.randomUUID(), type: "rect", x: 120, y: 90, width: 240, height: 140 },
    { id: crypto.randomUUID(), type: "circle", x: 620, y: 200, radius: 90 },
    {
      id: crypto.randomUUID(),
      type: "pen",
      points: [140, 320, 220, 300, 320, 360, 440, 300, 540, 360],
    },
  ];
}

async function seed() {
  await connectDB();

  // 1. Wipe. Clearing every collection keeps the seed deterministic — re-running
  //    always yields the same known state, never duplicates.
  console.log("Clearing existing data…");
  await Promise.all([
    User.deleteMany({}),
    Team.deleteMany({}),
    Membership.deleteMany({}),
    Document.deleteMany({}),
    DocumentVersion.deleteMany({}),
    Whiteboard.deleteMany({}),
    Comment.deleteMany({}),
    Notification.deleteMany({}),
    ActivityLog.deleteMany({}),
  ]);

  // 2. Users. Passwords are bcrypt-hashed the same way the register route does
  //    it (cost 10), so seeded accounts log in through the normal flow.
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const users = await User.create(
    SEED_USERS.map((u) => ({ name: u.name, email: u.email, passwordHash }))
  );
  const byEmail = Object.fromEntries(users.map((u) => [u.email, u]));
  const owner = byEmail["ava@collabspace.dev"];

  // 3. Team + memberships. The role lives on Membership (the user–team pair),
  //    never on User — that is how one person can own one team and be a plain
  //    member of another.
  const team = await Team.create({ name: "Product Team", ownerId: owner._id });
  await Membership.create(
    SEED_USERS.map((u) => ({
      userId: byEmail[u.email]._id,
      teamId: team._id,
      role: u.role,
    }))
  );

  // 4. A document with real content, plus its first saved version.
  const document = await Document.create({
    title: "Product Roadmap",
    teamId: team._id,
    createdBy: owner._id,
    yjsState: buildYjsState(DOC_PARAGRAPHS),
  });
  await DocumentVersion.create({
    documentId: document._id,
    label: "Initial draft",
    content: docJSON(DOC_PARAGRAPHS),
    createdBy: owner._id,
  });

  // 5. A whiteboard with a few shapes already on it.
  const whiteboard = await Whiteboard.create({
    title: "Architecture Sketch",
    teamId: team._id,
    createdBy: owner._id,
    elements: seedShapes(),
  });

  // 6. A little activity so the team feed isn't blank.
  await ActivityLog.create([
    { teamId: team._id, userId: owner._id, action: 'created document "Product Roadmap"' },
    { teamId: team._id, userId: owner._id, action: 'created whiteboard "Architecture Sketch"' },
  ]);

  console.log("\n✅ Seed complete.\n");
  console.log("Log in with any of these (password for all: %s):", PASSWORD);
  for (const u of SEED_USERS) {
    console.log(`  • ${u.email.padEnd(26)} ${u.role}`);
  }
  console.log(`\nTeam:       Product Team`);
  console.log(`Document:   Product Roadmap   (${document._id})`);
  console.log(`Whiteboard: Architecture Sketch (${whiteboard._id})`);

  await mongoose.disconnect();
}

seed().catch(async (err) => {
  console.error("Seed failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});
