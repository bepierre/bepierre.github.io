// The Manhattan map: streets, the ride's route coloured by time, the taxi and its next move, the goal,
// a small compass at the taxi, and (only while hovered) the strongest wrong intersection. Drawn in pixel
// space from the graph's metre coordinates so stroke widths and marker sizes stay constant.

import { P, MOVES, MOVE_ANGLE, MILESTONE, svg, clear, timeColor, starPath, rad } from "./util.js";

export class MapView {
  constructor(frame, world) {
    this.frame = frame;
    this.stage = frame.querySelector(".map-stage") || frame;   // the box the map itself fills
    this.svg = frame.querySelector("svg.map");
    this.locator = frame.querySelector("svg.locator");
    this.world = world;
    this.ride = null;
    this.view = null;           // {x0, y1, k, w, h}
    this.overlays = { compass: true, future: true };
    this.buildDefs();
    this.drawLocatorIsland();
  }

  buildDefs() {
    const defs = svg("defs", {}, this.svg);
    for (const [id, color] of [["arrow-own", P.clay], ["arrow-forced", P.slate], ["arrow-illegal", P.bad]]) {
      const m = svg("marker", { id, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse", markerUnits: "userSpaceOnUse" }, defs);
      svg("path", { d: "M0 0 L10 5 L0 10 Z", fill: color }, m);
    }
    this.gStreets = svg("g", { class: "streets" }, this.svg);
    this.gRoute = svg("g", {}, this.svg);
    this.gMarks = svg("g", {}, this.svg);
    this.gNow = svg("g", {}, this.svg);
    this.gLabels = svg("g", {}, this.svg);
  }

  drawLocatorIsland() {
    const b = this.world.bounds;              // [minx, miny, maxx, maxy] in metres
    const W = 62, H = 112, pad = 3;
    const k = Math.min((W - 2 * pad) / (b[2] - b[0]), (H - 2 * pad) / (b[3] - b[1]));
    this.locScale = { k, x0: b[0] - ((W / k) - (b[2] - b[0])) / 2, y1: b[3] + ((H / k) - (b[3] - b[1])) / 2 };
    const d = [];
    for (const [u, , v] of this.world.edges) {
      const a = this.world.nodes[u], c = this.world.nodes[v];
      if (!a || !c) continue;
      d.push(`M${this.locX(a[0])} ${this.locY(a[1])}L${this.locX(c[0])} ${this.locY(c[1])}`);
    }
    svg("path", { class: "island", d: d.join("") }, this.locator);
    this.locView = svg("rect", { class: "view" }, this.locator);
  }
  locX(x) { return ((x - this.locScale.x0) * this.locScale.k).toFixed(1); }
  locY(y) { return ((this.locScale.y1 - y) * this.locScale.k).toFixed(1); }

  setRide(ride) { this.ride = ride; this.fit(); this.drawStatic(); }

  // Fit the route and the goal into the frame.
  fit() {
    const W = this.stage.clientWidth || 600, H = this.stage.clientHeight || 500;
    const pts = this.ride.steps.map(s => this.world.nodes[s.node]).filter(Boolean);
    pts.push(this.world.nodes[this.ride.goal]);
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const [x, y] of pts) { minx = Math.min(minx, x); miny = Math.min(miny, y); maxx = Math.max(maxx, x); maxy = Math.max(maxy, y); }
    const padPx = 56;
    const k = Math.min((W - 2 * padPx) / Math.max(1, maxx - minx), (H - 2 * padPx) / Math.max(1, maxy - miny));
    const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
    this.view = { k, x0: cx - (W / 2) / k, y1: cy + (H / 2) / k, w: W, h: H };
    this.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    // the window rectangle, clamped inside the locator so its edges never fall outside the little box
    // (the map window is often wider than the island at this scale)
    const LW = 62, LH = 112, m = 0.5;
    let lx = +this.locX(this.view.x0), ly = +this.locY(this.view.y1);
    let lw = (W / k) * this.locScale.k, lh = (H / k) * this.locScale.k;
    const x2 = Math.min(LW - m, lx + lw), y2 = Math.min(LH - m, ly + lh);
    lx = Math.max(m, lx); ly = Math.max(m, ly);
    this.locView.setAttribute("x", lx.toFixed(1));
    this.locView.setAttribute("y", ly.toFixed(1));
    this.locView.setAttribute("width", Math.max(2, x2 - lx).toFixed(1));
    this.locView.setAttribute("height", Math.max(2, y2 - ly).toFixed(1));
  }
  px(id) { const n = this.world.nodes[id]; return n ? this.pt(n) : null; }
  pt([x, y]) { return [(x - this.view.x0) * this.view.k, (this.view.y1 - y) * this.view.k]; }
  inView([x, y], m = 0) { return x >= -m && x <= this.view.w + m && y >= -m && y <= this.view.h + m; }

  drawStatic() {
    clear(this.gStreets); clear(this.gRoute); clear(this.gMarks);
    // streets: every street with an endpoint in the window, as one path
    const d = [], seen = new Set();
    for (const [u, , v] of this.world.edges) {
      const key = u < v ? `${u}-${v}` : `${v}-${u}`;
      if (seen.has(key)) continue;
      const a = this.px(u), b = this.px(v);
      if (!a || !b) continue;
      if (!this.inView(a, 40) && !this.inView(b, 40)) continue;
      seen.add(key);
      d.push(`M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`);
    }
    svg("path", { d: d.join("") }, this.gStreets);

    // the route, one segment per move coloured by time; shown up to the current step
    const steps = this.ride.steps, n = steps.length - 1;
    this.routePts = steps.map(s => this.px(s.node));
    this.future = svg("path", { class: "route-future", d: "" }, this.gRoute);
    this.segs = [];
    for (let k = 0; k < n; k++) {
      const a = this.routePts[k], b = this.routePts[k + 1];
      this.segs.push(svg("path", { class: "route-seg", d: `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`, stroke: timeColor(k + 0.5, n) }, this.gRoute));
    }
    // origin, goal, the 20-move squares
    const o = this.routePts[0];
    svg("circle", { class: "origin", cx: o[0], cy: o[1], r: 4.2 }, this.gMarks);
    const g = this.px(this.ride.goal);
    svg("path", { class: "goal", d: starPath(8), transform: `translate(${g[0]} ${g[1]})` }, this.gMarks);
    this.milestones = [];      // the paper's 20-move squares are not drawn on the web version
  }

  setOverlays(o) { Object.assign(this.overlays, o); }

  render(state) {
    if (!this.ride) return;
    const k = state.step, steps = this.ride.steps, n = steps.length - 1, s = steps[k];
    this.segs.forEach((seg, i) => { seg.style.display = i < k ? "" : "none"; });
    if (this.overlays.future && k < n) {
      this.future.setAttribute("d", this.routePts.slice(k).map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(""));
      this.future.style.display = "";
    } else this.future.style.display = "none";
    this.milestones.forEach((m, i) => { m.style.display = (i + 1) * MILESTONE <= k ? "" : "none"; });

    clear(this.gNow); clear(this.gLabels);
    const here = this.routePts[k];

    // the strongest wrong intersection, only while its readout is hovered
    if (state.hover === "wrong" && s.position.wrong_node) {
      const wp = this.px(s.position.wrong_node);
      if (wp) {
        const inside = this.inView(wp, -6);
        const q = inside ? wp : this.clampToEdge(wp, here);
        svg("line", { class: "wrong-link", x1: here[0], y1: here[1], x2: q[0], y2: q[1] }, this.gNow);
        svg("circle", { class: "wrong-node" + (inside ? "" : " offmap"), cx: q[0], cy: q[1], r: 5.5 }, this.gNow);
        svg("circle", { class: "hover-ring on", cx: q[0], cy: q[1], r: 11, stroke: P.bad }, this.gNow);
        svg("text", { class: "node-label", x: q[0] + 13, y: q[1] + 4, text: inside ? "strongest wrong intersection" : "strongest wrong intersection, off this window" }, this.gLabels);
      }
    }
    if (state.hover === "true") svg("circle", { class: "hover-ring on", cx: here[0], cy: here[1], r: 13, stroke: P.good }, this.gNow);

    // hovering the compass panel: the decoded bearing (plum) and the bearing to the goal (ink) as rays
    const compassHover = state.hover === "compass" && s.goal_bearing_deg !== null;
    if (compassHover) {
      // the decoded bearing as a thin ray with its pointer at the tip; the bearing to the goal dashed
      const g = this.px(this.ride.goal);
      const toGoal = Math.hypot(g[0] - here[0], g[1] - here[1]);
      const a = rad(s.goal_bearing_deg), c = s.compass.decoded_bearing_deg, len = Math.max(120, toGoal);
      svg("line", { class: "ray actual", x1: here[0], y1: here[1], x2: g[0], y2: g[1] }, this.gNow);
      const tip = [here[0] + Math.cos(rad(c)) * len, here[1] - Math.sin(rad(c)) * len];
      svg("line", { class: "ray decoded", x1: here[0], y1: here[1], x2: tip[0], y2: tip[1] }, this.gNow);
      svg("path", { class: "compass-decoded", d: "M0 -8L4.5 0L-4.5 0Z", transform: `translate(${tip[0]} ${tip[1]}) rotate(${90 - c})` }, this.gNow);
    }
    // the compass at the taxi: decoded bearing (plum pointer) and the actual bearing to the goal (ink tick)
    if (this.overlays.compass && s.goal_bearing_deg !== null && !compassHover) {
      const R = 21;
      svg("circle", { class: "compass-ring", cx: here[0], cy: here[1], r: R }, this.gNow);
      const a = rad(s.goal_bearing_deg);
      svg("line", { class: "compass-actual", x1: here[0] + Math.cos(a) * (R + 1), y1: here[1] - Math.sin(a) * (R + 1), x2: here[0] + Math.cos(a) * (R + 9), y2: here[1] - Math.sin(a) * (R + 9) }, this.gNow);
      const c = s.compass.decoded_bearing_deg;
      svg("path", { class: "compass-decoded", d: "M0 -8L4.5 0L-4.5 0Z", transform: `translate(${here[0] + Math.cos(rad(c)) * (R + 4)} ${here[1] - Math.sin(rad(c)) * (R + 4)}) rotate(${90 - c})` }, this.gNow);
    }

    // the next move: the model's own choice (clay), a forced move (slate) with the model's proposal dashed,
    // or an attempted illegal move (a stub ending in a cross: no intersection is reached)
    const pr = s.prediction;
    let heading = k > 0 ? this.bearingPx(this.routePts[k - 1], here) : (this.world.moveBearing[pr.executed] ?? 90);
    if (pr.executed && MOVES.includes(pr.executed)) {
      if (pr.executed_legal) {
        const to = this.routePts[k + 1];
        heading = this.bearingPx(here, to);
        if (pr.forced) {
          this.arrow(here, to, "move forced", "arrow-forced");
          if (pr.proposed && pr.proposed !== "END" && pr.proposed !== pr.executed) this.arrow(here, this.stub(here, pr.proposed, 30), "move proposed", "arrow-own");
        } else this.arrow(here, to, "move own", "arrow-own");
      } else {
        const q = this.stub(here, pr.executed, 36), q0 = this.stub(here, pr.executed, 11);
        heading = this.world.moveBearing[pr.executed] ?? MOVE_ANGLE[pr.executed];
        svg("line", { class: "move illegal", x1: q0[0], y1: q0[1], x2: q[0], y2: q[1] }, this.gNow);
        svg("path", { class: "illegal-x", d: `M${q[0] - 5} ${q[1] - 5}L${q[0] + 5} ${q[1] + 5}M${q[0] + 5} ${q[1] - 5}L${q[0] - 5} ${q[1] + 5}` }, this.gNow);
      }
    }
    this.taxi(here, heading);
    if (pr.executed === "END") {
      svg("text", { class: "node-label", x: here[0] + 12, y: here[1] + 18, text: s.node === this.ride.goal ? "END at the goal" : "END away from the goal" }, this.gLabels);
    }
  }

  // a small top-down yellow cab, nose along the heading (degrees, math convention): four wheel stubs,
  // a body with a rounder nose, and the windscreen and rear window as two dark bands
  taxi(p, heading) {
    const g = svg("g", { class: "taxi", transform: `translate(${p[0]} ${p[1]}) rotate(${-heading})` }, this.gNow);
    for (const [x, y] of [[-6.5, -6.6], [3.3, -6.6], [-6.5, 4.6], [3.3, 4.6]]) svg("rect", { class: "taxi-wheel", x, y, width: 3.2, height: 2, rx: .6 }, g);
    svg("path", { class: "taxi-body", d: "M-9 -4.2 Q-9 -5.5 -7.5 -5.5 L7 -5.5 Q10 -5.5 10 -3 L10 3 Q10 5.5 7 5.5 L-7.5 5.5 Q-9 5.5 -9 4.2 Z" }, g);
    svg("rect", { class: "taxi-window", x: 2.4, y: -3.6, width: 2.4, height: 7.2, rx: .6 }, g);
    svg("rect", { class: "taxi-window", x: -5.2, y: -3.6, width: 2, height: 7.2, rx: .6 }, g);
  }
  bearingPx(a, b) { return Math.atan2(-(b[1] - a[1]), b[0] - a[0]) * 180 / Math.PI; }
  // arrows leave from the taxi's nose (11 px out) and stop short of the destination
  arrow(a, b, cls, marker) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const t0 = Math.min(0.45, 11 / L), t1 = Math.max(t0, (L - 5) / L);
    svg("line", { class: cls, x1: a[0] + dx * t0, y1: a[1] + dy * t0, x2: a[0] + dx * t1, y2: a[1] + dy * t1, "marker-end": `url(#${marker})` }, this.gNow);
  }
  // a short segment in the direction a move label points on this street grid (no street exists for it)
  stub(a, move, len) {
    const ang = this.world.moveBearing[move] ?? MOVE_ANGLE[move];
    return [a[0] + Math.cos(rad(ang)) * len, a[1] - Math.sin(rad(ang)) * len];
  }
  clampToEdge(p, from) {
    const m = 10, { w, h } = this.view;
    const dx = p[0] - from[0], dy = p[1] - from[1];
    let t = 1;
    if (p[0] < m) t = Math.min(t, (m - from[0]) / dx);
    if (p[0] > w - m) t = Math.min(t, (w - m - from[0]) / dx);
    if (p[1] < m) t = Math.min(t, (m - from[1]) / dy);
    if (p[1] > h - m) t = Math.min(t, (h - m - from[1]) / dy);
    return [from[0] + dx * t, from[1] + dy * t];
  }
  resize() { if (this.ride) { this.fit(); this.drawStatic(); } }
}
