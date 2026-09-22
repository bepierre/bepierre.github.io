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
const COMPASS_MARKS = [{ layer: 16, label: "compass read", color: "#6E5C7A" }];

export const HELP = {
  taxigpt: {
    title: "What TaxiGPT is",
    body: `<p>TaxiGPT is given an origin (●) and a destination (★), then generates moves one token at a time: for example, N, N, E means north, north, east. It must reach the destination and emit END. It learns from random walks without being given the map, so it tends to meander rather than always take the shortest route.</p>`,
  },
  inside: {
    title: "Inside the model",
    body: `<p>Inside its residual stream, the model represents intersections and the direction to its goal. It uses these representations to track where it is and choose where to go. The residual stream carries information from layer to layer; this dashboard lets you follow parts of that information as the taxi moves.</p>`,
    sketch: [...POSITION_MARKS, COMPASS_MARKS[0]],
  },
  prediction: {
    title: "Next move",
    body: `<p>At each step, the model decides which move to take next, or whether to stop with END. The bars show the probability it assigns to each choice. Red marks directions with no street at the taxi’s current intersection; the selected move is highlighted.</p>`,
  },
  effect: {
    title: "Compass effect",
    body: `<p>How much does the compass influence each move? We compare the model’s scores with and without the compass. A dot to the right means the compass raises that move’s score; a dot to the left means it lowers it. This separate measurement does not change the recorded ride.</p>`,
  },
  position: {
    title: "Position code",
    body: `<p>The model represents each intersection by a direction in its internal activity, which we call an intersection feature. The model activates the current intersection’s feature to represent where it is. We call the strength of this activation the position write. These features share a limited space, so activating one can also activate others: this is superposition. If the true-position signal is weak or noisy, a wrong feature can become most active.</p><p>Imagine a taxi driver drawing a map in a small notebook. When the page fills up, they draw the remaining streets over the ones already there. The streets are still recorded, but different parts of the city now overlap on the page. When the driver looks for their current position, several intersections occupy the same spot on the page. They may recognize the right location but follow streets belonging to another part of the city. Superposition creates a similar difficulty for the model: activating the feature for its true intersection also activates other intersection features.</p>`,
    sketch: POSITION_MARKS,
  },
  wrong: {
    title: "Strongest wrong intersection",
    body: `<p>The most active feature for an intersection other than the taxi’s actual position. Hover to see that intersection on the map.</p>`,
  },
  angle: {
    title: "Feature angle",
    body: `<p>The angle between the true intersection’s feature and the strongest wrong feature. Because intersection features are stored in superposition, activating the true feature also activates wrong features aligned with it. The smaller the angle, the stronger this effect.</p>`,
  },
  noise: {
    title: "Noise",
    body: `<p>The position code, where the intersection features lie, also contains noise. More noise can make a wrong intersection’s feature more active than the true one.</p>`,
  },
  sketch: {
    title: "The feature plane",
    body: `<p>This sketch illustrates how the true and wrong features compete, using their measured activations and angle. Across the dotted boundary, the wrong feature scores higher. The gray disc illustrates the noise measure; it is not an uncertainty region or the full noise vector.</p>`,
  },
  compass: {
    title: "Goal compass",
    body: `<p>The model uses a goal compass to encode the angle from its current intersection to the destination and guide its moves toward the goal. Steering the compass changes where the taxi goes.</p>`,
    sketch: COMPASS_MARKS,
  },
  trace: {
    title: "Position tracking over time",
    body: `<p>This plot follows the true and strongest wrong intersection features as the taxi moves. They often rise and fall together because of superposition: activating the true feature also activates wrong features aligned with it.</p>`,
  },
  stress: {
    title: "The stress test",
    body: `<p>The taxi starts farther from its destination than is typical in training. It chooses moves according to the model’s predicted probabilities. As the ride gets longer, the goal may still be far away: this challenges the model’s ability to keep track of its position.</p>`,
  },
  detour: {
    title: "The detour test",
    body: `<p>The test sometimes overrides the model’s choice with its least likely legal move, provided the goal can still be reached before the move limit. These repeated detours can leave the taxi far from its goal late in the ride, when keeping track of its position becomes harder.</p>`,
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
    body: `<p>A wrong intersection feature becomes more active than the true one, and the model makes an illegal move. The two features have a small angle between them, so activating the true feature also activates the wrong one.</p>`,
  },
  category_silent: {
    title: "Silent slip",
    body: `<p>The true intersection remains most active, yet the model makes an illegal move. Other active intersection features can still favor moves that are legal elsewhere but not here.</p>`,
  },
  category_full_corruption: {
    title: "Full corruption",
    body: `<p>The true intersection’s feature is weakly active, and a wrong feature at a large angle becomes most active. The model’s position code no longer reliably identifies where the taxi is.</p>`,
  },
  category_giveup: {
    title: "Give-up slip",
    body: `<p>Late in a ride, while the goal is still far away, the model activates a feature that encourages it to stop. The position code is also noisy in this regime, and illegal moves can still occur.</p>`,
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
