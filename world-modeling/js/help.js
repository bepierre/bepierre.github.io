// Help: a small circled "?" that opens an explanation on hover, pins on click, and closes on Escape or a
// click elsewhere. Texts follow the paper's wording; a few carry an analogy. Some carry a sketch of the
// model showing the layer a readout comes from.

import { el, svg, P } from "./util.js";

const N_LAYERS = 48;

// A simplified transformer, drawn left to right: the moves so far enter on the left, the residual stream
// passes through 48 layers, the next-move prediction leaves on the right. Marked layers are where a
// readout is taken (or an intervention made).
function layerSketch(marks) {
  const W = 316, barW = 4, gap = 2, left = 22, top = 30, barH = 22;
  const H = top + barH + 30;
  const s = svg("svg", { class: "layer-sketch", viewBox: `0 0 ${W} ${H}`, width: W, height: H, "aria-hidden": "true" });
  const x = n => left + (n - 1) * (barW + gap);
  for (let n = 1; n <= N_LAYERS; n++) svg("rect", { x: x(n), y: top, width: barW, height: barH, fill: P.grid }, s);
  const arrow = (x1, x2, y) => {
    svg("line", { x1, y1: y, x2, y2: y, stroke: P.muted, "stroke-width": 1 }, s);
    svg("path", { d: `M${x2 - 4} ${y - 3}L${x2} ${y}L${x2 - 4} ${y + 3}`, fill: "none", stroke: P.muted, "stroke-width": 1 }, s);
  };
  arrow(2, left - 2, top + barH / 2);
  arrow(x(N_LAYERS) + barW + 2, W - 2, top + barH / 2);
  svg("text", { x: 2, y: H - 4, class: "lab", text: "moves so far" }, s);
  svg("text", { x: W - 2, y: H - 4, "text-anchor": "end", class: "lab", text: "next move" }, s);
  svg("text", { x: x(1), y: top + barH + 11, class: "lab", text: "layer 1" }, s);
  svg("text", { x: x(N_LAYERS) + barW, y: top + barH + 11, "text-anchor": "end", class: "lab", text: "48" }, s);
  marks.forEach((m, i) => {
    const xx = x(m.layer) + barW / 2;
    svg("rect", { x: x(m.layer) - 1, y: top - 2, width: barW + 2, height: barH + 4, fill: m.color }, s);
    // labels above, staggered so neighbouring layers do not collide
    const ly = top - 6 - (i % 2) * 11;
    svg("line", { x1: xx, y1: top - 3, x2: xx, y2: ly + 2, stroke: m.color, "stroke-width": 1 }, s);
    svg("text", { x: xx + 3, y: ly, class: "lab", fill: m.color, text: `layer ${m.layer}: ${m.label}` }, s);
  });
  return s;
}
const POSITION_MARKS = [{ layer: 18, label: "position read", color: P.good }];
const COMPASS_MARKS = [{ layer: 16, label: "compass read", color: "#6E5C7A" }, { layer: 18, label: "compass removed", color: P.muted }];

