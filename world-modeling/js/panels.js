// The dashboard panels: next-move prediction, position code (with the Fig. 3 plane sketch) and goal compass.
// Each panel renders from the current step; one provenance tag per panel comes from the ride file.

import { MOVES, TOKENS, MOVE_ANGLE, svg, clear, el, softmax, rad, wrap, fmtDeg, fmtNum, fmtPct } from "./util.js";

// one tag for a panel: recorded / illustrative / mixed, with the field list in the tooltip
function tag(prov, fields) {
  const kinds = fields.map(f => [f, prov[f] || ""]);
  const ill = kinds.filter(([, v]) => !v.startsWith("recorded") && !v.startsWith("derived")).map(([f]) => f.split(".").pop().replace(/_/g, " "));
  const kind = ill.length === 0 ? "recorded" : ill.length === kinds.length ? "illustrative" : "mixed";
  if (kind === "recorded") return "";     // measured data needs no label; the dataset note in the header says so
  return `<span class="tag ${kind}" title="illustrative: ${ill.join(", ")}">${kind === "mixed" ? "partly illustrative" : kind}</span>`;
}

// ── next move ─────────────────────────────────────────────────────────────────
export class PredictionView {
  constructor(root) {
    this.moves = root.querySelector("#moves");
    this.note = root.querySelector("#prediction-note");
    this.where = root.querySelector("#prediction-where");
  }
  setRide(ride) {
    this.ride = ride;
    const hasEffect = ride.steps.some(s => s.compass.ablation_delta_logit);
    clear(this.moves);
    this.moves.style.gridTemplateColumns = hasEffect ? "30px 1fr 58px 122px" : "30px 1fr 60px";
    // the effect column is scaled to the ride's largest |Δ logit|, so small effects stay readable
    this.effectMax = Math.max(0.5, ...ride.steps.flatMap(s => s.compass.ablation_delta_logit ? Object.values(s.compass.ablation_delta_logit).map(Math.abs) : [0]));
    el("div", { class: "hdr", text: "token" }, this.moves);
    el("div", { class: "hdr", text: ride.steps[0].prediction.probabilities ? "probability (full vocabulary)" : "probability over the nine tokens" }, this.moves);
    el("div", { class: "hdr", text: "logit", style: "text-align:right" }, this.moves);
    if (hasEffect) el("div", { class: "hdr effect", text: `compass effect, ± ${this.effectMax.toFixed(1)} logit`, title: "Δ logit = original − compass-ablated prediction at the same state; the axis spans this ride's largest effect" }, this.moves);
    this.rows = {};
    for (const t of TOKENS) {
      const lbl = el("div", { class: "lbl", text: t }, this.moves);
      const track = el("div", { class: "track" }, this.moves);
      const bar = el("div", { class: "bar" }, track);
      const val = el("div", { class: "val" }, this.moves);
      let eff = null;
      if (hasEffect) {
        eff = el("div", { class: "effect" }, this.moves);
        const s = svg("svg", { viewBox: "0 0 118 11" }, eff);
        svg("line", { class: "zero", x1: 59, x2: 59, y1: 1, y2: 10 }, s);
        eff.stem = svg("line", { class: "stem", x1: 59, x2: 59, y1: 5.5, y2: 5.5 }, s);
        eff.dot = svg("circle", { class: "dot", cx: 59, cy: 5.5, r: 2.4 }, s);
      }
      this.rows[t] = { lbl, track, bar, val, eff };
    }
    const t1 = tag(ride.provenance, ["prediction.logits", "compass.ablation_delta_logit"]);
    this.where.innerHTML = `${ride.generation.temperature > 0 ? "sampled at T = 1" : "greedy"}${t1 ? " · " + t1 : ""}`;
  }
  render(state) {
    const s = this.ride.steps[state.step], pr = s.prediction;
    const probs = pr.probabilities || softmax(pr.logits, TOKENS);
    const legal = new Set(s.legal);
    for (const t of TOKENS) {
      const r = this.rows[t];
      const isLegal = t === "END" || legal.has(t);
      const cls = ["row"];
      if (!isLegal) cls.push("row-illegal");
      if (t === pr.executed) cls.push(pr.forced ? "row-forced" : "row-executed");
      else if (t === pr.proposed && pr.forced) cls.push("row-proposed");
      for (const e of [r.lbl, r.track, r.val, r.eff]) if (e) e.className = e.className.split(" ").filter(c => !c.startsWith("row")).concat(cls).join(" ");
      r.bar.style.width = `${(probs[t] * 100).toFixed(1)}%`;
      r.val.innerHTML = `${fmtPct(probs[t])}<small>${pr.logits[t] >= 0 ? "+" : ""}${pr.logits[t].toFixed(1)}</small>`;
      r.lbl.title = isLegal ? "" : "illegal at the true intersection";
      if (r.eff) {
        const d = s.compass.ablation_delta_logit ? s.compass.ablation_delta_logit[t] : 0;
        const x = 59 + Math.max(-56, Math.min(56, d / this.effectMax * 56));
        r.eff.stem.setAttribute("x2", x); r.eff.dot.setAttribute("cx", x);
        r.eff.title = `${d >= 0 ? "+" : ""}${d.toFixed(2)} logit from the compass`;
      }
    }
    let msg;
    if (pr.executed === null) {
      msg = "The generation limit was reached; no next move was selected.";
    } else if (pr.executed === "END") {
      msg = s.node === this.ride.goal ? `The model emits <b>END</b> at the goal: the ride succeeds.` : `The model emits <b>END</b> away from the goal.`;
    } else if (!pr.executed_legal) {
      msg = `<span class="illegal">${pr.executed}</span> is illegal here: the taxi attempts it and leaves the street graph, so no intersection is reached and the ride ends.`;

    } else if (pr.forced) {
      msg = `The detour test forces <span class="forced">${pr.executed}</span>, its least-likely legal move that leaves the goal reachable within the remaining budget. The model proposed <span class="own">${pr.proposed}</span>.`;
    } else {
      msg = `The model chooses <span class="own">${pr.executed}</span>. Legal here: ${[...legal].join(", ")}. The active intersection feature raises legal moves; the compass raises goalward ones.`;
    }
    this.note.innerHTML = msg;
  }
}

