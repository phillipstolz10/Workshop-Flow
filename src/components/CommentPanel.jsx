import { useState, useRef, useEffect } from 'react';
import Icon from './Icon.jsx';

function relTime(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

function avatarBg(uid) {
  if (!uid) return '#94a3b8';
  const palette = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6'];
  let h = 0;
  for (const c of uid) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function CommentInput({ targetLabel, userFullName, userColor, onPost, onCancel }) {
  const [body, setBody] = useState('');
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const post = () => { if (body.trim()) { onPost(body.trim()); setBody(''); } };
  return (
    <div className="cm-input-card">
      <div className="cm-input-head">
        <span className="cm-avatar" style={{ background: userColor || '#94a3b8' }}>
          {getInitials(userFullName)}
        </span>
        <span>Commenting on <strong style={{ color: 'var(--text)' }}>{targetLabel}</strong></span>
      </div>
      <textarea
        ref={ref}
        className="cm-input-textarea"
        placeholder="Leave a comment — anyone with access can see it…"
        value={body}
        onChange={e => setBody(e.target.value)}
        onKeyDown={e => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); post(); }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
        rows={3}
      />
      <div className="cm-input-actions">
        <button className="cm-btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="cm-btn-primary" disabled={!body.trim()} onClick={post}>Post</button>
      </div>
    </div>
  );
}

function ReplyInput({ userFullName, userColor, onPost, onCancel }) {
  const [body, setBody] = useState('');
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const post = () => { if (body.trim()) { onPost(body.trim()); setBody(''); } };
  return (
    <div className="cm-reply-input">
      <div className="cm-input-head">
        <span className="cm-avatar" style={{ background: userColor || '#94a3b8' }}>
          {getInitials(userFullName)}
        </span>
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Reply</span>
      </div>
      <textarea
        ref={ref}
        className="cm-input-textarea"
        placeholder="Add a reply…"
        value={body}
        onChange={e => setBody(e.target.value)}
        onKeyDown={e => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); post(); }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
        rows={2}
      />
      <div className="cm-input-actions">
        <button className="cm-btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="cm-btn-primary" disabled={!body.trim()} onClick={post}>Post</button>
      </div>
    </div>
  );
}

