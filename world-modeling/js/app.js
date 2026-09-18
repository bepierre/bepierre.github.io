// The explorer: one state object (ride, step, playing, hover), fanned out to every view on each change.

import { MOVES, debounce, rad } from "./util.js";
import { MapView } from "./map.js";
import { TimelineView } from "./timeline.js";
import { PredictionView, PositionView, CompassView } from "./panels.js";

const DATA = "data/demo/";

const state = { ride: null, rideId: null, step: 0, playing: false, speed: 1, hover: null };
let world, index, views, timer = null;

async function loadJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

function prepareWorld(raw) {
  // nodes keyed by id → [x, y]; the mean bearing of each move label on this street grid, for arrows
  // that point along the streets even when no street exists (an attempted illegal move)
  const nodes = {};
  for (const [id, xy] of Object.entries(raw.nodes)) nodes[id] = xy;
  const sums = {};
  for (const [u, m, v] of raw.edges) {
    const a = nodes[u], b = nodes[v];
    if (!a || !b) continue;
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const s = sums[m] || (sums[m] = [0, 0]);
    s[0] += Math.cos(ang); s[1] += Math.sin(ang);
  }
  const moveBearing = {};
  for (const m of MOVES) if (sums[m]) moveBearing[m] = Math.atan2(sums[m][1], sums[m][0]) * 180 / Math.PI;
  return { nodes, edges: raw.edges, bounds: raw.bounds, moveBearing };
}

function fillPicker() {
  const sel = document.getElementById("ride");
  const groups = { stress: "Stress test — sampled rides", detour: "Detour test — forced moves" };
  for (const [fam, label] of Object.entries(groups)) {
    const og = document.createElement("optgroup");
    og.label = label;
    for (const r of index.rides.filter(r => r.family === fam)) {
      const o = document.createElement("option");
      o.value = r.id;
      o.textContent = (r.category_label ? `${r.category_label} · ${r.n_moves} moves · ${r.outcome_label}` : `${r.outcome_label} · ${r.n_moves} moves`)
        + (r.recorded_position ? "" : " · illustrative readouts");
      og.appendChild(o);
    }
    sel.appendChild(og);
  }
  sel.addEventListener("change", () => selectRide(sel.value, 0));
}

async function selectRide(id, step = 0) {
  const entry = index.rides.find(r => r.id === id) || index.rides[0];
  const ride = await loadJSON(DATA + entry.file);
  ride.moveBearing = world.moveBearing;
  stop();
  state.ride = ride; state.rideId = entry.id; state.hover = null;
  state.step = Math.max(0, Math.min(ride.steps.length - 1, step));
  document.getElementById("ride").value = entry.id;
  for (const v of Object.values(views)) v.setRide(ride);
  render();
}

function render() {
  if (!state.ride) return;
  for (const v of Object.values(views)) v.render(state);
  const n = state.ride.steps.length - 1, s = state.ride.steps[state.step];
  document.getElementById("status-step").textContent = state.step;
  document.getElementById("status-of").textContent = `of ${n}`;
  document.getElementById("status-goal").textContent = s.dist_to_goal === 0 ? "at the goal" : `${s.dist_to_goal} to goal`;
  const r = state.ride, gen = r.generation;
  document.getElementById("map-note").innerHTML =
    `<b>${r.family === "stress" ? "Stress ride" : "Detour ride"}</b> · ${r.family === "stress" ? "sampled at T = 1" : `greedy, forced with p = ${gen.forcing.p}`}<br>` +
    `origin ${r.shortest_hops} moves from the goal · ${r.n_moves} moves · <span class="outcome-${r.outcome}">${r.outcome_label}</span>${r.category_label ? ` · ${r.category_label}` : ""}`;
  document.getElementById("foot-model").textContent = `Rides from ${r.model.checkpoint}, ${r.model.architecture}.`;
  const playBtn = document.getElementById("btn-play");
  playBtn.innerHTML = state.playing
    ? '<svg viewBox="0 0 14 14"><path d="M3 2h3v10H3zM8 2h3v10H8z"/></svg>'
    : '<svg viewBox="0 0 14 14"><path d="M3 2l9 5-9 5z"/></svg>';
  playBtn.setAttribute("aria-label", state.playing ? "Pause" : "Play");
  history.replaceState(null, "", `#ride=${state.rideId}&step=${state.step}`);
}

