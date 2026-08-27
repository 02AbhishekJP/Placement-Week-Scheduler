import { useState } from 'react';

export default function UnscheduledList({ unscheduled, metrics }) {
  const [selectedReason, setSelectedReason] = useState(null);

  // Parse breakdown from metrics
  const breakdown = metrics?.unscheduledBreakdown || {};
  let total = 0;
  const chartData = Object.keys(breakdown).map(code => {
    total += breakdown[code];
    // Map backend codes to friendly labels
    let label = code;
    if (code === 'ROOMS_FULL') label = 'Room Capacity';
    else if (code === 'PANELS_FULL') label = 'Panel Capacity';
    else if (code === 'PANEL_AND_ROOM_FULL') label = 'Room & Panel Full';
    else if (code === 'STUDENT_CONFLICT') label = 'Student Collision';
    else if (code === 'NO_FEASIBLE_SLOT') label = 'No Slot Found';
    return { code, label, value: breakdown[code], color: 'cyan' };
  }).sort((a, b) => b.value - a.value);

  const filteredUnscheduled = selectedReason 
    ? unscheduled.filter(u => u.code === selectedReason)
    : unscheduled;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <h2 style={{ fontSize: '1rem', margin: 0 }}>Constraint Intelligence</h2>
          <span style={{ color: 'var(--text-secondary)' }}>⋮</span>
        </div>
        
        <div className="chart-container" style={{ height: '180px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
            <span>{total > 0 ? total : 10}</span>
            <span>{Math.round((total > 0 ? total : 10) * 0.5)}</span>
            <span>0</span>
          </div>
          <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: '0.7rem', color: 'var(--text-secondary)', marginLeft: '4px' }}>
            Failure Reason
          </div>
          
          <div style={{ display: 'flex', gap: '12px', marginLeft: '16px', height: '100%', alignItems: 'flex-end', borderBottom: '1px solid var(--border-light)', flex: 1, paddingBottom: '4px', overflowX: 'auto' }}>
            {chartData.length === 0 && <div className="text-muted" style={{ padding: '20px', alignSelf: 'center' }}>No failures!</div>}
            {chartData.map((d, i) => {
              const heightPct = total > 0 ? Math.max(5, (d.value / total) * 100) : 0;
              return (
                <div key={i} className="bar-col" style={{ cursor: 'pointer', opacity: selectedReason === d.code ? 1 : 0.7 }} onClick={() => setSelectedReason(selectedReason === d.code ? null : d.code)}>
                  <div className="bar" style={{ height: `${heightPct}%` }}></div>
                  <div className="bar-label">{d.label.split(' ').map((w, j) => <div key={j}>{w}</div>)}</div>
                  <div className="text-cyan text-xs" style={{ fontWeight: 'bold' }}>{d.value}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ padding: '16px', flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '1rem', margin: 0 }}>Failure Log</h2>
          {selectedReason && <button className="btn text-xs" style={{ padding: '2px 8px' }} onClick={() => setSelectedReason(null)}>Clear Filter</button>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filteredUnscheduled.slice(0, 50).map((u, i) => (
            <div key={i} style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-light)', borderRadius: '6px' }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{u.student?.name} → {u.company?.name}</div>
              <div className="text-muted text-xs" style={{ marginTop: '4px' }}>{u.reason}</div>
              <div className="status-badge red" style={{ marginTop: '8px' }}>{u.code}</div>
            </div>
          ))}
          {filteredUnscheduled.length > 50 && (
            <div className="text-center text-muted text-xs">...and {filteredUnscheduled.length - 50} more</div>
          )}
          {filteredUnscheduled.length === 0 && (
            <div className="text-muted text-sm text-center" style={{ padding: '20px' }}>No failures to display.</div>
          )}
        </div>
      </div>
    </div>
  );
}