function CommentCard({ comment, userId, userColorMap, onResolve, onReopen, onDelete, onReply, isReply, showReply }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isAuthor = comment.user_id === userId;
  return (
    <div className={'cm-card' + (comment.resolved ? ' is-resolved' : '')} role="article" aria-labelledby={'cm-author-' + comment.id}>
      <div className="cm-card-head">
        <span className="cm-avatar" style={{ background: userColorMap?.[comment.user_id] || avatarBg(comment.user_id) }}>
          {getInitials(comment.author_name)}
        </span>
        <span className="cm-card-author" id={'cm-author-' + comment.id}>{comment.author_name}</span>
        <span className="cm-card-time">· {relTime(comment.created_at)}</span>
        {comment.resolved && <span className="cm-card-resolved-badge">Resolved</span>}
      </div>

      <div className="cm-card-body">{comment.body}</div>

      {!comment.resolved && (
        <div className="cm-card-foot">
          <button className="cm-resolve-btn" onClick={() => onResolve(comment.id)}>
            <Icon name="check" size={12} /> Resolve
          </button>
          {showReply && (
            <button onClick={() => onReply(comment.id)}>
              <Icon name="reply" size={12} /> Reply
            </button>
          )}
          <span style={{ flex: 1 }} />
          {isAuthor && (
            <button className="cm-card-del" title="Delete" onClick={() => setShowDeleteConfirm(v => !v)}>
              <Icon name="trash" size={13} />
            </button>
          )}
        </div>
      )}
      {comment.resolved && !isReply && (
        <div className="cm-card-foot">
          <button onClick={() => onReopen(comment.id)}>Re-open</button>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="cm-delete-confirm">
          <p>Delete this comment and its replies?</p>
          <div className="cm-delete-actions">
            <button className="cm-delete-cancel" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
            <button className="cm-delete-confirm-btn" onClick={() => { onDelete(comment.id); setShowDeleteConfirm(false); }}>Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CommentPanel({
  comments,
  data,
  sectionIds,
  userId,
  userFullName,
  userColor,
  selectedTarget,
  inputOpen,
  onOpenInput,
  onClearInput,
  onScrollToTarget,
  onAdd,
  onResolve,
  onReopen,
  onDelete,
  userColorMap,
}) {
  const [filter, setFilter] = useState('all');
const [replyingTo, setReplyingTo] = useState(null);
  const [pulsingTarget, setPulsingTarget] = useState(null);
  const [repliesOpen, setRepliesOpen] = useState({});

  // Derived data
  const rootComments = comments.filter(c => !c.parent_id);
  const repliesByParent = {};
  comments.filter(c => c.parent_id).forEach(c => {
    (repliesByParent[c.parent_id] = repliesByParent[c.parent_id] || []).push(c);
  });

  const commentsByEntity = {};
  rootComments.forEach(c => {
    const key = c.entity_type + ':' + c.entity_id;
    (commentsByEntity[key] = commentsByEntity[key] || []).push(c);
  });

  const totalUnresolved = rootComments.filter(c => !c.resolved).length;

  const groups = sectionIds.map((sid, sIdx) => {
    const sec = data.sections[sid];
    if (!sec) return null;

    const items = [];

    const secKey = 'section:' + sid;
    const secComments = commentsByEntity[secKey] || [];
    const visibleSecComments = filter === 'open' ? secComments.filter(c => !c.resolved) : secComments;
    if (visibleSecComments.length > 0) {
      items.push({ targetLabel: sec.title + ' (section)', entityKey: secKey, entityType: 'section', entityId: sid, comments: visibleSecComments });
    }

    (sec.blockIds || []).forEach(bid => {
      const blkKey = 'block:' + bid;
      const blkComments = commentsByEntity[blkKey] || [];
      const visibleBlkComments = filter === 'open' ? blkComments.filter(c => !c.resolved) : blkComments;
      if (visibleBlkComments.length > 0) {
        items.push({ targetLabel: data.blocks[bid]?.title || 'Block', entityKey: blkKey, entityType: 'block', entityId: bid, comments: visibleBlkComments });
      }
    });

    // Add input item if this section's target is selected
    if (inputOpen && selectedTarget) {
      const isInThisGroup = selectedTarget.kind === 'section'
        ? selectedTarget.id === sid
        : (sec.blockIds || []).includes(selectedTarget.id);
      if (isInThisGroup) {
        const inputLabel = selectedTarget.kind === 'section'
          ? sec.title + ' (section)'
          : data.blocks[selectedTarget.id]?.title || 'Block';
        items.push({ isInput: true, entityType: selectedTarget.kind, entityId: selectedTarget.id, targetLabel: inputLabel });
      }
    }

    if (items.length === 0) return null;
    return { sectionId: sid, sectionTitle: sec.title, sectionIndex: sIdx + 1, items };
  }).filter(Boolean);

  const handleScrollToTarget = (kind, id) => {
    onScrollToTarget && onScrollToTarget(kind, id);
    const key = kind + ':' + id;
    setPulsingTarget(key);
    setTimeout(() => setPulsingTarget(null), 900);
  };

  const handleAdd = (entityType, entityId, body, parentId) => {
    onAdd(entityType, entityId, body, parentId);
    if (!parentId) onClearInput();
    setReplyingTo(null);
  };

  return (
    <aside className="cm-panel">
      <div className="cm-panel-head">
        <div className="cm-panel-title">
          <Icon name="message-circle" size={14} />
          Comments
          <span className="cm-panel-count">{totalUnresolved}</span>
        </div>
        <div className="cm-panel-filter">
          <button className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')}>All</button>
          <button className={filter === 'open' ? 'is-active' : ''} onClick={() => setFilter('open')}>Open</button>
        </div>
      </div>

      <div className="cm-panel-body">
        {groups.length === 0 && (
          <div className="cm-empty">
            <span className="cm-empty-icon"><Icon name="message-circle" size={18} /></span>
            <div className="cm-empty-title">No comments yet</div>
            <div>Hover any section or block and click the speech bubble to add the first comment.</div>
          </div>
        )}

        {groups.map(group => (
          <div className="cm-group" key={group.sectionId}>
            <div className="cm-group-head">
              <span className="cm-group-idx">{String(group.sectionIndex).padStart(2, '0')}</span>
              {group.sectionTitle}
            </div>

            {group.items.map((item, itemIdx) => {
              if (item.isInput) {
                return (
                  <CommentInput
                    key={'input-' + item.entityId}
                    targetLabel={item.targetLabel}
                    userFullName={userFullName}
                    userColor={userColor}
                    onPost={body => handleAdd(item.entityType, item.entityId, body, null)}
                    onCancel={onClearInput}
                  />
                );
              }

              const isPulsing = pulsingTarget === item.entityKey;

              return (
                <div key={item.entityKey}>
                  <div className={'cm-on' + (isPulsing ? ' cm-on-pulse' : '')}>
                    On{' '}
                    <a
                      onClick={() => handleScrollToTarget(item.entityType, item.entityId)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && handleScrollToTarget(item.entityType, item.entityId)}
                    >
                      <strong>{item.targetLabel}</strong>
                    </a>
                  </div>

                  <div className="cm-thread">
                    {item.comments.map(comment => {
                      const replies = repliesByParent[comment.id] || [];
                      return (
                        <div key={comment.id}>
                          <CommentCard
                            comment={comment}
                            userId={userId}
                            userColorMap={userColorMap}
                            onResolve={onResolve}
                            onReopen={onReopen}
                            onDelete={onDelete}
                            onReply={id => setReplyingTo(replyingTo === id ? null : id)}
                            isReply={false}
                            showReply={replies.length === 0}
                          />

                          {replies.length > 0 && (
                            <button
                              className="cm-replies-toggle"
                              onClick={() => setRepliesOpen(s => ({ ...s, [comment.id]: !s[comment.id] }))}
                            >
                              <Icon name={repliesOpen[comment.id] ? 'chevron-down' : 'chevron-right'} size={11} />
                              {repliesOpen[comment.id] ? 'Hide' : replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                            </button>
                          )}

                          {repliesOpen[comment.id] && replies.map((reply, ri) => (
                            <div className="cm-reply" key={reply.id}>
                              <CommentCard
                                comment={reply}
                                userId={userId}
                                userColorMap={userColorMap}
                                onResolve={onResolve}
                                onReopen={onReopen}
                                onDelete={onDelete}
                                onReply={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                                isReply
                                showReply={ri === replies.length - 1}
                              />
                            </div>
                          ))}

                          {replyingTo === comment.id && (
                            <ReplyInput
                              userFullName={userFullName}
                              userColor={userColor}
                              onPost={body => { handleAdd(item.entityType, item.entityId, body, comment.id); }}
                              onCancel={() => setReplyingTo(null)}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