export const HELP = {
  taxigpt: {
    title: "What TaxiGPT is",
    body: `<p>TaxiGPT learns to predict moves from random walks through Manhattan, without being given the map. It learns to meander like its training rides rather than always taking the shortest route. We find that it represents intersections and streets, tracks its position, and uses a goal compass to navigate.</p>`,
  },
  inside: {
    title: "Inside the model",
    body: `<p>These readouts come from the residual stream, the vector passed from layer to layer. We extract intersection features and the goal compass using diff-means: differences between average activations across groups of rides. The next-move logits are the model’s output.</p>`,
    sketch: [...POSITION_MARKS, COMPASS_MARKS[0]],
  },
  prediction: {
    title: "Next move",
    body: `<p>Two complementary mechanisms shape the model’s move predictions. The active intersection feature increases the logits of legal moves and decreases those of illegal ones. The goal compass increases the logits of moves toward the goal and decreases those of moves away from it.</p>`,
  },
  effect: {
    title: "Compass effect",
    body: `<p>We remove the compass at the current state and compare the prediction with the original. The effect is the original logit minus the ablated logit: a dot to the right means the compass increased that move’s logit. This separate measurement does not change the recorded ride.</p>`,
  },
  position: {
    title: "Position code",
    body: `<p>The model localizes itself by reading active intersection features in a look-back window of past residual streams. The position write measures how strongly the true intersection’s feature is active. These features are stored in superposition: when the write is weak and noise is high, a wrong intersection can become most active.</p>`,
    sketch: POSITION_MARKS,
  },
  wrong: {
    title: "Strongest wrong intersection",
    body: `<p>The most active intersection feature other than the true one. It can change at each step. When it exceeds the true feature, the position readout is wrong, though the next move may still be legal. Hover to find this intersection on the map.</p>`,
  },
  angle: {
    title: "Feature angle",
    body: `<p>The angle between the true and strongest wrong intersection features. Features close in direction tend to share legal moves: this affordance packing limits the consequences of confusing them. Larger angles tend to mean fewer shared legal moves. This is an angle in feature space, not a distance on the map.</p>`,
  },
  noise: {
    title: "Noise",
    body: `<p>Activity beyond the true-position write varies across visits and spreads across many intersection directions, which is why we interpret it as noise. The displayed measure summarizes activity along sampled intersection directions. In the paper, noise grows with ride depth while the write weakens with distance to the goal.</p>`,
  },
  sketch: {
    title: "The feature plane",
    body: `<p>This sketch illustrates how the true and wrong features compete, using their measured activations and angle. Across the dotted boundary, the wrong feature scores higher. The gray disc illustrates the noise measure; it is not an uncertainty region or the full noise vector.</p>`,
  },
  compass: {
    title: "Goal compass",
    body: `<p>The goal compass encodes the bearing from the current intersection to the goal. The plum needle shows the model’s decoded bearing; the black line and star point toward the goal. Steering the compass changes where the model goes; removing it preserves move legality but strongly reduces goal-reaching.</p>`,
    sketch: COMPASS_MARKS,
  },
  trace: {
    title: "Activation trace",
    body: `<p>Green follows the true-position write; red follows the strongest wrong feature, whose identity can change. Superposition helps explain why they often rise and fall together: activating the true feature also activates wrong features superposed with it. Noise uses the right-hand scale. Click or drag to move through the ride.</p>`,
  },
  stress: {
    title: "The stress test",
    body: `<p>The model generates rides between sampled origin–destination pairs at temperature 1. These pairs start farther apart than in training, making the task challenging. In the paper, the model reaches the goal on 81% of pairs and makes an off-graph move on 8.5% of rides.</p>`,
  },
  detour: {
    title: "The detour test",
    body: `<p>With probability 0.75, the test imposes the least-likely legal move that keeps the goal reachable within the remaining budget; otherwise the model predicts greedily. Repeated forcing creates deep-and-far, unlikely rides on which the position write weakens. In the paper’s diagnostic run, about a quarter of rides end in an illegal move.</p>`,
  },
  forced: {
    title: "Forced move",
    body: `<p>A move imposed by the detour test. The slate arrow shows the forced move; the dashed clay arrow shows what the model proposed instead.</p>`,
  },
  illegal: {
    title: "Illegal move",
    body: `<p>There is no street in the selected direction at the current intersection. The ride ends at this attempted move, marked by a red cross.</p>`,
  },
  category_fatal_slip: {
    title: "Fatal superposition slip",
    body: `<p>A wrong intersection becomes most active while remaining close to the true feature in direction, and the model emits an illegal move. In the paper, removing the wrong feature or strengthening the true-position write reduces illegal-move probability.</p>`,
  },
  category_silent: {
    title: "Silent slip",
    body: `<p>The true intersection remains most active, yet the model emits an illegal move. Co-active wrong features can still raise illegal-move logits. The classification checks for a co-active feature where the highest-logit illegal move is legal; it need not be the move sampled. Removing position noise strongly reduces illegal probability in these states.</p>`,
  },
  category_full_corruption: {
    title: "Full corruption",
    body: `<p>The true-position write is weak, and the strongest wrong feature lies far from it in feature space. Removing that feature alone helps less than clearing position noise or restoring the write: more than one competing intersection contributes to the failure.</p>`,
  },
  category_giveup: {
    title: "Give-up slip",
    body: `<p>Deep in a ride, with the goal still far away, a give-up feature becomes active and promotes stopping. The residual is enlarged and position noise is high. Illegal moves can still occur in this regime; clearing position noise substantially reduces their probability.</p>`,
  },
};

