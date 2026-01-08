/* ==========
   app.js
   Loads health_data.json and renders:
   - KPI snapshot
   - Weight trend chart
   - Resting HR trend chart
   - Workout table
   - Blood reports table
   - Doctor summary
   ========== */

let weightChart;
let hrChart;

async function loadHealthData() {
  try {
    const res = await fetch("health_data.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Could not load health_data.json (HTTP ${res.status})`);
    const data = await res.json();

    const daily = (data.dailyCheckins || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    const workouts = (data.workouts || []).slice().sort((a, b) => b.date.localeCompare(a.date));
    const blood = (data.bloodTests || []).slice().sort((a, b) => b.date.localeCompare(a.date));

    renderKPIs(daily);
    renderWeightChart(daily);
    renderHrChart(daily);
    renderWorkoutTable(workouts);
    renderBloodTable(blood);
    renderDoctorSummary(data, daily, blood);

  } catch (err) {
    showError(err);
    console.error(err);
  }
}

function renderKPIs(daily) {
  const last = daily[daily.length - 1] || {};

  setText("weight", valueOrDash(last.weightKg));
  setText("bodyFat", valueOrDash(last.bodyFatPct));
  setText("rhr", valueOrDash(last.restingHr));
  setText("steps", valueOrDash(last.steps));
}

function renderWeightChart(daily) {
  const labels = daily.map(d => d.date);
  const weights = daily.map(d => numOrNull(d.weightKg));
  const bodyFat = daily.map(d => numOrNull(d.bodyFatPct));

  const ctx = document.getElementById("weightChart");
  if (!ctx) return;

  if (weightChart) weightChart.destroy();

  weightChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Weight (kg)",
          data: weights,
          tension: 0.25
        },
        {
          label: "Body Fat (%)",
          data: bodyFat,
          tension: 0.25
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom" },
        tooltip: { mode: "index", intersect: false }
      },
      interaction: { mode: "index", intersect: false },
      scales: {
        y: { beginAtZero: false }
      }
    }
  });
}

function renderHrChart(daily) {
  const labels = daily.map(d => d.date);
  const rhr = daily.map(d => numOrNull(d.restingHr));
  const zone2 = daily.map(d => numOrNull(d.zone2WalkHr));

  const ctx = document.getElementById("hrChart");
  if (!ctx) return;

  if (hrChart) hrChart.destroy();

  hrChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Resting HR",
          data: rhr,
          tension: 0.25
        },
        {
          label: "Zone 2 Walk HR",
          data: zone2,
          tension: 0.25
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom" },
        tooltip: { mode: "index", intersect: false }
      },
      interaction: { mode: "index", intersect: false },
      scales: {
        y: { beginAtZero: false }
      }
    }
  });
}

function renderWorkoutTable(workouts) {
  const tbody = document.getElementById("workoutTable");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!workouts.length) {
    tbody.innerHTML = `<tr><td colspan="4">No workout data yet.</td></tr>`;
    return;
  }

  // show last 12 workouts
  workouts.slice(0, 12).forEach(w => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(w.date)}</td>
      <td>${escapeHtml(w.type || "-")}</td>
      <td>${escapeHtml(valueOrDash(w.durationMin))}</td>
      <td>${escapeHtml(valueOrDash(w.calories))}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderBloodTable(blood) {
  const tbody = document.getElementById("bloodTable");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!blood.length) {
    tbody.innerHTML = `<tr><td colspan="5">No blood report data yet.</td></tr>`;
    return;
  }

  // show last 15 tests
  blood.slice(0, 15).forEach(t => {
    const status = computeLabStatus(t.value, t.rangeLow, t.rangeHigh);
    const statusClass =
      status === "Normal" ? "status-normal" :
      status === "High" ? "status-high" :
      status === "Low" ? "status-low" : "";

    const rangeText = (t.rangeLow != null && t.rangeHigh != null)
      ? `${t.rangeLow}–${t.rangeHigh} ${t.unit || ""}`.trim()
      : "-";

    const valueText = (t.value != null)
      ? `${t.value} ${t.unit || ""}`.trim()
      : "-";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(t.date || "-")}</td>
      <td>${escapeHtml(t.name || "-")}</td>
      <td>${escapeHtml(valueText)}</td>
      <td>${escapeHtml(rangeText)}</td>
      <td class="${statusClass}">${escapeHtml(status)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderDoctorSummary(data, daily, blood) {
  const el = document.getElementById("doctorSummary");
  if (!el) return;

  const baseline = data.baseline || {};
  const last = daily[daily.length - 1] || {};
  const first = daily[0] || {};

  const weightDelta = diffNum(last.weightKg, first.weightKg);
  const bfDelta = diffNum(last.bodyFatPct, first.bodyFatPct);
  const rhrDelta = diffNum(last.restingHr, first.restingHr);

  // Find latest flagged labs
  const flagged = (blood || [])
    .map(t => ({ ...t, status: computeLabStatus(t.value, t.rangeLow, t.rangeHigh) }))
    .filter(t => t.status === "High" || t.status === "Low")
    .slice(0, 5);

  const flagsText = flagged.length
    ? flagged.map(t => `${t.name}: ${t.value}${t.unit ? " " + t.unit : ""} (${t.status})`).join("; ")
    : "No out-of-range labs recorded in the latest entries.";

  const summary = [
    `Baseline date: ${baseline.date || (first.date || "—")}.`,
    `Latest check-in: ${last.date || "—"}.`,
    `Weight: ${valueOrDash(last.weightKg)} kg (${formatDelta(weightDelta)} since first entry).`,
    `Body fat: ${valueOrDash(last.bodyFatPct)}% (${formatDelta(bfDelta)} since first entry).`,
    `Resting HR: ${valueOrDash(last.restingHr)} (${formatDelta(rhrDelta)} since first entry).`,
    `Notes: ${last.notes ? last.notes : "—"}`,
    `Lab flags: ${flagsText}`
  ].join(" ");

  el.textContent = summary;
}

/* ==========
   Helpers
   ========== */

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function valueOrDash(v) {
  return (v === undefined || v === null || v === "") ? "--" : String(v);
}

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function diffNum(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return null;
  return na - nb;
}

function formatDelta(n) {
  if (n == null) return "—";
  const rounded = Math.round(n * 100) / 100;
  if (rounded > 0) return `+${rounded}`;
  return `${rounded}`;
}

function computeLabStatus(value, low, high) {
  const v = Number(value);
  const l = Number(low);
  const h = Number(high);

  if (!Number.isFinite(v) || (!Number.isFinite(l) && !Number.isFinite(h))) return "—";
  if (Number.isFinite(l) && v < l) return "Low";
  if (Number.isFinite(h) && v > h) return "High";
  return "Normal";
}

function showError(err) {
  // Insert a friendly error card at the top
  const card = document.createElement("section");
  card.className = "card";
  card.innerHTML = `
    <h2>Data Load Error</h2>
    <p>Could not load <strong>health_data.json</strong>. Common causes:</p>
    <ul style="margin-top:10px; padding-left:18px;">
      <li>health_data.json is missing or not in the repo root</li>
      <li>File name case mismatch (must be exactly health_data.json)</li>
      <li>JSON has a syntax error (missing comma, quote, bracket)</li>
      <li>GitHub Pages not deployed yet</li>
    </ul>
    <p style="margin-top:10px; color:#6b7280;">Technical details: ${escapeHtml(err.message)}</p>
  `;
  document.body.insertBefore(card, document.body.children[1]);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ==========
   Start
   ========== */
document.addEventListener("DOMContentLoaded", loadHealthData);
