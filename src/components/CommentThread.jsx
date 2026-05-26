import { useState } from 'react';
import Icon from './Icon.jsx';
import { initials, timeAgo } from '../lib/utils.js';

const AVATAR_COLORS = ['#6366f1','#8b5cf6','#ec4899','#14b8a6','#f59e0b','#10b981','#3b82f6','#f97316'];
function commentAvatarColor(userId) {
  if (!userId) return '#a8a29e';
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function CommentCard({ comment, isReply = false, userId, onResolve, onReopen, onDelete, onReply }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isAuthor = comment.user_id === userId;
  const color = commentAvatarColor(comment.user_id);

  return (
    <div className={'comment-card' + (comment.resolved ? ' is-resolved' : '') + (isReply ? ' is-reply' : '')}>
      <div className="comment-header">
        <div className="comment-avatar" style={{ background: color }}>
          {initials(comment.author_name)}
        </div>
        <div className="comment-meta">
          <span className="comment-author">{comment.author_name}</span>
          <span className="comment-time">{timeAgo(comment.created_at)}</span>
        </div>
        <div className="comment-header-right">
          {!isReply && (
            comment.resolved
              ? <button className="btn btn-icon comment-action-btn" onClick={onReopen} title="Re-open"><Icon name="redo" size={12} /></button>
              : <button className="btn btn-icon comment-action-btn" onClick={onResolve} title="Resolve"><Icon name="check" size={12} /></button>
          )}
          {isAuthor && (
            <button className="btn btn-icon comment-action-btn comment-delete-btn" onClick={() => setShowDeleteConfirm(true)} title="Delete">
              <Icon name="trash" size={11} />
            </button>
          )}
        </div>
      </div>

      <div className="comment-body">{comment.body}</div>

      {comment.resolved && !isReply && (
        <div className="comment-resolved-badge">Resolved</div>
      )}

      {!isReply && !comment.resolved && onReply && (
        <button className="comment-reply-btn" onClick={onReply}>Reply</button>
      )}

      {showDeleteConfirm && (
        <div className="comment-delete-confirm">
          <p>Delete this comment? This cannot be undone.</p>
          <div className="comment-delete-actions">
            <button className="btn btn-ghost" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
            <button className="btn confirm-delete-btn" onClick={() => { onDelete(comment.id); setShowDeleteConfirm(false); }}>Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CommentThread({
  comments, userId, userColor, userFullName,
  isInputOpen, onOpenInput, onCloseInput,
  onAdd, onResolve, onReopen, onDelete,
}) {
  const rootComments = comments
    .filter(c => !c.parent_id)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const [currentIdx, setCurrentIdx] = useState(0);
  const [inputBody, setInputBody]   = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyBody, setReplyBody]   = useState('');
  const [posting, setPosting]       = useState(false);

  const safeIdx     = rootComments.length ? Math.min(currentIdx, rootComments.length - 1) : 0;
  const currentRoot = rootComments[safeIdx] || null;
  const replies     = currentRoot
    ? comments.filter(c => c.parent_id === currentRoot.id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    : [];

  const handlePost = async () => {
    if (!inputBody.trim() || posting) return;
    setPosting(true);
    try { await onAdd(inputBody.trim(), null); setInputBody(''); onCloseInput(); }
    finally { setPosting(false); }
  };

  const handleReply = async () => {
    if (!replyBody.trim() || !replyingTo || posting) return;
    setPosting(true);
    try { await onAdd(replyBody.trim(), replyingTo); setReplyBody(''); setReplyingTo(null); }
    finally { setPosting(false); }
  };

  const handleResolve = () => {
    if (!currentRoot) return;
    onResolve(currentRoot.id, replies.map(r => r.id));
  };

  return (
    <div className="comment-thread">
      {rootComments.length > 0 && currentRoot && (
        <div className="comment-card-wrap">
          {rootComments.length > 1 && (
            <div className="comment-nav">
              <button className="btn btn-icon comment-nav-btn" onClick={() => setCurrentIdx(i => Math.max(0, i - 1))} disabled={safeIdx === 0}>
                <Icon name="chevron-left" size={13} />
              </button>
              <span className="comment-nav-count">{safeIdx + 1} / {rootComments.length}</span>
              <button className="btn btn-icon comment-nav-btn" onClick={() => setCurrentIdx(i => Math.min(rootComments.length - 1, i + 1))} disabled={safeIdx === rootComments.length - 1}>
                <Icon name="chevron-right" size={13} />
              </button>
            </div>
          )}

          <CommentCard
            comment={currentRoot}
            userId={userId}
            onResolve={handleResolve}
            onReopen={() => onReopen(currentRoot.id)}
            onDelete={onDelete}
            onReply={() => setReplyingTo(currentRoot.id)}
          />

          {replies.map(r => (
            <CommentCard
              key={r.id}
              comment={r}
              isReply
              userId={userId}
              onDelete={onDelete}
            />
          ))}

          {replyingTo === currentRoot.id && (
            <div className="comment-reply-input">
              <textarea
                className="comment-textarea"
                placeholder="Reply…"
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                rows={2}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleReply(); if (e.key === 'Escape') { setReplyingTo(null); setReplyBody(''); } }}
              />
              <div className="comment-input-actions">
                <button className="btn btn-ghost" onClick={() => { setReplyingTo(null); setReplyBody(''); }}>Cancel</button>
                <button className="btn btn-accent" onClick={handleReply} disabled={!replyBody.trim() || posting}>Post</button>
              </div>
            </div>
          )}
        </div>
      )}

      {isInputOpen && (
        <div className="comment-input-wrap">
          <textarea
            className="comment-textarea"
            placeholder="Add a comment…"
            value={inputBody}
            onChange={(e) => setInputBody(e.target.value)}
            rows={3}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePost(); if (e.key === 'Escape') { onCloseInput(); setInputBody(''); } }}
          />
          <div className="comment-input-actions">
            <button className="btn btn-ghost" onClick={() => { onCloseInput(); setInputBody(''); }}>Cancel</button>
            <button className="btn btn-accent" onClick={handlePost} disabled={!inputBody.trim() || posting}>Post</button>
          </div>
        </div>
      )}
    </div>
  );
}