let open = null;     // { key, btn, pinned }
let layer = null;

function ensureLayer() {
  if (!layer) { layer = el("div", { class: "help-pop", role: "dialog", hidden: "" }, document.body); layer.hidden = true; }
  return layer;
}

function show(key, btn, pinned) {
  const h = HELP[key];
  if (!h) return;
  const pop = ensureLayer();
  pop.innerHTML = "";
  const head = el("div", { class: "help-head" }, pop);
  el("b", { text: h.title }, head);
  const close = el("button", { class: "help-close", "aria-label": "Close", text: "×" }, head);
  close.addEventListener("click", hide);
  const body = el("div", { class: "help-body", html: h.body }, pop);
  if (h.sketch) { body.classList.add("with-sketch"); body.appendChild(layerSketch(h.sketch)); }
  pop.classList.toggle("pinned", pinned);
  pop.hidden = false;
  // place below the button, flipped above or shifted left when it would leave the viewport
  const r = btn.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight, m = 8;
  let x = r.left, y = r.bottom + 6;
  if (x + pw > window.innerWidth - m) x = window.innerWidth - m - pw;
  if (y + ph > window.innerHeight - m) y = Math.max(m, r.top - 6 - ph);
  pop.style.left = `${x}px`; pop.style.top = `${y}px`;
  for (const b of document.querySelectorAll(".help.on")) b.classList.remove("on");
  btn.classList.add("on");
  open = { key, btn, pinned };
}
function hide() {
  if (!open) return;
  open.btn.classList.remove("on");
  ensureLayer().hidden = true;
  open = null;
}

let bound = false;
function bindGlobal() {
  if (bound) return; bound = true;
  document.addEventListener("keydown", e => { if (e.key === "Escape") hide(); });
  document.addEventListener("pointerdown", e => {
    if (!open) return;
    if (ensureLayer().contains(e.target) || e.target.closest(".help")) return;
    hide();
  });
  ensureLayer().addEventListener("mouseleave", () => { if (open && !open.pinned) hide(); });
}

// Make a help button for a key. Hover shows, click pins (click again unpins and closes).
export function helpButton(key) {
  bindGlobal();
  const b = el("button", { class: "help", type: "button", "aria-label": `About ${HELP[key]?.title || key}`, "data-help": key, text: "?" });
  let leaveTimer = null;
  b.addEventListener("mouseenter", () => { clearTimeout(leaveTimer); if (!open || !open.pinned || open.key !== key) show(key, b, open?.pinned && open.key === key); });
  b.addEventListener("mouseleave", () => {
    leaveTimer = setTimeout(() => { if (open && !open.pinned && open.key === key && !ensureLayer().matches(":hover")) hide(); }, 180);
  });
  b.addEventListener("click", e => {
    e.preventDefault();
    if (open && open.key === key && open.pinned) hide();
    else show(key, b, true);
  });
  b.addEventListener("focus", () => show(key, b, false));
  b.addEventListener("blur", () => { if (open && !open.pinned && open.key === key) hide(); });
  return b;
}

// Put a help button after an element (or its first child when a selector is given).
export function attachHelp(target, key) {
  const t = typeof target === "string" ? document.querySelector(target) : target;
  if (!t) return null;
  const b = helpButton(key);
  t.appendChild(b);
  return b;
}
