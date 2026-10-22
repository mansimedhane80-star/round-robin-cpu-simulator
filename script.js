
const $ = id => document.getElementById(id);

let nextId = 5;

const palette = [
  "#7164f4",
  "#0daaa1",
  "#d28a36",
  "#d45381",
  "#4387d9",
  "#9a68c9",
  "#65a65b",
  "#cf6252"
];

/* PROCESS INPUTS */

function addProcess(pid = `P${nextId++}`, arrival = 0, burst = 5) {
  const tr = document.createElement("tr");

  [
    { field: "pid", value: pid, type: "text" },
    { field: "arrival", value: arrival, type: "number" },
    { field: "burst", value: burst, type: "number" }
  ].forEach(({ field, value, type }) => {
    const td = document.createElement("td");
    const input = document.createElement("input");

    input.type = type;
    input.value = value;
    input.dataset.field = field;

    if (field === "arrival") {
      input.min = "0";
      input.step = "any";
      input.setAttribute("aria-label", "Arrival time");
    }

    if (field === "burst") {
      input.min = "0.01";
      input.step = "any";
      input.setAttribute("aria-label", "Burst time");
    }

    if (field === "pid") {
      input.setAttribute("aria-label", "Process ID");
    }

    td.append(input);
    tr.append(td);
  });

  const action = document.createElement("td");
  const remove = document.createElement("button");

  remove.className = "btn secondary";
  remove.textContent = "Remove";
  remove.type = "button";
  remove.setAttribute("aria-label", `Remove ${pid}`);

  remove.onclick = () => tr.remove();

  action.append(remove);
  tr.append(action);

  $("processTable").append(tr);
}

function loadSample() {
  $("processTable").replaceChildren();

  nextId = 5;

  addProcess("P1", 0, 10);
  addProcess("P2", 0, 5);
  addProcess("P3", 0, 3);
  addProcess("P4", 0, 7);

  $("error").textContent = "";
}

function readProcesses() {
  const rows = [...$("processTable").rows];

  if (!rows.length) {
    throw Error("Add at least one process.");
  }

  const processes = rows.map((row, index) => {
    const get = field =>
      row.querySelector(`[data-field="${field}"]`).value.trim();

    const pid = get("pid");
    const arrival = Number(get("arrival"));
    const burst = Number(get("burst"));

    if (
      !pid ||
      !Number.isFinite(arrival) ||
      arrival < 0 ||
      !Number.isFinite(burst) ||
      burst <= 0
    ) {
      throw Error(
        `Check the process ID, arrival time and burst time in row ${index + 1}.`
      );
    }

    return { pid, arrival, burst, index };
  });

  const ids = processes.map(p => p.pid);

  if (new Set(ids).size !== ids.length) {
    throw Error("Each process must have a unique process ID.");
  }

  return processes;
}

/* ROUND ROBIN SCHEDULING ALGORITHM */

function simulate(processes, quantum, switchCost = 0) {
  if (!Number.isFinite(quantum) || quantum <= 0) {
    throw Error("Time quantum must be greater than zero.");
  }

  if (!Number.isFinite(switchCost) || switchCost < 0) {
    throw Error("Context-switch cost cannot be negative.");
  }

  const jobs = processes
    .map(p => ({
      ...p,
      remaining: p.burst,
      completion: 0,
      firstStart: null
    }))
    .sort((a, b) => a.arrival - b.arrival || a.index - b.index);

  const ready = [];
  const timeline = [];

  let time = 0;
  let arrived = 0;
  let lastPid = null;
  let switches = 0;

  function admit() {
    while (
      arrived < jobs.length &&
      jobs[arrived].arrival <= time
    ) {
      ready.push(jobs[arrived]);
      arrived++;
    }
  }

  while (jobs.some(p => p.remaining > 0)) {
    admit();

    if (ready.length === 0) {
      const nextProcess = jobs
        .slice(arrived)
        .find(p => p.remaining > 0);

      if (!nextProcess) break;

      if (nextProcess.arrival > time) {
        timeline.push({
          pid: "IDLE",
          start: time,
          end: nextProcess.arrival
        });

        time = nextProcess.arrival;

        // An idle interval is not a process-to-process switch.
        lastPid = null;
      }

      admit();
      continue;
    }

    const process = ready.shift();

    // Count a switch only when dispatching a different process
    // after another process has used the CPU.
    if (lastPid !== null && lastPid !== process.pid) {
      switches++;

      if (switchCost > 0) {
        timeline.push({
          pid: "CS",
          start: time,
          end: time + switchCost
        });

        time += switchCost;

        // Processes arriving during switching join the ready queue.
        admit();
      }
    }

    if (process.firstStart === null) {
      process.firstStart = time;
    }

    const start = time;
    const duration = Math.min(quantum, process.remaining);

    time += duration;
    process.remaining = Math.max(0, process.remaining - duration);

    timeline.push({
      pid: process.pid,
      start,
      end: time
    });

    // Admit arrivals before re-queuing the unfinished process.
    admit();

    if (process.remaining > 0) {
      ready.push(process);
    } else {
      process.completion = time;
    }

    lastPid = process.pid;
  }

  const results = jobs.map(p => {
    const turnaround = p.completion - p.arrival;

    return {
      ...p,
      turnaround,
      waiting: turnaround - p.burst,
      response: p.firstStart - p.arrival
    };
  });

  const average = key =>
    results.reduce((sum, p) => sum + p[key], 0) / results.length;

  return {
    results,
    timeline,
    switches,
    quantum,
    switchCost,
    avgWaiting: average("waiting"),
    avgTurnaround: average("turnaround"),
    avgResponse: average("response"),
    finishTime: time
  };
}

