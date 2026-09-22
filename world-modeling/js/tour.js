// A guided first visit: a sequence of cards, each spotlighting one part of the explorer, with Back / Next
// and a way out at every step. Runs once per browser (remembered in localStorage) and can be replayed from
// the "tour" link in the header. Texts follow the paper's wording; the ? buttons hold the longer versions.

import { el } from "./util.js";

const DONE_KEY = "explorer-tour-done";

const STEPS = [
  {
    target: "#intro",
    title: "A model that learned Manhattan from taxi rides",
    body: `TaxiGPT is a transformer trained by Vafa et al. on sequences of taxi turns across Manhattan. It
      never sees a map. The paper asks whether it builds one anyway, and finds that it does: intersections
      and streets are encoded inside it, and it uses them to keep track of where it is and to head for the
      goal. This page lets you watch that happen, one move at a time.`,
  },
  {
    target: "#map",
    title: "The ride",
    body: `The dot is where the ride started and the star is the goal. The yellow cab is the taxi at the
      current move, the dark line is the route so far, and the clay arrow is the move the model picks next.
      On detour rides a slate arrow marks a move forced on the model instead. If the model picks a turn
      with no street, the ride ends there with a red cross.`,
    place: "right",
  },
  {
    target: ".dash-head",
    title: "Inside the model",
    body: `Everything on this side is read from the model's internal state at the same move: the residual
      stream, decoded with features fitted on other rides. Each panel says which layer of the 48 it reads.`,
    place: "left",
  },
  {
    target: "#panel-prediction",
    title: "The next move",
    body: `The model's actual output: a probability for each of the eight turns and for END. Turns in red
      are illegal at the true intersection. Two mechanisms write into these scores: the active intersection
      feature favours legal moves, and the goal compass favours moves toward the goal. The last column shows
      how much the compass pushed each move.`,
    place: "left",
  },
  {
    target: "#panel-position",
    title: "The position code",
    body: `Every intersection has its own feature direction inside the model. The write is how strongly the
      true one is active. The map is stored in superposition, so directions overlap, and a wrong
      intersection can become the most active one when the write is weak and there is noise. That is how
      an off-graph move happens. Hover a readout to see that intersection on the map.`,
    place: "left",
  },
  {
    target: "#panel-compass",
    title: "The goal compass",
    body: `A circular feature that encodes the bearing to the goal. The plum needle is the bearing read
      from the model; the black line ending in a star is the true bearing. Hover the dial to see both drawn
      on the map.`,
    place: "left",
  },
  {
    target: ".timeline-panel",
    title: "Position tracking over time",
    body: `The true intersection's write (green) and the strongest wrong intersection (red) at every move,
      with noise in grey. Where red crosses green, the model reads the wrong place. Click or drag here to
      move through the ride.`,
    place: "left",
  },
  {
    target: ".transport",
    title: "Play, step, explore",
    body: `Press play, or step with the arrow keys and the space bar. Choose other rides at the top right:
      stress rides sampled from the model, and detour rides where it is pushed off course. Every ? opens a
      longer explanation. Enjoy the ride.`,
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
      <p class="tour-body"></p>
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
  let r = t ? t.getBoundingClientRect() : { left: vw / 2, top: vh / 2, width: 0, height: 0, right: vw / 2, bottom: vh / 2 };
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
