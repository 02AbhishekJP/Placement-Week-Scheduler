/**
 * Minimal-Churn Replanner Engine
 * 
 * Handles 4 disruption types + compound disruptions.
 * Only touches directly-affected interviews, caps ripple at 1 hop.
 * Produces a diff the coordinator can read in seconds.
 */

import prisma from './db.js';

const DAY_START = 540;
const DAY_END = 1080;

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildOccupancy(slots) {
  const studentOcc = new Map();
  const roomOcc = new Map();
  const panelOcc = new Map();

  for (const s of slots) {
    addToOcc(studentOcc, s.studentId, s.day, s.startTimeMin, s.endTimeMin);
    addToOcc(roomOcc, s.roomId, s.day, s.startTimeMin, s.endTimeMin);
    addToOcc(panelOcc, `${s.companyId}:${s.panelIndex}`, s.day, s.startTimeMin, s.endTimeMin);
  }
  return { studentOcc, roomOcc, panelOcc };
}

function addToOcc(map, key, day, start, end) {
  if (!map.has(key)) map.set(key, new Map());
  const dayMap = map.get(key);
  if (!dayMap.has(day)) dayMap.set(day, []);
  dayMap.get(day).push([start, end]);
}

function removeFromOcc(map, key, day, start, end) {
  if (!map.has(key)) return;
  const dayMap = map.get(key);
  if (!dayMap.has(day)) return;
  const intervals = dayMap.get(day);
  const idx = intervals.findIndex(([s, e]) => s === start && e === end);
  if (idx !== -1) intervals.splice(idx, 1);
}

function overlaps(map, key, day, start, end) {
  if (!map.has(key)) return false;
  const dayMap = map.get(key);
  if (!dayMap.has(day)) return false;
  for (const [s, e] of dayMap.get(day)) {
    if (start < e && end > s) return true;
  }
  return false;
}

function formatTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * Try to place an interview into a free slot.
 * Returns the new slot data or null.
 */
function tryPlace(studentId, companyId, duration, day, panelCount, rooms, occ) {
  const { studentOcc, roomOcc, panelOcc } = occ;

  for (let startMin = DAY_START; startMin + duration <= DAY_END; startMin += 5) {
    const endMin = startMin + duration;
    if (overlaps(studentOcc, studentId, day, startMin, endMin)) continue;

    for (const room of rooms) {
      const availDays = JSON.parse(room.availableDays);
      if (!availDays.includes(day)) continue;
      if (overlaps(roomOcc, room.id, day, startMin, endMin)) continue;

      for (let panel = 0; panel < panelCount; panel++) {
        const pk = `${companyId}:${panel}`;
        if (overlaps(panelOcc, pk, day, startMin, endMin)) continue;

        return { roomId: room.id, panelIndex: panel, startTimeMin: startMin, endTimeMin: endMin };
      }
    }
  }
  return null;
}

// ─── Main Replan Function ───────────────────────────────────────────────────

/**
 * @param {Array} disruptions - Array of disruption objects
 *   { type: 'COMPANY_LATE' | 'PANEL_DROPPED' | 'STUDENT_WITHDRAWN' | 'ROOM_UNAVAILABLE',
 *     params: { companyId?, hoursLate?, panelIndex?, studentId?, roomId?, day? } }
 * @returns {Object} Diff result
 */
