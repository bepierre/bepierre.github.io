// The dashboard panels: next-move prediction, position code (with the Fig. 3 plane sketch), goal compass,
// and ride facts. Each panel renders from the current step; provenance tags come from the ride file.

import { P, MOVES, TOKENS, MOVE_ANGLE, svg, clear, el, softmax, rad, wrap, fmtDeg, fmtNum, fmtPct } from "./util.js";

function tag(prov) {
  if (!prov) return "";
  const kind = prov.startsWith("recorded") ? "recorded" : prov.startsWith("derived") ? "derived" : "illustrative";
  return `<span class="tag ${kind}" title="${prov}">${kind}</span>`;
}

// ── next move ─────────────────────────────────────────────────────────────────
export class PredictionView {
  constructor(root) {
    this.root = root;
    this.moves = root.querySelector("#moves");
    this.note = root.querySelector("#prediction-note");
    this.where = root.querySelector("#prediction-where");
    this.rows = null;
  }
  setRide(ride) {
    this.ride = ride;
    const hasEffect = ride.steps.some(s => s.compass.ablation_delta_logit);
    this.hasEffect = hasEffect;
    clear(this.moves);
    this.moves.style.gridTemplateColumns = hasEffect ? "34px 1fr 62px 70px" : "34px 1fr 62px";
    el("div", { class: "hdr", text: "token" }, this.moves);
    el("div", { class: "hdr", text: "probability over the nine tokens" }, this.moves);
    el("div", { class: "hdr", html: "logit" , style: "text-align:right" }, this.moves);
    if (hasEffect) el("div", { class: "hdr effect", html: "compass effect", title: "Δ logit = original − compass-ablated prediction at the same state" }, this.moves);
    this.rows = {};
    for (const t of TOKENS) {
      const lbl = el("div", { class: "lbl", text: t }, this.moves);
      const track = el("div", { class: "track" }, this.moves);
      const bar = el("div", { class: "bar" }, track);
      const val = el("div", { class: "val" }, this.moves);
      let eff = null;
      if (hasEffect) {
        eff = el("div", { class: "effect" }, this.moves);
        const s = svg("svg", { viewBox: "0 0 64 14" }, eff);
        svg("line", { class: "zero", x1: 32, x2: 32, y1: 1, y2: 13 }, s);
        eff.stem = svg("line", { class: "stem", x1: 32, x2: 32, y1: 7, y2: 7 }, s);
        eff.dot = svg("circle", { class: "dot", cx: 32, cy: 7, r: 2.6 }, s);
      }
      this.rows[t] = { lbl, track, bar, val, eff };
    }
    const prov = ride.provenance;
    this.where.innerHTML = `${tag(prov["prediction.logits"])}${hasEffect ? " · effect " + tag(prov["compass.ablation_delta_logit"]) : ""}`;
  }
  render(state) {
    const s = this.ride.steps[state.step], pr = s.prediction;
    const probs = softmax(pr.logits, TOKENS);
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
        const x = 32 + Math.max(-30, Math.min(30, d * 18));
        r.eff.stem.setAttribute("x2", x); r.eff.dot.setAttribute("cx", x);
        r.eff.title = `${d >= 0 ? "+" : ""}${d.toFixed(2)} logit from the compass`;
      }
    }
    // what happened here, in one line
    const how = this.ride.generation.temperature > 0 ? "sampled at temperature 1" : "greedy";
    let msg;
    if (pr.executed === "END") {
      msg = s.node === this.ride.goal ? `The model emits <b>END</b> at the goal: the ride succeeds.` : `The model emits <b>END</b> away from the goal.`;
    } else if (!pr.executed_legal) {
      msg = `<span class="illegal">${pr.executed}</span> is illegal here: the taxi attempts it and leaves the street graph. No intersection is reached.`;
      if (s.position.decoded_node && s.position.decoded_node !== s.node) msg += ` ${pr.executed} is legal at the decoded intersection.`;
    } else if (pr.forced) {
      msg = `The detour test forces <span class="forced">${pr.executed}</span>, its least-likely legal move. The model proposed <span class="own">${pr.proposed}</span>.`;
    } else {
      msg = `The model chooses <span class="own">${pr.executed}</span> (${how})${legal.size ? `; legal here: ${[...legal].join(", ")}` : ""}.`;
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
    // persistent elements, so a hovered span survives re-renders and keeps its mouseleave
    clear(this.dl);
    const row = label => { el("dt", { text: label }, this.dl); return el("dd", {}, this.dl); };
    const trueDd = row("true intersection");
    el("span", { class: "swatch good" }, trueDd);
    this.trueId = el("span", { class: "hoverable good-text", "data-hover": "true" }, trueDd);
    this.trueVal = el("b", {}, trueDd);
    this.trueNote = el("span", { class: "muted small" }, trueDd);
    const wrongDd = row("strongest wrong");
    el("span", { class: "swatch bad" }, wrongDd);
    this.wrongId = el("span", { class: "hoverable bad-text", "data-hover": "wrong" }, wrongDd);
    this.wrongVal = el("b", {}, wrongDd);
    this.decodedDd = row("decoded as");
    this.angleDd = row("feature angle");
    this.noiseDd = row("position noise");
    for (const h of [this.trueId, this.wrongId]) {
      h.addEventListener("mouseenter", () => this.onHover(h.dataset.hover));
      h.addEventListener("mouseleave", () => this.onHover(null));
      h.addEventListener("click", () => this.onHover(this.hover === h.dataset.hover ? null : h.dataset.hover));
      h.tabIndex = 0;
      h.addEventListener("focus", () => this.onHover(h.dataset.hover));
      h.addEventListener("blur", () => this.onHover(null));
    }
    // backstop: leaving the panel always clears a hover highlight
    this.root.addEventListener("mouseleave", () => { if (this.hover) this.onHover(null); });
  }
  setRide(ride) {
    this.ride = ride;
    const p = ride.provenance;
    this.where.innerHTML = `layer ${ride.layers.position_write} · ${tag(p["position.write"])}`;
    this.noiseTag = tag(p["position.noise"]);
    this.angleTag = tag(p["position.cos_true_wrong"]);
    this.decodedTag = tag(p["position.decoded_node"]);
  }
  render(state) {
    const s = this.ride.steps[state.step], pos = s.position;
    this.hover = state.hover;
    this.trueId.classList.toggle("on", state.hover === "true");
    this.wrongId.classList.toggle("on", state.hover === "wrong");
    this.trueId.textContent = s.node;
    this.trueId.title = "hover to find it on the map";
    if (pos.write === null) {
      this.trueVal.textContent = "";
      this.trueNote.textContent = " origin state, not measured";
      this.wrongId.textContent = "–"; this.wrongVal.textContent = "";
      this.decodedDd.textContent = "–"; this.angleDd.textContent = "–"; this.noiseDd.textContent = "–";
      this.drawSketch(null);
      this.caption.textContent = "The origin state is the goal token's position; no readout is recorded there.";
      return;
    }
    const wrongWins = pos.wrong_activation > pos.write;
    this.trueVal.textContent = " " + fmtNum(pos.write);
    this.trueNote.textContent = "";
    this.wrongId.textContent = pos.wrong_node;
    this.wrongId.title = "the intersection whose feature is most active apart from the true one, at this step";
    this.wrongVal.textContent = " " + fmtNum(pos.wrong_activation);
    this.decodedDd.innerHTML = pos.decoded_node === s.node
      ? `<span class="ok">the true intersection</span> ${this.decodedTag}`
      : `<span class="no">the wrong intersection ${pos.decoded_node}</span> ${this.decodedTag}`;
    const cos = pos.cos_true_wrong;
    const ang = cos === null ? null : Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
    this.angleDd.innerHTML = cos === null ? `– ${this.angleTag}` : `${ang.toFixed(0)}° <span class="muted">(cos ${cos.toFixed(2)}${cos > 0.5 ? ", shares moves" : ""})</span> ${this.angleTag}`;
    this.noiseDd.innerHTML = `${fmtNum(pos.noise)} <span class="muted small">rms over sampled directions</span> ${this.noiseTag}`;
    this.drawSketch({ write: pos.write, wrong: pos.wrong_activation, cos, wrongWins });
    this.caption.textContent = "The plane of the true and wrong features; the point is the residual's projection onto it (2 of the code's 244 dimensions).";
  }
  // Fig. 3 (a) made exact for two measured projections: with e_true = (1, 0) and e_wrong at the measured angle,
  // the residual's in-plane point is fixed by write = p·e_true and wrong = p·e_wrong.
  drawSketch(d) {
    const g = this.sketch;
    clear(g);
    const ox = 22, oy = 96, scale = 170 / 800;   // 800 activation units ≈ 170 px
    // the true axis and, when known, the wrong axis at its angle
    svg("line", { class: "axis-true", x1: ox, y1: oy, x2: 240, y2: oy }, g);
    svg("text", { class: "lab", x: 240, y: oy + 13, "text-anchor": "end", text: "true feature" }, g);
    if (!d) return;
    let theta = d.cos === null ? 60 : Math.acos(Math.max(-1, Math.min(1, d.cos))) * 180 / Math.PI;
    theta = Math.max(8, Math.min(120, theta));
    const t = rad(theta);
    // the affordance-protected wedge (cos > 0.5, i.e. within 60°)
    const wr = 118;
    svg("path", { class: "wedge", d: `M${ox} ${oy}L${ox + wr} ${oy}A${wr} ${wr} 0 0 0 ${ox + Math.cos(rad(60)) * wr} ${oy - Math.sin(rad(60)) * wr}Z` }, g);
    if (d.cos !== null) {
      // the wrong axis, clipped to the box, with its label just inside the top edge
      const reach = Math.min(230, (oy - 6) / Math.max(0.05, Math.sin(t)), (250 - ox - 4) / Math.max(0.05, Math.abs(Math.cos(t))));
      svg("line", { class: "axis-wrong", x1: ox, y1: oy, x2: ox + Math.cos(t) * reach, y2: oy - Math.sin(t) * reach }, g);
      const lr = Math.min(reach, (oy - 14) / Math.max(0.05, Math.sin(t)));
      const lx = ox + Math.cos(t) * lr, ly = oy - Math.sin(t) * lr;
      svg("text", { class: "lab bad", x: lx + 5, y: ly + (theta > 70 ? 10 : -4), text: "wrong feature" }, g);
    }
    // the point p and its components
    const w = d.write * scale;
    const perp = d.cos === null ? 0 : (d.wrong - d.write * d.cos) / Math.sin(t) * scale;
    const px = ox + w, py = oy - perp;
    const arrow = (x1, y1, x2, y2, cls, head) => {
      svg("line", { class: cls, x1, y1, x2, y2 }, g);
      const a = Math.atan2(y2 - y1, x2 - x1);
      const hx = x2, hy = y2;
      svg("path", { class: head, d: `M${hx} ${hy}L${hx - 8 * Math.cos(a - 0.4)} ${hy - 8 * Math.sin(a - 0.4)}L${hx - 8 * Math.cos(a + 0.4)} ${hy - 8 * Math.sin(a + 0.4)}Z` }, g);
    };
    arrow(ox, oy, px, oy, "write", "arrow-ink");
    svg("text", { class: "lab ink", x: ox + w / 2, y: oy + 13, "text-anchor": "middle", text: "write" }, g);
    if (d.cos !== null) {
      svg("line", { class: "remainder", x1: px, y1: oy, x2: px, y2: py }, g);
      arrow(ox, oy, px, py, `resultant ${d.wrongWins ? "bad" : "good"}`, d.wrongWins ? "arrow-bad" : "arrow-good");
      const label = d.wrongWins ? "wrong node most active" : "true node most active";
      const right = px < 120;
      svg("text", { class: `lab ${d.wrongWins ? "bad" : ""}`, x: right ? px + 7 : px - 7, y: py - 7, "text-anchor": right ? "start" : "end", text: label }, g);
    }
  }
}

