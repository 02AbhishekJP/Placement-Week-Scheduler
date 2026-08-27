/**
 * Hard-Constraint Greedy Scheduler
 *
 * Expands shortlists into interview requests, sorts by constraint tightness,
 * and greedily assigns each request its earliest feasible slot.
 * All hard constraints are strictly enforced — violations go to the unscheduled
 * list with a specific, human-readable reason.
 *
 * Hard constraints:
 * 1. A student is in at most one interview per time slot
 * 2. A room hosts at most one interview per time slot
 * 3. A panel runs at most one interview at a time
 * 4. No interview for student below company CGPA cutoff
 * 5. Interview length matches company's interviewDurationMin
 */

import prisma from './db.js';

const DAY_START = 540;  // 9:00 AM in minutes from midnight
const DAY_END = 1080;   // 6:00 PM

/**
 * Run the scheduling algorithm on the current dataset.
 * @returns {Object} Schedule summary with metrics
 */
export async function runScheduler() {
  // Clear previous schedule
  await prisma.scheduleSlot.deleteMany();
  await prisma.unscheduledInterview.deleteMany();

  // Load all entities
  const companies = await prisma.company.findMany();
  const students = await prisma.student.findMany();
  const rooms = await prisma.room.findMany();
  const shortlists = await prisma.shortlist.findMany();

  // Build lookup maps
  const companyMap = new Map(companies.map(c => [c.id, c]));
  const studentMap = new Map(students.map(s => [s.id, s]));
  const roomMap = new Map(rooms.map(r => [r.id, r]));

  // ── 1. Expand shortlists into interview requests ─────────────────────
  const requests = shortlists.map(sl => {
    const company = companyMap.get(sl.companyId);
    const student = studentMap.get(sl.studentId);
    return {
      studentId: sl.studentId,
      companyId: sl.companyId,
      student,
      company,
      duration: company.interviewDurationMin,
      day: company.assignedDay,
      tier: company.priorityTier
    };
  });

  // ── 2. Pre-filter: CGPA cutoff check ─────────────────────────────────
  const eligible = [];
  const cgpaRejections = [];

  for (const req of requests) {
    if (req.student.cgpa < req.company.cgpaCutoff) {
      cgpaRejections.push({
        studentId: req.studentId,
        companyId: req.companyId,
        reason: `Student CGPA (${req.student.cgpa}) below ${req.company.name} cutoff (${req.company.cgpaCutoff})`,
        code: 'CGPA_BELOW_CUTOFF'
      });
    } else {
      eligible.push(req);
    }
  }

  // ── 3. Sort by constraint tightness ──────────────────────────────────
  // Priority: mass > mid > niche, then by fewer feasible options
  const tierOrder = { mass: 0, mid: 1, niche: 2 };

  // Pre-compute flexibility score: how many feasible (room, panel, time) combos exist
  const roomsByDay = new Map();
  for (const room of rooms) {
    const days = JSON.parse(room.availableDays);
    for (const d of days) {
      if (!roomsByDay.has(d)) roomsByDay.set(d, []);
      roomsByDay.get(d).push(room);
    }
  }

  eligible.sort((a, b) => {
    // Primary: company priority tier
    const tierDiff = tierOrder[a.tier] - tierOrder[b.tier];
    if (tierDiff !== 0) return tierDiff;

    // Secondary: fewer available rooms on their day → schedule first (more constrained)
    const aRooms = (roomsByDay.get(a.day) || []).length;
    const bRooms = (roomsByDay.get(b.day) || []).length;
    if (aRooms !== bRooms) return aRooms - bRooms;

    // Tertiary: longer interviews first (harder to fit)
    return b.duration - a.duration;
  });

  // ── 4. Greedy assignment with constraint tracking ────────────────────

  // Occupancy trackers: key = "resource:day:startMin" → Set of occupied minute ranges
  // Using interval lists for each resource per day
  // student occupancy: studentId → day → sorted list of [start, end]
  // room occupancy: roomId → day → sorted list of [start, end]
  // panel occupancy: "companyId:panelIndex" → day → sorted list of [start, end]
  const studentOcc = new Map(); // studentId → Map<day, [[start,end],...]>
  const roomOcc = new Map();    // roomId → Map<day, [[start,end],...]>
  const panelOcc = new Map();   // "cId:pIdx" → Map<day, [[start,end],...]>

  function getOcc(map, key, day) {
    if (!map.has(key)) map.set(key, new Map());
    const dayMap = map.get(key);
    if (!dayMap.has(day)) dayMap.set(day, []);
    return dayMap.get(day);
  }

  function overlaps(intervals, start, end) {
    for (const [s, e] of intervals) {
      if (start < e && end > s) return true;
    }
    return false;
  }

  function addInterval(intervals, start, end) {
    intervals.push([start, end]);
  }

  const scheduled = [];
  const unscheduled = [];

  for (const req of eligible) {
    const { studentId, companyId, duration, day } = req;
    const company = req.company;
    const dayRooms = roomsByDay.get(day) || [];

    let placed = false;
    let failReason = '';
    let failCode = '';

    // Try each time slot in 5-minute increments
    for (let startMin = DAY_START; startMin + duration <= DAY_END; startMin += 5) {
      const endMin = startMin + duration;

      // Check student availability
      const studentSlots = getOcc(studentOcc, studentId, day);
      if (overlaps(studentSlots, startMin, endMin)) continue;

      // Try each room
      for (const room of dayRooms) {
        const roomSlots = getOcc(roomOcc, room.id, day);
        if (overlaps(roomSlots, startMin, endMin)) continue;

        // Try each panel
        for (let panel = 0; panel < company.panelCount; panel++) {
          const panelKey = `${companyId}:${panel}`;
          const panelSlots = getOcc(panelOcc, panelKey, day);
          if (overlaps(panelSlots, startMin, endMin)) continue;

          // All constraints satisfied! Place it.
          addInterval(studentSlots, startMin, endMin);
          addInterval(roomSlots, startMin, endMin);
          addInterval(panelSlots, startMin, endMin);

          scheduled.push({
            companyId,
            studentId,
            roomId: room.id,
            panelIndex: panel,
            day,
            startTimeMin: startMin,
            endTimeMin: endMin,
            status: 'scheduled'
          });

          placed = true;
          break;
        }
        if (placed) break;
      }
      if (placed) break;
    }

    if (!placed) {
      // Determine specific failure reason
      const studentSlots = getOcc(studentOcc, studentId, day);
      const studentBusy = studentSlots.length > 0;

      const allRoomsFull = dayRooms.every(room => {
        const roomSlots = getOcc(roomOcc, room.id, day);
        // Check if there's any gap that fits
        for (let t = DAY_START; t + duration <= DAY_END; t += 5) {
          if (!overlaps(roomSlots, t, t + duration)) return false;
        }
        return true;
      });

      const allPanelsBusy = (() => {
        for (let panel = 0; panel < company.panelCount; panel++) {
          const panelKey = `${companyId}:${panel}`;
          const panelSlots = getOcc(panelOcc, panelKey, day);
          for (let t = DAY_START; t + duration <= DAY_END; t += 5) {
            if (!overlaps(panelSlots, t, t + duration)) return false;
          }
        }
        return true;
      })();

      if (allPanelsBusy && allRoomsFull) {
        failReason = `All ${company.panelCount} panels of ${company.name} and all rooms on Day ${day} are fully booked`;
        failCode = 'PANEL_AND_ROOM_FULL';
      } else if (allPanelsBusy) {
        failReason = `All ${company.panelCount} panels of ${company.name} are fully booked on Day ${day}`;
        failCode = 'PANELS_FULL';
      } else if (allRoomsFull) {
        failReason = `All rooms on Day ${day} are fully booked during available panel slots`;
        failCode = 'ROOMS_FULL';
      } else if (studentBusy) {
        failReason = `Student has conflicting interviews across all available time slots for ${company.name} on Day ${day}`;
        failCode = 'STUDENT_CONFLICT';
      } else {
        failReason = `No feasible (room, panel, time) combination found for ${company.name} on Day ${day}`;
        failCode = 'NO_FEASIBLE_SLOT';
      }

      unscheduled.push({
        studentId,
        companyId,
        reason: failReason,
        code: failCode
      });
    }
  }

  // ── 5. Write results to database ─────────────────────────────────────
  // Batch insert scheduled slots
  const BATCH_SIZE = 500;
  for (let i = 0; i < scheduled.length; i += BATCH_SIZE) {
    await prisma.scheduleSlot.createMany({
      data: scheduled.slice(i, i + BATCH_SIZE)
    });
  }

  // Insert unscheduled (combine CGPA rejections and scheduling failures)
  const allUnscheduled = [...cgpaRejections, ...unscheduled];
  for (let i = 0; i < allUnscheduled.length; i += BATCH_SIZE) {
    await prisma.unscheduledInterview.createMany({
      data: allUnscheduled.slice(i, i + BATCH_SIZE)
    });
  }

  // ── 6. Compute metrics ───────────────────────────────────────────────
  const totalRequests = requests.length;
  const scheduledCount = scheduled.length;
  const unscheduledCount = allUnscheduled.length;
  const scheduleRate = totalRequests > 0 ? Math.round((scheduledCount / totalRequests) * 1000) / 10 : 0;

  // Room utilization per day
  const roomUtil = {};
  for (let d = 1; d <= 4; d++) {
    const dRooms = roomsByDay.get(d) || [];
    let totalUsed = 0;
    let totalAvail = dRooms.length * (DAY_END - DAY_START);
    for (const room of dRooms) {
      const slots = getOcc(roomOcc, room.id, d);
      for (const [s, e] of slots) {
        totalUsed += (e - s);
      }
    }
    roomUtil[d] = totalAvail > 0 ? Math.round((totalUsed / totalAvail) * 1000) / 10 : 0;
  }

  // Student clash check (should be 0 by construction)
  let clashCount = 0;
  for (const [, dayMap] of studentOcc) {
    for (const [, intervals] of dayMap) {
      intervals.sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < intervals.length; i++) {
        if (intervals[i][0] < intervals[i - 1][1]) clashCount++;
      }
    }
  }

  // Unscheduled breakdown by code
  const unscheduledByCode = {};
  for (const u of allUnscheduled) {
    unscheduledByCode[u.code] = (unscheduledByCode[u.code] || 0) + 1;
  }

  return {
    totalRequests,
    scheduled: scheduledCount,
    unscheduled: unscheduledCount,
    scheduleRate,
    clashCount,
    roomUtilization: roomUtil,
    unscheduledBreakdown: unscheduledByCode
  };
}
