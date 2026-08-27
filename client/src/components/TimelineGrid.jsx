import { useState } from 'react';

const TIME_LABELS = [
  { min: 540, label: '9AM' },
  { min: 600, label: '10AM' },
  { min: 660, label: '11AM' },
  { min: 780, label: '1PM' },
  { min: 840, label: '2PM' },
  { min: 900, label: '3PM' },
  { min: 960, label: '4PM' },
  { min: 1020, label: '5PM' }
];

export default function TimelineGrid({ slots, rooms, day }) {
  const [selectedSlot, setSelectedSlot] = useState(null);
  
  const dayRooms = rooms.filter(r => JSON.parse(r.availableDays).includes(day));
  const daySlots = slots.filter(s => s.day === day);

  const slotsByRoom = new Map();
  for (const room of dayRooms) slotsByRoom.set(room.id, []);
  for (const slot of daySlots) {
    if (slotsByRoom.has(slot.roomId)) slotsByRoom.get(slot.roomId).push(slot);
  }

  const layoutMin = 540;
  const layoutMax = 1080;
  const totalMinutes = layoutMax - layoutMin;

  function formatTime(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  }

  return (
    <div className="timeline-container" style={{ overflowY: 'auto', maxHeight: '600px' }}>
      <div className="timeline-grid">
        <div className="timeline-header" style={{ position: 'sticky', top: 0, zIndex: 10 }}>
          <div className="time-col"><div className="header-pill">Time</div></div>
          {TIME_LABELS.map(t => (
            <div key={t.min} className="time-header"><div className="header-pill">{t.label}</div></div>
          ))}
        </div>

        {dayRooms.map((room, index) => {
          const roomSlots = slotsByRoom.get(room.id) || [];
          return (
            <div key={room.id} className="timeline-row">
              <div className="room-col"><div className="header-pill">{room.name.replace('Room ', '')}</div></div>
              <div className="time-slot">
                <div className="grid-bg"></div>
                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                  {roomSlots.map(slot => {
                    const left = ((slot.startTimeMin - layoutMin) / totalMinutes) * 100;
                    const width = ((slot.endTimeMin - slot.startTimeMin) / totalMinutes) * 100;
                    
                    const colorClass = slot.status === 'moved' ? 'purple' : slot.status === 'scheduled' ? 'blue' : 'green'; 
                    const statusText = slot.status === 'moved' ? 'Rescheduled' : 'Scheduled';

                    return (
                      <div
                        key={slot.id}
                        className={`schedule-card ${colorClass}`}
                        style={{ left: `${left}%`, width: `${width}%`, cursor: 'pointer' }}
                        onClick={() => setSelectedSlot(slot)}
                        title={`${slot.student?.name} - ${slot.company?.name}`}
                      >
                        <div className="card-title text-truncate">
                          {slot.company?.name} | {slot.student?.name.split(' ')[0]} {slot.student?.name.split(' ')[1]?.[0] ? slot.student?.name.split(' ')[1][0] + '.' : ''}
                        </div>
                        <div className="card-details text-truncate">Panel {slot.panelIndex}, {slot.company?.name}</div>
                        <div className="card-details text-truncate" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: 'auto' }}>
                          CGPA: {slot.student?.cgpa}
                          <span className={`status-badge ${colorClass}`}>{statusText}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedSlot && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="panel" style={{ width: '450px' }}>
            <h2 className="text-cyan">Interview Details</h2>
            <div style={{ marginBottom: '16px' }}>
              <div><strong>Student:</strong> {selectedSlot.student?.name} (CGPA: {selectedSlot.student?.cgpa})</div>
              <div><strong>Company:</strong> {selectedSlot.company?.name} ({selectedSlot.company?.priorityTier} tier)</div>
              <div><strong>Cutoff:</strong> {selectedSlot.company?.cgpaCutoff}</div>
              <div><strong>Time:</strong> Day {selectedSlot.day}, {formatTime(selectedSlot.startTimeMin)} – {formatTime(selectedSlot.endTimeMin)}</div>
              <div><strong>Location:</strong> Room {selectedSlot.room?.name}, Panel {selectedSlot.panelIndex}</div>
              <div><strong>Status:</strong> {selectedSlot.status.toUpperCase()}</div>
            </div>
            <h3 style={{ fontSize: '0.9rem', marginBottom: '8px' }}>Why this slot?</h3>
            <div className="ai-list" style={{ marginTop: 0, marginBottom: '20px' }}>
              <div className="ai-item"><span className="ai-check">✔</span> Student eligible (CGPA {selectedSlot.student?.cgpa} &gt;= {selectedSlot.company?.cgpaCutoff})</div>
              <div className="ai-item"><span className="ai-check">✔</span> Student available (No clashes)</div>
              <div className="ai-item"><span className="ai-check">✔</span> Room {selectedSlot.room?.name} available</div>
              <div className="ai-item"><span className="ai-check">✔</span> Panel {selectedSlot.panelIndex} available</div>
              <div className="ai-item"><span className="ai-check">✔</span> Contiguous {selectedSlot.endTimeMin - selectedSlot.startTimeMin}min slot found</div>
            </div>
            <button className="btn" onClick={() => setSelectedSlot(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