export async function replan(disruptions) {
  const startTime = Date.now();

  const allSlots = await prisma.scheduleSlot.findMany({ where: { status: { not: 'cancelled' } } });
  const companies = await prisma.company.findMany();
  const rooms = await prisma.room.findMany();

  const companyMap = new Map(companies.map(c => [c.id, c]));
  const occ = buildOccupancy(allSlots);
  const diff = [];
  const affectedSlotIds = new Set();

  // Process each disruption
  for (const disruption of disruptions) {
    const { type, params } = disruption;

    if (type === 'COMPANY_LATE') {
      await handleCompanyLate(params, allSlots, companyMap, rooms, occ, diff, affectedSlotIds);
    } else if (type === 'PANEL_DROPPED') {
      await handlePanelDropped(params, allSlots, companyMap, rooms, occ, diff, affectedSlotIds);
    } else if (type === 'STUDENT_WITHDRAWN') {
      await handleStudentWithdrawn(params, allSlots, companyMap, rooms, occ, diff, affectedSlotIds);
    } else if (type === 'ROOM_UNAVAILABLE') {
      await handleRoomUnavailable(params, allSlots, companyMap, rooms, occ, diff, affectedSlotIds);
    } else if (type === 'NEW_COMPANY') {
      await handleNewCompany(params, allSlots, companyMap, rooms, occ, diff, affectedSlotIds);
    }
  }

  // Apply changes to database
  for (const entry of diff) {
    if (entry.changeType === 'cancelled') {
      await prisma.scheduleSlot.update({
        where: { id: entry.slotId },
        data: { status: 'cancelled' }
      });
    } else if (entry.changeType === 'moved') {
      await prisma.scheduleSlot.update({
        where: { id: entry.slotId },
        data: {
          roomId: entry.newSlot.roomId,
          panelIndex: entry.newSlot.panelIndex,
          startTimeMin: entry.newSlot.startTimeMin,
          endTimeMin: entry.newSlot.endTimeMin,
          status: 'moved'
        }
      });
    }
  }

  // Log disruption
  const elapsed = Date.now() - startTime;
  await prisma.disruptionLog.create({
    data: {
      type: disruptions.map(d => d.type).join('+'),
      payload: JSON.stringify(disruptions),
      churnCount: diff.length,
      diffJson: JSON.stringify(diff)
    }
  });

  // Rollup: affected companies and students
  const affectedCompanies = [...new Set(diff.map(d => d.companyId))];
  const affectedStudents = [...new Set(diff.map(d => d.studentId))];

  // Churn metrics
  const totalScheduled = allSlots.length;
  const churnPercent = totalScheduled > 0 ? Math.round((diff.length / totalScheduled) * 1000) / 10 : 0;

  return {
    executionMs: elapsed,
    totalChanges: diff.length,
    moved: diff.filter(d => d.changeType === 'moved').length,
    cancelled: diff.filter(d => d.changeType === 'cancelled').length,
    churnPercent,
    affectedCompanies,
    affectedStudents,
    diff
  };
}

// ─── Disruption Handlers ────────────────────────────────────────────────────

async function handleCompanyLate(params, allSlots, companyMap, rooms, occ, diff, affected) {
  const { companyId, hoursLate } = params;
  const company = companyMap.get(companyId);
  if (!company) return;

  const delayMin = hoursLate * 60;

  // Find affected slots: ALL of this company's scheduled interviews
  // Because if a company arrives late, they push their entire queue back.
  const companySlots = allSlots.filter(
    s => s.companyId === companyId && s.status !== 'cancelled'
  );

  for (const slot of companySlots) {
    if (affected.has(slot.id)) continue;
    affected.add(slot.id);

    // Remove from occupancy
    removeFromOcc(occ.studentOcc, slot.studentId, slot.day, slot.startTimeMin, slot.endTimeMin);
    removeFromOcc(occ.roomOcc, slot.roomId, slot.day, slot.startTimeMin, slot.endTimeMin);
    removeFromOcc(occ.panelOcc, `${slot.companyId}:${slot.panelIndex}`, slot.day, slot.startTimeMin, slot.endTimeMin);

    // Try to replace after their originally scheduled time + delay
    // We enforce that the new slot must be at or after the delayed time
    const newTargetMin = slot.startTimeMin + delayMin;
    let newSlot = null;
    
    // Custom tryPlace logic to enforce the minimum start time
    for (let startMin = newTargetMin; startMin + company.interviewDurationMin <= DAY_END; startMin += 5) {
      const endMin = startMin + company.interviewDurationMin;
      if (overlaps(occ.studentOcc, slot.studentId, slot.day, startMin, endMin)) continue;

      let found = false;
      for (const room of rooms) {
        if (!JSON.parse(room.availableDays).includes(slot.day)) continue;
        if (overlaps(occ.roomOcc, room.id, slot.day, startMin, endMin)) continue;

        for (let panel = 0; panel < company.panelCount; panel++) {
          const pk = `${companyId}:${panel}`;
          if (overlaps(occ.panelOcc, pk, slot.day, startMin, endMin)) continue;

          newSlot = { roomId: room.id, panelIndex: panel, startTimeMin: startMin, endTimeMin: endMin };
          found = true; break;
        }
        if (found) break;
      }
      if (found) break;
    }

    if (newSlot) {
      addToOcc(occ.studentOcc, slot.studentId, slot.day, newSlot.startTimeMin, newSlot.endTimeMin);
      addToOcc(occ.roomOcc, newSlot.roomId, slot.day, newSlot.startTimeMin, newSlot.endTimeMin);
      addToOcc(occ.panelOcc, `${slot.companyId}:${newSlot.panelIndex}`, slot.day, newSlot.startTimeMin, newSlot.endTimeMin);

      diff.push({
        slotId: slot.id, studentId: slot.studentId, companyId: slot.companyId,
        changeType: 'moved',
        oldSlot: { roomId: slot.roomId, panelIndex: slot.panelIndex, startTimeMin: slot.startTimeMin, endTimeMin: slot.endTimeMin },
        newSlot,
        reason: `${company.name} arrived ${hoursLate}h late — shifted from ${formatTime(slot.startTimeMin)} to ${formatTime(newSlot.startTimeMin)}`
      });
    } else {
      diff.push({
        slotId: slot.id, studentId: slot.studentId, companyId: slot.companyId,
        changeType: 'cancelled',
        oldSlot: { roomId: slot.roomId, panelIndex: slot.panelIndex, startTimeMin: slot.startTimeMin, endTimeMin: slot.endTimeMin },
        newSlot: null,
        reason: `${company.name} arrived ${hoursLate}h late — no feasible slot after ${formatTime(newTargetMin)}`
      });
    }
  }
}

