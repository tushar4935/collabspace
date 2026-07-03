# CollabSpace

A real-time team collaboration platform: teams, shared rich-text documents
(Yjs + Tiptap), shared whiteboards (Socket.io + react-konva), presence,
comments with mentions, notifications, and version history.

## Tech stack

- **Frontend:** React (Vite), Tailwind CSS, React Router, Axios, Context API
- **Backend:** Node, Express, Mongoose, Socket.io
- **Database:** MongoDB Atlas (free tier)
- **Auth:** JWT + bcrypt
- **Real-time documents:** Yjs + y-websocket + Tiptap (exact pinned versions
  will be listed here when the editor phase lands)
- **Real-time whiteboard / presence / notifications:** Socket.io

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
3. "Unsaved changes" appears — click **Save**, then reload the page. Every
   shape comes back exactly where it was (elements persisted to MongoDB).
4. Delete rules match documents: a member sees Delete only on boards they
   created; the team owner sees it on all of them.

The canvas is a fixed 1000×600 logical space rather than stretching to the
window, so saved coordinates mean the same thing on every screen — which is
what makes the shared real-time board possible later.

### RBAC design in one line

The role lives on the **Membership** (user–team pair), not on the User —
one person can be `owner` of one team and `member` of another. Middleware
(`server/src/middleware/membership.js`) loads the caller's membership for
the team in the URL and checks its role before the route runs.
