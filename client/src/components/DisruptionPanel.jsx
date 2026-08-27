import { useState } from 'react';

export default function DisruptionPanel({ companies, students, rooms, onTrigger }) {
  const [queue, setQueue] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [currentType, setCurrentType] = useState(null);
  
  // Form states
  const [companyId, setCompanyId] = useState('');
  const [hoursLate, setHoursLate] = useState(3);
  const [panelIndex, setPanelIndex] = useState(0);
  const [studentIdStr, setStudentIdStr] = useState('');
  const [roomId, setRoomId] = useState('');
  const [day, setDay] = useState(1);
  
  // New Company states
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyTier, setNewCompanyTier] = useState('mass');
  const [newCompanyDay, setNewCompanyDay] = useState(2);
  const [newCompanySlots, setNewCompanySlots] = useState(20);
  const [newCompanyPanels, setNewCompanyPanels] = useState(2);
  const [newCompanyCgpa, setNewCompanyCgpa] = useState(7.0);
  const [newCompanyDuration, setNewCompanyDuration] = useState(30);

  const openModal = (type) => {
    setCurrentType(type);
    setShowModal(true);
  };

  const handleQueue = () => {
    let params = {};
    let label = '';
    
    if (currentType === 'COMPANY_LATE') {
      if (!companyId) return alert('Select company');
      params = { companyId: parseInt(companyId), hoursLate: parseFloat(hoursLate) };
      label = `${companies.find(c => c.id == companyId)?.name} +${hoursLate}h late`;
    } else if (currentType === 'PANEL_DROPPED') {
      if (!companyId) return alert('Select company');
      params = { companyId: parseInt(companyId), panelIndex: parseInt(panelIndex) };
      label = `${companies.find(c => c.id == companyId)?.name} Panel ${panelIndex} dropped`;
    } else if (currentType === 'STUDENT_WITHDRAWN') {
      if (!studentIdStr) return alert('Enter student IDs');
      const ids = studentIdStr.split(',').map(s => parseInt(s.trim())).filter(Boolean);
      ids.forEach(id => {
        setQueue(q => [...q, { type: 'STUDENT_WITHDRAWN', params: { studentId: id }, label: `Student #${id} withdrawn` }]);
      });
      setShowModal(false);
      return;
    } else if (currentType === 'ROOM_UNAVAILABLE') {
      if (!roomId) return alert('Select room');
      params = { roomId: parseInt(roomId), day: parseInt(day) };
      label = `${rooms.find(r => r.id == roomId)?.name} offline (Day ${day})`;
    } else if (currentType === 'NEW_COMPANY') {
      if (!newCompanyName) return alert('Enter company name');
      params = {
        name: newCompanyName,
        priorityTier: newCompanyTier,
        assignedDay: parseInt(newCompanyDay),
        slotsNeeded: parseInt(newCompanySlots),
        panelCount: parseInt(newCompanyPanels),
        cgpaCutoff: parseFloat(newCompanyCgpa),
        interviewDurationMin: parseInt(newCompanyDuration)
      };
      label = `New Company: ${newCompanyName} (Day ${newCompanyDay})`;
    }

    setQueue(q => [...q, { type: currentType, params, label }]);
    setShowModal(false);
  };

  return (
    <>
      <div className="disruption-grid">
        <div className="disruption-card yellow" onClick={() => openModal('COMPANY_LATE')} style={{ cursor: 'pointer' }}>
          <div className="d-title">Company Late</div>
          <div className="d-info">Impact: <span className="d-status yellow">Shift schedule</span></div>
        </div>
        
        <div className="disruption-card red" onClick={() => openModal('STUDENT_WITHDRAWN')} style={{ cursor: 'pointer' }}>
          <div className="d-title">Student Withdrawn</div>
          <div className="d-info">Impact: <span className="d-status red">Free slots</span></div>
        </div>
        
        <div className="disruption-card red" onClick={() => openModal('PANEL_DROPPED')} style={{ cursor: 'pointer' }}>
          <div className="d-title">Panel Dropped</div>
          <div className="d-info">Impact: <span className="d-status red">Reassign panels</span></div>
        </div>
        
        <div className="disruption-card red" onClick={() => openModal('ROOM_UNAVAILABLE')} style={{ cursor: 'pointer' }}>
          <div className="d-title">Room Offline</div>
          <div className="d-info">Impact: <span className="d-status red">Reassign rooms</span></div>
        </div>
        
        <div className="disruption-card blue" onClick={() => openModal('NEW_COMPANY')} style={{ cursor: 'pointer', borderColor: 'var(--color-blue)', boxShadow: 'inset 0 0 12px rgba(59,130,246,0.1)' }}>
          <div className="d-title">Add New Company</div>
          <div className="d-info">Impact: <span className="d-status" style={{color: 'var(--color-blue)'}}>Schedule dynamically</span></div>
        </div>
      </div>

      {queue.length > 0 && (
        <div style={{ marginTop: '16px', background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px' }}>
          <h3 style={{ fontSize: '0.85rem', marginBottom: '8px' }}>Compound Disruption Queue ({queue.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
            {queue.map((q, i) => (
              <div key={i} style={{ fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
                <span>• {q.label}</span>
                <span style={{ cursor: 'pointer', color: 'var(--color-red)' }} onClick={() => setQueue(qs => qs.filter((_, idx) => idx !== i))}>✕</span>
              </div>
            ))}
          </div>
          <button className="btn" style={{ width: '100%', justifyContent: 'center', borderColor: 'var(--color-cyan)', color: 'var(--color-cyan)' }} onClick={() => { onTrigger(queue); setQueue([]); }}>
            Run Compound Replan
          </button>
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="panel" style={{ width: '350px' }}>
            <h2 className="text-cyan">Configure Disruption</h2>
            
            {(currentType === 'COMPANY_LATE' || currentType === 'PANEL_DROPPED') && (
              <div className="form-group">
                <label>Company</label>
                <select value={companyId} onChange={e => setCompanyId(e.target.value)}>
                  <option value="">Select...</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}

            {currentType === 'COMPANY_LATE' && (
              <div className="form-group">
                <label>Hours Late</label>
                <input type="number" step="0.5" value={hoursLate} onChange={e => setHoursLate(e.target.value)} />
              </div>
            )}

            {currentType === 'PANEL_DROPPED' && (
              <div className="form-group">
                <label>Panel Index</label>
                <input type="number" value={panelIndex} onChange={e => setPanelIndex(e.target.value)} />
              </div>
            )}

            {currentType === 'STUDENT_WITHDRAWN' && (
              <div className="form-group">
                <label>Student IDs</label>
                <input type="text" value={studentIdStr} onChange={e => setStudentIdStr(e.target.value)} placeholder="e.g. 1, 4, 15" />
              </div>
            )}

            {currentType === 'ROOM_UNAVAILABLE' && (
              <>
                <div className="form-group">
                  <label>Room</label>
                  <select value={roomId} onChange={e => setRoomId(e.target.value)}>
                    <option value="">Select...</option>
                    {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Day</label>
                  <select value={day} onChange={e => setDay(e.target.value)}>
                    {[1,2,3,4].map(d => <option key={d} value={d}>Day {d}</option>)}
                  </select>
                </div>
              </>
            )}

            {currentType === 'NEW_COMPANY' && (
              <>
                <div className="form-group">
                  <label>Company Name</label>
                  <input type="text" value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)} placeholder="e.g. Stripe" />
                </div>
                <div className="form-group">
                  <label>Priority Tier</label>
                  <select value={newCompanyTier} onChange={e => setNewCompanyTier(e.target.value)}>
                    <option value="mass">Mass</option>
                    <option value="mid">Mid</option>
                    <option value="niche">Niche</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Day</label>
                  <select value={newCompanyDay} onChange={e => setNewCompanyDay(e.target.value)}>
                    <option value="2">Day 2</option>
                    <option value="3">Day 3</option>
                    <option value="4">Day 4</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Slots Needed</label>
                  <input type="number" value={newCompanySlots} onChange={e => setNewCompanySlots(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Panel Count</label>
                  <input type="number" value={newCompanyPanels} onChange={e => setNewCompanyPanels(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>CGPA Cutoff</label>
                  <input type="number" step="0.1" value={newCompanyCgpa} onChange={e => setNewCompanyCgpa(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Duration (Min)</label>
                  <select value={newCompanyDuration} onChange={e => setNewCompanyDuration(e.target.value)}>
                    <option value="30">30 min</option>
                    <option value="45">45 min</option>
                    <option value="60">60 min</option>
                  </select>
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button className="btn" style={{ borderColor: 'var(--color-cyan)', color: 'var(--color-cyan)' }} onClick={handleQueue}>Add to Queue</button>
              <button className="btn" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