async function handlePanelDropped(params, allSlots, companyMap, rooms, occ, diff, affected) {
  const { companyId, panelIndex } = params;
  const company = companyMap.get(companyId);
  if (!company) return;

  const panelSlots = allSlots.filter(
    s => s.companyId === companyId && s.panelIndex === panelIndex && s.status !== 'cancelled'
  );

  // Reduce available panels for re-placement
  const remainingPanels = company.panelCount - 1;

  for (const slot of panelSlots) {
    if (affected.has(slot.id)) continue;
    affected.add(slot.id);

    removeFromOcc(occ.studentOcc, slot.studentId, slot.day, slot.startTimeMin, slot.endTimeMin);
    removeFromOcc(occ.roomOcc, slot.roomId, slot.day, slot.startTimeMin, slot.endTimeMin);
    removeFromOcc(occ.panelOcc, `${slot.companyId}:${slot.panelIndex}`, slot.day, slot.startTimeMin, slot.endTimeMin);

    // Try other panels (not the dropped one)
    const newSlot = remainingPanels > 0
      ? tryPlace(slot.studentId, slot.companyId, company.interviewDurationMin, slot.day, company.panelCount, rooms, occ)
      : null;

    // Filter: don't place on the dropped panel
    if (newSlot && newSlot.panelIndex === panelIndex) {
      // This shouldn't happen since we removed it, but guard
      diff.push({
        slotId: slot.id, studentId: slot.studentId, companyId: slot.companyId,
        changeType: 'cancelled', oldSlot: { roomId: slot.roomId, panelIndex: slot.panelIndex, startTimeMin: slot.startTimeMin, endTimeMin: slot.endTimeMin },
        newSlot: null,
        reason: `Panel ${panelIndex} of ${company.name} dropped — no other panel available`
      });
    } else if (newSlot) {
      addToOcc(occ.studentOcc, slot.studentId, slot.day, newSlot.startTimeMin, newSlot.endTimeMin);
      addToOcc(occ.roomOcc, newSlot.roomId, slot.day, newSlot.startTimeMin, newSlot.endTimeMin);
      addToOcc(occ.panelOcc, `${slot.companyId}:${newSlot.panelIndex}`, slot.day, newSlot.startTimeMin, newSlot.endTimeMin);

      diff.push({
        slotId: slot.id, studentId: slot.studentId, companyId: slot.companyId,
        changeType: 'moved',
        oldSlot: { roomId: slot.roomId, panelIndex: slot.panelIndex, startTimeMin: slot.startTimeMin, endTimeMin: slot.endTimeMin },
        newSlot,
        reason: `Panel ${panelIndex} of ${company.name} dropped — reassigned to panel ${newSlot.panelIndex}`
      });
    } else {
      diff.push({
        slotId: slot.id, studentId: slot.studentId, companyId: slot.companyId,
        changeType: 'cancelled', oldSlot: { roomId: slot.roomId, panelIndex: slot.panelIndex, startTimeMin: slot.startTimeMin, endTimeMin: slot.endTimeMin },
        newSlot: null,
        reason: `Panel ${panelIndex} of ${company.name} dropped — no feasible reassignment`
      });
    }
  }
}

