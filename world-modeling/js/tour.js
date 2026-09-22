// A guided first visit: a sequence of cards, each spotlighting one part of the explorer, with Back / Next
// and a way out at every step. Runs once per browser (remembered in localStorage) and can be replayed from
// the "tour" link in the header. Texts follow the paper's wording; the ? buttons hold the longer versions.

import { el } from "./util.js";

const DONE_KEY = "explorer-tour-done";

const STEPS = [
  {
    target: "#intro",
    title: "A model that learns an internal map",
    body: `TaxiGPT is trained on random walks through Manhattan, without being given the map. It receives an origin (●) and a destination (★), then predicts moves such as N, N, E: north, north, east. We find that it learns an internal map and uses it to localize itself and navigate. Here you can follow a ride and look inside the model at each step.`,
  },
  {
    target: "#map",
    title: "The ride",
    body: `The taxi travels from the origin (●) toward the goal (★). The route shows where it has been, and the arrow shows its next move. It tends to meander, like its training rides. In the detour test, some moves are forced instead. A red cross marks an illegal move (there is no street in that direction).`,
    place: "right",
  },
  {
    target: ".dash-head",
    title: "Inside the model",
    body: `Inside the model’s residual stream, we find representations used by two world-modeling capacities: a position code for localizing itself and a goal compass for navigating toward its destination. The panels show how these representations change as the taxi moves.`,
    place: "left",
  },
  {
    target: "#moves > .hdr:not(.effect), #moves > .lbl, #moves > .track, #moves > .val",
    title: "Next move",
    body: `At each step, the model decides which move to take next, or whether to stop with END. The bars show the probability it assigns to each choice. Red marks directions with no street at the taxi’s current intersection.`,
    place: "left",
  },
  {
    target: "#panel-position",
    title: "Position code",
    body: `<p>Each intersection has a feature inside the model. The model activates the current intersection’s feature to represent where it is; the strength of this activation is the position write. Activating one feature can also activate others (because of superposition). If the true-position signal is weak or there is a lot of noise, a wrong feature can become most active.</p><p>Imagine a taxi driver learning their way around Manhattan and drawing the streets in a small notebook. At first, there is plenty of room. But as they discover more of the city, the page fills up. Rather than leave streets out, they start drawing new parts of the map on top of the ones already there. Later, when they mark their position with an X, it lands on two overlapping parts of the map. They can then confuse which of the two places they are actually in. Similarly, TaxiGPT can confuse its current intersection with another whose feature is superposed with it.</p>`,
    place: "left",
  },
  {
    target: "#panel-compass",
    title: "Goal compass",
    body: `The goal compass is a circular feature that encodes the angle from the current intersection to the destination. The model uses it to guide its moves toward the goal.`,
    place: "left",
  },
  {
    target: "#moves > .effect",
    title: "Compass effect",
    body: `We compare the model’s scores with and without the compass. A dot to the right means the compass raises that move’s score; a dot to the left means it lowers it.`,
    place: "left",
  },
  {
    target: ".timeline-panel",
    title: "Position tracking over time",
    body: `This plot follows the true and strongest wrong intersection features as the taxi moves. They often rise and fall together because of superposition: activating the true feature also activates wrong features aligned with it. Click or drag along the plot to inspect a particular step.`,
    place: "left",
  },
  {
    target: ".transport",
    title: "Explore the rides",
    body: `Press play to watch a ride, or use the arrow keys to step through it. Space pauses or resumes playback. Choose another ride from the menu: stress rides start farther from the goal than in training, while detour rides include forced moves. The ? buttons explain what each panel shows.`,
    place: "top",
    last: true,
  },
];

let idx = 0, root = null, onStep = null, onEnd = null, keyHandler = null, resizeHandler = null;

