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

// npm run seed — wipes all collections and inserts demo data.
// Run against your own database only.

const PASSWORD = "password123"; // same for all seed users

const SEED_USERS = [
  { name: "Ava Owner", email: "ava@collabspace.dev", role: "owner" },
  { name: "Ben Member", email: "ben@collabspace.dev", role: "member" },
  { name: "Cara Member", email: "cara@collabspace.dev", role: "member" },
];

// build real yjs state so the seeded doc opens with content.
// tiptap's Collaboration extension binds to the XmlFragment named "default".
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

// same content as prosemirror json, for the first saved version
function docJSON(paragraphs) {
  return {
    type: "doc",
    content: paragraphs.map((text) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    })),
  };
}

// shapes in the same format the client draws (unique id per element)
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

  // hashed the same way the register route does it
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const users = await User.create(
    SEED_USERS.map((u) => ({ name: u.name, email: u.email, passwordHash }))
  );
  const byEmail = Object.fromEntries(users.map((u) => [u.email, u]));
  const owner = byEmail["ava@collabspace.dev"];

  const team = await Team.create({ name: "Product Team", ownerId: owner._id });
  await Membership.create(
    SEED_USERS.map((u) => ({
      userId: byEmail[u.email]._id,
      teamId: team._id,
      role: u.role,
    }))
  );

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

  const whiteboard = await Whiteboard.create({
    title: "Architecture Sketch",
    teamId: team._id,
    createdBy: owner._id,
    elements: seedShapes(),
  });

  await ActivityLog.create([
    { teamId: team._id, userId: owner._id, action: 'created document "Product Roadmap"' },
    { teamId: team._id, userId: owner._id, action: 'created whiteboard "Architecture Sketch"' },
  ]);

  console.log("\nSeed complete.\n");
  console.log("Log in with any of these (password for all: %s):", PASSWORD);
  for (const u of SEED_USERS) {
    console.log(`  - ${u.email.padEnd(26)} ${u.role}`);
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
