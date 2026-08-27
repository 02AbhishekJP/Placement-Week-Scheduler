/**
 * Placement Week Scheduler — Express API Server
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from './db.js';
import { generateDataset } from './generator.js';
import { runScheduler } from './scheduler.js';
import { replan } from './replanner.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// ─── Dataset Generation ─────────────────────────────────────────────────────

app.post('/api/dataset/generate', async (req, res) => {
  try {
    const { seed = 42, numCompanies = 35, numStudents = 800, numRooms = 20, numDays = 4 } = req.body || {};
    const result = await generateDataset({ seed, numCompanies, numStudents, numRooms, numDays });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Run Scheduler ──────────────────────────────────────────────────────────

app.post('/api/schedule/run', async (req, res) => {
  try {
    const t0 = Date.now();
    const result = await runScheduler();
    const executionMs = Date.now() - t0;
    res.json({ success: true, executionMs, ...result });
  } catch (err) {
    console.error('Scheduler error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Get Schedule ───────────────────────────────────────────────────────────

app.get('/api/schedule', async (req, res) => {
  try {
    const { day } = req.query;
    const where = { status: { not: 'cancelled' } };
    if (day) where.day = parseInt(day);

    const slots = await prisma.scheduleSlot.findMany({
      where,
      include: {
        company: { select: { id: true, name: true, priorityTier: true, interviewDurationMin: true, panelCount: true, cgpaCutoff: true, slotsNeeded: true, assignedDay: true } },
        student: { select: { id: true, name: true, cgpa: true, branch: true } },
        room: { select: { id: true, name: true } }
      },
      orderBy: [{ day: 'asc' }, { startTimeMin: 'asc' }, { roomId: 'asc' }]
    });

    const unscheduled = await prisma.unscheduledInterview.findMany({
      include: {
        company: { select: { id: true, name: true, priorityTier: true, cgpaCutoff: true, assignedDay: true } },
        student: { select: { id: true, name: true, cgpa: true, branch: true } }
      }
    });

    res.json({ slots, unscheduled, totalSlots: slots.length, totalUnscheduled: unscheduled.length });
  } catch (err) {
    console.error('Schedule fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Get Companies ──────────────────────────────────────────────────────────

app.get('/api/companies', async (req, res) => {
  try {
    const companies = await prisma.company.findMany({ orderBy: { id: 'asc' } });
    res.json(companies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Get Students ───────────────────────────────────────────────────────────

app.get('/api/students', async (req, res) => {
  try {
    const students = await prisma.student.findMany({ orderBy: { id: 'asc' } });
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Get Rooms ──────────────────────────────────────────────────────────────

app.get('/api/rooms', async (req, res) => {
  try {
    const rooms = await prisma.room.findMany({ orderBy: { id: 'asc' } });
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Trigger Disruption / Replan ────────────────────────────────────────────

app.post('/api/replan/trigger', async (req, res) => {
  try {
    const { disruptions } = req.body;
    if (!disruptions || !Array.isArray(disruptions) || disruptions.length === 0) {
      return res.status(400).json({ error: 'disruptions array required' });
    }
    const result = await replan(disruptions);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Replan error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Get Disruption History ─────────────────────────────────────────────────

app.get('/api/disruptions', async (req, res) => {
  try {
    const logs = await prisma.disruptionLog.findMany({ orderBy: { timestamp: 'desc' } });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Metrics ────────────────────────────────────────────────────────────────

app.get('/api/metrics', async (req, res) => {
  try {
    const totalScheduled = await prisma.scheduleSlot.count({ where: { status: { not: 'cancelled' } } });
    const totalCancelled = await prisma.scheduleSlot.count({ where: { status: 'cancelled' } });
    const totalUnscheduled = await prisma.unscheduledInterview.count();
    const totalShortlists = await prisma.shortlist.count();
    const totalStudents = await prisma.student.count();
    const totalCompanies = await prisma.company.count();

    const scheduleRate = totalShortlists > 0 ? Math.round((totalScheduled / totalShortlists) * 1000) / 10 : 0;

    // Room utilization
    const rooms = await prisma.room.findMany();
    const slots = await prisma.scheduleSlot.findMany({ where: { status: { not: 'cancelled' } } });

    const DAY_MINUTES = 540;
    const roomUtil = {};
    for (let d = 1; d <= 4; d++) {
      const dayRooms = rooms.filter(r => JSON.parse(r.availableDays).includes(d));
      const totalAvail = dayRooms.length * DAY_MINUTES;
      let totalUsed = 0;
      for (const s of slots) {
        if (s.day === d) totalUsed += (s.endTimeMin - s.startTimeMin);
      }
      roomUtil[d] = totalAvail > 0 ? Math.round((totalUsed / totalAvail) * 1000) / 10 : 0;
    }

    // Unscheduled breakdown
    const unscheduled = await prisma.unscheduledInterview.findMany();
    const breakdown = {};
    for (const u of unscheduled) {
      breakdown[u.code] = (breakdown[u.code] || 0) + 1;
    }

    res.json({
      totalScheduled, totalCancelled, totalUnscheduled, totalShortlists,
      totalStudents, totalCompanies, scheduleRate, roomUtilization: roomUtil,
      unscheduledBreakdown: breakdown
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Defense Summary ────────────────────────────────────────────────────────

app.get('/api/defense/summary', async (req, res) => {
  try {
    const companies = await prisma.company.findMany();
    const rooms = await prisma.room.findMany();
    const slots = await prisma.scheduleSlot.findMany({
      where: { status: { not: 'cancelled' } },
      include: { company: true }
    });
    const unscheduled = await prisma.unscheduledInterview.findMany();
    const shortlists = await prisma.shortlist.findMany();

    // Per-company stats
    const companyStats = companies.map(c => {
      const shortlisted = shortlists.filter(s => s.companyId === c.id).length;
      const scheduled = slots.filter(s => s.companyId === c.id).length;
      const pending = unscheduled.filter(u => u.companyId === c.id).length;
      const completion = shortlisted > 0 ? Math.round((scheduled / shortlisted) * 1000) / 10 : 0;
      return {
        id: c.id, name: c.name, priorityTier: c.priorityTier,
        assignedDay: c.assignedDay, panelCount: c.panelCount,
        interviewDurationMin: c.interviewDurationMin,
        slotsNeeded: c.slotsNeeded, cgpaCutoff: c.cgpaCutoff,
        shortlisted, scheduled, pending, completion
      };
    });

    // Per-day stats
    const DAY_MINUTES = 540;
    const dayStats = {};
    for (let d = 1; d <= 4; d++) {
      const daySlots = slots.filter(s => s.day === d);
      const dayUnsched = unscheduled.filter(u => {
        const comp = companies.find(c => c.id === u.companyId);
        return comp && comp.assignedDay === d;
      });
      const dayRooms = rooms.filter(r => JSON.parse(r.availableDays).includes(d));
      const dayCompanies = companies.filter(c => c.assignedDay === d);
      const totalAvail = dayRooms.length * DAY_MINUTES;
      let totalUsed = 0;
      for (const s of daySlots) totalUsed += (s.endTimeMin - s.startTimeMin);
      dayStats[d] = {
        scheduled: daySlots.length,
        unscheduled: dayUnsched.length,
        utilization: totalAvail > 0 ? Math.round((totalUsed / totalAvail) * 1000) / 10 : 0,
        companies: dayCompanies.length,
        rooms: dayRooms.length
      };
    }

    // Schedule health score
    const totalShortlists = shortlists.length;
    const totalScheduled = slots.length;
    const scheduleRate = totalShortlists > 0 ? (totalScheduled / totalShortlists) * 100 : 0;
    // Health = weighted: 70% schedule rate + 30% (absence of hard violations)
    const health = Math.round(Math.min(100, scheduleRate * 0.7 + 30));

    res.json({ companyStats, dayStats, health, totalScheduled, totalShortlists });
  } catch (err) {
    console.error('Defense summary error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Analytics ──────────────────────────────────────────────────────────────

app.get('/api/analytics', async (req, res) => {
  try {
    const students = await prisma.student.findMany();
    const companies = await prisma.company.findMany();
    const rooms = await prisma.room.findMany();
    const shortlists = await prisma.shortlist.findMany();
    
    // Student Analytics
    const cgpas = students.map(s => s.cgpa);
    const avgCgpa = (cgpas.reduce((a, b) => a + b, 0) / (students.length || 1)).toFixed(2);
    const highestCgpa = Math.max(...cgpas);
    const lowestCgpa = Math.min(...cgpas);
    
    // Company Analytics
    const shortlistsPerCompany = {};
    shortlists.forEach(s => {
      shortlistsPerCompany[s.companyId] = (shortlistsPerCompany[s.companyId] || 0) + 1;
    });
    
    let maxShortlist = 0;
    for (const count of Object.values(shortlistsPerCompany)) {
      if (count > maxShortlist) maxShortlist = count;
    }
    
    const massRecruiters = companies.filter(c => c.priorityTier === 'mass').length;
    const midTier = companies.filter(c => c.priorityTier === 'mid').length;
    const nicheTier = companies.filter(c => c.priorityTier === 'niche').length;
    
    // Capacity Analytics
    const DAY_MINUTES = 540;
    let totalDemandMinutes = 0;
    companies.forEach(c => totalDemandMinutes += (c.slotsNeeded * c.interviewDurationMin));
    
    let totalCapacityMinutes = 0;
    rooms.forEach(r => {
      const days = JSON.parse(r.availableDays);
      totalCapacityMinutes += (days.length * DAY_MINUTES);
    });

    res.json({
      studentStats: { avgCgpa, highestCgpa, lowestCgpa, count: students.length },
      companyStats: { massRecruiters, midTier, nicheTier, count: companies.length, maxShortlist },
      capacityStats: { totalDemandMinutes, totalCapacityMinutes, deficit: Math.max(0, totalDemandMinutes - totalCapacityMinutes) }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Serve React Frontend (Production) ──────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDist = path.join(__dirname, '../../client/dist');

app.use(express.static(clientDist));

// Catch-all: serve index.html for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// ─── Start Server ───────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🚀 Placement Scheduler API running on http://localhost:${PORT}`);
});
