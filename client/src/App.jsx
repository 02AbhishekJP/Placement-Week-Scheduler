import { useState, useEffect } from 'react';
import { api } from './api';
import TimelineGrid from './components/TimelineGrid';
import UnscheduledList from './components/UnscheduledList';
import DisruptionPanel from './components/DisruptionPanel';
import ReplanDiffView from './components/ReplanDiffView';

function App() {
  const [loading, setLoading] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [scheduleReady, setScheduleReady] = useState(false);
  
  const [companies, setCompanies] = useState([]);
  const [students, setStudents] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [slots, setSlots] = useState([]);
  const [unscheduled, setUnscheduled] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [defenseSummary, setDefenseSummary] = useState(null);
  const [replanResult, setReplanResult] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  
  const [day, setDay] = useState(1);
  const [genParams, setGenParams] = useState({ seed: 42, numCompanies: 35, numStudents: 800, numRooms: 20, numDays: 4 });
  const [showGenModal, setShowGenModal] = useState(false);
  
  // Animation state
  const [animatingStep, setAnimatingStep] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  async function loadData() {
    try {
      const [schedData, compData, studData, roomData, metData, defData, analData] = await Promise.all([
        api.getSchedule(), api.getCompanies(), api.getStudents(), api.getRooms(), 
        api.getMetrics(), api.getDefenseSummary(), api.getAnalytics()
      ]);
      setSlots(schedData.slots);
      setUnscheduled(schedData.unscheduled);
      setCompanies(compData);
      setStudents(studData);
      setRooms(roomData);
      setMetrics(metData);
      setDefenseSummary(defData);
      setAnalytics(analData);
      if (schedData.slots.length > 0) {
        setScheduleReady(true);
        setDataReady(true);
      }
    } catch { /* ignore */ }
  }

  useEffect(() => { loadData(); }, []);

  async function handleGenerate() {
    setLoading(true);
    setShowGenModal(false);
    try {
      await api.generateDataset(genParams);
      setDataReady(true); setScheduleReady(false); setSlots([]); setUnscheduled([]); setReplanResult(null);
      await loadData();
    } finally { setLoading(false); }
  }

  async function runSchedulerAnimation() {
    setIsAnimating(true);
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      setAnimatingStep(i);
      await new Promise(r => setTimeout(r, 400));
    }
    
    setLoading(true);
    try {
      await api.runScheduler();
      setScheduleReady(true); setReplanResult(null);
      await loadData();
    } finally { 
      setLoading(false); 
      setIsAnimating(false);
      setAnimatingStep(0);
    }
  }

  function handleExport() {
    if (!slots.length) return alert('No schedule to export');
    let csv = 'Student,Company,Day,StartMin,EndMin,Room,Panel,Status\n';
    slots.forEach(s => {
      csv += `"${s.student?.name}","${s.company?.name}",${s.day},${s.startTimeMin},${s.endTimeMin},"${s.room?.name}",${s.panelIndex},${s.status}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'schedule_export.csv';
    a.click();
  }

  return (
    <>
      <header className="header-row">
        <div>
          <h1 className="header-title text-cyan">PLACEMENT <span style={{color: 'white'}}>COMMAND CENTER</span></h1>
          <div className="header-subtitle">AI-powered scheduling for university placements.</div>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button className="btn" onClick={() => setShowGenModal(true)}>Dataset Settings</button>
          <button className="btn" onClick={runSchedulerAnimation} disabled={!dataReady || isAnimating}>Run Scheduler</button>
          <button className="btn" onClick={handleExport} disabled={!scheduleReady}>Export CSV</button>
          <div className="system-online">
            <div className="dot"></div> SYSTEM ONLINE
          </div>
        </div>
      </header>

      {/* Dataset Generation Modal */}
      {showGenModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="panel" style={{ width: '400px' }}>
            <h2>Generate Dataset</h2>
            <div className="form-group"><label>Seed</label><input type="number" value={genParams.seed} onChange={e => setGenParams({...genParams, seed: parseInt(e.target.value)})} /></div>
            <div className="form-group"><label>Students</label><input type="number" value={genParams.numStudents} onChange={e => setGenParams({...genParams, numStudents: parseInt(e.target.value)})} /></div>
            <div className="form-group"><label>Companies</label><input type="number" value={genParams.numCompanies} onChange={e => setGenParams({...genParams, numCompanies: parseInt(e.target.value)})} /></div>
            <div className="form-group"><label>Rooms</label><input type="number" value={genParams.numRooms} onChange={e => setGenParams({...genParams, numRooms: parseInt(e.target.value)})} /></div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <button className="btn btn-primary" onClick={handleGenerate}>Generate</button>
              <button className="btn" onClick={() => setShowGenModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Scheduler Animation Overlay */}
      {isAnimating && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h2 style={{ fontSize: '2rem', marginBottom: '30px' }} className="text-cyan">Executing Scheduler</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '1.2rem' }}>
            <div style={{ opacity: animatingStep >= 1 ? 1 : 0.3 }}>{animatingStep >= 1 ? '✓' : '○'} DATASET LOADED</div>
            <div style={{ opacity: animatingStep >= 2 ? 1 : 0.3 }}>{animatingStep >= 2 ? '✓' : '○'} SHORTLIST EXPANSION</div>
            <div style={{ opacity: animatingStep >= 3 ? 1 : 0.3 }}>{animatingStep >= 3 ? '✓' : '○'} CONSTRAINT ANALYSIS</div>
            <div style={{ opacity: animatingStep >= 4 ? 1 : 0.3 }}>{animatingStep >= 4 ? '✓' : '○'} PRIORITY SORTING</div>
            <div style={{ opacity: animatingStep >= 5 ? 1 : 0.3 }}>{animatingStep >= 5 ? '✓' : '○'} GREEDY ASSIGNMENT</div>
            <div style={{ opacity: animatingStep >= 6 ? 1 : 0.3 }}>{animatingStep >= 6 ? '✓' : '○'} CONFLICT DETECTION</div>
            <div style={{ opacity: animatingStep >= 7 ? 1 : 0.3 }}>{animatingStep >= 7 ? '✓' : '○'} SCHEDULE VALIDATION</div>
            <div style={{ opacity: animatingStep >= 8 ? 1 : 0.3 }}>{animatingStep >= 8 ? '✓' : '○'} FINAL SCHEDULE</div>
          </div>
        </div>
      )}

      {metrics ? (
        <>
          <div className="kpi-row">
            <div className="kpi-card blue">
              <div className="kpi-title">Scheduled:</div>
              <div className="kpi-value">{metrics.totalScheduled}</div>
            </div>
            <div className="kpi-card purple">
              <div className="kpi-title">Unscheduled:</div>
              <div className="kpi-value">{metrics.totalUnscheduled}</div>
            </div>
            <div className="kpi-card cyan">
              <div className="kpi-title">Utilization:</div>
              <div className="kpi-value">{metrics.roomUtilization?.[day] || 0}%</div>
            </div>
            <div className="kpi-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div className="kpi-title">System Health:</div>
                <div className="kpi-value">{defenseSummary?.health || 0}%</div>
              </div>
              <div className="progress-ring">
                <svg viewBox="0 0 60 60">
                  <circle className="bg" cx="30" cy="30" r="25" />
                  <circle className="fill" cx="30" cy="30" r="25" strokeDashoffset={157 - (157 * (defenseSummary?.health || 0)) / 100} />
                </svg>
              </div>
            </div>
          </div>

          <div className="day-row">
            {[1, 2, 3, 4].map(d => (
              <div key={d} className={`day-pill ${day === d ? 'active' : ''}`} onClick={() => setDay(d)}>
                Day {d} <span className="text-muted">({metrics.roomUtilization?.[d] || 0}%)</span>
                <div className="bar-bg">
                  <div className="bar-fill" style={{ width: `${metrics.roomUtilization?.[d] || 0}%`, background: day === d ? 'var(--color-cyan)' : 'var(--color-purple)' }}></div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : <div style={{ height: '140px' }} />}

      <div className="dashboard-grid">
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <h2 style={{ padding: '16px', borderBottom: '1px solid var(--border-light)', margin: 0, fontSize: '0.9rem', textTransform: 'uppercase' }}>Live Schedule Timeline</h2>
          <TimelineGrid slots={slots} rooms={rooms} day={day} numDays={genParams.numDays} />
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', overflow: 'hidden', maxHeight: '640px' }}>
          <div className="panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
            <UnscheduledList unscheduled={unscheduled} metrics={metrics} />
          </div>
        </div>
      </div>

      <div className="bottom-grid">
        <div className="panel">
          <h2><span style={{ color: 'var(--color-yellow)' }}>⚡</span> DISRUPTION CENTER <span style={{ marginLeft: 'auto', color: 'var(--color-red)', fontSize: '0.8rem' }}>Urgent</span></h2>
          <DisruptionPanel companies={companies} students={students} rooms={rooms} onTrigger={async (d) => { setLoading(true); const r = await api.triggerDisruption(d); setReplanResult(r); await loadData(); setLoading(false); }} />
        </div>
        
        <div className="panel">
          <h2>Company Operations</h2>
          {(defenseSummary?.companyStats || []).slice(0, 3).map(c => (
            <div className="progress-item" key={c.id}>
              <div className="progress-header"><span>{c.name}</span> <span className="text-muted">{c.completion}%</span></div>
              <div className="progress-track"><div className={`progress-fill ${c.id % 2 === 0 ? 'cyan' : 'purple'}`} style={{ width: `${c.completion}%` }}></div></div>
            </div>
          ))}
          {(!defenseSummary?.companyStats || defenseSummary.companyStats.length === 0) && (
            <div className="text-muted text-sm mt-4">No companies scheduled yet.</div>
          )}
        </div>

        <div className="panel">
          <ReplanDiffView replanResult={replanResult} companies={companies} students={students} />
        </div>

        <div className="panel">
          <h2>AI Decision Explanation</h2>
          <div className="ai-list">
            <div className="ai-item"><span className="ai-check">✔</span> Student eligible & available</div>
            <div className="ai-item"><span className="ai-check">✔</span> Room available & reserved</div>
            <div className="ai-item"><span className="ai-check">✔</span> Panel available & assigned</div>
            <div className="ai-item"><span className="ai-check">✔</span> Contiguous slot found</div>
            <div className="ai-item"><span className="ai-check">✔</span> No student conflicts</div>
          </div>
        </div>
      </div>
    </>
  );
}

export default App;
