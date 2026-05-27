import Icon from './Icon.jsx';
import { timeAgo } from '../lib/utils.js';

export default function NotificationPanel({ notifications, onMarkRead, onMarkAllRead, onNavigate, onClose }) {
  const hasUnread = notifications.some((n) => !n.read);

  const handleClick = (notif) => {
    if (!notif.read) onMarkRead(notif.id);
    onNavigate(notif);
    onClose();
  };

  return (
    <>
      <div className="notif-scrim" onClick={onClose} />
      <div className="notif-panel" role="dialog" aria-label="Notifications">
        <div className="notif-head">
          <div className="notif-title">Notifications</div>
          {hasUnread && (
            <button className="btn btn-ghost notif-mark-all" onClick={onMarkAllRead}>
              Mark all as read
            </button>
          )}
          <button className="btn btn-icon notif-close" onClick={onClose} title="Close">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="notif-body">
          {notifications.length === 0 ? (
            <div className="notif-empty">
              <Icon name="bell" size={32} style={{ color: 'var(--text-subtle)', marginBottom: 14 }} />
              <p>No notifications yet.</p>
            </div>
          ) : (
            <ul className="notif-list">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={'notif-item' + (n.read ? '' : ' is-unread')}
                  onClick={() => handleClick(n)}
                >
                  {!n.read && <span className="notif-dot" />}
                  <div className="notif-item-body">
                    <div className="notif-message">{n.message}</div>
                    {n.type === 'new_comment' && n.metadata?.comment_body_preview && (
                      <div className="notif-preview">{n.metadata.comment_body_preview}</div>
                    )}
                    {n.type === 'comment_reply' && n.metadata?.reply_body_preview && (
                      <div className="notif-preview">{n.metadata.reply_body_preview}</div>
                    )}
                    <div className="notif-time">{timeAgo(n.created_at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