/* SINGLE SIMULATION RESULTS */

function render(result) {
  $("results").hidden = false;

  $("resultSummary").textContent =
    `Time quantum: ${result.quantum} units · ` +
    `Context-switch cost: ${result.switchCost} units`;

  const metrics = [
    ["Average waiting time", result.avgWaiting],
    ["Average turnaround time", result.avgTurnaround],
    ["Average response time", result.avgResponse],
    ["Context switches", result.switches]
  ];

  $("metrics").replaceChildren();

  metrics.forEach(([label, value]) => {
    const card = document.createElement("div");
    card.className = "metric";

    const name = document.createElement("span");
    name.textContent = label;

    const number = document.createElement("strong");
    number.textContent = Number(value).toFixed(
      Number.isInteger(value) ? 0 : 2
    );

    card.append(name, number);
    $("metrics").append(card);
  });

  renderGantt(result);
  renderProcessResults(result);

  $("results").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function renderGantt(result) {
  const gantt = $("gantt");
  const timeline = $("timeline");

  gantt.replaceChildren();
  timeline.replaceChildren();

  const total = result.finishTime;

  if (total <= 0 || result.timeline.length === 0) {
    gantt.textContent = "No execution timeline available.";
    return;
  }

  result.timeline.forEach(block => {
    const duration = block.end - block.start;

    const el = document.createElement("div");
    el.className = "gantt-block";
    el.style.flex = `${duration} 1 0`;
    el.style.background =
      block.pid === "IDLE"
        ? "#8c96aa"
        : block.pid === "CS"
          ? "#c45c6a"
          : palette[
              Math.max(
                0,
                result.results.findIndex(p => p.pid === block.pid)
              ) % palette.length
            ];

    const name = document.createElement("strong");
    name.textContent = block.pid;

    const interval = document.createElement("small");
    interval.textContent =
      `${formatTime(block.start)}–${formatTime(block.end)}`;

    el.title = `${block.pid}: ${block.start} to ${block.end}`;
    el.append(name, interval);
    gantt.append(el);
  });

  // Display timeline ticks at every block boundary.
  const startTick = document.createElement("span");
  startTick.textContent = formatTime(result.timeline[0].start);
  startTick.style.flex = "0 0 auto";
  timeline.append(startTick);

  result.timeline.forEach(block => {
    const tick = document.createElement("span");

    tick.textContent = formatTime(block.end);
    tick.style.flex = `${block.end - block.start} 1 0`;
    tick.style.textAlign = "right";

    timeline.append(tick);
  });
}

function renderProcessResults(result) {
  const tbody = $("resultTable");
  tbody.replaceChildren();

  [...result.results]
    .sort((a, b) => a.index - b.index)
    .forEach(p => {
      const row = document.createElement("tr");

      [
        p.pid,
        p.burst,
        p.completion,
        p.turnaround,
        p.waiting,
        p.response
      ].forEach(value => {
        const td = document.createElement("td");

        td.textContent =
          typeof value === "number"
            ? formatTime(value)
            : value;

        row.append(td);
      });

      tbody.append(row);
    });
}

function formatTime(value) {
  return Number(value.toFixed(2)).toString();
}

/* MANUAL QUANTUM COMPARISON */

function compare() {
  const processes = readProcesses();
  const cost = Number($("switchCost").value);

  if (!Number.isFinite(cost) || cost < 0) {
    throw Error("Context-switch cost cannot be negative.");
  }

  const scenarios = [
    {
      label: "Small",
      quantum: Number($("quantumSmall").value)
    },
    {
      label: "Medium",
      quantum: Number($("quantumMedium").value)
    },
    {
      label: "Large",
      quantum: Number($("quantumLarge").value)
    }
  ];

  if (
    scenarios.some(
      s => !Number.isFinite(s.quantum) || s.quantum <= 0
    )
  ) {
    throw Error(
      "All three comparison quantum values must be greater than zero."
    );
  }

  if (
    new Set(scenarios.map(s => s.quantum)).size !== 3
  ) {
    throw Error(
      "Enter three different quantum values for comparison."
    );
  }

  // Run the exact values entered by the user.
  const runs = scenarios.map(s => ({
    ...simulate(processes, s.quantum, cost),
    label: s.label
  }));

  renderComparisonTable(runs);
  renderComparisonChart(
    "waitingChart",
    runs,
    "avgWaiting",
    "Average waiting time"
  );
  renderComparisonChart(
    "switchChart",
    runs,
    "switches",
    "Context switches"
  );
  renderExplanation(runs);

  $("comparisonSummary").textContent =
    `Compared quantum values: ${runs
      .map(r => r.quantum)
      .join(", ")} · Context-switch cost: ${cost}`;

  $("comparison").hidden = false;

  $("comparison").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function renderComparisonTable(runs) {
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const header = document.createElement("tr");

  [
    "Scenario",
    "Quantum",
    "Avg. waiting",
    "Avg. turnaround",
    "Avg. response",
    "Context switches"
  ].forEach(label => {
    const th = document.createElement("th");
    th.textContent = label;
    header.append(th);
  });

  thead.append(header);

  const tbody = document.createElement("tbody");

  runs.forEach(run => {
    const row = document.createElement("tr");

    [
      run.label,
      run.quantum,
      formatTime(run.avgWaiting),
      formatTime(run.avgTurnaround),
      formatTime(run.avgResponse),
      run.switches
    ].forEach(value => {
      const td = document.createElement("td");
      td.textContent = value;
      row.append(td);
    });

    tbody.append(row);
  });

  table.append(thead, tbody);
  $("comparisonContent").replaceChildren(table);
}

/* COMPARISON BAR CHARTS */

function renderComparisonChart(containerId, runs, key, description) {
  const container = $(containerId);
  container.replaceChildren();

  const maxValue = Math.max(...runs.map(run => run[key]), 0);

  runs.forEach((run, index) => {
    const row = document.createElement("div");
    row.className = "bar-row";

    const label = document.createElement("span");
    label.className = "bar-label";
    label.textContent = `${run.label} (${run.quantum})`;
    label.title = `${description} for quantum ${run.quantum}`;

    const track = document.createElement("div");
    track.className = "bar-track";

    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.background = palette[index % palette.length];

    const percentage =
      maxValue > 0 ? (run[key] / maxValue) * 100 : 0;

    fill.style.width = `${percentage}%`;

    track.append(fill);

    const value = document.createElement("span");
    value.className = "bar-value";
    value.textContent = formatTime(run[key]);

    row.append(label, track, value);
    container.append(row);
  });
}

/* EXPLAIN THE COMPARISON */

function renderExplanation(runs) {
  const smallest = runs.reduce((best, run) =>
    run.avgWaiting < best.avgWaiting ? run : best
  );

  const fewestSwitches = runs.reduce((best, run) =>
    run.switches < best.switches ? run : best
  );

  const largestQuantum = runs.reduce((largest, run) =>
    run.quantum > largest.quantum ? run : largest
  );

  const box = $("comparisonExplanation");
  box.replaceChildren();

  const heading = document.createElement("strong");
  heading.textContent = "What these results mean";

  const details = document.createElement("p");
  details.textContent =
    `Quantum ${smallest.quantum} has the lowest average waiting time ` +
    `(${formatTime(smallest.avgWaiting)} units) among these runs. ` +
    `Quantum ${fewestSwitches.quantum} has the fewest counted ` +
    `process-to-process switches (${fewestSwitches.switches}). ` +
    `The largest quantum you tested is ${largestQuantum.quantum}. ` +
    `A larger quantum tends to make Round Robin behave more like FCFS, ` +
    `but the best waiting and response times depend on the workload.`;

  details.style.margin = "10px 0 0";

  const note = document.createElement("p");
  note.textContent =
    "Context-switch cost is included in elapsed execution time. " +
    "The switch count records dispatches between different processes; " +
    "idle periods are not counted as process-to-process switches.";

  note.style.margin = "8px 0 0";

  box.append(heading, details, note);
}

/* BUTTON EVENTS */

$("addBtn").addEventListener("click", () => {
  addProcess();
  $("error").textContent = "";
});

$("sampleBtn").addEventListener("click", () => {
  loadSample();
});

$("runBtn").addEventListener("click", () => {
  try {
    $("error").textContent = "";

    const processes = readProcesses();
    const quantum = Number($("quantum").value);
    const cost = Number($("switchCost").value);

    const result = simulate(processes, quantum, cost);
    render(result);
  } catch (error) {
    $("error").textContent = error.message;
  }
});

$("compareBtn").addEventListener("click", () => {
  try {
    $("error").textContent = "";
    compare();
  } catch (error) {
    $("error").textContent = error.message;
  }
});

/* INITIALIZE */

loadSample();