async function handleStudentWithdrawn(params, allSlots, companyMap, rooms, occ, diff, affected) {
  const { studentId } = params;

  // Mark student as placed
  await prisma.student.updateMany({ where: { id: studentId }, data: { alreadyPlaced: true } });

  const studentSlots = allSlots.filter(s => s.studentId === studentId && s.status !== 'cancelled');

  for (const slot of studentSlots) {
    if (affected.has(slot.id)) continue;
    affected.add(slot.id);

    removeFromOcc(occ.studentOcc, slot.studentId, slot.day, slot.startTimeMin, slot.endTimeMin);
    removeFromOcc(occ.roomOcc, slot.roomId, slot.day, slot.startTimeMin, slot.endTimeMin);
    removeFromOcc(occ.panelOcc, `${slot.companyId}:${slot.panelIndex}`, slot.day, slot.startTimeMin, slot.endTimeMin);

    diff.push({
      slotId: slot.id, studentId: slot.studentId, companyId: slot.companyId,
      changeType: 'cancelled',
      oldSlot: { roomId: slot.roomId, panelIndex: slot.panelIndex, startTimeMin: slot.startTimeMin, endTimeMin: slot.endTimeMin },
      newSlot: null,
      reason: `Student withdrew (placed elsewhere) — slot freed`
    });
  }

  // Try to backfill from unscheduled pool using freed slots
  const unscheduled = await prisma.unscheduledInterview.findMany({
    where: { code: { not: 'CGPA_BELOW_CUTOFF' } }
  });

  for (const unsched of unscheduled) {
    const company = companyMap.get(unsched.companyId);
    if (!company) continue;

    const newSlot = tryPlace(unsched.studentId, unsched.companyId, company.interviewDurationMin, company.assignedDay, company.panelCount, rooms, occ);

    if (newSlot) {
      addToOcc(occ.studentOcc, unsched.studentId, company.assignedDay, newSlot.startTimeMin, newSlot.endTimeMin);
      addToOcc(occ.roomOcc, newSlot.roomId, company.assignedDay, newSlot.startTimeMin, newSlot.endTimeMin);
      addToOcc(occ.panelOcc, `${unsched.companyId}:${newSlot.panelIndex}`, company.assignedDay, newSlot.startTimeMin, newSlot.endTimeMin);

      await prisma.scheduleSlot.create({
        data: {
          companyId: unsched.companyId, studentId: unsched.studentId,
          roomId: newSlot.roomId, panelIndex: newSlot.panelIndex,
          day: company.assignedDay, startTimeMin: newSlot.startTimeMin, endTimeMin: newSlot.endTimeMin,
          status: 'scheduled'
        }
      });
      await prisma.unscheduledInterview.delete({ where: { id: unsched.id } });

      diff.push({
        slotId: null, studentId: unsched.studentId, companyId: unsched.companyId,
        changeType: 'newly_scheduled',
        oldSlot: null, newSlot,
        reason: `Backfilled from waitlist after student withdrawal freed slots`
      });
      break; // Limit backfill to avoid excessive churn
    }
  }
}

