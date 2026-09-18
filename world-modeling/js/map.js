// The Manhattan map: streets, the ride's route coloured by time, the taxi and its next move, the goal,
// the strongest wrong intersection and a small compass at the taxi. Drawn in pixel space from the
// graph's metre coordinates so stroke widths and marker sizes stay constant.

import { P, MOVE_ANGLE, MILESTONE, svg, clear, timeColor, starPath, rad } from "./util.js";

export class MapView {
  constructor(frame, world) {
    this.frame = frame;
    this.svg = frame.querySelector("svg.map");
    this.locator = frame.querySelector("svg.locator");
    this.note = frame.querySelector(".map-note");
    this.world = world;
    this.ride = null;
    this.view = null;           // {x0, y1, k, w, h}
    this.overlays = { compass: true, wrong: true, future: true };
    this.hoverNode = null;
    this.onHover = () => {};
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
    // the whole island at a glance, so the reader knows where the ride's window sits
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

  setRide(ride) {
    this.ride = ride;
    this.fit();
    this.drawStatic();
  }

  // Fit the ride (route + goal, and the wrong intersections when they are near) into the frame.
  fit() {
    const W = this.frame.clientWidth || 600, H = this.frame.clientHeight || 500;
    const pts = this.ride.steps.map(s => this.world.nodes[s.node]).filter(Boolean);
    pts.push(this.world.nodes[this.ride.goal]);
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const [x, y] of pts) { minx = Math.min(minx, x); miny = Math.min(miny, y); maxx = Math.max(maxx, x); maxy = Math.max(maxy, y); }
    // widen a little for wrong intersections that sit just outside the route's own box (judged against
    // that box, so far-away wrong nodes cannot chain the window open)
    const span = Math.max(maxx - minx, maxy - miny);
    const box = [minx - span * 0.2, miny - span * 0.2, maxx + span * 0.2, maxy + span * 0.2];
    for (const s of this.ride.steps) {
      const w = s.position.wrong_node && this.world.nodes[s.position.wrong_node];
      if (!w) continue;
      if (w[0] > box[0] && w[0] < box[2] && w[1] > box[1] && w[1] < box[3]) {
        minx = Math.min(minx, w[0]); maxx = Math.max(maxx, w[0]); miny = Math.min(miny, w[1]); maxy = Math.max(maxy, w[1]);
      }
    }
    const padPx = 46;
    const k = Math.min((W - 2 * padPx) / Math.max(1, maxx - minx), (H - 2 * padPx) / Math.max(1, maxy - miny));
    const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
    this.view = { k, x0: cx - (W / 2) / k, y1: cy + (H / 2) / k, w: W, h: H };
    this.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    this.locView.setAttribute("x", this.locX(this.view.x0));
    this.locView.setAttribute("y", this.locY(this.view.y1));
    this.locView.setAttribute("width", ((W / k) * this.locScale.k).toFixed(1));
    this.locView.setAttribute("height", ((H / k) * this.locScale.k).toFixed(1));
  }
  px(id) { const n = this.world.nodes[id]; return n ? this.pt(n) : null; }
  pt([x, y]) { return [(x - this.view.x0) * this.view.k, (this.view.y1 - y) * this.view.k]; }
  inView([x, y], m = 0) { return x >= -m && x <= this.view.w + m && y >= -m && y <= this.view.h + m; }

  drawStatic() {
    clear(this.gStreets); clear(this.gRoute); clear(this.gMarks);
    const { w, h } = this.view;
    // streets: every directed street with an endpoint in the window, one path
    const d = [];
    const seen = new Set();
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

    // the route: one segment per move, coloured by time (drawn later up to the current step)
    const steps = this.ride.steps, n = steps.length - 1;
    this.routePts = steps.map(s => this.px(s.node));
    this.segs = [];
    for (let k = 0; k < n; k++) {
      const a = this.routePts[k], b = this.routePts[k + 1];
      const seg = svg("path", { class: "route-seg", d: `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`, stroke: timeColor(k + 0.5, n) }, this.gRoute);
      this.segs.push(seg);
    }
    this.future = svg("path", { class: "route-future", d: "" }, this.gRoute);
    this.gRoute.insertBefore(this.future, this.gRoute.firstChild);

    // origin, goal, milestone squares
    const o = this.routePts[0];
    svg("circle", { class: "origin", cx: o[0], cy: o[1], r: 4.2 }, this.gMarks);
    const g = this.px(this.ride.goal);
    svg("path", { class: "goal", d: starPath(8), transform: `translate(${g[0]} ${g[1]})` }, this.gMarks);
    this.milestones = [];
    for (let k = MILESTONE; k < n; k += MILESTONE) {
      const p = this.routePts[k];
      this.milestones.push(svg("rect", { class: "milestone", x: p[0] - 3, y: p[1] - 3, width: 6, height: 6, fill: timeColor(k, n) }, this.gMarks));
    }
  }

  setOverlays(o) { Object.assign(this.overlays, o); }

