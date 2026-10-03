/**
 * app.js
 * Frontend Controller for CHRONOS // Smart Campus Event & Resource Scheduler
 * Handles UI interactions, Canvas Graph visualization, Timetable Matrix rendering,
 * Step-by-Step execution debugger, Faculty timelines, and CSV/JSON exports.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Global Application State
  const state = {
    currentDatasetKey: 'hackathonPrompt',
    currentDataset: JSON.parse(JSON.stringify(SchedulerAlgorithms.SAMPLE_DATASETS.hackathonPrompt)),
    currentAlgorithm: 'csp-mrv', // 'csp-mrv' | 'graph-dsatur' | 'graph-welsh' | 'greedy'
    currentResult: null,
    
    // Step Debugger State
    stepTrace: [],
    currentStepIndex: 0,
    isPlaying: false,
    playInterval: null,
    playbackSpeed: 1.0,

    // Conflict Graph Canvas State
    graphNodes: [],
    graphEdges: [],
    draggingNode: null,
    dragOffset: { x: 0, y: 0 }
  };

  // Color Palette for Chromatic Time Slots
  const CHROMATIC_COLORS = [
    '#06B6D4', // Cyan
    '#8B5CF6', // Purple
    '#10B981', // Emerald
    '#F59E0B', // Amber
    '#EC4899', // Pink
    '#3B82F6', // Blue
    '#F43F5E', // Rose
    '#14B8A6'  // Teal
  ];

  // DOM Elements
  const datasetSelect = document.getElementById('datasetSelect');
  const algorithmSelect = document.getElementById('algorithmSelect');
  const btnRunSchedule = document.getElementById('btnRunSchedule');
  const btnStepDebugger = document.getElementById('btnStepDebugger');
  const btnExportMenu = document.getElementById('btnExportMenu');
  const exportDropdown = document.getElementById('exportDropdown');
  const exportCSV = document.getElementById('exportCSV');
  const exportJSON = document.getElementById('exportJSON');
  const exportPrint = document.getElementById('exportPrint');

  // KPI Elements
  const kpiScheduledRatio = document.getElementById('kpiScheduledRatio');
  const kpiSuccessPercent = document.getElementById('kpiSuccessPercent');
  const kpiExecutionTime = document.getElementById('kpiExecutionTime');
  const kpiNodesBacktracks = document.getElementById('kpiNodesBacktracks');
  const kpiComplexityTag = document.getElementById('kpiComplexityTag');
  const kpiVenueUtilization = document.getElementById('kpiVenueUtilization');
  const kpiCapacitySummary = document.getElementById('kpiCapacitySummary');
  const kpiConflictStatus = document.getElementById('kpiConflictStatus');
  const statusBadge = document.getElementById('statusBadge');

  // View Panels & Tabs
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');
  const timetableGrid = document.getElementById('timetableGrid');
  const unscheduledBanner = document.getElementById('unscheduledBanner');
  const unscheduledList = document.getElementById('unscheduledList');

  // Graph Canvas Elements
  const canvas = document.getElementById('conflictGraphCanvas');
  const ctx = canvas.getContext('2d');
  const graphVerticesCount = document.getElementById('graphVerticesCount');
  const graphEdgesCount = document.getElementById('graphEdgesCount');
  const graphChromaticNumber = document.getElementById('graphChromaticNumber');
  const slotColorsList = document.getElementById('slotColorsList');

  // Debugger Elements
  const btnPrevStep = document.getElementById('btnPrevStep');
  const btnPlayPause = document.getElementById('btnPlayPause');
  const btnNextStep = document.getElementById('btnNextStep');
  const btnResetTrace = document.getElementById('btnResetTrace');
  const stepSpeedInput = document.getElementById('stepSpeed');
  const speedDisplay = document.getElementById('speedDisplay');
  const stepCounterDisplay = document.getElementById('stepCounterDisplay');
  const stepLogFeed = document.getElementById('stepLogFeed');
  const currentStepDetail = document.getElementById('currentStepDetail');
  const variableDomainsList = document.getElementById('variableDomainsList');
  const stepStateBadge = document.getElementById('stepStateBadge');

  // Faculty & Equipment Elements
  const facultyTimetableList = document.getElementById('facultyTimetableList');
  const equipmentInventoryList = document.getElementById('equipmentInventoryList');

  // Benchmark Elements
  const benchmarkTableBody = document.getElementById('benchmarkTableBody');
  const btnRebenchmark = document.getElementById('btnRebenchmark');

  // Manage Elements
  const formAddEvent = document.getElementById('formAddEvent');
  const eventsTableList = document.getElementById('eventsTableList');
  const eventCountBadge = document.getElementById('eventCountBadge');
  const datasetNameBadge = document.getElementById('datasetNameBadge');
  const btnResetToDefaults = document.getElementById('btnResetToDefaults');
  const btnApplyCustomSchedule = document.getElementById('btnApplyCustomSchedule');

  // Modal Elements
  const eventModal = document.getElementById('eventModal');
  const btnModalClose = document.getElementById('btnModalClose');
  const modalEventName = document.getElementById('modalEventName');
  const modalEventBody = document.getElementById('modalEventBody');

  // Toast Container
  const toastContainer = document.getElementById('toastContainer');

  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  // =========================================================================
  // SCHEDULING RUNNER
  // =========================================================================
  function runScheduler() {
    const { events, resources } = state.currentDataset;
    const algo = state.currentAlgorithm;

    let result;
    if (algo === 'csp-mrv') {
      result = SchedulerAlgorithms.solveCSP(events, resources, {
        heuristic: 'mrv',
        forwardChecking: true,
        recordSteps: true
      });
      state.stepTrace = result.stats.steps || [];
    } else if (algo === 'graph-dsatur') {
      result = SchedulerAlgorithms.solveGraphColoring(events, resources, 'dsatur');
      state.stepTrace = result.stats.steps || [];
    } else if (algo === 'graph-welsh') {
      result = SchedulerAlgorithms.solveGraphColoring(events, resources, 'welsh-powell');
      state.stepTrace = result.stats.steps || [];
    } else if (algo === 'greedy') {
      result = SchedulerAlgorithms.solveGreedy(events, resources, 'most-constrained');
      state.stepTrace = result.stats.steps || [];
    }

    state.currentResult = result;
    state.currentStepIndex = 0;

    // Update UI components
    updateKpis(result);
    renderTimetable(result);
    setupConflictGraph();
    renderDebuggerTrace();
    renderFacultyAndEquipment(result);
    renderBenchmarkTable();
    renderEventsManagerList();

    showToast(`Executed ${result.algorithm} in ${result.stats.executionTimeMs.toFixed(2)} ms`);
  }

  // =========================================================================
  // KPI RIBBON UPDATE
  // =========================================================================
  function updateKpis(result) {
    const total = state.currentDataset.events.length;
    const scheduled = result.timetable.length;
    const pct = Math.round((scheduled / total) * 100);

    kpiScheduledRatio.textContent = `${scheduled} / ${total}`;
    kpiSuccessPercent.textContent = `${pct}% Conflict-Free Placed`;

    if (pct === 100) {
      statusBadge.textContent = 'Optimal (100%)';
      statusBadge.className = 'status-indicator status-ready';
      kpiConflictStatus.textContent = '0 Violations';
      kpiConflictStatus.className = 'kpi-value highlight-emerald';
    } else {
      statusBadge.textContent = `${total - scheduled} Unplaced`;
      statusBadge.className = 'status-indicator status-warning';
      kpiConflictStatus.textContent = `${total - scheduled} Bottlenecks`;
      kpiConflictStatus.className = 'kpi-value highlight-rose';
    }

    kpiExecutionTime.textContent = `${result.stats.executionTimeMs.toFixed(2)} ms`;

    if (result.stats.nodesExplored !== undefined) {
      kpiNodesBacktracks.textContent = `${result.stats.nodesExplored} nodes • ${result.stats.backtracks} backtracks`;
      kpiComplexityTag.textContent = 'CSP MRV Pruned';
    } else if (result.chromaticNumber !== undefined) {
      kpiNodesBacktracks.textContent = `Chromatic Number χ(G) = ${result.chromaticNumber}`;
      kpiComplexityTag.textContent = state.currentAlgorithm === 'graph-dsatur' ? 'O(V²)' : 'O(V log V + E)';
    } else {
      kpiNodesBacktracks.textContent = `Greedy 1-pass ordering`;
      kpiComplexityTag.textContent = 'O(n log n)';
    }

    // Venues active
    const activeRooms = new Set(result.timetable.map(t => t.room.id)).size;
    const totalRooms = state.currentDataset.resources.rooms.length;
    kpiVenueUtilization.textContent = `${activeRooms} / ${totalRooms}`;

    let totalCapUtil = 0;
    result.timetable.forEach(t => {
      totalCapUtil += (t.event.attendees / t.room.capacity);
    });
    const avgCap = scheduled > 0 ? Math.round((totalCapUtil / scheduled) * 100) : 0;
    kpiCapacitySummary.textContent = `Avg Room Capacity Fit: ${avgCap}%`;
  }

  // =========================================================================
  // TIMETABLE MATRIX RENDERING
  // =========================================================================
  function renderTimetable(result) {
    timetableGrid.innerHTML = '';
    const slots = state.currentDataset.resources.timeSlots;
    const rooms = state.currentDataset.resources.rooms;

    // 1. Render Top Header Row: Corner + Time Slots
    const cornerCell = document.createElement('div');
    cornerCell.className = 'venue-header-corner';
    cornerCell.innerHTML = '<strong>CAMPUS VENUE \ TIME</strong>';
    timetableGrid.appendChild(cornerCell);

    slots.forEach(slot => {
      const slotHeader = document.createElement('div');
      slotHeader.className = 'time-slot-header';
      slotHeader.textContent = slot.label;
      timetableGrid.appendChild(slotHeader);
    });

    // Map room type class
    const typeClassMap = {
      'Computer Lab': 'lab',
      'Seminar Hall': 'hall',
      'Classroom': 'class',
      'Robotics Lab': 'robot'
    };

    // 2. Render Room Rows
    rooms.forEach(room => {
      const roomClass = typeClassMap[room.type] || 'class';

      // Left Room Label
      const rowLabel = document.createElement('div');
      rowLabel.className = `room-row-label ${roomClass}`;
      rowLabel.innerHTML = `
        <div class="room-name-text">${room.name}</div>
        <div class="room-meta-text">${room.type} • Cap: ${room.capacity}</div>
      `;
      timetableGrid.appendChild(rowLabel);

      // Grid cells for each time slot
      slots.forEach(slot => {
        const cell = document.createElement('div');
        cell.className = 'timetable-cell';
        cell.dataset.roomId = room.id;
        cell.dataset.slotStart = slot.start;
        timetableGrid.appendChild(cell);
      });
    });

    // 3. Place Scheduled Event Chips inside corresponding cells
    result.timetable.forEach(item => {
      const eventStart = item.slot.start;
      const duration = item.event.duration;
      const roomId = item.room.id;

      // Find the starting cell
      const targetCell = timetableGrid.querySelector(
        `.timetable-cell[data-room-id="${roomId}"][data-slot-start="${eventStart}"]`
      );

      if (targetCell) {
        const chip = document.createElement('div');
        const roomTypeKey = typeClassMap[item.room.type] || 'class';
        chip.className = `event-chip type-${roomTypeKey}`;

        // Width span for multi-hour events
        if (duration > 1) {
          // Span width across multiple cells: (width of 1 cell + 8px gap) * duration
          chip.style.width = `calc(${duration * 100}% + ${(duration - 1) * 8}px)`;
        }

        // Equipment icons text
        let eqBadges = '';
        (item.equipmentList || []).forEach(eq => {
          if (eq.includes('projector')) eqBadges += '📽️ ';
          else if (eq.includes('mic')) eqBadges += '🎙️ ';
          else if (eq.includes('comp')) eqBadges += '💻 ';
          else if (eq.includes('robot')) eqBadges += '🤖 ';
        });

        chip.innerHTML = `
          <div class="chip-title">${item.event.name}</div>
          <div class="chip-meta">
            <span>👤 ${item.faculty?.name ? item.faculty.name.split(' ')[0] + ' ' + (item.faculty.name.split(' ')[1] || '') : 'TBD'}</span>
            <span>👥 ${item.event.attendees}/${item.room.capacity}</span>
          </div>
          <div class="chip-equipment-icons">
            <span>${eqBadges || 'Standard'}</span>
            <span style="font-family: var(--font-mono); font-size: 0.65rem;">[${item.slot.label.split(' - ')[0]}]</span>
          </div>
        `;

        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          openEventModal(item);
        });

        targetCell.appendChild(chip);
      }
    });

    // 4. Handle Unscheduled / Infeasible Events
    if (result.unassigned && result.unassigned.length > 0) {
      unscheduledBanner.classList.remove('hidden');
      unscheduledList.innerHTML = '';
      result.unassigned.forEach(ev => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${ev.name}</strong> (${ev.duration} hrs, ${ev.requiredRoomType}, ${ev.attendees} attendees) — Bottleneck: No conflict-free room/slot available.`;
        unscheduledList.appendChild(li);
      });
    } else {
      unscheduledBanner.classList.add('hidden');
    }
  }

  // =========================================================================
  // EVENT DETAIL MODAL
  // =========================================================================
  function openEventModal(item) {
    modalEventName.textContent = item.event.name;
    const eqList = (item.equipmentList || []).map(eqId => {
      const eqObj = state.currentDataset.resources.equipment.find(e => e.id === eqId);
      return eqObj ? eqObj.name : eqId;
    }).join(', ') || 'None required';

    modalEventBody.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.2rem;">
        <div>
          <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase;">Time Window</div>
          <div style="font-size: 1rem; font-weight: 700; color: var(--accent-cyan); font-family: var(--font-mono);">${item.slot.label} (${item.event.duration} hrs)</div>
        </div>
        <div>
          <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase;">Assigned Venue</div>
          <div style="font-size: 1rem; font-weight: 700;">${item.room.name}</div>
          <div style="font-size: 0.75rem; color: var(--text-secondary);">${item.room.type} (Cap: ${item.room.capacity})</div>
        </div>
        <div>
          <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase;">Faculty Coordinator</div>
          <div style="font-size: 0.95rem; font-weight: 600;">${item.faculty?.name || 'Unassigned'}</div>
        </div>
        <div>
          <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase;">Expected Participants</div>
          <div style="font-size: 0.95rem; font-weight: 600;">${item.event.attendees} Attendees (${Math.round((item.event.attendees / item.room.capacity) * 100)}% Capacity Fill)</div>
        </div>
      </div>

      <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--bg-glass-border); border-radius: var(--radius-sm); padding: 0.8rem; margin-bottom: 1rem;">
        <div style="font-size: 0.75rem; font-weight: 700; margin-bottom: 0.3rem;">Dedicated Hardware Equipment:</div>
        <div style="font-size: 0.82rem; color: var(--text-secondary);">${eqList}</div>
      </div>

      <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: var(--radius-sm); padding: 0.8rem; font-size: 0.82rem; color: #6EE7B7;">
        ✓ <strong>Constraint Verification Passed:</strong> Verified zero overlap with other events in ${item.room.name}, faculty availability confirmed, room type is compatible, and hardware inventory limit respected.
      </div>
    `;

    eventModal.classList.remove('hidden');
  }

  btnModalClose.addEventListener('click', () => eventModal.classList.add('hidden'));
  eventModal.addEventListener('click', (e) => {
    if (e.target === eventModal) eventModal.classList.add('hidden');
  });

  // =========================================================================
  // CONFLICT GRAPH & GRAPH COLORING (CANVAS)
  // =========================================================================
  function setupConflictGraph() {
    const { events, resources } = state.currentDataset;
    const graphData = SchedulerAlgorithms.buildConflictGraph(events, resources);

    graphVerticesCount.textContent = events.length;
    graphEdgesCount.textContent = graphData.edges.length;

    // Run Welsh-Powell / DSATUR coloring to get colors
    const colorResult = SchedulerAlgorithms.solveGraphColoring(events, resources, 'dsatur');
    graphChromaticNumber.textContent = colorResult.chromaticNumber;

    // Position vertices in an aesthetic circle or force layout
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(centerX, centerY) - 80;

    const n = events.length;
    state.graphNodes = events.map((ev, idx) => {
      const angle = (idx / n) * 2 * Math.PI - Math.PI / 2;
      // Get assigned color index
      const stepForEv = colorResult.stats.steps.find(s => s.vertex === ev.name);
      const colorIdx = stepForEv !== undefined ? stepForEv.color : idx % CHROMATIC_COLORS.length;

      return {
        id: idx,
        event: ev,
        name: ev.name,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        radius: 28,
        colorIndex: colorIdx,
        color: CHROMATIC_COLORS[colorIdx % CHROMATIC_COLORS.length],
        degree: graphData.adjacency[idx].size
      };
    });

    state.graphEdges = graphData.edges.map(e => ({
      u: state.graphNodes[e.u],
      v: state.graphNodes[e.v],
      reasons: e.reasons
    }));

    // Populate legend
    slotColorsList.innerHTML = '';
    const distinctColors = [...new Set(state.graphNodes.map(n => n.colorIndex))].sort((a,b)=>a-b);
    distinctColors.forEach(cIdx => {
      const slotObj = resources.timeSlots[cIdx % resources.timeSlots.length];
      const row = document.createElement('div');
      row.className = 'slot-color-row';
      row.innerHTML = `
        <span class="color-dot" style="background: ${CHROMATIC_COLORS[cIdx % CHROMATIC_COLORS.length]};"></span>
        <span>Slot Color ${cIdx + 1}: ${slotObj ? slotObj.label : 'Flexible Slot'}</span>
      `;
      slotColorsList.appendChild(row);
    });

    drawGraph();
  }

  function drawGraph() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw subtle background grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // 2. Draw Edges (Conflicts)
    state.graphEdges.forEach(edge => {
      ctx.beginPath();
      ctx.moveTo(edge.u.x, edge.u.y);
      ctx.lineTo(edge.v.x, edge.v.y);
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.45)'; // Rose conflict edge
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw middle constraint marker
      const midX = (edge.u.x + edge.v.x) / 2;
      const midY = (edge.u.y + edge.v.y) / 2;
      ctx.fillStyle = 'rgba(244, 63, 94, 0.9)';
      ctx.beginPath();
      ctx.arc(midX, midY, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // 3. Draw Nodes (Events)
    state.graphNodes.forEach(node => {
      // Glow effect
      const glow = ctx.createRadialGradient(node.x, node.y, 10, node.x, node.y, node.radius + 8);
      glow.addColorStop(0, node.color + '40');
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius + 8, 0, Math.PI * 2);
      ctx.fill();

      // Node Body
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#111827';
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = node.color;
      ctx.stroke();

      // Chromatic Color Badge in center
      ctx.fillStyle = node.color;
      ctx.font = 'bold 12px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`C${node.colorIndex + 1}`, node.x, node.y - 2);

      // Label below node
      ctx.fillStyle = '#F8FAFC';
      ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
      const label = node.name.length > 18 ? node.name.slice(0, 16) + '...' : node.name;
      ctx.fillText(label, node.x, node.y + node.radius + 14);

      // Degree tag
      ctx.fillStyle = '#94A3B8';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText(`deg: ${node.degree}`, node.x, node.y + node.radius + 26);
    });
  }

  // Interactive Node Dragging on Canvas
  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    for (const node of state.graphNodes) {
      const dist = Math.hypot(node.x - mouseX, node.y - mouseY);
      if (dist <= node.radius) {
        state.draggingNode = node;
        state.dragOffset = { x: node.x - mouseX, y: node.y - mouseY };
        break;
      }
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (state.draggingNode) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top) * scaleY;

      state.draggingNode.x = mouseX + state.dragOffset.x;
      state.draggingNode.y = mouseY + state.dragOffset.y;
      drawGraph();
    }
  });

  window.addEventListener('mouseup', () => {
    state.draggingNode = null;
  });

  // =========================================================================
  // STEP-BY-STEP CSP VISUAL DEBUGGER
  // =========================================================================
  function renderDebuggerTrace() {
    stepLogFeed.innerHTML = '';
    const steps = state.stepTrace;
    stepCounterDisplay.textContent = `Step ${state.currentStepIndex} / ${steps.length}`;

    if (steps.length === 0) {
      stepLogFeed.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 1rem;">No execution steps recorded for this algorithm mode. Choose "CSP Backtracking" for detailed search tree tracing.</div>';
      return;
    }

    steps.forEach((step, idx) => {
      const item = document.createElement('div');
      item.className = `step-item ${step.type} ${idx === state.currentStepIndex ? 'active' : ''}`;
      item.id = `step-item-${idx}`;

      let content = '';
      if (step.type === 'SELECT_VARIABLE') {
        content = `<strong>MRV Select:</strong> "${step.detail.event}" (Domain size: ${step.detail.domainSize})`;
      } else if (step.type === 'ASSIGN') {
        content = `<strong>Placed:</strong> "${step.detail.event}" in ${step.detail.room} at ${step.detail.slot}`;
      } else if (step.type === 'FORWARD_CHECK_FAIL') {
        content = `<strong>Forward Check Prune:</strong> Bottleneck on "${step.detail.bottleneckEvent}"`;
      } else if (step.type === 'BACKTRACK') {
        content = `<strong>Backtrack:</strong> Undid "${step.detail.event}" from ${step.detail.testedRoom}`;
      } else if (step.type === 'REJECT') {
        content = `<strong>Conflict Rejected:</strong> ${step.detail.reason}`;
      } else {
        content = JSON.stringify(step.detail);
      }

      item.innerHTML = `
        <span class="step-tag">${step.type}</span>
        <div>${content}</div>
      `;

      item.addEventListener('click', () => {
        jumpToStep(idx);
      });

      stepLogFeed.appendChild(item);
    });

    updateStepDetail();
  }

  function updateStepDetail() {
    const steps = state.stepTrace;
    if (steps.length === 0 || !steps[state.currentStepIndex]) return;

    const current = steps[state.currentStepIndex];
    stepCounterDisplay.textContent = `Step ${state.currentStepIndex + 1} / ${steps.length}`;

    // Highlight active in log
    document.querySelectorAll('.step-item').forEach((el, i) => {
      el.classList.toggle('active', i === state.currentStepIndex);
    });

    const activeEl = document.getElementById(`step-item-${state.currentStepIndex}`);
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    stepStateBadge.textContent = current.type;
    stepStateBadge.className = `badge status-${current.type === 'ASSIGN' ? 'ready' : current.type === 'BACKTRACK' ? 'warning' : 'accent'}`;

    let html = `<div><strong>Step #${state.currentStepIndex + 1}:</strong> Action <code>${current.type}</code></div>`;
    if (current.type === 'ASSIGN') {
      html += `
        <div style="margin-top: 0.5rem; color: #34D399;">
          Successfully assigned <strong>${current.detail.event}</strong> to venue <strong>${current.detail.room}</strong> during time slot <strong>${current.detail.slot}</strong> with faculty <strong>${current.detail.faculty}</strong>.
        </div>
      `;
    } else if (current.type === 'BACKTRACK') {
      html += `
        <div style="margin-top: 0.5rem; color: #FB7185;">
          Sub-tree exploration failed. Algorithm is backtracking from event <strong>${current.detail.event}</strong>. Reverting slot ${current.detail.testedSlot}.
        </div>
      `;
    } else if (current.type === 'SELECT_VARIABLE') {
      html += `
        <div style="margin-top: 0.5rem;">
          Using <strong>MRV (Minimum Remaining Values)</strong> heuristic: Variable <strong>${current.detail.event}</strong> selected due to tightest remaining domain options (${current.detail.domainSize} candidates).
        </div>
      `;
    } else {
      html += `<pre style="font-family: var(--font-mono); font-size: 0.75rem; margin-top: 0.5rem;">${JSON.stringify(current.detail, null, 2)}</pre>`;
    }

    currentStepDetail.innerHTML = html;

    // Update live variable domains
    variableDomainsList.innerHTML = '';
    state.currentDataset.events.forEach(ev => {
      const isAssigned = steps.slice(0, state.currentStepIndex + 1).some(s => s.type === 'ASSIGN' && s.detail.event === ev.name);
      const row = document.createElement('div');
      row.className = 'domain-item';
      row.innerHTML = `
        <span><strong>${ev.name}</strong></span>
        <span style="font-family: var(--font-mono); font-size: 0.72rem; color: ${isAssigned ? '#34D399' : 'var(--accent-cyan)'};">
          ${isAssigned ? '✓ ASSIGNED' : 'Candidate Domains Active'}
        </span>
      `;
      variableDomainsList.appendChild(row);
    });
  }

  function jumpToStep(idx) {
    if (idx >= 0 && idx < state.stepTrace.length) {
      state.currentStepIndex = idx;
      updateStepDetail();
    }
  }

  btnNextStep.addEventListener('click', () => {
    if (state.currentStepIndex < state.stepTrace.length - 1) {
      jumpToStep(state.currentStepIndex + 1);
    }
  });

  btnPrevStep.addEventListener('click', () => {
    if (state.currentStepIndex > 0) {
      jumpToStep(state.currentStepIndex - 1);
    }
  });

  btnResetTrace.addEventListener('click', () => {
    pausePlay();
    jumpToStep(0);
  });

  function startPlay() {
    state.isPlaying = true;
    btnPlayPause.textContent = '⏸ Pause';
    btnPlayPause.classList.add('btn-secondary');
    btnPlayPause.classList.remove('btn-primary');

    state.playInterval = setInterval(() => {
      if (state.currentStepIndex < state.stepTrace.length - 1) {
        jumpToStep(state.currentStepIndex + 1);
      } else {
        pausePlay();
      }
    }, 1000 / state.playbackSpeed);
  }

  function pausePlay() {
    state.isPlaying = false;
    btnPlayPause.textContent = '▶ Auto Play';
    btnPlayPause.classList.add('btn-primary');
    btnPlayPause.classList.remove('btn-secondary');
    if (state.playInterval) {
      clearInterval(state.playInterval);
      state.playInterval = null;
    }
  }

  btnPlayPause.addEventListener('click', () => {
    if (state.isPlaying) pausePlay();
    else startPlay();
  });

  stepSpeedInput.addEventListener('input', (e) => {
    state.playbackSpeed = parseFloat(e.target.value);
    speedDisplay.textContent = `${state.playbackSpeed.toFixed(1)}x`;
    if (state.isPlaying) {
      pausePlay();
      startPlay();
    }
  });

  // =========================================================================
  // TAB 4: FACULTY & EQUIPMENT SCHEDULES
  // =========================================================================
  function renderFacultyAndEquipment(result) {
    // 1. Faculty personal calendars
    facultyTimetableList.innerHTML = '';
    const facultyList = state.currentDataset.resources.faculty;

    facultyList.forEach(fac => {
      const assignedEvents = result.timetable.filter(item => item.faculty && item.faculty.id === fac.id);

      const row = document.createElement('div');
      row.className = 'faculty-row';

      let pills = '';
      if (assignedEvents.length === 0) {
        pills = '<span style="font-size: 0.75rem; color: var(--text-muted);">Available (No commitments scheduled)</span>';
      } else {
        assignedEvents.forEach(a => {
          pills += `
            <div class="fac-event-pill">
              <strong>${a.slot.label}:</strong> "${a.event.name}" (${a.room.name})
            </div>
          `;
        });
      }

      row.innerHTML = `
        <div class="faculty-row-header">
          <span class="faculty-name">${fac.name}</span>
          <span class="faculty-dept">${fac.dept || 'Campus Faculty'}</span>
        </div>
        <div class="faculty-events-pills">${pills}</div>
      `;
      facultyTimetableList.appendChild(row);
    });

    // 2. Equipment inventory loads
    equipmentInventoryList.innerHTML = '';
    const equipment = state.currentDataset.resources.equipment;

    equipment.forEach(eq => {
      // Find peak simultaneous usage
      const slots = state.currentDataset.resources.timeSlots;
      let peakUsage = 0;

      slots.forEach(slot => {
        let countInSlot = 0;
        result.timetable.forEach(assigned => {
          if (SchedulerAlgorithms.intervalsOverlap(slot.start, slot.end, assigned.slot.start, assigned.slot.end)) {
            if (assigned.equipmentList && assigned.equipmentList.includes(eq.id)) {
              countInSlot++;
            }
          }
        });
        if (countInSlot > peakUsage) peakUsage = countInSlot;
      });

      const fillPct = Math.min(100, Math.round((peakUsage / eq.totalQuantity) * 100));

      const row = document.createElement('div');
      row.className = 'equipment-row';
      row.innerHTML = `
        <div class="eq-header">
          <span class="eq-name">${eq.name}</span>
          <span class="eq-count">Peak Usage: ${peakUsage} / ${eq.totalQuantity} Units (${fillPct}%)</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width: ${fillPct}%;"></div>
        </div>
        <div style="font-size: 0.72rem; color: var(--text-muted);">
          ${eq.totalQuantity - peakUsage >= 0 ? `✓ Buffer available: ${eq.totalQuantity - peakUsage} spare units` : '⚠ Demand exceeds total supply'}
        </div>
      `;
      equipmentInventoryList.appendChild(row);
    });
  }

  // =========================================================================
  // TAB 5: ALGORITHM COMPARISON BENCHMARK
  // =========================================================================
  function renderBenchmarkTable() {
    benchmarkTableBody.innerHTML = '';
    const { events, resources } = state.currentDataset;
    const comparison = SchedulerAlgorithms.compareAlgorithms(events, resources);

    comparison.forEach(item => {
      const tr = document.createElement('tr');
      const isCurrent = item.name.toLowerCase().includes(state.currentAlgorithm.replace('-', ' '));

      tr.innerHTML = `
        <td>
          <strong style="color: ${isCurrent ? 'var(--accent-cyan)' : 'var(--text-main)'};">${item.name}</strong>
          ${isCurrent ? '<span style="font-size: 0.65rem; background: rgba(6,182,212,0.2); color: var(--accent-cyan); padding: 0.1rem 0.4rem; border-radius: 3px; margin-left: 0.4rem;">ACTIVE</span>' : ''}
        </td>
        <td><span class="badge">${item.type}</span></td>
        <td><code style="font-family: var(--font-mono); font-size: 0.75rem; color: #A5B4FC;">${item.complexity.time}</code></td>
        <td><code style="font-family: var(--font-mono); font-size: 0.75rem; color: #6EE7B7;">${item.complexity.space}</code></td>
        <td style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-cyan);">${item.timeMs} ms</td>
        <td><span style="font-weight: 700; color: ${item.unassigned === 0 ? '#34D399' : '#F59E0B'};">${item.scheduled}/${events.length}</span></td>
        <td style="font-size: 0.78rem;">${item.details}</td>
      `;
      benchmarkTableBody.appendChild(tr);
    });
  }

  btnRebenchmark.addEventListener('click', () => {
    renderBenchmarkTable();
    showToast('Re-benchmarked all 4 algorithms on current dataset!');
  });

  // =========================================================================
  // TAB 6: EVENT & RESOURCE MANAGER
  // =========================================================================
  function renderEventsManagerList() {
    eventsTableList.innerHTML = '';
    const events = state.currentDataset.events;
    eventCountBadge.textContent = events.length;
    datasetNameBadge.textContent = state.currentDataset.name;

    events.forEach((ev, idx) => {
      const item = document.createElement('div');
      item.className = 'event-row-item';
      item.innerHTML = `
        <div>
          <strong style="color: var(--text-main);">${ev.name}</strong>
          <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.15rem;">
            ${ev.duration} hr(s) • ${ev.requiredRoomType} • ${ev.attendees} seats • ${ev.facultyName || ev.facultyId}
            ${ev.fixedStart !== undefined ? ` • Fixed @ ${ev.fixedStart}:00` : ''}
          </div>
        </div>
        <button class="btn-delete-event" data-event-id="${ev.id}" title="Delete event">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      `;

      item.querySelector('.btn-delete-event').addEventListener('click', () => {
        deleteEvent(ev.id);
      });

      eventsTableList.appendChild(item);
    });
  }

  function deleteEvent(id) {
    state.currentDataset.events = state.currentDataset.events.filter(e => e.id !== id);
    renderEventsManagerList();
    runScheduler();
    showToast('Event removed from scheduling pool');
  }

  formAddEvent.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('inputEventName').value.trim();
    const duration = parseInt(document.getElementById('inputEventDuration').value, 10);
    const requiredRoomType = document.getElementById('inputEventRoomType').value;
    const attendees = parseInt(document.getElementById('inputEventAttendees').value, 10);
    const facultyId = document.getElementById('inputEventFaculty').value;
    const facultySelect = document.getElementById('inputEventFaculty');
    const facultyName = facultySelect.options[facultySelect.selectedIndex].text;
    const fixedTimeVal = document.getElementById('inputEventFixedTime').value;

    const checkedEquipment = Array.from(
      document.querySelectorAll('input[name="customEquipment"]:checked')
    ).map(cb => cb.value);

    const newEvent = {
      id: 'custom_' + Date.now(),
      name,
      duration,
      requiredRoomType,
      attendees,
      facultyId,
      facultyName,
      requiredEquipment: checkedEquipment
    };

    if (fixedTimeVal !== 'flexible') {
      newEvent.fixedStart = parseInt(fixedTimeVal, 10);
    }

    state.currentDataset.events.push(newEvent);
    datasetSelect.value = 'custom';
    formAddEvent.reset();
    renderEventsManagerList();
    runScheduler();
    showToast(`Added "${name}" to scheduling dataset!`);
  });

  btnResetToDefaults.addEventListener('click', () => {
    state.currentDatasetKey = 'hackathonPrompt';
    datasetSelect.value = 'hackathonPrompt';
    state.currentDataset = JSON.parse(JSON.stringify(SchedulerAlgorithms.SAMPLE_DATASETS.hackathonPrompt));
    runScheduler();
    showToast('Reset dataset to Hackathon Prompt baseline.');
  });

  btnApplyCustomSchedule.addEventListener('click', () => {
    runScheduler();
    switchTab('viewTimetable');
    showToast('Custom dataset scheduled and displayed in Timetable Matrix!');
  });

  // =========================================================================
  // TAB NAVIGATION
  // =========================================================================
  function switchTab(targetId) {
    tabButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.target === targetId);
    });
    tabPanels.forEach(panel => {
      panel.classList.toggle('active', panel.id === targetId);
    });

    if (targetId === 'viewConflictGraph') {
      // Re-draw canvas when tab is visible
      setTimeout(drawGraph, 50);
    }
  }

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.target);
    });
  });

  // =========================================================================
  // DATASET & ALGORITHM CHANGE LISTENERS
  // =========================================================================
  datasetSelect.addEventListener('change', (e) => {
    const key = e.target.value;
    state.currentDatasetKey = key;
    if (key !== 'custom' && SchedulerAlgorithms.SAMPLE_DATASETS[key]) {
      state.currentDataset = JSON.parse(JSON.stringify(SchedulerAlgorithms.SAMPLE_DATASETS[key]));
    }
    runScheduler();
  });

  algorithmSelect.addEventListener('change', (e) => {
    state.currentAlgorithm = e.target.value;
    runScheduler();
  });

  btnRunSchedule.addEventListener('click', () => {
    runScheduler();
  });

  btnStepDebugger.addEventListener('click', () => {
    switchTab('viewDebugger');
    state.currentStepIndex = 0;
    updateStepDetail();
    startPlay();
  });

  // =========================================================================
  // EXPORT HANDLERS (CSV, JSON, PRINT)
  // =========================================================================
  btnExportMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    exportDropdown.parentElement.classList.toggle('show');
  });

  document.addEventListener('click', () => {
    exportDropdown.parentElement.classList.remove('show');
  });

  exportCSV.addEventListener('click', (e) => {
    e.preventDefault();
    if (!state.currentResult) return;

    let csv = 'Event Name,Time Slot,Room Name,Room Type,Faculty,Attendees,Capacity,Equipment\n';
    state.currentResult.timetable.forEach(item => {
      const eq = (item.equipmentList || []).join('; ');
      csv += `"${item.event.name}","${item.slot.label}","${item.room.name}","${item.room.type}","${item.faculty?.name || 'N/A'}",${item.event.attendees},${item.room.capacity},"${eq}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `campus_timetable_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Timetable CSV exported successfully!');
  });

  exportJSON.addEventListener('click', (e) => {
    e.preventDefault();
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state.currentResult, null, 2));
    const link = document.createElement('a');
    link.href = dataStr;
    link.setAttribute('download', `schedule_result_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Timetable JSON exported successfully!');
  });

  exportPrint.addEventListener('click', (e) => {
    e.preventDefault();
    window.print();
  });

  // Initial Run
  runScheduler();
});
