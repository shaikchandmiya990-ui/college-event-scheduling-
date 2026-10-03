/**
 * cli_scheduler.js
 * Command-line runner and verification test for Smart Campus Event & Resource Scheduler
 */

const {
  solveCSP,
  solveGraphColoring,
  solveGreedy,
  compareAlgorithms,
  SAMPLE_DATASETS
} = require('./algorithms.js');

console.log('='.repeat(70));
console.log('  SMART CAMPUS EVENT & RESOURCE SCHEDULER (DAA HACKATHON)');
console.log('='.repeat(70));

const dataset = SAMPLE_DATASETS.hackathonPrompt;
console.log(`\nDataset: ${dataset.name}`);
console.log(`Events to schedule: ${dataset.events.length}`);
dataset.events.forEach(e => {
  console.log(`  - [${e.name}] Duration: ${e.duration} hr(s) | Room Req: ${e.requiredRoomType} | Equipment: ${e.requiredEquipment.join(', ')} | Faculty: ${e.facultyName}`);
});

console.log('\n--- 1. RUNNING CSP BACKTRACKING (MRV + Forward Checking) ---');
const cspRes = solveCSP(dataset.events, dataset.resources, { heuristic: 'mrv', forwardChecking: true });
console.log(`Success: ${cspRes.success}`);
console.log(`Execution Time: ${cspRes.stats.executionTimeMs.toFixed(3)} ms`);
console.log(`Nodes Explored: ${cspRes.stats.nodesExplored}, Backtracks: ${cspRes.stats.backtracks}`);
console.log('\nFinal Timetable:');
cspRes.timetable.forEach(item => {
  console.log(`  [${item.slot.label}] -> Event: "${item.event.name}" | Room: ${item.room.name} (${item.room.type}) | Faculty: ${item.faculty?.name || 'N/A'}`);
});

console.log('\n--- 2. RUNNING GRAPH COLORING (Welsh-Powell) ---');
const wpRes = solveGraphColoring(dataset.events, dataset.resources, 'welsh-powell');
console.log(`Success: ${wpRes.success}, Chromatic Number (Slots needed): ${wpRes.chromaticNumber}`);
wpRes.timetable.forEach(item => {
  console.log(`  [${item.slot.label}] -> Event: "${item.event.name}" | Room: ${item.room.name}`);
});

console.log('\n--- 3. RUNNING GRAPH COLORING (DSATUR) ---');
const dsaturRes = solveGraphColoring(dataset.events, dataset.resources, 'dsatur');
console.log(`Success: ${dsaturRes.success}, Chromatic Number: ${dsaturRes.chromaticNumber}`);

console.log('\n--- 4. ALGORITHM COMPARISON BENCHMARK ---');
const comparison = compareAlgorithms(dataset.events, dataset.resources);
console.table(comparison.map(c => ({
  Algorithm: c.name,
  Scheduled: `${c.scheduled}/${dataset.events.length}`,
  'Time (ms)': c.timeMs,
  Complexity: c.complexity.time,
  Details: c.details
})));