  render(state) {
    if (!this.ride) return;
    const k = state.step, steps = this.ride.steps, n = steps.length - 1, s = steps[k];
    // route so far: solid; ahead: faint dashes
    this.segs.forEach((seg, i) => { seg.style.display = i < k ? "" : "none"; });
    if (this.overlays.future && k < n) {
      this.future.setAttribute("d", this.routePts.slice(k).map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(""));
      this.future.style.display = "";
    } else this.future.style.display = "none";
    this.milestones.forEach((m, i) => { m.style.display = (i + 1) * MILESTONE <= k ? "" : "none"; });

    clear(this.gNow); clear(this.gLabels);
    const here = this.routePts[k];

    // the strongest wrong intersection (and the hover ring for true/wrong)
    const wrongId = s.position.wrong_node;
    if (this.overlays.wrong && wrongId) {
      const wp = this.px(wrongId);
      if (wp) {
        const inside = this.inView(wp, -6);
        const q = inside ? wp : this.clampToEdge(wp, here);
        if (state.hover === "wrong") svg("line", { class: "wrong-link", x1: here[0], y1: here[1], x2: q[0], y2: q[1] }, this.gNow);
        svg("circle", { class: "wrong-node" + (inside ? "" : " offmap"), cx: q[0], cy: q[1], r: 5.5 }, this.gNow);
        this.hoverRingWrong = svg("circle", { class: "hover-ring" + (state.hover === "wrong" ? " on" : ""), cx: q[0], cy: q[1], r: 11, stroke: P.bad }, this.gNow);
        if (!inside) svg("text", { class: "node-label", x: q[0] + 8, y: q[1] + 4, text: "wrong node, off this window" }, this.gLabels);
      }
    }
    this.hoverRingTrue = svg("circle", { class: "hover-ring" + (state.hover === "true" ? " on" : ""), cx: here[0], cy: here[1], r: 12, stroke: P.good }, this.gNow);

    // compass at the taxi: decoded bearing (clay) and the actual bearing to the goal (ink)
    if (this.overlays.compass && s.goal_bearing_deg !== null) {
      const R = 21;
      svg("circle", { class: "compass-ring", cx: here[0], cy: here[1], r: R }, this.gNow);
      const a = rad(s.goal_bearing_deg);
      svg("line", { class: "compass-actual", x1: here[0] + Math.cos(a) * (R + 1), y1: here[1] - Math.sin(a) * (R + 1), x2: here[0] + Math.cos(a) * (R + 9), y2: here[1] - Math.sin(a) * (R + 9) }, this.gNow);
      const c = s.compass.decoded_bearing_deg;
      svg("path", { class: "compass-decoded", d: "M0 -8L4.5 0L-4.5 0Z", transform: `translate(${here[0] + Math.cos(rad(c)) * (R + 4)} ${here[1] - Math.sin(rad(c)) * (R + 4)}) rotate(${90 - c})` }, this.gNow);
    }

    // the next move: the model's own choice (clay), a forced move (slate) with the model's proposal dashed,
    // or an attempted illegal move (a stub that ends in a cross: no intersection is reached)
    const pr = s.prediction;
    if (pr.executed && pr.executed !== "END") {
      if (pr.executed_legal) {
        const to = this.routePts[k + 1];
        if (pr.forced) {
          this.arrow(here, to, "move forced", "arrow-forced");
          if (pr.proposed && pr.proposed !== "END" && pr.proposed !== pr.executed) {
            const q = this.stub(here, pr.proposed, 30);
            this.arrow(here, q, "move proposed", "arrow-own");
          }
        } else this.arrow(here, to, "move own", "arrow-own");
      } else {
        const q = this.stub(here, pr.executed, 34);
        svg("line", { class: "move illegal", x1: here[0], y1: here[1], x2: q[0], y2: q[1] }, this.gNow);
        svg("path", { class: "illegal-x", d: `M${q[0] - 5} ${q[1] - 5}L${q[0] + 5} ${q[1] + 5}M${q[0] + 5} ${q[1] - 5}L${q[0] - 5} ${q[1] + 5}` }, this.gNow);
      }
    }
    // the taxi
    svg("circle", { class: "taxi", cx: here[0], cy: here[1], r: 5.5 }, this.gNow);

    if (pr.executed === "END") {
      svg("text", { class: "node-label", x: here[0] + 12, y: here[1] + 18, text: s.node === this.ride.goal ? "END at the goal" : "END away from the goal" }, this.gLabels);
    }
  }

  arrow(a, b, cls, marker) {
    // shorten a little so the head does not cover the destination intersection
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const t = Math.max(0, (L - 5) / L);
    svg("line", { class: cls, x1: a[0], y1: a[1], x2: a[0] + dx * t, y2: a[1] + dy * t, "marker-end": `url(#${marker})` }, this.gNow);
  }
  // a short segment in the direction a move label points on this street grid (no street exists for it)
  stub(a, move, len) {
    const ang = this.world.moveBearing[move] ?? MOVE_ANGLE[move];
    return [a[0] + Math.cos(rad(ang)) * len, a[1] - Math.sin(rad(ang)) * len];
  }
  clampToEdge(p, from) {
    const m = 10, { w, h } = this.view;
    let [x, y] = p;
    const dx = x - from[0], dy = y - from[1];
    let t = 1;
    if (x < m) t = Math.min(t, (m - from[0]) / dx);
    if (x > w - m) t = Math.min(t, (w - m - from[0]) / dx);
    if (y < m) t = Math.min(t, (m - from[1]) / dy);
    if (y > h - m) t = Math.min(t, (h - m - from[1]) / dy);
    return [from[0] + dx * t, from[1] + dy * t];
  }

  resize() { if (this.ride) { this.fit(); this.drawStatic(); } }
}