// ── position code ─────────────────────────────────────────────────────────────
export class PositionView {
  constructor(root) {
    this.root = root;
    this.dl = root.querySelector("#position-readouts");
    this.sketch = root.querySelector("#sketch");
    this.caption = root.querySelector("#sketch-caption");
    this.where = root.querySelector("#position-where");
    this.onHover = () => {};
    this.hover = null;
    this.build();
  }
  build() {
    // persistent rows, so a hovered element survives re-renders and keeps its mouseleave
    clear(this.dl);
    const row = (label, hoverKey, cls) => {
      const dt = el("dt", { text: label }, this.dl);
      const dd = el("dd", {}, this.dl);
      if (hoverKey) {
        for (const e of [dt, dd]) {
          e.className = `row-hover ${cls}`;
          e.dataset.hover = hoverKey;
          e.addEventListener("mouseenter", () => this.onHover(hoverKey));
          e.addEventListener("mouseleave", () => this.onHover(null));
          e.addEventListener("click", () => this.onHover(this.hover === hoverKey ? null : hoverKey));
        }
        dd.tabIndex = 0;
        dd.addEventListener("focus", () => this.onHover(hoverKey));
        dd.addEventListener("blur", () => this.onHover(null));
      }
      return [dt, dd];
    };
    [this.trueDt, this.trueDd] = row("true intersection", "true", "good-row");
    [this.wrongDt, this.wrongDd] = row("strongest wrong", "wrong", "bad-row");
    [, this.angleDd] = row("feature angle");
    [, this.noiseDd] = row("noise");
    this.root.addEventListener("mouseleave", () => { if (this.hover) this.onHover(null); });
  }
  setRide(ride) {
    this.ride = ride;
    const t2 = tag(ride.provenance, ["position.write", "position.wrong_activation", "position.cos_true_wrong", "position.noise"]);
    this.where.innerHTML = `layer ${ride.layers.position_write}${t2 ? " · " + t2 : ""}`;
  }
  render(state) {
    const s = this.ride.steps[state.step], pos = s.position;
    this.hover = state.hover;
    for (const e of [this.trueDt, this.trueDd]) e.classList.toggle("on", state.hover === "true");
    for (const e of [this.wrongDt, this.wrongDd]) e.classList.toggle("on", state.hover === "wrong");
    this.trueDd.title = `intersection ${s.node} · hover to find it on the map`;
    if (pos.write === null) {
      this.trueDd.innerHTML = `<span class="swatch good"></span><span class="muted">origin state, not measured</span>`;
      this.wrongDd.innerHTML = "–"; this.angleDd.textContent = "–"; this.noiseDd.textContent = "–";
      this.wrongDd.title = "";
      this.drawSketch(null);
      this.caption.textContent = "The origin state is the goal token's position; the paper's readouts start at the first move.";
      return;
    }
    const wrongWins = pos.wrong_activation > pos.write;
    this.trueDd.innerHTML = `<span class="swatch good"></span><b>${fmtNum(pos.write)}</b> <span class="muted">write</span>`;
    this.wrongDd.innerHTML = `<span class="swatch bad"></span><b>${fmtNum(pos.wrong_activation)}</b>${wrongWins ? ` <span class="win">most active</span>` : ""}`;
    this.wrongDd.title = `intersection ${pos.wrong_node} · hover to find it on the map`;
    const cos = pos.cos_true_wrong;
    const ang = cos === null ? null : Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
    this.angleDd.innerHTML = cos === null ? "–" : `${ang.toFixed(0)}° <span class="muted">cos ${cos.toFixed(2)}</span>`;
    this.noiseDd.innerHTML = `<span class="swatch noise"></span><b>${fmtNum(pos.noise)}</b> <span class="muted">rms</span>`;
    this.noiseDd.title = "root-mean-square projection of the residual on fixed sampled intersection directions";
    this.drawSketch({ write: pos.write, wrong: pos.wrong_activation, cos, wrongWins, noise: pos.noise });
    this.caption.textContent = wrongWins
      ? "Noise has pushed the residual past the wrong feature: it is now the most active intersection, and moves legal there become likely."
      : "The residual writes along the true feature; noise adds a remainder. A wrong, overlapping feature can become the most active one.";
  }
  // Fig. 3 (a) made exact for two measured projections: with e_true = (1, 0) and e_wrong at the measured angle,
  // the residual's in-plane point is fixed by write = p·e_true and wrong = p·e_wrong.
  drawSketch(d) {
    const g = this.sketch;
    clear(g);
    const ox = 14, oy = 92, scale = 165 / 800;
    svg("line", { class: "axis-true", x1: ox, y1: oy, x2: 228, y2: oy }, g);
    svg("text", { class: "lab", x: 228, y: oy + 12, "text-anchor": "end", text: "true feature" }, g);
    if (!d) return;
    let theta = d.cos === null ? 60 : Math.acos(Math.max(-1, Math.min(1, d.cos))) * 180 / Math.PI;
    theta = Math.max(8, Math.min(120, theta));
    const t = rad(theta);
    if (d.cos !== null) {
      const reach = Math.min(200, (oy - 5) / Math.max(0.05, Math.sin(t)), (236 - ox - 4) / Math.max(0.05, Math.abs(Math.cos(t))));
      svg("line", { class: "axis-wrong", x1: ox, y1: oy, x2: ox + Math.cos(t) * reach, y2: oy - Math.sin(t) * reach }, g);
      const lr = Math.min(reach, (oy - 12) / Math.max(0.05, Math.sin(t)));
      svg("text", { class: "lab bad", x: ox + Math.cos(t) * lr + 5, y: oy - Math.sin(t) * lr + (theta > 70 ? 9 : -3), text: "wrong feature" }, g);
    }
    const w = d.write * scale;
    const perp = d.cos === null ? 0 : (d.wrong - d.write * d.cos) / Math.sin(t) * scale;
    const px = ox + w, py = oy - perp;
    if (d.cos !== null) {
      // beyond the bisector of the two axes the wrong feature scores higher than the true one
      const h = t / 2, br = Math.min(200, (oy - 5) / Math.max(0.05, Math.sin(h)));
      svg("line", { class: "boundary", x1: ox, y1: oy, x2: ox + Math.cos(h) * br, y2: oy - Math.sin(h) * br }, g);
    }
    if (d.noise) {
      // the measured noise as a typical displacement in any direction of the position subspace
      const nr = d.noise * scale;
      svg("circle", { class: "noise-disc", cx: px, cy: oy, r: nr }, g);
      svg("text", { class: "lab", x: px, y: oy + nr + 10, "text-anchor": "middle", text: "noise" }, g);
    }
    const arrow = (x1, y1, x2, y2, cls, head) => {
      svg("line", { class: cls, x1, y1, x2, y2 }, g);
      const a = Math.atan2(y2 - y1, x2 - x1);
      svg("path", { class: head, d: `M${x2} ${y2}L${x2 - 7 * Math.cos(a - 0.4)} ${y2 - 7 * Math.sin(a - 0.4)}L${x2 - 7 * Math.cos(a + 0.4)} ${y2 - 7 * Math.sin(a + 0.4)}Z` }, g);
    };
    arrow(ox, oy, px, oy, "write", "arrow-ink");
    svg("text", { class: "lab ink", x: ox + w / 2, y: oy + 12, "text-anchor": "middle", text: "write" }, g);
    if (d.cos !== null) {
      svg("line", { class: "remainder", x1: px, y1: oy, x2: px, y2: py }, g);
      arrow(ox, oy, px, py, `resultant ${d.wrongWins ? "bad" : "good"}`, d.wrongWins ? "arrow-bad" : "arrow-good");
      const right = px < 120;
      svg("text", { class: `lab ${d.wrongWins ? "bad" : "good"}`, x: right ? px + 7 : px - 7, y: py - 6, "text-anchor": right ? "start" : "end", text: d.wrongWins ? "wrong node most active" : "true node most active" }, g);
    }
  }
}

