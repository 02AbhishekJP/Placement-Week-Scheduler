import { useState } from 'react';

function formatTime(min) {
  if (!min) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default function ReplanDiffView({ replanResult, companies, students }) {
  const [showDiff, setShowDiff] = useState(false);
  const churn = replanResult?.churnPercent || 0;
  
  const diffs = replanResult?.diff || [];
  const notifications = [];

  const companyMap = new Map((companies || []).map(c => [c.id, c]));
  const studentMap = new Map((students || []).map(s => [s.id, s]));

  diffs.forEach(d => {
    const student = studentMap.get(d.studentId);
    if (d.changeType === 'moved') {
      notifications.push({ type: 'STUDENT', name: student?.name, msg: `Interview moved from ${formatTime(d.oldSlot.startTimeMin)} to ${formatTime(d.newSlot.startTimeMin)}` });
    } else if (d.changeType === 'cancelled') {
      notifications.push({ type: 'STUDENT', name: student?.name, msg: `Interview cancelled: ${d.reason}` });
    } else if (d.changeType === 'newly_scheduled') {
      notifications.push({ type: 'STUDENT', name: student?.name, msg: `Newly scheduled off waitlist!` });
    }
  });

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h2 style={{ margin: 0 }}>Replan Diff</h2>
        <span style={{ color: 'var(--color-blue)', cursor: 'pointer' }} onClick={() => setShowDiff(!showDiff)}>
          {showDiff ? 'Close Details' : 'View Details »'}
        </span>
      </div>
      
      {!showDiff && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '120px' }}>
          <div className="diff-arrows">
            <span className="arrow-cyan">❯</span>
            <span className="arrow-cyan">❯</span>
            <span className="arrow-red">❯</span>
          </div>
          <div className="churn-score">
            Churn Score: {churn}%
          </div>
          {replanResult && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
              Execution: {replanResult.executionMs}ms
            </div>
          )}
        </div>
      )}

      {showDiff && replanResult && (
        <div style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.75rem' }}>
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '4px', marginBottom: '8px' }}>
            <strong>Impact Summary:</strong> {replanResult.affectedStudents?.length || 0} Students, {replanResult.affectedCompanies?.length || 0} Companies Affected
          </div>

          <h3 style={{ fontSize: '0.85rem', color: 'var(--color-cyan)', margin: '8px 0 4px' }}>Notifications Required</h3>
          {notifications.slice(0, 10).map((n, i) => (
            <div key={`n-${i}`} style={{ padding: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
              <strong>{n.name}:</strong> {n.msg}
            </div>
          ))}
          {notifications.length === 0 && <div className="text-muted">No notifications required.</div>}
          {notifications.length > 10 && <div className="text-muted text-center">...and {notifications.length - 10} more</div>}
          
          <h3 style={{ fontSize: '0.85rem', color: 'var(--color-cyan)', margin: '16px 0 4px' }}>Detailed Changes ({diffs.length})</h3>
          {diffs.slice(0, 50).map((d, i) => {
            const student = studentMap.get(d.studentId);
            const company = companyMap.get(d.companyId);
            const statusColor = d.changeType === 'cancelled' ? 'var(--color-red)' : 'var(--color-cyan)';
            return (
              <div key={`d-${i}`} style={{ padding: '8px', background: 'rgba(0,0,0,0.3)', borderLeft: `3px solid ${statusColor}`, borderRadius: '4px', fontFamily: 'monospace' }}>
                <div style={{ fontWeight: 600, fontSize: '0.8rem', color: '#fff' }}>{student?.name} → {company?.name}</div>
                <div style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {d.oldSlot ? <div>BEFORE: {formatTime(d.oldSlot.startTimeMin)} (Room {d.oldSlot.roomId})</div> : null}
                  {d.newSlot ? <div>AFTER: {formatTime(d.newSlot.startTimeMin)} (Room {d.newSlot.roomId})</div> : null}
                </div>
                <div style={{ color: statusColor, fontWeight: 'bold', marginTop: '4px' }}>[{d.changeType.toUpperCase()}]</div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
