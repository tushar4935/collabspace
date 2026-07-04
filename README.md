# CollabSpace

A real-time team collaboration platform: teams, shared rich-text documents
(Yjs + Tiptap), shared whiteboards (Socket.io + react-konva), presence,
comments with mentions, notifications, and version history.

## Tech stack

- **Frontend:** React (Vite), Tailwind CSS, React Router, Axios, Context API
- **Backend:** Node, Express, Mongoose, Socket.io
- **Database:** MongoDB Atlas (free tier)
- **Auth:** JWT + bcrypt
- **Real-time documents:** Yjs (CRDT) + y-websocket + Tiptap
- **Real-time whiteboard / presence / notifications:** Socket.io

### Pinned collaboration versions

The Yjs and Tiptap packages are version-sensitive: mixing Tiptap majors, or
loading two copies of `yjs`, causes silent breakage. These are pinned and must
move together. The entire Tiptap family is kept on **one identical version**.

| Package | Version | Where |
| --- | --- | --- |
| `yjs` | 13.6.31 | client + server (must be a single deduped copy) |
| `y-websocket` | 1.5.4 | client (`WebsocketProvider`) + server (`bin/utils`) |
| `y-protocols` | 1.0.7 | server |
| `ws` | 8.18.3 | server (WebSocket upgrade handling) |
| `@tiptap/react` | 2.27.2 | client |
| `@tiptap/pm` | 2.27.2 | client |
| `@tiptap/starter-kit` | 2.27.2 | client |
| `@tiptap/extension-collaboration` | 2.27.2 | client |
| `@tiptap/extension-collaboration-cursor` | 2.27.2 | client |

The collaboration extensions are on the same 2.27.2 as the rest of Tiptap.
Verify a single Yjs after install: `cd client && npm ls yjs` should show every
entry as `yjs@13.6.31 deduped`.

See [docs/collaborative-editor.md](docs/collaborative-editor.md) for a
plain-English explanation of why naive broadcast loses text, how the CRDT fixes
it, how state is persisted/restored, and the failure modes.

## Architecture note

Express, Socket.io, and (later) y-websocket all share **one HTTP server on one
port**. Real-time features need persistent WebSocket connections, so the
backend must run on a host that keeps a process alive (Render) — never on
serverless platforms like Vercel/Netlify functions, which kill connections
between requests. The React frontend is static and deploys to Vercel/Netlify.

## Setup

Prerequisites: Node 20+ and a free MongoDB Atlas cluster (M0).

```bash
# 1. Install dependencies
cd server && npm install
cd ../client && npm install

# 2. Environment variables
# server/.env and client/.env were created from the .env.example files.
# Edit server/.env and set MONGODB_URI to your Atlas connection string.
```

### Environment variables

| File          | Variable        | Purpose                                  |
| ------------- | --------------- | ---------------------------------------- |
| `server/.env` | `MONGODB_URI`   | MongoDB Atlas connection string          |
| `server/.env` | `PORT`          | Server port (default 4000)               |
| `server/.env` | `CLIENT_ORIGIN` | React app origin for CORS                |
| `server/.env` | `JWT_SECRET`    | Secret for signing JWTs (`openssl rand -hex 32`) |
| `client/.env` | `VITE_SERVER_URL` | Base URL of the Express/Socket.io server |

## Run locally

```bash
# Terminal 1 — server (Express + Socket.io on http://localhost:4000)
cd server && npm run dev

# Terminal 2 — client (Vite dev server on http://localhost:5173)
cd client && npm run dev
```

## Verify Phase 0 (Socket.io handshake)

1. Start both processes as above. The server terminal should log
   `MongoDB connected: ...` and `Server listening on http://localhost:4000`.
2. Log in (the socket connects only for authenticated users). The server
   terminal logs `user connected: <socket id>`; the browser console logs
   `connected to server, socket id: <socket id>`.
3. Log out — the server logs `user disconnected: <socket id>`.

## Verify Phase 1 (auth, teams, RBAC)

1. Open http://localhost:5173 in a normal window, register **User A**, and
   create a team. A appears in the member list with an `owner` badge.
2. Open an incognito window, register **User B** (different email). B's
   dashboard shows no teams.
3. As A, add B by email on the team page. Refresh B's dashboard — the team
   appears with a `member` badge.
4. Open the team as B: there is no "add member" form and no remove buttons —
   the role comes from B's Membership in this team, not from B's account.
5. As A, remove B. B's dashboard no longer shows the team, and opening the
   team URL directly as B returns "You are not a member of this team".
6. Reload any page while logged in — the session survives (token restore),
   and visiting `/` logged out redirects to `/login`.

## Verify Phase 2 (document CRUD)

1. As **User A** (team owner), open a team and create a document. It appears
   in the Documents list; click it to open the document page and rename it.
2. As **User B** (member of the same team, incognito window), open the team —
   the document is there. Create a second document as B.
3. As B, note there is **no Delete button** on A's document (B is neither its
   creator nor the team owner), but there is one on B's own document.
4. As A (team owner), both documents show Delete. Delete B's document —
   refresh B's team page and it is gone.
5. Documents are team-scoped: the API looks up every document by
   `(documentId, teamId)` together, so a document can never be reached
   through a team it doesn't belong to.

## Verify Phase 3 (whiteboard CRUD)

1. On a team page, create a whiteboard and open it.
2. Draw with each tool: **pen** (freehand), **rect** and **circle** (click and
   drag), then switch to **eraser** and click a shape — the whole shape
   disappears (shapes are deleted as units, never partially erased).
3. Reload the page. Every shape comes back exactly where it was (the live
   server persists board state to MongoDB automatically — see Phase 5).
4. Delete rules match documents: a member sees Delete only on boards they
   created; the team owner sees it on all of them.

