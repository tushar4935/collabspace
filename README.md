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
2. Open http://localhost:5173 — the page should show
   **Socket: connected (\<socket id\>)**.
3. Server terminal logs `user connected: <socket id>`; the browser console
   logs `connected to server, socket id: <socket id>`.
4. Close the tab — the server logs `user disconnected: <socket id>`.