function setStep(k) {
  const n = state.ride.steps.length - 1;
  state.step = Math.max(0, Math.min(n, k));
  render();
}

function play() {
  if (state.playing) return;
  if (state.step >= state.ride.steps.length - 1) state.step = 0;
  state.playing = true;
  const tick = () => {
    if (state.step >= state.ride.steps.length - 1) { stop(); render(); return; }
    setStep(state.step + 1);
  };
  timer = setInterval(tick, 260 / state.speed);
  render();
}
function stop() { state.playing = false; if (timer) { clearInterval(timer); timer = null; } }
function toggle() { if (state.playing) { stop(); render(); } else play(); }

function bindTransport() {
  document.getElementById("btn-play").addEventListener("click", toggle);
  document.getElementById("btn-start").addEventListener("click", () => { stop(); setStep(0); });
  document.getElementById("btn-end").addEventListener("click", () => { stop(); setStep(Infinity); });
  document.getElementById("btn-back").addEventListener("click", () => { stop(); setStep(state.step - 1); });
  document.getElementById("btn-fwd").addEventListener("click", () => { stop(); setStep(state.step + 1); });
  document.getElementById("speed").addEventListener("change", e => { state.speed = +e.target.value; if (state.playing) { stop(); play(); } });
  document.addEventListener("keydown", e => {
    if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT") return;
    const ten = e.shiftKey ? 10 : 1;
    if (e.key === " ") { e.preventDefault(); toggle(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); stop(); setStep(state.step + ten); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); stop(); setStep(state.step - ten); }
    else if (e.key === "Home") { e.preventDefault(); stop(); setStep(0); }
    else if (e.key === "End") { e.preventDefault(); stop(); setStep(Infinity); }
  });
  for (const id of ["compass", "wrong", "future"]) {
    document.getElementById(`ov-${id}`).addEventListener("change", e => { views.map.setOverlays({ [id]: e.target.checked }); render(); });
  }
}

function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  return { ride: h.get("ride"), step: parseInt(h.get("step") || "0", 10) || 0 };
}

async function main() {
  const [rawWorld, idx] = await Promise.all([loadJSON("data/manhattan.json"), loadJSON(DATA + "index.json")]);
  world = prepareWorld(rawWorld);
  index = idx;
  views = {
    map: new MapView(document.getElementById("map"), world),
    timeline: new TimelineView(document.getElementById("timeline")),
    prediction: new PredictionView(document.getElementById("panel-prediction")),
    position: new PositionView(document.getElementById("panel-position")),
    compass: new CompassView(document.getElementById("panel-compass")),
  };
  views.timeline.onScrub = k => { stop(); setStep(k); };
  views.position.onHover = which => { state.hover = which; render(); };
  fillPicker();
  bindTransport();
  window.addEventListener("resize", debounce(() => { views.map.resize(); views.timeline.resize(); render(); }, 120));
  const h = readHash();
  await selectRide(h.ride || index.rides[0].id, h.step);
  // a shared link pasted into an open tab: follow it
  window.addEventListener("hashchange", () => {
    const g = readHash();
    if (!g.ride) return;
    if (g.ride !== state.rideId) selectRide(g.ride, g.step);
    else if (g.step !== state.step) { stop(); setStep(g.step); }
  });
}

main().catch(err => {
  console.error(err);
  document.getElementById("map-note").textContent = `Could not load the explorer data: ${err.message}`;
});
