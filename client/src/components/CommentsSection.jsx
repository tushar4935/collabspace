import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

// comment thread for a document or whiteboard. mention ids are recorded
// when picked from the dropdown, not parsed out of the text.
export default function CommentsSection({ teamId, targetType, targetId }) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [yourRole, setYourRole] = useState(null);
  const [members, setMembers] = useState([]);
  const [text, setText] = useState("");
  const [mentions, setMentions] = useState([]);
  const [showMentionList, setShowMentionList] = useState(false);
  const [replyTo, setReplyTo] = useState(null); // top-level comment being replied to
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get(`/teams/${teamId}/comments`, { params: { targetType, targetId } })
      .then((res) => {
        setComments(res.data.comments);
        setYourRole(res.data.yourRole);
      })
      .catch(() => setError("Could not load comments"));
    api
      .get(`/teams/${teamId}`)
      .then((res) => setMembers(res.data.members))
      .catch(() => {});
  }, [teamId, targetType, targetId]);

  function handleTextChange(e) {
    const value = e.target.value;
    setText(value);
    // "@" at the end of the text opens the member picker
    setShowMentionList(value.endsWith("@"));
    // drop mention ids whose name was edited out of the text
    setMentions((prev) =>
      prev.filter((id) => {
        const m = members.find((mem) => mem.id === id);
        return m && value.includes(`@${m.name}`);
      })
    );
  }

  function pickMention(member) {
    setText((prev) => `${prev}${member.name} `);
    setMentions((prev) => (prev.includes(member.id) ? prev : [...prev, member.id]));
    setShowMentionList(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      const res = await api.post(`/teams/${teamId}/comments`, {
        content: text,
        targetType,
        targetId,
        parentId: replyTo?.id ?? null,
        mentions,
      });
      setComments((prev) => [...prev, res.data.comment]);
      setText("");
      setMentions([]);
      setReplyTo(null);
    } catch (err) {
      setError(err.response?.data?.message || "Could not post the comment");
    }
  }

  async function handleDelete(commentId) {
    setError("");
    try {
      await api.delete(`/teams/${teamId}/comments/${commentId}`);
      // server cascades replies of a deleted top-level comment
      setComments((prev) =>
        prev.filter((c) => c.id !== commentId && c.parentId !== commentId)
      );
    } catch (err) {
      setError(err.response?.data?.message || "Could not delete the comment");
    }
  }

  // highlight @Name for team members that appear in the text
  function renderContent(content) {
    const names = members.map((m) => m.name).filter(Boolean);
    if (names.length === 0) return content;
    const pattern = new RegExp(
      `(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`,
      "g"
    );
    return content.split(pattern).map((part, i) =>
      part.startsWith("@") ? (
        <span key={i} className="text-indigo-300 font-medium">
          {part}
        </span>
      ) : (
        part
      )
    );
  }

  const canDelete = (c) => yourRole === "owner" || c.author.id === user.id;
  const topLevel = comments.filter((c) => !c.parentId);
  const repliesOf = (id) => comments.filter((c) => c.parentId === id);

  function CommentRow({ comment, isReply }) {
    return (
      <div className={`py-2 ${isReply ? "ml-6 border-l border-gray-800 pl-3" : ""}`}>
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-white text-sm font-medium">{comment.author.name}</span>
            <span className="text-gray-500 text-xs">
              {new Date(comment.createdAt).toLocaleString()}
            </span>
          </div>
          <div className="flex gap-3">
            {!isReply && (
              <button
                onClick={() => setReplyTo(comment)}
                className="text-xs text-gray-400 hover:text-gray-300"
              >
                Reply
              </button>
            )}
            {canDelete(comment) && (
              <button
                onClick={() => handleDelete(comment.id)}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Delete
              </button>
            )}
          </div>
        </div>
        <p className="text-gray-300 text-sm mt-0.5 whitespace-pre-wrap">
          {renderContent(comment.content)}
        </p>
      </div>
    );
  }

  return (
    <section className="bg-gray-900 rounded-lg p-4 space-y-3">
      <h2 className="text-white font-semibold text-sm">
        Comments ({comments.length})
      </h2>

      {topLevel.length === 0 ? (
        <p className="text-gray-500 text-sm">No comments yet.</p>
      ) : (
        <div className="divide-y divide-gray-800">
          {topLevel.map((c) => (
            <div key={c.id}>
              <CommentRow comment={c} isReply={false} />
              {repliesOf(c.id).map((r) => (
                <CommentRow key={r.id} comment={r} isReply />
              ))}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-2 relative">
        {replyTo && (
          <p className="text-xs text-gray-400">
            Replying to <span className="text-gray-300">{replyTo.author.name}</span>{" "}
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="text-red-400 hover:text-red-300 ml-1"
            >
              cancel
            </button>
          </p>
        )}
        <textarea
          required
          rows={2}
          placeholder="Write a comment — type @ to mention a teammate"
          value={text}
          onChange={handleTextChange}
          className="w-full bg-gray-800 text-white rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
        />
        {showMentionList && members.length > 0 && (
          <ul className="absolute z-10 bg-gray-800 border border-gray-700 rounded shadow-lg w-56 max-h-40 overflow-auto">
            {members.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => pickMention(m)}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700"
                >
                  {m.name}
                  <span className="text-gray-500 text-xs ml-2">{m.email}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-500 text-white rounded px-4 py-1.5 text-sm font-medium"
          >
            {replyTo ? "Reply" : "Comment"}
          </button>
        </div>
      </form>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </section>
  );
}
