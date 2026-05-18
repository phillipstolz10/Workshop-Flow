import { useState, useEffect } from 'react';
import Icon from './Icon.jsx';

function aggregateMaterials(data, workshopId) {
  const workshop = data.workshops[workshopId];
  if (!workshop) return [];
  const counts = {};
  workshop.sectionIds.forEach((sid) => {
    const section = data.sections[sid];
    if (!section) return;
    section.blockIds.forEach((bid) => {
      const block = data.blocks[bid];
      if (!block?.material?.trim()) return;
      block.material
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((item) => {
          const key = item.toLowerCase();
          if (!counts[key]) counts[key] = { label: item, count: 0 };
          counts[key].count++;
        });
    });
  });
  return Object.values(counts).sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
  );
}

const storageKey = (workshopId) => `wf_packing_${workshopId}`;

export default function PackingList({ data, workshopId, onClose }) {
  const items = aggregateMaterials(data, workshopId);

  const [checked, setChecked] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey(workshopId)) || '{}');
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem(storageKey(workshopId), JSON.stringify(checked));
  }, [checked, workshopId]);

  const toggle = (key) => setChecked((c) => ({ ...c, [key]: !c[key] }));
  const reset  = () => setChecked({});

  const checkedCount = Object.values(checked).filter(Boolean).length;
  const subtitleText = items.length === 0
    ? 'No items'
    : `${items.length} item${items.length === 1 ? '' : 's'}${checkedCount > 0 ? ` · ${checkedCount} packed` : ''}`;

  return (
    <>
      <div className="pl-scrim" onClick={onClose} />
      <div className="pl-panel" role="dialog" aria-label="Packing List">
        <div className="pl-head">
          <div>
            <div className="pl-title">Packing List</div>
            <div className="pl-subtitle">{subtitleText}</div>
          </div>
          <button className="btn btn-icon pl-close" onClick={onClose} title="Close">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="pl-body">
          {items.length === 0 ? (
            <div className="pl-empty">
              <Icon name="backpack" size={36} style={{ color: 'var(--text-subtle)', marginBottom: 14 }} />
              <p>No materials found.</p>
              <p>Add materials to your blocks to see them here.</p>
            </div>
          ) : (
            <ul className="pl-list">
              {items.map((item) => {
                const key = item.label.toLowerCase();
                const isChecked = !!checked[key];
                return (
                  <li key={key} className={'pl-item' + (isChecked ? ' is-checked' : '')}>
                    <label>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(key)}
                        className="pl-checkbox"
                      />
                      <span className="pl-item-label">{item.label}</span>
                      {item.count > 1 && (
                        <span className="pl-item-count">×{item.count}</span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="pl-footer">
            <button className="btn btn-ghost pl-reset" onClick={reset}>
              Reset list
            </button>
          </div>
        )}
      </div>
    </>
  );
}
