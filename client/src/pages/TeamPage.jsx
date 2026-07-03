import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import Navbar from "../components/Navbar";
import { useAuth } from "../context/AuthContext";

export default function TeamPage() {
  const { teamId } = useParams();
  const { user } = useAuth();
  const [team, setTeam] = useState(null);
  const [members, setMembers] = useState([]);
  const [yourRole, setYourRole] = useState(null);
  const [error, setError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");

  useEffect(() => {
    api
      .get(`/teams/${teamId}`)
      .then((res) => {
        setTeam(res.data.team);
        setMembers(res.data.members);
        setYourRole(res.data.yourRole);
      })
      .catch((err) =>
        setError(err.response?.data?.message || "Could not load this team")
      );
  }, [teamId]);

  async function handleAddMember(e) {
    e.preventDefault();
    setInviteError("");
    try {
      const res = await api.post(`/teams/${teamId}/members`, { email: inviteEmail });
      setMembers((prev) => [...prev, res.data.member]);
      setInviteEmail("");
    } catch (err) {
      setInviteError(err.response?.data?.message || "Could not add member");
    }
  }

  async function handleRemoveMember(userId) {
    try {
      await api.delete(`/teams/${teamId}/members/${userId}`);
      setMembers((prev) => prev.filter((m) => m.id !== userId));
    } catch (err) {
      setError(err.response?.data?.message || "Could not remove member");
    }
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950">
        <Navbar />
        <main className="max-w-3xl mx-auto px-4 py-8">
          <p className="text-red-400 text-sm">{error}</p>
          <Link to="/" className="text-indigo-400 text-sm hover:underline">
            ← Back to your teams
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div>
          <Link to="/" className="text-indigo-400 text-sm hover:underline">
            ← Back to your teams
          </Link>
          <h1 className="text-xl font-bold text-white mt-2">
            {team ? team.name : "Loading…"}
          </h1>
        </div>

        <section className="bg-gray-900 rounded-lg p-4 space-y-3">
          <h2 className="text-white font-semibold text-sm">
            Members ({members.length})
          </h2>
          <ul className="divide-y divide-gray-800">
            {members.map((m) => (
              <li key={m.id} className="py-2 flex items-center justify-between">
                <div>
                  <span className="text-white text-sm">{m.name}</span>
                  <span className="text-gray-500 text-xs ml-2">{m.email}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      m.role === "owner"
                        ? "bg-indigo-500/20 text-indigo-300"
                        : "bg-gray-700 text-gray-300"
                    }`}
                  >
                    {m.role}
                  </span>
                  {yourRole === "owner" && m.role !== "owner" && m.id !== user.id && (
                    <button
                      onClick={() => handleRemoveMember(m.id)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {yourRole === "owner" && (
            <form onSubmit={handleAddMember} className="flex gap-2 pt-2">
              <input
                type="email"
                required
                placeholder="Add member by email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 bg-gray-800 text-white rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-500 text-white rounded px-4 py-2 text-sm font-medium"
              >
                Add
              </button>
            </form>
          )}
          {inviteError && <p className="text-sm text-red-400">{inviteError}</p>}
        </section>
      </main>
    </div>
  );
}