// ── goal compass ──────────────────────────────────────────────────────────────
export class CompassView {
  constructor(root) {
    this.dial = root.querySelector("#compass");
    this.dl = root.querySelector("#compass-readouts");
    this.where = root.querySelector("#compass-where");
    clear(this.dl);
    for (const [key, label] of [["decodedDd", "decoded"], ["actualDd", "to the goal"], ["errDd", "error"]]) {
      el("dt", { text: label }, this.dl);
      this[key] = el("dd", {}, this.dl);
    }
  }
  setRide(ride) {
    this.ride = ride;
    const t3 = tag(ride.provenance, ["compass.decoded_bearing_deg"]);
    this.where.innerHTML = `layer ${ride.layers.compass_decode}${t3 ? " · " + t3 : ""}`;
  }
  render(state) {
    const s = this.ride.steps[state.step];
    const g = this.dial; clear(g);
    const c = 52, R = 41;
    svg("circle", { class: "ring", cx: c, cy: c, r: R }, g);
    for (const [name, a] of [["N", 90], ["E", 0], ["S", 270], ["W", 180]]) {
      svg("text", { class: "cardinal", x: c + Math.cos(rad(a)) * (R + 8), y: c - Math.sin(rad(a)) * (R + 8), text: name }, g);
    }
    const legal = new Set(s.legal);
    for (const m of MOVES) {
      const a = rad(this.ride.moveBearing?.[m] ?? MOVE_ANGLE[m]);
      svg("line", { class: "tick" + (legal.has(m) ? " legal" : ""), x1: c + Math.cos(a) * (R - 5), y1: c - Math.sin(a) * (R - 5), x2: c + Math.cos(a) * R, y2: c - Math.sin(a) * R }, g);
    }
    if (s.goal_bearing_deg === null) {
      svg("text", { class: "cardinal", x: c, y: c, text: s.node === this.ride.goal ? "at goal" : "no GPS" }, g);
      this.decodedDd.textContent = "–"; this.actualDd.textContent = s.node === this.ride.goal ? "at the goal" : "coordinates unavailable"; this.errDd.textContent = "–";
      return;
    }
    const ga = rad(s.goal_bearing_deg), da = rad(s.compass.decoded_bearing_deg);
    const err = wrap(s.compass.decoded_bearing_deg - s.goal_bearing_deg);
    const r2 = R - 12, sweep = err > 0 ? 0 : 1;
    svg("path", { class: "err", d: `M${c + Math.cos(ga) * r2} ${c - Math.sin(ga) * r2}A${r2} ${r2} 0 0 ${sweep} ${c + Math.cos(da) * r2} ${c - Math.sin(da) * r2}` }, g);
    svg("line", { class: "actual", x1: c, y1: c, x2: c + Math.cos(ga) * (R - 2), y2: c - Math.sin(ga) * (R - 2) }, g);
    svg("path", { class: "actual-star", d: "M0 -5L1.2 -1.6L4.8 -1.5L1.9 0.7L2.9 4.1L0 2.1L-2.9 4.1L-1.9 0.7L-4.8 -1.5L-1.2 -1.6Z", transform: `translate(${c + Math.cos(ga) * (R + 1)} ${c - Math.sin(ga) * (R + 1)})` }, g);
    svg("line", { class: "needle", x1: c, y1: c, x2: c + Math.cos(da) * (R - 9), y2: c - Math.sin(da) * (R - 9) }, g);
    svg("path", { class: "needle-head", d: "M0 0L-4.5 7L4.5 7Z", transform: `translate(${c + Math.cos(da) * (R - 3)} ${c - Math.sin(da) * (R - 3)}) rotate(${90 - s.compass.decoded_bearing_deg})` }, g);
    svg("circle", { class: "hub", cx: c, cy: c, r: 2.5 }, g);
    this.decodedDd.innerHTML = `<span class="swatch compass"></span>${fmtDeg(s.compass.decoded_bearing_deg)}`;
    this.actualDd.innerHTML = `<span class="swatch ink"></span>${fmtDeg(s.goal_bearing_deg)}`;
    this.errDd.textContent = `${Math.abs(err).toFixed(0)}°`;
  }
}
