// The explorer: one state object (ride, step, playing, hover), fanned out to every view on each change.

import { MOVES, debounce } from "./util.js";
import { MapView } from "./map.js";
import { TimelineView } from "./timeline.js";
import { PredictionView, PositionView, CompassView } from "./panels.js";
import { attachHelp, helpButton, HELP } from "./help.js";
import { startTour, tourSeen } from "./tour.js";

const DATA = new URLSearchParams(location.search).get("dataset") === "demo" ? "data/demo/" : "data/recorded-v1/";
const DEFAULT_RIDE = "stress-0001";   // the landing ride: a long successful ride that shows most of the island
const STEP_MS = 260;          // one move at 1×
const RIDE_GAP_MS = 1100;     // pause between rides when playing them all

const state = { ride: null, rideId: null, step: 0, playing: false, playAll: false, speed: 1, hover: null, hinted: false };
let world, index, views, timer = null, gapTimer = null;

async function loadJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

function prepareWorld(raw) {
  // nodes keyed by id → [x, y]; the mean bearing of each move label on this street grid, so arrows for a
  // move without a street (an attempted illegal move) still point along the grid
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
  // hand focus back to the page after a choice so the arrow keys drive the ride, not the list
  sel.addEventListener("change", () => { selectRide(sel.value, 0); sel.blur(); });
  document.getElementById("ride-prev").addEventListener("click", () => stepRide(-1));
  document.getElementById("ride-next").addEventListener("click", () => stepRide(1));
  document.getElementById("hint-next").addEventListener("click", async () => { await stepRide(1); play(); });
  sel.addEventListener("focus", () => { document.getElementById("ride-hint").hidden = true; });
  document.getElementById("play-all").addEventListener("click", () => {
    if (state.playAll) { state.playAll = false; stop(); render(); }
    else { state.playAll = true; if (!state.playing) play(); else render(); }
  });
}

function rideIndex() { return Math.max(0, index.rides.findIndex(r => r.id === state.rideId)); }
async function stepRide(d) {
  const i = (rideIndex() + d + index.rides.length) % index.rides.length;
  const keepPlaying = state.playing;
  await selectRide(index.rides[i].id, 0);
  if (keepPlaying) play();
}

async function selectRide(id, step = 0) {
  const entry = index.rides.find(r => r.id === id) || index.rides[0];
  const ride = await loadJSON(DATA + entry.file);
  ride.moveBearing = world.moveBearing;
  // intersections without historical coordinates sit at an interpolated map position; the export leaves
  // their goal bearing empty, so take it from the same position the map draws
  const g = world.nodes[ride.goal];
  for (const s of ride.steps) {
    const p = world.nodes[s.node];
    if (s.goal_bearing_deg === null && s.node !== ride.goal && p && g) {
      s.goal_bearing_deg = Math.round(Math.atan2(g[1] - p[1], g[0] - p[0]) * 1800 / Math.PI) / 10;
      s.goal_bearing_status = "approximate";
    }
  }
  stop();
  state.ride = ride; state.rideId = entry.id; state.hover = null; state.hinted = false;
  document.getElementById("ride-hint").hidden = true;
  state.step = Math.max(0, Math.min(ride.steps.length - 1, step));
  document.getElementById("ride").value = entry.id;
  for (const v of Object.values(views)) v.setRide(ride);
  render();
}

function render() {
  if (!state.ride) return;
  for (const v of Object.values(views)) v.render(state);
  const r = state.ride, gen = r.generation, n = r.steps.length - 1, s = r.steps[state.step];
  document.getElementById("status-step").textContent = state.step;
  document.getElementById("status-of").textContent = `of ${n}`;
  document.getElementById("status-goal").textContent = s.dist_to_goal === 0 ? "at the goal" : `${s.dist_to_goal} moves from goal`;
  const note = document.getElementById("map-note");
  note.innerHTML =
    `<b>${r.family === "stress" ? "Stress ride" : "Detour ride"}</b> · ${r.family === "stress" ? "moves sampled from the model’s predictions" : "the model’s choices are sometimes overridden"}<span id="help-family"></span><br>` +
    `origin ${r.shortest_hops} moves from the goal · ${r.n_moves} moves · <span class="outcome-${r.outcome}">${r.outcome_label}</span>${r.category_label ? ` · ${r.category_label}<span id="help-category"></span>` : ""}`;
  note.querySelector("#help-family").appendChild(helpButton(r.family));
  if (r.category && HELP[`category_${r.category}`]) note.querySelector("#help-category").appendChild(helpButton(`category_${r.category}`));
  document.getElementById("legend-forced").hidden = r.family !== "detour";   // stress rides force nothing
  document.getElementById("legend-illegal").hidden = r.outcome !== "illegal";  // only rides that end off the graph
  document.getElementById("foot-model").textContent = `Rides from ${r.model.checkpoint}, ${r.model.architecture};`;
  const playBtn = document.getElementById("btn-play");
  playBtn.innerHTML = state.playing
    ? '<svg viewBox="0 0 14 14"><path d="M3 2h3v10H3zM8 2h3v10H8z"/></svg>'
    : '<svg viewBox="0 0 14 14"><path d="M3 2l9 5-9 5z"/></svg>';
  playBtn.setAttribute("aria-label", state.playing ? "Pause" : "Play");
  document.getElementById("play-all").classList.toggle("on", state.playAll);
  const hint = document.getElementById("ride-hint");
  if (state.step === n && !state.playAll && !state.hinted) { state.hinted = true; hint.hidden = false; }
  else if (state.step < n && !hint.hidden) hint.hidden = true;
  history.replaceState(null, "", `#ride=${state.rideId}&step=${state.step}`);
}

