import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import Navbar from "../components/Navbar";

export default function Dashboard() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/teams")
      .then((res) => setTeams(res.data.teams))
      .catch(() => setError("Could not load your teams"))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    try {
      const res = await api.post("/teams", { name: newName });
      setTeams((prev) => [...prev, { ...res.data.team, role: "owner" }]);
      setNewName("");
    } catch (err) {
      setError(err.response?.data?.message || "Could not create team");
    }
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-xl font-bold text-white">Your teams</h1>

        <form onSubmit={handleCreate} className="flex gap-2">
          <input
            type="text"
            required
            placeholder="New team name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 bg-gray-900 text-white rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-500 text-white rounded px-4 py-2 text-sm font-medium"
          >
            Create team
          </button>
        </form>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {loading ? (
          <p className="text-gray-500 text-sm">Loading…</p>
        ) : teams.length === 0 ? (
          <p className="text-gray-500 text-sm">
            You are not in any team yet — create one above.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {teams.map((team) => (
              <li key={team.id}>
                <Link
                  to={`/teams/${team.id}`}
                  className="block bg-gray-900 hover:bg-gray-800 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-white font-medium">{team.name}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        team.role === "owner"
                          ? "bg-indigo-500/20 text-indigo-300"
                          : "bg-gray-700 text-gray-300"
                      }`}
                    >
                      {team.role}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
