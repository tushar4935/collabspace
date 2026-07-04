import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { api } from "../api";
import CollaborativeEditor from "../components/CollaborativeEditor";
import CommentsSection from "../components/CommentsSection";
import Navbar from "../components/Navbar";
import { useAuth } from "../context/AuthContext";

// Browsers can't set headers on a WebSocket, so y-websocket connects over
// ws(s):// — derive that from the http(s):// API URL.
const WS_BASE = import.meta.env.VITE_SERVER_URL.replace(/^http/, "ws");

export default function DocumentPage() {
  const { teamId, documentId } = useParams();
  const { user } = useAuth();
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  // The Yjs doc + provider are created in an effect (not render) so React's
  // StrictMode double-mount tears the first pair down cleanly instead of
  // leaking two live WebSocket connections.
  const [collab, setCollab] = useState(null);

  useEffect(() => {
    api
      .get(`/teams/${teamId}/documents/${documentId}`)
      .then((res) => setDoc(res.data.document))
      .catch((err) =>
        setError(err.response?.data?.message || "Could not load this document")
      );
  }, [teamId, documentId]);

  useEffect(() => {
    const ydoc = new Y.Doc();
    // roomname = documentId; the server maps it to the Document and checks
    // membership. The token rides as a query param for the handshake auth.
    const provider = new WebsocketProvider(`${WS_BASE}/yjs`, documentId, ydoc, {
      params: { token: localStorage.getItem("token") },
    });
    setCollab({ ydoc, provider });
    return () => {
      provider.destroy();
      ydoc.destroy();
      setCollab(null);
    };
  }, [documentId]);

  async function handleRename(e) {
    e.preventDefault();
    try {
      const res = await api.patch(`/teams/${teamId}/documents/${documentId}`, {
        title: titleDraft,
      });
      setDoc(res.data.document);
      setRenaming(false);
    } catch (err) {
      setError(err.response?.data?.message || "Could not rename the document");
    }
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div>
          <Link
            to={`/teams/${teamId}`}
            className="text-indigo-400 text-sm hover:underline"
          >
            ← Back to team
          </Link>

          {renaming ? (
            <form onSubmit={handleRename} className="flex gap-2 mt-2">
              <input
                type="text"
                required
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                className="flex-1 bg-gray-800 text-white rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-500 text-white rounded px-4 py-2 text-sm font-medium"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setRenaming(false)}
                className="text-gray-400 hover:text-gray-300 text-sm px-2"
              >
                Cancel
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-3 mt-2">
              <h1 className="text-xl font-bold text-white">
                {doc ? doc.title : "Loading…"}
              </h1>
              {doc && (
                <button
                  onClick={() => {
                    setTitleDraft(doc.title);
                    setRenaming(true);
                  }}
                  className="text-xs text-gray-400 hover:text-gray-300"
                >
                  Rename
                </button>
              )}
            </div>
          )}
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        {collab ? (
          <CollaborativeEditor
            ydoc={collab.ydoc}
            provider={collab.provider}
            userName={user.name}
          />
        ) : (
          <section className="bg-gray-900 rounded-lg p-6 min-h-64">
            <p className="text-gray-500 text-sm">Connecting to the editor…</p>
          </section>
        )}

        <CommentsSection
          teamId={teamId}
          targetType="document"
          targetId={documentId}
        />
      </main>
    </div>
  );
}
