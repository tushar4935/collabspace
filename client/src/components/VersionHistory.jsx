import { useEffect, useState } from "react";
import { api } from "../api";

// save = editor.getJSON() snapshot; restore = setContent(), which syncs to
// everyone through the shared yjs doc.
export default function VersionHistory({ editor, teamId, documentId }) {
  const [versions, setVersions] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const base = `/teams/${teamId}/documents/${documentId}/versions`;

  useEffect(() => {
    api
      .get(base)
      .then((res) => setVersions(res.data.versions))
      .catch(() => setError("Could not load versions"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, documentId]);

  async function saveVersion(label) {
    const content = editor.getJSON();
    const res = await api.post(base, { label, content });
    return res.data.version;
  }

  async function handleSave() {
    if (!editor) return;
    setError("");
    const label = window.prompt("Name this version (optional):", "") ?? "";
    setBusy(true);
    try {
      const version = await saveVersion(label);
      setVersions((prev) => [version, ...prev]);
    } catch (err) {
      setError(err.response?.data?.message || "Could not save version");
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore(v) {
    if (!editor) return;
    if (!window.confirm("Restore this version? The current content is saved as a new version first, so you can undo this.")) {
      return;
    }
    setError("");
    setBusy(true);
    try {
      // snapshot the current content first so the restore is reversible
      const snapshot = await saveVersion(
        `Auto-saved before restore — ${new Date().toLocaleString()}`
      );
      const res = await api.get(`${base}/${v.id}`);
      editor.commands.setContent(res.data.version.content, true);
      setVersions((prev) => [snapshot, ...prev]);
    } catch (err) {
      setError(err.response?.data?.message || "Could not restore version");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={busy || !editor}
          className="px-2 py-1 rounded text-xs bg-gray-800 text-gray-200 hover:bg-gray-700 disabled:opacity-40"
        >
          Save version
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="px-2 py-1 rounded text-xs bg-gray-800 text-gray-200 hover:bg-gray-700"
        >
          History ({versions.length})
        </button>
      </div>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-gray-900 border border-gray-800 rounded-lg shadow-xl z-20">
          <div className="px-3 py-2 border-b border-gray-800 text-white text-sm font-semibold">
            Version history
          </div>
          {error && <p className="px-3 py-2 text-xs text-red-400">{error}</p>}
          <ul className="max-h-80 overflow-auto divide-y divide-gray-800">
            {versions.length === 0 ? (
              <li className="px-3 py-4 text-gray-500 text-sm text-center">
                No versions saved yet.
              </li>
            ) : (
              versions.map((v) => (
                <li key={v.id} className="px-3 py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-200 truncate">
                      {v.label || new Date(v.createdAt).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">
                      {v.createdBy.name} · {new Date(v.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRestore(v)}
                    disabled={busy}
                    className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-40 shrink-0"
                  >
                    Restore
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