// ── goal compass ──────────────────────────────────────────────────────────────
export class CompassView {
  constructor(root) {
    this.root = root;
    this.dial = root.querySelector("#compass");
    this.dl = root.querySelector("#compass-readouts");
    this.where = root.querySelector("#compass-where");
    this.build();
  }
  build() {
    clear(this.dl);
    for (const [key, label] of [["decodedDd", "decoded bearing"], ["actualDd", "bearing to goal"], ["errDd", "error"], ["effectDd", "effect on moves"]]) {
      el("dt", { text: label }, this.dl);
      this[key] = el("dd", {}, this.dl);
    }
  }
  setRide(ride) {
    this.ride = ride;
    const p = ride.provenance;
    this.where.innerHTML = `layer ${ride.layers.compass_decode} · ${tag(p["compass.decoded_bearing_deg"])}`;
    this.hasEffect = ride.steps.some(s => s.compass.ablation_delta_logit);
  }
  render(state) {
    const s = this.ride.steps[state.step];
    const g = this.dial; clear(g);
    const c = 61, R = 49;
    svg("circle", { class: "ring", cx: c, cy: c, r: R }, g);
    svg("circle", { class: "ring", cx: c, cy: c, r: 2 }, g);
    for (const [name, a] of [["N", 90], ["E", 0], ["S", 270], ["W", 180]]) {
      svg("text", { class: "cardinal", x: c + Math.cos(rad(a)) * (R + 9), y: c - Math.sin(rad(a)) * (R + 9), text: name }, g);
    }
    // the eight moves as ticks on the street grid's own bearings; legal ones are dark
    const legal = new Set(s.legal);
    for (const m of MOVES) {
      const a = rad(this.ride.moveBearing?.[m] ?? MOVE_ANGLE[m]);
      svg("line", { class: "tick" + (legal.has(m) ? " legal" : ""), x1: c + Math.cos(a) * (R - 6), y1: c - Math.sin(a) * (R - 6), x2: c + Math.cos(a) * R, y2: c - Math.sin(a) * R }, g);
    }
    if (s.goal_bearing_deg === null) {
      svg("text", { class: "cardinal", x: c, y: c, text: "at goal" }, g);
      this.decodedDd.textContent = "–"; this.actualDd.textContent = "at the goal"; this.errDd.textContent = "–";
    } else {
      const ga = rad(s.goal_bearing_deg), da = rad(s.compass.decoded_bearing_deg);
      // the error arc between the decoded and the actual bearing
      const err = wrap(s.compass.decoded_bearing_deg - s.goal_bearing_deg);
      const r2 = R - 14;
      const large = Math.abs(err) > 180 ? 1 : 0, sweep = err > 0 ? 0 : 1;
      svg("path", { class: "err", d: `M${c + Math.cos(ga) * r2} ${c - Math.sin(ga) * r2}A${r2} ${r2} 0 ${large} ${sweep} ${c + Math.cos(da) * r2} ${c - Math.sin(da) * r2}` }, g);
      svg("line", { class: "actual", x1: c, y1: c, x2: c + Math.cos(ga) * (R - 2), y2: c - Math.sin(ga) * (R - 2) }, g);
      svg("path", { class: "actual-star", d: "M0 -5L1.2 -1.6L4.8 -1.5L1.9 0.7L2.9 4.1L0 2.1L-2.9 4.1L-1.9 0.7L-4.8 -1.5L-1.2 -1.6Z", transform: `translate(${c + Math.cos(ga) * (R + 1)} ${c - Math.sin(ga) * (R + 1)})` }, g);
      svg("line", { class: "needle", x1: c, y1: c, x2: c + Math.cos(da) * (R - 10), y2: c - Math.sin(da) * (R - 10) }, g);
      svg("path", { class: "needle-head", d: "M0 0L-5 8L5 8Z", transform: `translate(${c + Math.cos(da) * (R - 3)} ${c - Math.sin(da) * (R - 3)}) rotate(${90 - s.compass.decoded_bearing_deg})` }, g);
      svg("circle", { class: "hub", cx: c, cy: c, r: 3 }, g);
      this.decodedDd.innerHTML = `<span class="swatch clay"></span>${fmtDeg(s.compass.decoded_bearing_deg)}`;
      this.actualDd.innerHTML = `<span class="swatch ink"></span>${fmtDeg(s.goal_bearing_deg)} <span class="muted">· ${s.dist_to_goal} moves away</span>`;
      this.errDd.textContent = `${Math.abs(err).toFixed(0)}°`;
    }
    this.effectDd.innerHTML = this.hasEffect
      ? `shown beside each move <span class="muted">(original − ablated, layer ${this.ride.layers.compass_ablation})</span>`
      : `<span class="muted">not recorded for this ride</span>`;
  }
}

// ── ride facts (unused: the facts sit in the map's note) ──────────────────────
export class FactsView {
  constructor(root) { this.root = root; this.dl = root.querySelector("#facts"); this.where = root.querySelector("#facts-where"); }
  setRide(ride) {
    this.ride = ride;
    clear(this.dl);
    const gen = ride.generation;
    const items = [
      ["test", ride.family === "stress" ? "stress (sampled, T = 1)" : `detour (greedy, forced with p = ${gen.forcing.p})`],
      ["origin → goal", `${ride.shortest_hops} moves apart`],
      ["outcome", `<span class="outcome-${ride.outcome}">${ride.outcome_label}</span>${ride.category_label ? ` · ${ride.category_label}` : ""}`],
      ["model", `${ride.model.checkpoint}`],
    ];
    for (const [k, v] of items) { el("dt", { text: k }, this.dl); el("dd", { html: v }, this.dl); }
    this.movesDd = null;
    this.where.textContent = `${ride.n_moves} moves`;
  }
  render() {}
}
