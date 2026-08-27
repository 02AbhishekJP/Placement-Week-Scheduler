/**
 * Seeded PRNG Dataset Generator
 * Generates realistic placement week data: companies, students, rooms, shortlists.
 *
 * Realism rules enforced:
 * 1. Popularity skew: mass recruiters (150-400 shortlists), niche (15-40)
 * 2. CGPA-correlated shortlists: top decile → 10-18, bottom quartile → 0-2
 * 3. Mass recruiters clustered on Day 1
 * 4. Deliberate capacity infeasibility in peak slices
 */

import prisma from './db.js';

// ─── Seeded PRNG (Mulberry32) ───────────────────────────────────────────────
function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randFloat(rng, min, max) {
  return rng() * (max - min) + min;
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function weightedPick(rng, items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function shuffle(rng, arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Company Name Generator ────────────────────────────────────────────────
const COMPANY_PREFIXES = [
  'Tech', 'Info', 'Digi', 'Cyber', 'Data', 'Cloud', 'Net', 'Code',
  'Algo', 'Soft', 'Smart', 'Meta', 'Quantum', 'Nexus', 'Vertex',
  'Prism', 'Logic', 'Byte', 'Flux', 'Core', 'Nova', 'Zen', 'Pulse',
  'Arc', 'Sigma', 'Omega', 'Alpha', 'Delta', 'Vibe', 'Apex',
  'Pixel', 'Echo', 'Orbit', 'Synth', 'Aura'
];
const COMPANY_SUFFIXES = [
  'Systems', 'Solutions', 'Corp', 'Labs', 'Technologies', 'Dynamics',
  'Works', 'Logic', 'Soft', 'Ware', 'Hub', 'Stack', 'Forge',
  'Mind', 'Sphere', 'Wave', 'Bridge', 'Link', 'Point', 'Edge',
  'Matrix', 'Studio', 'Global', 'Networks', 'Innovations', 'Digital',
  'Analytics', 'Robotics', 'AI', 'Ventures', 'Group', 'Consulting',
  'Services', 'International', 'Partners'
];

function generateCompanyName(rng, index) {
  const prefix = pick(rng, COMPANY_PREFIXES);
  const suffix = pick(rng, COMPANY_SUFFIXES);
  return `${prefix}${suffix}`;
}

// ─── Student Name Generator ────────────────────────────────────────────────
const FIRST_NAMES = [
  'Aarav', 'Aditi', 'Akash', 'Ananya', 'Arjun', 'Diya', 'Gaurav', 'Ishaan',
  'Kavya', 'Krishna', 'Meera', 'Neha', 'Nikhil', 'Pooja', 'Priya', 'Rahul',
  'Riya', 'Rohan', 'Sakshi', 'Sanya', 'Shreya', 'Tanvi', 'Varun', 'Vidya',
  'Vikram', 'Yash', 'Zara', 'Aditya', 'Bhavna', 'Chetan', 'Deepak', 'Esha',
  'Farhan', 'Gauri', 'Harsh', 'Isha', 'Jay', 'Karan', 'Lakshmi', 'Manav',
  'Nandini', 'Om', 'Pallavi', 'Raj', 'Sagar', 'Tara', 'Uma', 'Veer', 'Akshay', 'Simran'
];
const LAST_NAMES = [
  'Sharma', 'Verma', 'Patel', 'Singh', 'Kumar', 'Gupta', 'Reddy', 'Joshi',
  'Mishra', 'Shah', 'Chopra', 'Mehta', 'Iyer', 'Nair', 'Das', 'Bose',
  'Roy', 'Sen', 'Agarwal', 'Banerjee', 'Kapoor', 'Malhotra', 'Tiwari', 'Saxena',
  'Chauhan', 'Yadav', 'Patil', 'Kulkarni', 'Deshmukh', 'Mukherjee', 'Srinivasan', 'Rao'
];
const BRANCHES = ['CSE', 'ECE', 'EEE', 'ME', 'CE', 'IT', 'AI/ML', 'DS'];

function generateStudentName(rng) {
  return `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;
}

// ─── Main Generator ────────────────────────────────────────────────────────

/**
 * Generate a complete placement dataset and write directly to the database.
 *
 * @param {Object} options
 * @param {number} options.seed - RNG seed for reproducibility
 * @param {number} options.numCompanies - default 35
 * @param {number} options.numStudents  - default 800
 * @param {number} options.numRooms     - default 20
 * @param {number} options.numDays      - default 4
 * @returns {Object} Summary statistics
 */
export async function generateDataset({
  seed = 42,
  numCompanies = 35,
  numStudents = 800,
  numRooms = 20,
  numDays = 4
} = {}) {
  const rng = mulberry32(seed);

  // Clear existing data
  await prisma.disruptionLog.deleteMany();
  await prisma.unscheduledInterview.deleteMany();
  await prisma.scheduleSlot.deleteMany();
  await prisma.shortlist.deleteMany();
  await prisma.room.deleteMany();
  await prisma.student.deleteMany();
  await prisma.company.deleteMany();

  // ── 1. Generate Companies ──────────────────────────────────────────────
  // Tier distribution: ~20% mass, ~35% mid, ~45% niche
  const massCount = Math.max(5, Math.round(numCompanies * 0.2));
  const nicheCount = Math.max(10, Math.round(numCompanies * 0.35));
  const midCount = numCompanies - massCount - nicheCount;

  const companyData = [];
  const usedNames = new Set();

  for (let i = 0; i < numCompanies; i++) {
    let tier, slotsNeeded, panelCount, cgpaCutoff, duration;

    if (i < massCount) {
      tier = 'mass';
      slotsNeeded = randInt(rng, 150, 400);
      panelCount = randInt(rng, 3, 6);
      cgpaCutoff = randFloat(rng, 5.5, 7.0);
      duration = pick(rng, [15, 20, 25, 30]);
    } else if (i < massCount + midCount) {
      tier = 'mid';
      slotsNeeded = randInt(rng, 50, 120);
      panelCount = randInt(rng, 2, 4);
      cgpaCutoff = randFloat(rng, 6.5, 8.0);
      duration = pick(rng, [20, 25, 30, 40]);
    } else {
      tier = 'niche';
      slotsNeeded = randInt(rng, 15, 40);
      panelCount = randInt(rng, 1, 2);
      cgpaCutoff = randFloat(rng, 7.5, 9.0);
      duration = pick(rng, [30, 40, 45, 60]);
    }

    // Day assignment: mass → heavily weighted to Day 1
    let assignedDay;
    if (tier === 'mass') {
      assignedDay = weightedPick(rng, [1, 2, 3, 4], [0.65, 0.20, 0.10, 0.05]);
    } else if (tier === 'mid') {
      assignedDay = weightedPick(rng, [1, 2, 3, 4], [0.15, 0.35, 0.30, 0.20]);
    } else {
      assignedDay = weightedPick(rng, [1, 2, 3, 4], [0.05, 0.25, 0.35, 0.35]);
    }

    let name;
    do {
      name = generateCompanyName(rng, i);
    } while (usedNames.has(name));
    usedNames.add(name);

    companyData.push({
      name,
      slotsNeeded,
      panelCount,
      cgpaCutoff: Math.round(cgpaCutoff * 10) / 10,
      interviewDurationMin: duration,
      priorityTier: tier,
      assignedDay
    });
  }

  const companies = [];
  for (const c of companyData) {
    const created = await prisma.company.create({ data: c });
    companies.push(created);
  }

  // ── 2. Generate Students ───────────────────────────────────────────────
  // CGPA distribution: skewed towards realistic bell curve centered at ~7.5
  const studentData = [];
  for (let i = 0; i < numStudents; i++) {
    // Box-Muller transform for normal distribution
    const u1 = rng();
    const u2 = rng();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    let cgpa = 7.5 + z * 1.2; // mean 7.5, std 1.2
    cgpa = Math.max(4.0, Math.min(10.0, cgpa));
    cgpa = Math.round(cgpa * 100) / 100;

    studentData.push({
      name: generateStudentName(rng),
      cgpa,
      branch: pick(rng, BRANCHES),
      alreadyPlaced: false
    });
  }

  const students = [];
  for (const s of studentData) {
    const created = await prisma.student.create({ data: s });
    students.push(created);
  }

  // ── 3. Generate Rooms ─────────────────────────────────────────────────
  const rooms = [];
  for (let i = 0; i < numRooms; i++) {
    // Most rooms available all days; a few available only 2-3 days
    let availDays;
    if (rng() < 0.85) {
      availDays = Array.from({ length: numDays }, (_, d) => d + 1);
    } else {
      const count = randInt(rng, 2, numDays - 1);
      const allDays = Array.from({ length: numDays }, (_, d) => d + 1);
      availDays = shuffle(rng, allDays).slice(0, count).sort((a, b) => a - b);
    }

    const room = await prisma.room.create({
      data: {
        name: `Room ${String.fromCharCode(65 + Math.floor(i / 10))}${(i % 10) + 1}`,
        availableDays: JSON.stringify(availDays)
      }
    });
    rooms.push(room);
  }

  // ── 4. Generate Shortlists (CGPA-correlated) ─────────────────────────
  // Sort students by CGPA to determine percentile
  const sortedStudents = [...students].sort((a, b) => b.cgpa - a.cgpa);
  const studentPercentile = new Map();
  sortedStudents.forEach((s, idx) => {
    studentPercentile.set(s.id, 1 - idx / sortedStudents.length); // 1.0 = top, 0.0 = bottom
  });

  // For each company, select students to shortlist based on CGPA weighting
  const shortlistData = [];
  const studentShortlistCount = new Map(); // track per-student count

  for (const company of companies) {
    // Eligible students: above CGPA cutoff
    const eligible = students.filter(s => s.cgpa >= company.cgpaCutoff);
    if (eligible.length === 0) continue;

    const target = Math.min(company.slotsNeeded, eligible.length);

    // Weight by CGPA percentile: top students much more likely
    const weights = eligible.map(s => {
      const p = studentPercentile.get(s.id);
      // Exponential weighting: top decile gets 10x weight of bottom quartile
      return Math.pow(p, 2) * 10 + 0.5;
    });

    const selected = new Set();
    let attempts = 0;
    const maxAttempts = target * 5;

    while (selected.size < target && attempts < maxAttempts) {
      attempts++;
      const student = weightedPick(rng, eligible, weights);

      // Check per-student shortlist cap based on CGPA percentile
      const pct = studentPercentile.get(student.id);
      let maxShortlists;
      if (pct >= 0.9) maxShortlists = randInt(rng, 10, 18);
      else if (pct >= 0.75) maxShortlists = randInt(rng, 6, 12);
      else if (pct >= 0.5) maxShortlists = randInt(rng, 3, 7);
      else if (pct >= 0.25) maxShortlists = randInt(rng, 1, 4);
      else maxShortlists = randInt(rng, 0, 2);

      const currentCount = studentShortlistCount.get(student.id) || 0;
      if (currentCount < maxShortlists && !selected.has(student.id)) {
        selected.add(student.id);
        studentShortlistCount.set(student.id, currentCount + 1);
        shortlistData.push({ studentId: student.id, companyId: company.id });
      }
    }
  }

  // Deduplicate shortlists before insertion
  const seen = new Set();
  const uniqueShortlists = shortlistData.filter(sl => {
    const key = `${sl.studentId}:${sl.companyId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Batch insert shortlists
  if (uniqueShortlists.length > 0) {
    const BATCH_SIZE = 500;
    for (let i = 0; i < uniqueShortlists.length; i += BATCH_SIZE) {
      const batch = uniqueShortlists.slice(i, i + BATCH_SIZE);
      await prisma.shortlist.createMany({ data: batch });
    }
  }

  // ── 5. Compute Summary Statistics ─────────────────────────────────────
  const totalShortlists = await prisma.shortlist.count();
  const companyStats = companies.map(c => ({
    name: c.name,
    tier: c.priorityTier,
    day: c.assignedDay,
    slotsNeeded: c.slotsNeeded,
    panels: c.panelCount,
    duration: c.interviewDurationMin,
    cutoff: c.cgpaCutoff
  }));

  // Capacity analysis
  const DAY_START = 540; // 9:00 AM
  const DAY_END = 1080;  // 6:00 PM
  const DAY_MINUTES = DAY_END - DAY_START; // 540 minutes

  const roomDaySlots = rooms.reduce((acc, r) => {
    const days = JSON.parse(r.availableDays);
    return acc + days.length;
  }, 0);
  const totalCapacityMinutes = roomDaySlots * DAY_MINUTES;

  const totalDemandMinutes = companies.reduce((acc, c) => {
    return acc + c.slotsNeeded * c.interviewDurationMin;
  }, 0);

  // Per-day demand
  const dayDemand = {};
  for (let d = 1; d <= numDays; d++) {
    const dayCompanies = companies.filter(c => c.assignedDay === d);
    dayDemand[d] = {
      companies: dayCompanies.length,
      totalInterviewMinutes: dayCompanies.reduce((a, c) => a + c.slotsNeeded * c.interviewDurationMin, 0),
      availableRoomMinutes: rooms.filter(r => JSON.parse(r.availableDays).includes(d)).length * DAY_MINUTES
    };
    dayDemand[d].utilization = Math.round((dayDemand[d].totalInterviewMinutes / dayDemand[d].availableRoomMinutes) * 100);
  }

  return {
    seed,
    counts: {
      companies: numCompanies,
      students: numStudents,
      rooms: numRooms,
      days: numDays,
      shortlists: totalShortlists
    },
    capacityAnalysis: {
      totalDemandMinutes,
      totalCapacityMinutes,
      overallUtilization: Math.round((totalDemandMinutes / totalCapacityMinutes) * 100),
      perDay: dayDemand
    },
    companyStats
  };
}