The canvas is a fixed 1000×600 logical space rather than stretching to the
window, so saved coordinates mean the same thing on every screen — which is
what makes the shared real-time board possible later.

## Verify Phase 4 (comments, mentions, activity)

1. Open any document or whiteboard — a Comments section sits under it.
2. As **User A**, write a comment. Type `@` — a member picker appears; pick
   **User B**. The posted comment shows `@B's name` highlighted.
3. As **User B** (incognito), open the same page: A's comment is there. Click
   **Reply** and answer. Replies render indented under the parent, one level
   deep — replying to a reply attaches to the same thread.
4. Delete rules: B can delete B's own comments; A (team owner) can delete
   anyone's. Deleting a top-level comment removes its replies with it.
5. On the team page, **Recent activity** lists what just happened — team
   created, members added, documents/whiteboards created and deleted,
   comments posted — newest first with names and timestamps.

Mentions are stored as user ids sent by the picker, not parsed out of the
text by the server — display names are ambiguous, ids are not. (Mention
notifications arrive with Phase 7.)

## Verify Phase 5 (real-time whiteboard + presence) — two-client test

1. Window 1 (normal): log in as **User A**, open a team whiteboard.
2. Window 2 (incognito): log in as **User B**, open the SAME whiteboard.
   Each window now shows the other person's name badge next to "Live".
3. Move your mouse over the canvas in one window — a labeled colored cursor
   follows in the other window.
4. **Draw at the same time**: A drags a rectangle while B draws with the pen.
   When you release, each shape appears in the other window. Count the
   shapes in both windows — same number, nothing lost, nothing duplicated.
5. As B, take the eraser and click one of A's shapes — it disappears in both
   windows at once.
6. **Late joiner**: close window 2 entirely, draw two more shapes as A, then
   reopen the board as B. B sees the complete current board immediately
   (one snapshot on join — the server does not replay event history).
7. As A, click **Clear board** — B's canvas empties too.
8. Close BOTH windows, reopen the board: the last state is still there.
   The server saves the live board to MongoDB a few seconds after each
   change and immediately when the last person leaves.
9. Log out and open a socket manually with a bad token (or just watch the
   server logs): unauthenticated sockets are refused at the handshake.

### How the whiteboard stays consistent (interview answer)

Every shape has a **client-generated unique id**. Concurrent edits either
touch different ids (both survive) or the same id (**last write wins**).
That's enough for drawings because shapes are independent objects — there is
no ordering to preserve *inside* a shape. Text is different: concurrent
inserts into the same character sequence conflict, which is why the document
editor (Phase 6) uses a CRDT (Yjs) and the whiteboard deliberately does not.
Cursor positions are throttled to ~50 ms and sent as volatile packets — a
lost cursor update is instantly superseded by the next one.

## Verify Phase 6 (collaborative document editor) — two-client test

1. Window 1 (normal): log in as **User A**, open a document. You get a
   rich-text editor with a toolbar (bold, italic, H1/H2, lists, code) and a
   green "Live" indicator.
2. Window 2 (incognito): log in as **User B**, open the SAME document.
3. Type in one window — the text appears in the other as you type. Each window
   shows the other person's **name in the toolbar** and their **colored caret**
   moving through the text.
4. **Type at the same time**, both of you, in the same paragraph. Nothing is
   lost — both people's characters survive and both windows show identical
   text. (This is the case naive whole-document broadcast would silently
   overwrite; see the explainer.)
5. Format some text (bold, a heading, a bullet list) — the formatting appears
   for the other person too.
6. Close BOTH windows, then reopen the document: your content and formatting
   are still there (persisted to MongoDB and reloaded on open).

### Why this needs a CRDT (interview answer)

Two people typing into the same sentence produce inserts at overlapping
positions; last-write-wins would drop one person's characters. Yjs is a CRDT:
it gives every character a stable id so concurrent inserts **merge**
deterministically instead of overwriting. That's why the editor uses Yjs while
the whiteboard (independent shapes) can safely use last-write-wins. Full
explanation: [docs/collaborative-editor.md](docs/collaborative-editor.md).

## Deploy

The backend needs a host that keeps one process alive (WebSockets), so it
goes on **Render**; the static React build goes on **Vercel**. Both free.

1. **Push to GitHub**: create an empty repo, then
   `git remote add origin <repo-url> && git push -u origin main`.
2. **MongoDB Atlas**: in *Network Access*, allow `0.0.0.0/0` (Render's free
   tier has no fixed IPs).
3. **Render** (render.com → New → Web Service, pick the repo):
   - Root directory: `server` — Build: `npm install` — Start: `npm start`
   - Health check path: `/api/health`
   - Environment variables: `MONGODB_URI`, `JWT_SECRET` (generate a fresh
     one), `CLIENT_ORIGIN` (fill in after step 4). Render sets `PORT` itself.
4. **Vercel** (vercel.com → Add New → Project, pick the repo):
   - Root directory: `client` (framework preset: Vite)
   - Environment variable: `VITE_SERVER_URL` = the Render URL from step 3
     (e.g. `https://collabspace-api.onrender.com` — no trailing slash).
5. Back on Render, set `CLIENT_ORIGIN` to the exact Vercel URL
   (e.g. `https://collabspace.vercel.app` — no trailing slash) and redeploy.
6. Open the Vercel URL, register, and run the two-client test above.

Free-tier caveat: Render spins the server down after ~15 idle minutes; the
first request afterwards takes ~30–60 s while it cold-starts.

### RBAC design in one line

The role lives on the **Membership** (user–team pair), not on the User —
one person can be `owner` of one team and `member` of another. Middleware
(`server/src/middleware/membership.js`) loads the caller's membership for
the team in the URL and checks its role before the route runs.
