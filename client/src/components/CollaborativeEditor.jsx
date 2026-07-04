import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import VersionHistory from "./VersionHistory";

// A stable color per user name, so each person shows up the same color in
// everyone's caret list without any server coordination.
const CURSOR_COLORS = ["#f87171", "#fbbf24", "#34d399", "#60a5fa", "#c084fc", "#f472b6"];
function colorForName(name) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

function ToolbarButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-1 rounded text-sm ${
        active ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

// Receives an already-connected Yjs doc + provider from DocumentPage. Keeping
// the hook in its own component means the provider is created once (in an
// effect) before this ever mounts — the editor always has a live doc.
export default function CollaborativeEditor({ ydoc, provider, userName, teamId, documentId }) {
  const [status, setStatus] = useState(provider.wsconnected ? "connected" : "connecting");
  const [peers, setPeers] = useState([]);

  const editor = useEditor({
    extensions: [
      // StarterKit ships its own undo/redo ("history"), but Collaboration
      // brings a Yjs-aware undo manager. Running both corrupts the shared
      // document, so StarterKit's history MUST be turned off here.
      StarterKit.configure({ history: false }),
      // Binds the editor to the shared Yjs document — this is what makes edits
      // merge instead of clobber. No manual "broadcast my content" anywhere.
      Collaboration.configure({ document: ydoc }),
      // Shows every other person's live caret and selection.
      CollaborationCursor.configure({
        provider,
        user: { name: userName, color: colorForName(userName) },
      }),
    ],
    editorProps: {
      attributes: {
        class:
          "prose prose-invert max-w-none min-h-64 focus:outline-none px-4 py-3",
      },
    },
  });

  useEffect(() => {
    function onStatus({ status }) {
      setStatus(status);
    }
    provider.on("status", onStatus);

    // Awareness = who else is connected, straight from the provider. We read
    // the distinct user names present (excluding ourselves).
    const awareness = provider.awareness;
    function onAwareness() {
      const names = new Set();
      awareness.getStates().forEach((state, clientId) => {
        if (clientId !== awareness.clientID && state.user?.name) {
          names.add(state.user.name);
        }
      });
      setPeers([...names]);
    }
    awareness.on("change", onAwareness);
    onAwareness();

    return () => {
      provider.off("status", onStatus);
      awareness.off("change", onAwareness);
    };
  }, [provider]);

  return (
    <section className="bg-gray-900 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 flex-wrap border-b border-gray-800 px-3 py-2">
        <ToolbarButton
          active={editor?.isActive("bold")}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <span className="font-bold">B</span>
        </ToolbarButton>
        <ToolbarButton
          active={editor?.isActive("italic")}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <span className="italic">I</span>
        </ToolbarButton>
        <ToolbarButton
          active={editor?.isActive("heading", { level: 1 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          H1
        </ToolbarButton>
        <ToolbarButton
          active={editor?.isActive("heading", { level: 2 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          active={editor?.isActive("bulletList")}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          • List
        </ToolbarButton>
        <ToolbarButton
          active={editor?.isActive("orderedList")}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          1. List
        </ToolbarButton>
        <ToolbarButton
          active={editor?.isActive("codeBlock")}
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
        >
          {"</>"}
        </ToolbarButton>

        <div className="ml-auto flex items-center gap-3 text-xs">
          {peers.length > 0 && (
            <span className="text-gray-400">
              Editing with{" "}
              {peers.map((name) => (
                <span key={name} style={{ color: colorForName(name) }} className="font-medium">
                  {name}{" "}
                </span>
              ))}
            </span>
          )}
          <span className={status === "connected" ? "text-green-400" : "text-yellow-400"}>
            ● {status === "connected" ? "Live" : "Connecting…"}
          </span>
          <VersionHistory editor={editor} teamId={teamId} documentId={documentId} />
        </div>
      </div>

      <EditorContent editor={editor} />
    </section>
  );
}
