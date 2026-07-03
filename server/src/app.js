import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import teamRoutes from "./routes/teams.js";

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN }));
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/teams", teamRoutes);

// Central error handler (Express 5 forwards rejected async handlers here).
// Keeps every error response in the same JSON shape the client expects.
app.use((err, req, res, next) => {
  if (err.name === "CastError") {
    return res.status(400).json({ message: "Invalid id" });
  }
  console.error(err);
  res.status(500).json({ message: "Server error" });
});

export default app;
