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
    body: `<p>TaxiGPT is a GPT-2 XL transformer (48 layers × 1,600 dimensions) that Vafa et al. trained on
      taxi rides across Manhattan: each training sequence is an origin, a destination and the turns taken
      (N, NE, E, SE, S, SW, W, NW), ending with END. It never sees a map.</p>
      <p>The paper asks whether the model builds a world model of the city anyway, and finds that it does:
      intersections are encoded as features in the residual stream, streets are encoded as transitions
      between them, and the model exploits this internal map to localize itself and to navigate. It also
      explains why the model can still make off-graph moves: the map is stored in superposition, and out of
      distribution the position code becomes weak and noisy.</p>`,
  },
  inside: {
    title: "Inside the model",
    body: `<p>Everything on this side is read from the residual stream, the vector the model carries from
      layer to layer for the current token, using features fitted on other rides (differences of means).
      Different mechanisms live at different layers: intersection features decode best at layer 18, the goal
      compass at layer 16. The next-move logits are the model's actual output.</p>`,
    sketch: [...POSITION_MARKS, COMPASS_MARKS[0]],
  },
  prediction: {
    title: "Next move",
    body: `<p>At every intersection the model predicts the next token: one of the eight moves or END. Two
      mechanisms write into these logits. The active intersection feature raises the logits of legal moves
      and lowers those of illegal ones; the goal compass raises moves toward the goal and lowers moves away
      from it.</p>
      <p>Tokens in red are illegal at the true intersection. The bar the model chose is clay; a move imposed
      by the detour test is slate.</p>`,
  },
  effect: {
    title: "Compass effect",
    body: `<p>A compass readout is not the same as its effect on the prediction. To measure the effect the
      model is run twice on the same state, once as is and once with the compass plane removed at layer 18,
      and the change in each move's logit is shown. A dot to the right means the compass was pushing that
      move up.</p>
      <p>In the paper, removing the compass leaves moves legal but the model loses its way: goal-reaching
      falls from 94% to 23% for goals 18 to 32 moves away.</p>`,
  },
  position: {
    title: "Position code",
    body: `<p>Localization: the model carries a running position, read from a look-back window of past
      positions rather than recomputed from the moves. Each of the 4,516 intersections has its own feature
      direction in the residual stream, read here at layer 18. The <b>write</b> is how strongly the true
      intersection's feature is active.</p>
      <p>The map is stored in superposition: the 4,516 directions share a subspace of only 244 dimensions,
      so they overlap (a node's nearest neighbour is on average only 48° away). Picture a driver sketching
      all of Manhattan on a page far too small for it, so that many intersections end up drawn on top of
      each other. Usually it works; when the write is weak and there is noise, an overlapping wrong
      intersection can become the most active one, and a move that is legal there but not here becomes
      likely: an off-graph move.</p>`,
    sketch: POSITION_MARKS,
  },
  wrong: {
    title: "Strongest wrong intersection",
    body: `<p>Of all intersections other than the true one, the one whose direction is most active right
      now. It can change from step to step. Hover to see it on the map: it is often close by, because
      overlapping directions tend to belong to intersections with the same legal moves. When it beats the
      true one, the model has in effect lost track of where it is.</p>`,
  },
  angle: {
    title: "Feature angle",
    body: `<p>The angle between the true and the wrong intersection's directions. Nearby directions (cosine
      above 0.5) mostly belong to intersections offering the same legal moves, so confusing them is
      harmless; the paper calls this packing by affordance. The farther the wrong feature lies from the true
      direction, the fewer legal moves the two intersections share and the more likely an illegal move
      becomes.</p>`,
  },
  noise: {
    title: "Noise",
    body: `<p>Activity in the position subspace that is not the true-position write, measured as the
      root-mean-square projection on 96 fixed sampled intersection directions. It varies from visit to visit
      and is not confined to nearby intersections. In the paper, noise grows with ride depth while the write
      weakens with distance to the goal; both push the model out of the regime it was trained in.</p>`,
  },
  sketch: {
    title: "The feature plane",
    body: `<p>The plane spanned by the true and the wrong feature, two of the position code's 244 dimensions.
      The arrow is the residual's projection onto it: its component along the true feature is the write, the
      rest is the remainder. The grey disc is the measured noise. Past the dotted line the wrong feature
      scores higher than the true one.</p>`,
  },
  compass: {
    title: "Goal compass",
    body: `<p>Navigation: a circular representation in the residual stream, read at layer 16, that encodes
      the bearing from the current intersection to the goal, much like a clock hand pointing at the
      destination. The plum needle is the bearing decoded from the model; the black line ending in a star is
      the actual bearing. On held-out rides the median decoding error is 18°.</p>
      <p>It is causal: setting it north makes the taxi drive north, and removing it leaves the model
      following streets but missing the goal.</p>`,
    sketch: COMPASS_MARKS,
  },
  trace: {
    title: "Activation trace",
    body: `<p>The paper's Figure 4 for this ride: the true intersection's write (green) and the activation of
      the strongest wrong intersection (red) at every step, read at layer 18, with noise on the right-hand
      scale. The two rise and fall together: intersection features overlap, so strengthening the true one
      also raises the wrong ones that overlap with it. Where red crosses green the model reads the wrong
      intersection. Squares every 20 moves match the squares on the map. Click or drag to move through the
      ride.</p>`,
  },
  stress: {
    title: "The stress test",
    body: `<p>Vafa et al.'s test: the model generates rides between sampled origin–destination pairs at
      temperature 1. The pairs are a median of 32 moves apart, whereas training rides start 9 moves from
      their goal, so the model is far out of distribution. It still reaches the goal on 81% of pairs and can
      be located from its activations with 99% accuracy, but it takes an off-graph move on 8.5% of rides.</p>`,
  },
  detour: {
    title: "The detour test",
    body: `<p>At each move, with probability 0.75, the model's choice is overridden by its least-likely
      legal move (among those that keep the goal reachable within the remaining budget). Once the budget
      just suffices, forcing stops and the model continues greedily. Individual forced moves do not disrupt
      the position code, but because the least-likely move almost always points away from the goal, repeated
      forcing pushes the ride deep and far along routes the model finds unlikely, and the position write
      weakens.</p>`,
  },
  forced: {
    title: "Forced move",
    body: `<p>A move imposed by the detour test rather than chosen by the model. The slate arrow is the
      forced move; the dashed clay arrow is what the model proposed instead.</p>`,
  },
  illegal: {
    title: "Illegal move",
    body: `<p>A move token with no street: the taxi attempts it, leaves the street graph, and the ride
      ends there. No intersection is reached, so the red stub ends in a cross instead of at a node.</p>`,
  },
  category_fatal_slip: {
    title: "Fatal superposition slip",
    body: `<p>A wrong intersection whose feature lies close to the true one (cosine above 0.2) becomes the
      most active, and the model emits a move that is legal there but not here. The write is moderate and
      the noise modest; the position code has slipped to a neighbour in feature space.</p>`,
  },
  category_silent: {
    title: "Silent slip",
    body: `<p>The true intersection is still the most active one, yet the model emits an illegal move.
      Among the dozen or so most active intersections there is a supplier: a wrong node at which the emitted
      move is legal, active enough to feed that move into the logits.</p>`,
  },
  category_full_corruption: {
    title: "Full corruption",
    body: `<p>The write of the true intersection is weak (median 170 against 360 on clean states) and a
      wrong intersection far from it in feature space (cosine at most 0.2) is the most active. The position
      code no longer resembles the true state, and the move follows the wrong node.</p>`,
  },
  category_giveup: {
    title: "Give-up slip",
    body: `<p>The stopping direction is strongly active although the taxi is not at the goal, the residual
      is enlarged, and noise in the position code is high. The model behaves as if the ride were over and
      its next move is illegal.</p>`,
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
