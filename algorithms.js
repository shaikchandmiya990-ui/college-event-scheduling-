/**
 * algorithms.js
 * Core Scheduling Algorithms for College Events & Resources:
 * 1. Constraint Satisfaction Problem (CSP) with Backtracking, Forward Checking, and MRV/Degree heuristics.
 * 2. Graph Coloring (Welsh-Powell & DSATUR) for Time-Slot / Resource Partitioning.
 * 3. Greedy Multi-Resource Interval Scheduler.
 * 4. Step-by-Step Generator for Visual Step Execution and Tracing.
 */

(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.SchedulerAlgorithms = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  // Standard Time Slots (9:00 AM to 5:00 PM)
  const TIME_SLOTS = [
    { id: 's1', label: '09:00 - 10:00', start: 9, end: 10 },
    { id: 's2', label: '10:00 - 11:00', start: 10, end: 11 },
    { id: 's3', label: '11:00 - 12:00', start: 11, end: 12 },
    { id: 's4', label: '12:00 - 13:00', start: 12, end: 13 },
    { id: 's5', label: '13:00 - 14:00', start: 13, end: 14 },
    { id: 's6', label: '14:00 - 15:00', start: 14, end: 15 },
    { id: 's7', label: '15:00 - 16:00', start: 15, end: 16 },
    { id: 's8', label: '16:00 - 17:00', start: 16, end: 17 }
  ];

  /**
   * Helper: Check if two time intervals [s1, e1) and [s2, e2) overlap.
   */
  function intervalsOverlap(s1, e1, s2, e2) {
    return Math.max(s1, s2) < Math.min(e1, e2);
  }

  /**
   * Helper: Check if a proposed event assignment is valid against current assignments.
   */
  function isAssignmentValid(candidate, existingAssignments, resources) {
    const { event, slot, room, faculty, equipmentList } = candidate;

    // 1. Room Suitability & Capacity
    if (event.requiredRoomType && room.type !== event.requiredRoomType) {
      return { valid: false, reason: `Room ${room.name} (${room.type}) doesn't match required type (${event.requiredRoomType})` };
    }
    if (room.capacity < event.attendees) {
      return { valid: false, reason: `Room ${room.name} capacity (${room.capacity}) < attendees (${event.attendees})` };
    }

    // 2. Conflict checks against currently placed events
    const eStart = slot.start;
    const eEnd = slot.start + event.duration;

    // Calculate simultaneous equipment usage during this event's window
    const equipmentUsage = {};
    if (resources && resources.equipment) {
      resources.equipment.forEach(eq => { equipmentUsage[eq.id] = 0; });
    }
    // Add candidate's equipment
    (equipmentList || []).forEach(eqId => {
      equipmentUsage[eqId] = (equipmentUsage[eqId] || 0) + 1;
    });

    for (const assigned of existingAssignments) {
      const aStart = assigned.slot.start;
      const aEnd = assigned.slot.start + assigned.event.duration;

      if (intervalsOverlap(eStart, eEnd, aStart, aEnd)) {
        // Room double-booking
        if (assigned.room.id === room.id) {
          return {
            valid: false,
            reason: `Room conflict: "${assigned.event.name}" already booked in ${room.name} at ${assigned.slot.label}`
          };
        }

        // Faculty double-booking
        if (faculty && assigned.faculty && assigned.faculty.id === faculty.id) {
          return {
            valid: false,
            reason: `Faculty conflict: ${faculty.name} is already conducting "${assigned.event.name}" at this time`
          };
        }

        // Equipment capacity accumulation
        if (assigned.equipmentList) {
          assigned.equipmentList.forEach(eqId => {
            equipmentUsage[eqId] = (equipmentUsage[eqId] || 0) + 1;
          });
        }
      }
    }

    // Validate equipment count against inventory
    if (resources && resources.equipment) {
      for (const eq of resources.equipment) {
        if ((equipmentUsage[eq.id] || 0) > eq.totalQuantity) {
          return {
            valid: false,
            reason: `Equipment shortage: Required ${equipmentUsage[eq.id]}x ${eq.name}, but only ${eq.totalQuantity} available`
          };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Helper: Generate available candidate slots for an event based on its duration.
   */
  function getCandidateSlotsForDuration(duration, availableSlots) {
    const slots = availableSlots || TIME_SLOTS;
    const candidates = [];
    const minStart = 9;
    const maxEnd = 17;

    for (let start = minStart; start <= maxEnd - duration; start++) {
      const end = start + duration;
      const matchingSlot = slots.find(s => s.start === start);
      candidates.push({
        id: `slot_${start}_${end}`,
        start: start,
        end: end,
        label: `${String(start).padStart(2, '0')}:00 - ${String(end).padStart(2, '0')}:00`
      });
    }
    return candidates;
  }

  /**
   * Build Conflict Graph for Graph Coloring Algorithms.
   * Nodes = Events
   * Edges = Constraints / Incompatibility (cannot occur concurrently)
   */
  function buildConflictGraph(events, resources) {
    const n = events.length;
    const adj = Array.from({ length: n }, () => new Set());
    const edges = [];

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const e1 = events[i];
        const e2 = events[j];
        let hasConflict = false;
        let reasons = [];

        // 1. Same Faculty
        if (e1.facultyId && e2.facultyId && e1.facultyId === e2.facultyId) {
          hasConflict = true;
          reasons.push(`Shared Faculty: ${e1.facultyName || e1.facultyId}`);
        }

        // 2. Room Competition: If there are fewer compatible rooms than simultaneous demand
        if (e1.requiredRoomType && e2.requiredRoomType && e1.requiredRoomType === e2.requiredRoomType) {
          const compatibleRooms = resources.rooms.filter(r =>
            r.type === e1.requiredRoomType &&
            r.capacity >= Math.min(e1.attendees, e2.attendees)
          );
          if (compatibleRooms.length <= 1) {
            hasConflict = true;
            reasons.push(`Limited ${e1.requiredRoomType} capacity (only ${compatibleRooms.length} room)`);
          }
        }

        // 3. Equipment Contention: If combined equipment requirement exceeds total available
        const eqNeeded = {};
        (e1.requiredEquipment || []).forEach(eqId => { eqNeeded[eqId] = (eqNeeded[eqId] || 0) + 1; });
        (e2.requiredEquipment || []).forEach(eqId => { eqNeeded[eqId] = (eqNeeded[eqId] || 0) + 1; });

        for (const eqId in eqNeeded) {
          const eqObj = resources.equipment.find(e => e.id === eqId);
          if (eqObj && eqNeeded[eqId] > eqObj.totalQuantity) {
            hasConflict = true;
            reasons.push(`Contention for ${eqObj.name} (needs ${eqNeeded[eqId]}, total ${eqObj.totalQuantity})`);
          }
        }

        // 4. Fixed preferred time overlap
        if (e1.fixedStart !== undefined && e2.fixedStart !== undefined) {
          if (intervalsOverlap(e1.fixedStart, e1.fixedStart + e1.duration, e2.fixedStart, e2.fixedStart + e2.duration)) {
            // If they overlap in time AND share either room type or faculty
            if (e1.requiredRoomType === e2.requiredRoomType || e1.facultyId === e2.facultyId) {
              hasConflict = true;
              reasons.push('Fixed time overlap with shared resource demand');
            }
          }
        }

        if (hasConflict) {
          adj[i].add(j);
          adj[j].add(i);
          edges.push({ u: i, v: j, eventA: e1.name, eventB: e2.name, reasons });
        }
      }
    }

    return {
      nodes: events.map((e, idx) => ({ id: idx, event: e, degree: adj[idx].size })),
      adjacency: adj,
      edges: edges
    };
  }

  // =========================================================================
  // 1. CSP BACKTRACKING SOLVER (With MRV & Degree Heuristics + Forward Checking)
  // =========================================================================
  function solveCSP(events, resources, options = {}) {
    const startTime = performance.now();
    const stats = {
      backtracks: 0,
      nodesExplored: 0,
      assignmentsTested: 0,
      steps: []
    };

    const recordStep = (type, detail) => {
      if (options.recordSteps && stats.steps.length < 500) {
        stats.steps.push({ stepNumber: stats.steps.length + 1, type, detail, timestamp: performance.now() - startTime });
      }
    };

    // Prepare Variable Domains
    // Each event can take a domain of combinations: { slot, room, faculty, equipmentList }
    const domains = new Map();

    events.forEach(event => {
      const candidateSlots = event.fixedStart !== undefined
        ? [{
            id: `slot_${event.fixedStart}_${event.fixedStart + event.duration}`,
            start: event.fixedStart,
            end: event.fixedStart + event.duration,
            label: `${String(event.fixedStart).padStart(2, '0')}:00 - ${String(event.fixedStart + event.duration).padStart(2, '0')}:00`
          }]
        : getCandidateSlotsForDuration(event.duration, resources.timeSlots);

      // Compatible rooms
      const candidateRooms = resources.rooms.filter(room => {
        const typeMatch = !event.requiredRoomType || room.type === event.requiredRoomType;
        const capacityMatch = room.capacity >= (event.attendees || 0);
        return typeMatch && capacityMatch;
      });

      // Faculty object
      const assignedFaculty = resources.faculty.find(f => f.id === event.facultyId) ||
        (event.facultyId ? { id: event.facultyId, name: event.facultyName || event.facultyId } : null);

      // Candidate assignments
      const eventDomain = [];
      candidateSlots.forEach(slot => {
        candidateRooms.forEach(room => {
          eventDomain.push({
            event,
            slot,
            room,
            faculty: assignedFaculty,
            equipmentList: event.requiredEquipment || []
          });
        });
      });

      domains.set(event.id, eventDomain);
    });

    // MRV (Minimum Remaining Values) + Degree Heuristic to pick next unassigned variable
    function selectUnassignedVariable(unassigned, currentAssignments) {
      if (options.heuristic === 'none') {
        return unassigned[0];
      }

      // Compute remaining valid domain count for each variable
      let bestVar = null;
      let minDomainSize = Infinity;
      let maxDegree = -1;

      for (const ev of unassigned) {
        const domain = domains.get(ev.id);
        let validOptionsCount = 0;
        for (const candidate of domain) {
          if (isAssignmentValid(candidate, currentAssignments, resources).valid) {
            validOptionsCount++;
          }
        }

        // Degree calculation: how many unassigned events conflict with this event
        const degree = unassigned.filter(other =>
          other.id !== ev.id &&
          (other.facultyId === ev.facultyId || other.requiredRoomType === ev.requiredRoomType)
        ).length;

        if (validOptionsCount < minDomainSize) {
          minDomainSize = validOptionsCount;
          maxDegree = degree;
          bestVar = ev;
        } else if (validOptionsCount === minDomainSize && degree > maxDegree) {
          maxDegree = degree;
          bestVar = ev;
        }
      }

      return bestVar || unassigned[0];
    }

    // Backtracking search function
    const assignments = [];
    const unassignedList = [...events];

    function backtrack() {
      stats.nodesExplored++;

      if (unassignedList.length === 0) {
        return true; // All events successfully assigned
      }

      const currentEvent = selectUnassignedVariable(unassignedList, assignments);
      const varIndex = unassignedList.findIndex(e => e.id === currentEvent.id);
      unassignedList.splice(varIndex, 1);

      recordStep('SELECT_VARIABLE', {
        event: currentEvent.name,
        remainingVars: unassignedList.length,
        domainSize: domains.get(currentEvent.id).length
      });

      const domain = domains.get(currentEvent.id);

      for (const candidate of domain) {
        stats.assignmentsTested++;
        const check = isAssignmentValid(candidate, assignments, resources);

        if (check.valid) {
          assignments.push(candidate);
          recordStep('ASSIGN', {
            event: currentEvent.name,
            slot: candidate.slot.label,
            room: candidate.room.name,
            faculty: candidate.faculty ? candidate.faculty.name : 'N/A'
          });

          // Forward Checking: check if any remaining variable has empty domain
          let forwardCheckPassed = true;
          if (options.forwardChecking !== false) {
            for (const remaining of unassignedList) {
              const remDomain = domains.get(remaining.id);
              const hasAtLeastOneValid = remDomain.some(cand =>
                isAssignmentValid(cand, assignments, resources).valid
              );
              if (!hasAtLeastOneValid) {
                forwardCheckPassed = false;
                recordStep('FORWARD_CHECK_FAIL', {
                  bottleneckEvent: remaining.name,
                  causedBy: currentEvent.name
                });
                break;
              }
            }
          }

          if (forwardCheckPassed) {
            if (backtrack()) {
              return true;
            }
          }

          // Backtrack step
          assignments.pop();
          stats.backtracks++;
          recordStep('BACKTRACK', {
            event: currentEvent.name,
            testedSlot: candidate.slot.label,
            testedRoom: candidate.room.name,
            reason: forwardCheckPassed ? 'Sub-tree exhausted without solution' : 'Forward check domain wiped out'
          });
        } else {
          recordStep('REJECT', {
            event: currentEvent.name,
            slot: candidate.slot.label,
            room: candidate.room.name,
            reason: check.reason
          });
        }
      }

      // Restore unassigned list if all domain values fail
      unassignedList.splice(varIndex, 0, currentEvent);
      return false;
    }

    const success = backtrack();
    const durationMs = performance.now() - startTime;

    return {
      success,
      algorithm: 'CSP Backtracking (MRV + Forward Checking)',
      timetable: assignments,
      unassigned: unassignedList,
      stats: {
        ...stats,
        executionTimeMs: durationMs,
        assignedCount: assignments.length,
        totalCount: events.length
      }
    };
  }

  // =========================================================================
  // 2. GRAPH COLORING SOLVERS (Welsh-Powell & DSATUR)
  // =========================================================================
  function solveGraphColoring(events, resources, algorithmName = 'welsh-powell') {
    const startTime = performance.now();
    const graph = buildConflictGraph(events, resources);
    const n = events.length;
    const colorAssignment = new Array(n).fill(-1);
    const steps = [];

    const slots = resources.timeSlots || TIME_SLOTS;

    if (algorithmName === 'dsatur') {
      // DSATUR: Dynamic Saturation Degree Algorithm
      const saturation = new Array(n).fill(0);
      const neighborColors = Array.from({ length: n }, () => new Set());
      const coloredCount = () => colorAssignment.filter(c => c !== -1).length;

      while (coloredCount() < n) {
        // Pick uncolored vertex with highest saturation; tie break with highest degree
        let chosen = -1;
        let maxSat = -1;
        let maxDeg = -1;

        for (let i = 0; i < n; i++) {
          if (colorAssignment[i] === -1) {
            const sat = neighborColors[i].size;
            const deg = graph.adjacency[i].size;
            if (sat > maxSat || (sat === maxSat && deg > maxDeg)) {
              maxSat = sat;
              maxDeg = deg;
              chosen = i;
            }
          }
        }

        if (chosen === -1) break;

        // Find lowest available color (time slot) not used by any neighbor
        const usedColorsByNeighbors = new Set();
        graph.adjacency[chosen].forEach(neighbor => {
          if (colorAssignment[neighbor] !== -1) {
            usedColorsByNeighbors.add(colorAssignment[neighbor]);
          }
        });

        let assignedColor = 0;
        while (usedColorsByNeighbors.has(assignedColor)) {
          assignedColor++;
        }

        colorAssignment[chosen] = assignedColor;
        steps.push({
          vertex: events[chosen].name,
          color: assignedColor,
          slotLabel: slots[assignedColor % slots.length].label,
          saturation: maxSat,
          degree: maxDeg
        });

        // Update neighbor color sets
        graph.adjacency[chosen].forEach(neighbor => {
          neighborColors[neighbor].add(assignedColor);
        });
      }
    } else {
      // Welsh-Powell Algorithm
      // 1. Order vertices by descending degree
      const order = events.map((e, idx) => ({ idx, degree: graph.adjacency[idx].size }))
        .sort((a, b) => b.degree - a.degree);

      let currentColor = 0;

      for (let i = 0; i < order.length; i++) {
        const u = order[i].idx;
        if (colorAssignment[u] !== -1) continue;

        colorAssignment[u] = currentColor;
        steps.push({
          vertex: events[u].name,
          color: currentColor,
          slotLabel: slots[currentColor % slots.length].label,
          degree: order[i].degree
        });

        // Color all other non-adjacent uncolored vertices with same color
        for (let j = i + 1; j < order.length; j++) {
          const v = order[j].idx;
          if (colorAssignment[v] === -1) {
            // Check if v is adjacent to any vertex currently assigned currentColor
            let canColor = true;
            for (let k = 0; k < n; k++) {
              if (colorAssignment[k] === currentColor && graph.adjacency[v].has(k)) {
                canColor = false;
                break;
              }
            }
            if (canColor) {
              colorAssignment[v] = currentColor;
              steps.push({
                vertex: events[v].name,
                color: currentColor,
                slotLabel: slots[currentColor % slots.length].label,
                degree: order[j].degree
              });
            }
          }
        }
        currentColor++;
      }
    }

    // Map assigned colors to time slots and resolve room & equipment assignments
    const timetable = [];
    const unassigned = [];

    events.forEach((event, idx) => {
      const color = colorAssignment[idx];
      const slotIndex = color % slots.length;
      const slot = slots[slotIndex];

      // Find best available room for this slot
      const candidateRooms = resources.rooms.filter(r =>
        (!event.requiredRoomType || r.type === event.requiredRoomType) &&
        r.capacity >= (event.attendees || 0)
      );

      let assignedRoom = null;
      for (const room of candidateRooms) {
        const candidate = {
          event,
          slot: { ...slot, start: slot.start, end: slot.start + event.duration },
          room,
          faculty: resources.faculty.find(f => f.id === event.facultyId),
          equipmentList: event.requiredEquipment || []
        };

        if (isAssignmentValid(candidate, timetable, resources).valid) {
          assignedRoom = room;
          timetable.push(candidate);
          break;
        }
      }

      if (!assignedRoom) {
        unassigned.push(event);
      }
    });

    const executionTimeMs = performance.now() - startTime;
    const chromaticNumber = new Set(colorAssignment.filter(c => c >= 0)).size;

    return {
      success: unassigned.length === 0,
      algorithm: algorithmName === 'dsatur' ? 'Graph Coloring (DSATUR)' : 'Graph Coloring (Welsh-Powell)',
      chromaticNumber,
      conflictGraph: graph,
      timetable,
      unassigned,
      stats: {
        executionTimeMs,
        chromaticNumber,
        coloredVertices: timetable.length,
        totalEvents: events.length,
        steps
      }
    };
  }

  // =========================================================================
  // 3. GREEDY INTERVAL & RESOURCE SCHEDULER
  // =========================================================================
  function solveGreedy(events, resources, sortBy = 'most-constrained') {
    const startTime = performance.now();
    const sorted = [...events];

    // Sorting Heuristic
    if (sortBy === 'most-constrained') {
      // Events with highest attendees + most equipment + longest duration first
      sorted.sort((a, b) => {
        const scoreA = (a.requiredEquipment?.length || 0) * 2 + (a.duration || 1) * 3 + (a.attendees || 0) * 0.05;
        const scoreB = (b.requiredEquipment?.length || 0) * 2 + (b.duration || 1) * 3 + (b.attendees || 0) * 0.05;
        return scoreB - scoreA;
      });
    } else if (sortBy === 'earliest-deadline') {
      sorted.sort((a, b) => (a.fixedStart || 9) - (b.fixedStart || 9));
    } else if (sortBy === 'duration') {
      sorted.sort((a, b) => b.duration - a.duration);
    }

    const timetable = [];
    const unassigned = [];
    const steps = [];

    sorted.forEach(event => {
      const candidateSlots = event.fixedStart !== undefined
        ? [{
            id: `slot_${event.fixedStart}_${event.fixedStart + event.duration}`,
            start: event.fixedStart,
            end: event.fixedStart + event.duration,
            label: `${String(event.fixedStart).padStart(2, '0')}:00 - ${String(event.fixedStart + event.duration).padStart(2, '0')}:00`
          }]
        : getCandidateSlotsForDuration(event.duration, resources.timeSlots);

      const candidateRooms = resources.rooms.filter(room =>
        (!event.requiredRoomType || room.type === event.requiredRoomType) &&
        room.capacity >= (event.attendees || 0)
      );

      // Sort candidate rooms by capacity fit (best fit to avoid wasting large halls)
      candidateRooms.sort((a, b) => (a.capacity - event.attendees) - (b.capacity - event.attendees));

      const assignedFaculty = resources.faculty.find(f => f.id === event.facultyId);

      let placed = false;

      // Greedily find first valid slot and room
      for (const slot of candidateSlots) {
        for (const room of candidateRooms) {
          const candidate = {
            event,
            slot,
            room,
            faculty: assignedFaculty,
            equipmentList: event.requiredEquipment || []
          };

          const check = isAssignmentValid(candidate, timetable, resources);
          if (check.valid) {
            timetable.push(candidate);
            steps.push({
              action: 'SCHEDULED',
              event: event.name,
              slot: slot.label,
              room: room.name,
              reason: 'Greedy First-Fit'
            });
            placed = true;
            break;
          }
        }
        if (placed) break;
      }

      if (!placed) {
        unassigned.push(event);
        steps.push({
          action: 'FAILED',
          event: event.name,
          reason: 'No conflict-free slot/room found under greedy ordering'
        });
      }
    });

    const executionTimeMs = performance.now() - startTime;

    return {
      success: unassigned.length === 0,
      algorithm: `Greedy Multi-Resource (${sortBy})`,
      timetable,
      unassigned,
      stats: {
        executionTimeMs,
        assignedCount: timetable.length,
        totalCount: events.length,
        steps
      }
    };
  }

  // =========================================================================
  // 4. COMPARISON SUITE (Benchmark all algorithms)
  // =========================================================================
  function compareAlgorithms(events, resources) {
    const cspResult = solveCSP(events, resources, { heuristic: 'mrv', forwardChecking: true });
    const welshPowellResult = solveGraphColoring(events, resources, 'welsh-powell');
    const dsaturResult = solveGraphColoring(events, resources, 'dsatur');
    const greedyResult = solveGreedy(events, resources, 'most-constrained');

    return [
      {
        name: 'CSP Backtracking (MRV + Forward Checking)',
        type: 'Constraint Satisfaction',
        success: cspResult.success,
        scheduled: cspResult.timetable.length,
        unassigned: cspResult.unassigned.length,
        timeMs: cspResult.stats.executionTimeMs.toFixed(3),
        complexity: { time: 'O(d^n) worst, pruned to O(n d)', space: 'O(n)' },
        details: `${cspResult.stats.nodesExplored} nodes visited, ${cspResult.stats.backtracks} backtracks`,
        result: cspResult
      },
      {
        name: 'Graph Coloring (DSATUR)',
        type: 'Heuristic Graph Coloring',
        success: dsaturResult.success,
        scheduled: dsaturResult.timetable.length,
        unassigned: dsaturResult.unassigned.length,
        timeMs: dsaturResult.stats.executionTimeMs.toFixed(3),
        complexity: { time: 'O(V^2)', space: 'O(V + E)' },
        details: `Chromatic number: ${dsaturResult.chromaticNumber} time slots`,
        result: dsaturResult
      },
      {
        name: 'Graph Coloring (Welsh-Powell)',
        type: 'Greedy Degree Ordering',
        success: welshPowellResult.success,
        scheduled: welshPowellResult.timetable.length,
        unassigned: welshPowellResult.unassigned.length,
        timeMs: welshPowellResult.stats.executionTimeMs.toFixed(3),
        complexity: { time: 'O(V log V + E)', space: 'O(V + E)' },
        details: `Chromatic number: ${welshPowellResult.chromaticNumber} time slots`,
        result: welshPowellResult
      },
      {
        name: 'Greedy Interval Best-Fit',
        type: 'Greedy Heuristic',
        success: greedyResult.success,
        scheduled: greedyResult.timetable.length,
        unassigned: greedyResult.unassigned.length,
        timeMs: greedyResult.stats.executionTimeMs.toFixed(3),
        complexity: { time: 'O(n log n + n * S * R)', space: 'O(n)' },
        details: `Linear single-pass greedy scan`,
        result: greedyResult
      }
    ];
  }

  // Pre-configured Datasets for Testing & Demonstration
  const SAMPLE_DATASETS = {
    // 1. The exact example from user prompt
    hackathonPrompt: {
      name: "Hackathon Prompt Example (Basic 4-Event Case)",
      description: "Direct example from the problem statement: Coding Workshop, Seminar, Quiz Competition, Robotics Workshop.",
      events: [
        {
          id: 'e1',
          name: 'Coding Workshop',
          duration: 2,
          fixedStart: 10, // 10-12
          requiredRoomType: 'Computer Lab',
          attendees: 30,
          requiredEquipment: ['comp_cluster'],
          facultyId: 'f1',
          facultyName: 'Dr. Sarah (CS Dept)'
        },
        {
          id: 'e2',
          name: 'Seminar',
          duration: 1,
          fixedStart: 10, // 10-11
          requiredRoomType: 'Seminar Hall',
          attendees: 80,
          requiredEquipment: ['projector_hd', 'mic_sound'],
          facultyId: 'f2',
          facultyName: 'Prof. Alan (Keynote)'
        },
        {
          id: 'e3',
          name: 'Quiz Competition',
          duration: 1,
          fixedStart: 11, // 11-12
          requiredRoomType: 'Classroom',
          attendees: 45,
          requiredEquipment: ['mic_sound'],
          facultyId: 'f3',
          facultyName: 'Dr. Elena (Quizmaster)'
        },
        {
          id: 'e4',
          name: 'Robotics Workshop',
          duration: 2,
          fixedStart: 12, // 12-2 (12:00 to 14:00)
          requiredRoomType: 'Robotics Lab',
          attendees: 25,
          requiredEquipment: ['robotics_kits', 'projector_hd'],
          facultyId: 'f4',
          facultyName: 'Dr. Vikram (Robotics)'
        }
      ],
      resources: {
        rooms: [
          { id: 'r1', name: 'Computer Lab Alpha', type: 'Computer Lab', capacity: 40 },
          { id: 'r2', name: 'Main Seminar Hall', type: 'Seminar Hall', capacity: 120 },
          { id: 'r3', name: 'Classroom 301', type: 'Classroom', capacity: 60 },
          { id: 'r4', name: 'Mechatronics Lab', type: 'Robotics Lab', capacity: 35 }
        ],
        equipment: [
          { id: 'projector_hd', name: '4K HD Projector', totalQuantity: 2 },
          { id: 'mic_sound', name: 'Wireless Mic & Sound System', totalQuantity: 3 },
          { id: 'comp_cluster', name: 'High-Spec Workstations', totalQuantity: 1 },
          { id: 'robotics_kits', name: 'Robotics Arduino/ARM Kits', totalQuantity: 1 }
        ],
        faculty: [
          { id: 'f1', name: 'Dr. Sarah (CS Dept)', dept: 'Computer Science' },
          { id: 'f2', name: 'Prof. Alan (Keynote)', dept: 'Information Systems' },
          { id: 'f3', name: 'Dr. Elena (Quizmaster)', dept: 'Mathematics' },
          { id: 'f4', name: 'Dr. Vikram (Robotics)', dept: 'Mechanical / Mechatronics' }
        ],
        timeSlots: TIME_SLOTS
      }
    },

    // 2. High-Contention College Tech Fest (10 Events, Bottlenecks)
    techFest: {
      name: "College Tech Fest 2026 (High Resource Contention)",
      description: "Complex event portfolio with shared faculty, competing projector demands, and multiple overlapping laboratory sessions.",
      events: [
        { id: 'tf1', name: 'AI & Deep Learning Masterclass', duration: 2, requiredRoomType: 'Computer Lab', attendees: 35, requiredEquipment: ['comp_cluster', 'projector_hd'], facultyId: 'f1', facultyName: 'Dr. Sarah' },
        { id: 'tf2', name: 'Keynote: Quantum Computing', duration: 1, requiredRoomType: 'Seminar Hall', attendees: 150, requiredEquipment: ['projector_hd', 'mic_sound'], facultyId: 'f2', facultyName: 'Prof. Alan' },
        { id: 'tf3', name: 'Autonomous Drone Showcase', duration: 2, requiredRoomType: 'Robotics Lab', attendees: 30, requiredEquipment: ['robotics_kits', 'projector_hd'], facultyId: 'f4', facultyName: 'Dr. Vikram' },
        { id: 'tf4', name: 'Hackathon Ideation Pitch', duration: 2, requiredRoomType: 'Seminar Hall', attendees: 100, requiredEquipment: ['mic_sound'], facultyId: 'f2', facultyName: 'Prof. Alan' },
        { id: 'tf5', name: 'Web3 & Cybersecurity CTF', duration: 3, requiredRoomType: 'Computer Lab', attendees: 38, requiredEquipment: ['comp_cluster'], facultyId: 'f1', facultyName: 'Dr. Sarah' },
        { id: 'tf6', name: 'Tech Trivia Championship', duration: 1, requiredRoomType: 'Classroom', attendees: 50, requiredEquipment: ['mic_sound'], facultyId: 'f3', facultyName: 'Dr. Elena' },
        { id: 'tf7', name: 'Embedded IoT Hands-on', duration: 2, requiredRoomType: 'Robotics Lab', attendees: 20, requiredEquipment: ['robotics_kits'], facultyId: 'f4', facultyName: 'Dr. Vikram' },
        { id: 'tf8', name: 'Competitive Coding Sprint', duration: 2, requiredRoomType: 'Computer Lab', attendees: 30, requiredEquipment: ['comp_cluster'], facultyId: 'f5', facultyName: 'Prof. Chen' },
        { id: 'tf9', name: 'Panel: Future of Tech Careers', duration: 1, requiredRoomType: 'Seminar Hall', attendees: 140, requiredEquipment: ['projector_hd', 'mic_sound'], facultyId: 'f3', facultyName: 'Dr. Elena' },
        { id: 'tf10', name: 'Paper Presentation Track', duration: 2, requiredRoomType: 'Classroom', attendees: 40, requiredEquipment: ['projector_hd'], facultyId: 'f5', facultyName: 'Prof. Chen' }
      ],
      resources: {
        rooms: [
          { id: 'r1', name: 'Computer Lab Alpha', type: 'Computer Lab', capacity: 40 },
          { id: 'r2', name: 'Computer Lab Beta', type: 'Computer Lab', capacity: 35 },
          { id: 'r3', name: 'Auditorium Grand Hall', type: 'Seminar Hall', capacity: 200 },
          { id: 'r4', name: 'Robotics Innovation Bay', type: 'Robotics Lab', capacity: 35 },
          { id: 'r5', name: 'Smart Classroom 101', type: 'Classroom', capacity: 60 },
          { id: 'r6', name: 'Lecture Hall 202', type: 'Classroom', capacity: 70 }
        ],
        equipment: [
          { id: 'projector_hd', name: '4K HD Projector', totalQuantity: 3 },
          { id: 'mic_sound', name: 'Wireless Mic & Sound System', totalQuantity: 2 },
          { id: 'comp_cluster', name: 'Workstation Setup', totalQuantity: 2 },
          { id: 'robotics_kits', name: 'Robotics Lab Equipment', totalQuantity: 1 }
        ],
        faculty: [
          { id: 'f1', name: 'Dr. Sarah (CS Dept)' },
          { id: 'f2', name: 'Prof. Alan (Keynote)' },
          { id: 'f3', name: 'Dr. Elena (Math/Data)' },
          { id: 'f4', name: 'Dr. Vikram (Robotics)' },
          { id: 'f5', name: 'Prof. Chen (Systems)' }
        ],
        timeSlots: TIME_SLOTS
      }
    },

    // 3. Over-Constrained Stress Test
    stressConflict: {
      name: "Stress Test (High Contention / Demonstrates Conflict Resolution)",
      description: "Multiple simultaneous requests targeting the single seminar hall and single projector, forcing CSP backtracking and highlighting bottleneck detection.",
      events: [
        { id: 'sc1', name: 'Dean Inauguration Address', duration: 2, fixedStart: 10, requiredRoomType: 'Seminar Hall', attendees: 100, requiredEquipment: ['projector_hd'], facultyId: 'f1' },
        { id: 'sc2', name: 'Guest Lecture from Google', duration: 2, fixedStart: 10, requiredRoomType: 'Seminar Hall', attendees: 95, requiredEquipment: ['projector_hd'], facultyId: 'f2' },
        { id: 'sc3', name: 'Industry Advisory Board Meet', duration: 2, fixedStart: 10, requiredRoomType: 'Seminar Hall', attendees: 80, requiredEquipment: ['projector_hd'], facultyId: 'f3' },
        { id: 'sc4', name: 'Faculty Senate Meeting', duration: 1, fixedStart: 11, requiredRoomType: 'Seminar Hall', attendees: 70, requiredEquipment: ['projector_hd'], facultyId: 'f1' }
      ],
      resources: {
        rooms: [
          { id: 'r1', name: 'Main Seminar Hall', type: 'Seminar Hall', capacity: 120 }
        ],
        equipment: [
          { id: 'projector_hd', name: '4K HD Projector', totalQuantity: 1 }
        ],
        faculty: [
          { id: 'f1', name: 'Dean Johnson' },
          { id: 'f2', name: 'Google Speaker' },
          { id: 'f3', name: 'Board Chair' }
        ],
        timeSlots: TIME_SLOTS
      }
    }
  };

  return {
    TIME_SLOTS,
    intervalsOverlap,
    isAssignmentValid,
    buildConflictGraph,
    solveCSP,
    solveGraphColoring,
    solveGreedy,
    compareAlgorithms,
    SAMPLE_DATASETS
  };
});
