const API = '/api';

async function request(url, options = {}) {
  const res = await fetch(`${API}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const api = {
  generateDataset: (params) => request('/dataset/generate', { method: 'POST', body: JSON.stringify(params) }),
  runScheduler: () => request('/schedule/run', { method: 'POST' }),
  getSchedule: (day) => request(`/schedule${day ? `?day=${day}` : ''}`),
  getCompanies: () => request('/companies'),
  getStudents: () => request('/students'),
  getRooms: () => request('/rooms'),
  getMetrics: () => request('/metrics'),
  triggerDisruption: (disruptions) => request('/replan/trigger', { method: 'POST', body: JSON.stringify({ disruptions }) }),
  getDisruptions: () => request('/disruptions'),
  getDefenseSummary: () => request('/defense/summary'),
  getAnalytics: () => request('/analytics'),
};