function setStep(k) {
  state.step = Math.max(0, Math.min(state.ride.steps.length - 1, k));
  render();
}

function play() {
  if (state.playing) return;
  if (state.step >= state.ride.steps.length - 1) state.step = 0;
  state.playing = true;
  timer = setInterval(() => {
    if (state.step >= state.ride.steps.length - 1) {
      clearInterval(timer); timer = null;
      if (state.playAll) { gapTimer = setTimeout(() => { gapTimer = null; state.playing = false; stepRide(1); }, RIDE_GAP_MS); render(); }
      else { state.playing = false; render(); }
      return;
    }
    setStep(state.step + 1);
  }, STEP_MS / state.speed);
  render();
}
function stop() {
  state.playing = false;
  if (timer) { clearInterval(timer); timer = null; }
  if (gapTimer) { clearTimeout(gapTimer); gapTimer = null; }
}
function toggle() { if (state.playing) { state.playAll = false; stop(); render(); } else play(); }

function bindTransport() {
  document.getElementById("btn-play").addEventListener("click", toggle);
  document.getElementById("btn-start").addEventListener("click", () => { stop(); setStep(0); });
  document.getElementById("btn-end").addEventListener("click", () => { stop(); setStep(Infinity); });
  document.getElementById("btn-back").addEventListener("click", () => { stop(); setStep(state.step - 1); });
  document.getElementById("btn-fwd").addEventListener("click", () => { stop(); setStep(state.step + 1); });
  const speed = document.getElementById("speed");
  speed.addEventListener("change", e => { state.speed = +e.target.value; if (state.playing) { stop(); play(); } speed.blur(); });
  document.addEventListener("keydown", e => {
    if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT") return;
    const ten = e.shiftKey ? 10 : 1;
    if (e.key === " ") { e.preventDefault(); toggle(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); stop(); setStep(state.step + ten); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); stop(); setStep(state.step - ten); }
    else if (e.key === "Home") { e.preventDefault(); stop(); setStep(0); }
    else if (e.key === "End") { e.preventDefault(); stop(); setStep(Infinity); }
    else if (e.key === "PageDown" || e.key === "]") { e.preventDefault(); stepRide(1); }
    else if (e.key === "PageUp" || e.key === "[") { e.preventDefault(); stepRide(-1); }
  });
}

function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  return { ride: h.get("ride"), step: parseInt(h.get("step") || "0", 10) || 0 };
}

async function main() {
  const [rawWorld, idx] = await Promise.all([loadJSON(DATA === "data/demo/" ? "data/manhattan.json" : DATA + "manhattan.json"), loadJSON(DATA + "index.json")]);
  world = prepareWorld(rawWorld);
  index = idx;
  const dataNote = document.getElementById("data-note");
  if (dataNote) dataNote.textContent = idx.dataset === "demo"
    ? "Fields marked illustrative are generated, not measured."
    : "All readouts are measured. Some map coordinates are interpolated; unavailable geographic bearings are omitted.";
  views = {   // the timeline last: it takes whatever height the panels above it leave
    map: new MapView(document.getElementById("map"), world),
    prediction: new PredictionView(document.getElementById("panel-prediction")),
    position: new PositionView(document.getElementById("panel-position")),
    compass: new CompassView(document.getElementById("panel-compass")),
    timeline: new TimelineView(document.getElementById("timeline")),
  };
  views.timeline.onScrub = k => { stop(); setStep(k); };
  views.position.onHover = which => { state.hover = which; render(); };
  views.compass.onHover = which => { state.hover = which; render(); };
  views.prediction.onHover = which => { state.hover = which; render(); };
  fillPicker();
  bindTransport();
  for (const [id, key] of [["help-taxigpt", "taxigpt"], ["help-prediction", "prediction"], ["help-position", "position"],
                           ["help-compass", "compass"], ["help-trace", "trace"]]) {
    attachHelp(`#${id}`, key);
  }
  window.addEventListener("resize", debounce(() => { views.map.resize(); views.timeline.resize(); render(); }, 120));
  const h = readHash();
  await selectRide(h.ride || (index.rides.some(r => r.id === DEFAULT_RIDE) ? DEFAULT_RIDE : index.rides[0].id), h.step);
  // the guided tour runs on every visit until it has been completed or skipped once (?tour=1 replays it)
  const params = new URLSearchParams(location.search);
  const tour = () => {
    stop();
    if (state.step === 0) setStep(Math.min(30, state.ride.steps.length - 1));   // a mid-ride state has more to show
    startTour();
  };
  document.getElementById("tour-btn").addEventListener("click", e => { e.currentTarget.blur(); tour(); });
  if ((!tourSeen() && !params.has("notour")) || params.has("tour")) tour();
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