async function handleRoomUnavailable(params, allSlots, companyMap, rooms, occ, diff, affected) {
  const { roomId, day } = params;

  const roomSlots = allSlots.filter(s => s.roomId === roomId && s.day === day && s.status !== 'cancelled');
  const otherRooms = rooms.filter(r => r.id !== roomId);

  for (const slot of roomSlots) {
    if (affected.has(slot.id)) continue;
    affected.add(slot.id);

    const company = companyMap.get(slot.companyId);
    removeFromOcc(occ.studentOcc, slot.studentId, slot.day, slot.startTimeMin, slot.endTimeMin);
    removeFromOcc(occ.roomOcc, slot.roomId, slot.day, slot.startTimeMin, slot.endTimeMin);
    removeFromOcc(occ.panelOcc, `${slot.companyId}:${slot.panelIndex}`, slot.day, slot.startTimeMin, slot.endTimeMin);

    const newSlot = tryPlace(slot.studentId, slot.companyId, company.interviewDurationMin, slot.day, company.panelCount, otherRooms, occ);

    if (newSlot) {
      addToOcc(occ.studentOcc, slot.studentId, slot.day, newSlot.startTimeMin, newSlot.endTimeMin);
      addToOcc(occ.roomOcc, newSlot.roomId, slot.day, newSlot.startTimeMin, newSlot.endTimeMin);
      addToOcc(occ.panelOcc, `${slot.companyId}:${newSlot.panelIndex}`, slot.day, newSlot.startTimeMin, newSlot.endTimeMin);

      diff.push({
        slotId: slot.id, studentId: slot.studentId, companyId: slot.companyId,
        changeType: 'moved',
        oldSlot: { roomId: slot.roomId, panelIndex: slot.panelIndex, startTimeMin: slot.startTimeMin, endTimeMin: slot.endTimeMin },
        newSlot,
        reason: `Room unavailable on Day ${day} — moved to Room ${newSlot.roomId}`
      });
    } else {
      diff.push({
        slotId: slot.id, studentId: slot.studentId, companyId: slot.companyId,
        changeType: 'cancelled',
        oldSlot: { roomId: slot.roomId, panelIndex: slot.panelIndex, startTimeMin: slot.startTimeMin, endTimeMin: slot.endTimeMin },
        newSlot: null,
        reason: `Room unavailable on Day ${day} — no alternative room found`
      });
    }
  }
}

async function handleNewCompany(params, allSlots, companyMap, rooms, occ, diff, affected) {
  const { name, priorityTier, assignedDay, slotsNeeded, panelCount, cgpaCutoff, interviewDurationMin } = params;

  // 1. Create company
  const company = await prisma.company.create({
    data: { name, priorityTier, assignedDay, slotsNeeded, panelCount, cgpaCutoff, interviewDurationMin }
  });
  companyMap.set(company.id, company);

  // 2. Select students who meet cutoff and are not alreadyPlaced
  const eligibleStudents = await prisma.student.findMany({
    where: { cgpa: { gte: cgpaCutoff }, alreadyPlaced: false }
  });
  
  // Shuffle eligible students
  for (let i = eligibleStudents.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligibleStudents[i], eligibleStudents[j]] = [eligibleStudents[j], eligibleStudents[i]];
  }
  
  const selectedStudents = eligibleStudents.slice(0, slotsNeeded);

  // 3. Attempt to schedule them
  for (const student of selectedStudents) {
    // create shortlist
    await prisma.shortlist.create({ data: { studentId: student.id, companyId: company.id } });

    const newSlot = tryPlace(student.id, company.id, company.interviewDurationMin, company.assignedDay, company.panelCount, rooms, occ);

    if (newSlot) {
      addToOcc(occ.studentOcc, student.id, company.assignedDay, newSlot.startTimeMin, newSlot.endTimeMin);
      addToOcc(occ.roomOcc, newSlot.roomId, company.assignedDay, newSlot.startTimeMin, newSlot.endTimeMin);
      addToOcc(occ.panelOcc, `${company.id}:${newSlot.panelIndex}`, company.assignedDay, newSlot.startTimeMin, newSlot.endTimeMin);

      await prisma.scheduleSlot.create({
        data: {
          companyId: company.id, studentId: student.id,
          roomId: newSlot.roomId, panelIndex: newSlot.panelIndex,
          day: company.assignedDay, startTimeMin: newSlot.startTimeMin, endTimeMin: newSlot.endTimeMin,
          status: 'scheduled'
        }
      });

      diff.push({
        slotId: null, studentId: student.id, companyId: company.id,
        changeType: 'newly_scheduled',
        oldSlot: null, newSlot,
        reason: `Newly added company ${company.name} successfully scheduled`
      });
    } else {
      await prisma.unscheduledInterview.create({
        data: {
          studentId: student.id, companyId: company.id,
          reason: `No feasible slot for newly added company ${company.name}`,
          code: 'NO_FEASIBLE_SLOT'
        }
      });
    }
  }
}