function build() {
  root = el("div", { class: "tour", role: "dialog", "aria-label": "Guided tour" }, document.body);
  root.innerHTML = `
    <svg class="tour-shade" aria-hidden="true"><defs><mask id="tour-mask"><rect width="100%" height="100%" fill="#fff"/><rect class="tour-hole" rx="8" fill="#000"/></mask></defs><rect width="100%" height="100%" mask="url(#tour-mask)"/></svg>
    <div class="tour-card">
      <div class="tour-count"></div>
      <h3 class="tour-title"></h3>
      <div class="tour-body"></div>
      <div class="tour-nav">
        <button type="button" class="tour-skip">Skip the tour</button>
        <span class="tour-spacer"></span>
        <button type="button" class="tour-back">Back</button>
        <button type="button" class="tour-next">Next</button>
      </div>
    </div>`;
  root.querySelector(".tour-skip").addEventListener("click", finish);
  root.querySelector(".tour-back").addEventListener("click", () => go(idx - 1));
  root.querySelector(".tour-next").addEventListener("click", () => (STEPS[idx].last ? finish() : go(idx + 1)));
  root.addEventListener("pointerdown", e => { if (e.target.classList.contains("tour-shade") || e.target.tagName === "rect") finish(); });
  keyHandler = e => {
    if (e.key === "Escape") { e.preventDefault(); finish(); }
    else if (e.key === "ArrowRight" || e.key === "Enter" || e.key === " ") { e.preventDefault(); STEPS[idx].last ? finish() : go(idx + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(idx - 1); }
    e.stopPropagation();
  };
  document.addEventListener("keydown", keyHandler, true);
  resizeHandler = () => place();
  window.addEventListener("resize", resizeHandler);
}

function go(i) {
  idx = Math.max(0, Math.min(STEPS.length - 1, i));
  const s = STEPS[idx];
  root.querySelector(".tour-count").textContent = `${idx + 1} of ${STEPS.length}`;
  root.querySelector(".tour-title").textContent = s.title;
  root.querySelector(".tour-body").innerHTML = s.body;
  root.querySelector(".tour-back").hidden = idx === 0;
  root.querySelector(".tour-next").textContent = s.last ? "Start exploring" : "Next";
  if (onStep) onStep(idx);
  const t = document.querySelector(s.target);
  // narrow screens: the card sits at the bottom, so bring the target to the top; otherwise just into view
  if (t && t.scrollIntoView) t.scrollIntoView({ block: window.innerWidth < 700 ? "start" : "nearest", behavior: "instant" });
  if (window.innerWidth < 700) window.scrollBy(0, -12);
  place();
  root.querySelector(".tour-next").focus({ preventScroll: true });
}

function place() {
  const s = STEPS[idx], t = document.querySelector(s.target);
  const hole = root.querySelector(".tour-hole"), card = root.querySelector(".tour-card");
  const vw = window.innerWidth, vh = window.innerHeight, m = 12;
  const rects = [...document.querySelectorAll(s.target)].map(el => el.getBoundingClientRect());
  let r = { left: vw / 2, top: vh / 2, width: 0, height: 0, right: vw / 2, bottom: vh / 2 };
  if (rects.length) {
    r = { left: Math.min(...rects.map(b => b.left)), top: Math.min(...rects.map(b => b.top)),
          right: Math.max(...rects.map(b => b.right)), bottom: Math.max(...rects.map(b => b.bottom)) };
    r.width = r.right - r.left; r.height = r.bottom - r.top;
  }
  const pad = 8;
  hole.setAttribute("x", r.left - pad); hole.setAttribute("y", r.top - pad);
  hole.setAttribute("width", r.width + 2 * pad); hole.setAttribute("height", r.height + 2 * pad);
  // card: preferred side, else wherever it fits; on narrow screens it sits at the bottom
  const cw = card.offsetWidth, ch = card.offsetHeight;
  let x, y;
  if (vw < 700) { x = m; y = vh - ch - m; }
  else {
    const fits = { right: r.right + pad + m + cw <= vw, left: r.left - pad - m - cw >= 0, bottom: r.bottom + pad + m + ch <= vh, top: r.top - pad - m - ch >= 0 };
    const order = [s.place || "bottom", "bottom", "right", "left", "top"].filter(p => fits[p]);
    const p = order[0] || "bottom";
    if (p === "right") { x = r.right + pad + m; y = r.top; }
    else if (p === "left") { x = r.left - pad - m - cw; y = r.top; }
    else if (p === "top") { x = r.left; y = r.top - pad - m - ch; }
    else { x = r.left; y = r.bottom + pad + m; }
    x = Math.max(m, Math.min(vw - cw - m, x));
    y = Math.max(m, Math.min(vh - ch - m, y));
  }
  card.style.left = `${x}px`; card.style.top = `${y}px`;
}

function finish() {
  if (!root) return;
  document.removeEventListener("keydown", keyHandler, true);
  window.removeEventListener("resize", resizeHandler);
  root.remove(); root = null;
  try { localStorage.setItem(DONE_KEY, "1"); } catch (_) { /* storage may be unavailable */ }
  if (onEnd) onEnd();
}

export function startTour(opts = {}) {
  if (root) return;
  onStep = opts.onStep || null; onEnd = opts.onEnd || null;
  build();
  go(0);
}

export function tourSeen() {
  try { return localStorage.getItem(DONE_KEY) === "1"; } catch (_) { return true; }
}
