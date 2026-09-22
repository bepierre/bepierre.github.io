// The timeline is the paper's trace figure (Fig. 4): the true-position write and the strongest wrong-node
// activation across the ride, with the route's own time colour running along the axis, plus position noise
// on its own right-hand scale. It is also the scrubber.

import { P, MILESTONE, svg, clear, timeColor, starPath } from "./util.js";

const M = { l: 34, r: 30, t: 20, b: 26 };
let H = 124;

export class TimelineView {
  constructor(container) {
    this.container = container;
    this.svg = container.querySelector("svg");
    this.ride = null;
    this.onScrub = () => {};
    this.lastState = null;
    this.bind();
    // the box's size depends on the panels above it; redraw whenever it changes
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(() => {
        if (this.ride && (this.container.clientWidth !== this.W || this.container.clientHeight !== H)) { this.draw(); if (this.lastState) this.render(this.lastState); }
      }).observe(this.container);
    }
  }

  bind() {
    const stepAt = ev => {
      const rect = this.svg.getBoundingClientRect();
      return Math.max(0, Math.min(this.n, Math.round(this.xInv(ev.clientX - rect.left))));
    };
    let dragging = false;
    this.svg.addEventListener("pointerdown", ev => {
      if (!this.ride) return;
      dragging = true;
      this.onScrub(stepAt(ev));
      try { this.svg.setPointerCapture(ev.pointerId); } catch (_) { /* synthetic pointers cannot be captured */ }
    });
    this.svg.addEventListener("pointermove", ev => {
      if (!this.ride) return;
      if (dragging) this.onScrub(stepAt(ev));
      else { const x = this.x(stepAt(ev)); this.hoverLine.setAttribute("x1", x); this.hoverLine.setAttribute("x2", x); this.hoverLine.classList.add("on"); }
    });
    this.svg.addEventListener("pointerup", ev => { dragging = false; try { this.svg.releasePointerCapture(ev.pointerId); } catch (_) { /* not captured */ } });
    this.svg.addEventListener("pointerleave", () => { this.hoverLine.classList.remove("on"); });
  }

  setRide(ride) {
    this.ride = ride; this.n = ride.steps.length - 1;
    const w = document.getElementById("trace-where");
    if (w) w.textContent = `layer ${ride.layers.position_write}`;
    this.draw();
  }

  x(k) { return M.l + (k / this.xmax) * (this.W - M.l - M.r); }
  xInv(px) { return (px - M.l) / (this.W - M.l - M.r) * this.xmax; }
  y(v) { return M.t + (1 - v / this.ymax) * (H - M.t - M.b); }
  yn(v) { return M.t + (1 - v / this.nmax) * (H - M.t - M.b); }

  draw() {
    clear(this.svg);
    this.W = this.container.clientWidth || 500;
    H = this.container.clientHeight || 124;
    this.svg.setAttribute("viewBox", `0 0 ${this.W} ${H}`);
    const steps = this.ride.steps, n = this.n;
    this.xmax = n <= 100 ? 100 : 128;
    const vals = steps.flatMap(s => [s.position.write, s.position.wrong_activation]).filter(v => v !== null);
    this.ymax = Math.max(800, Math.ceil(Math.max(...vals) / 200) * 200);
    const noise = steps.map(s => s.position.noise).filter(v => v !== null);
    this.hasNoise = noise.length > 0;
    this.nmax = this.hasNoise ? Math.max(200, Math.ceil(Math.max(...noise) / 100) * 100) : 200;
    const y0 = this.y(0);

    // frame: a bare left spine with three ticks, as in the figures; a right spine for noise
    svg("line", { class: "spine", x1: M.l, y1: this.y(this.ymax), x2: M.l, y2: y0 }, this.svg);
    for (const v of [0, this.ymax / 2, this.ymax]) {
      svg("line", { class: "spine", x1: M.l - 3, x2: M.l, y1: this.y(v), y2: this.y(v) }, this.svg);
      svg("text", { class: "tick-text", x: M.l - 5, y: this.y(v) + 3.5, "text-anchor": "end", text: v }, this.svg);
    }
    if (this.hasNoise) {
      const xr = this.W - M.r;
      svg("line", { class: "spine", x1: xr, y1: this.y(this.ymax), x2: xr, y2: y0 }, this.svg);
      for (const v of [0, this.nmax / 2, this.nmax]) {
        svg("line", { class: "spine", x1: xr, x2: xr + 3, y1: this.yn(v), y2: this.yn(v) }, this.svg);
        svg("text", { class: "tick-text", x: xr + 5, y: this.yn(v) + 3.5, text: v }, this.svg);
      }
    }
    const xt = this.xmax === 100 ? [0, 50, 100] : [0, 60, 120];
    xt.forEach((v, i) => {
      svg("text", { class: "tick-text", x: this.x(v), y: H - 3, "text-anchor": i === 0 ? "start" : i === xt.length - 1 ? "end" : "middle", text: i === 0 ? `${v} moves` : v }, this.svg);
    });
    // the origin state carries no position readout
    svg("rect", { class: "unmeasured", x: this.x(0), y: this.y(this.ymax), width: Math.max(0, this.x(1) - this.x(0)), height: y0 - this.y(this.ymax) }, this.svg);

    const path = (key, yf) => steps.slice(1).map((s, i) => `${i ? "L" : "M"}${this.x(i + 1).toFixed(1)} ${yf(s.position[key]).toFixed(1)}`).join("");
    if (this.hasNoise) svg("path", { class: "series-noise", d: path("noise", v => this.yn(v)) }, this.svg);
    this.trueLine = svg("path", { class: "series-true", d: path("write", v => this.y(v)) }, this.svg);
    this.wrongLine = svg("path", { class: "series-wrong", d: path("wrong_activation", v => this.y(v)) }, this.svg);

    // the ending: an illegal-move cross, or END
    if (this.ride.outcome === "illegal") {
      svg("line", { class: "illegal-stem", x1: this.x(n), x2: this.x(n), y1: y0, y2: this.y(this.ymax * 0.92) }, this.svg);
      const cx = this.x(n), cy = this.y(this.ymax * 0.96);
      svg("path", { class: "illegal-x", d: `M${cx - 3.5} ${cy - 3.5}L${cx + 3.5} ${cy + 3.5}M${cx + 3.5} ${cy - 3.5}L${cx - 3.5} ${cy + 3.5}` }, this.svg);
    } else if (steps[n].prediction.executed === "END") {
      // END at the goal: the goal's star, as on the map; END elsewhere: a hollow ring
      if (steps[n].node === this.ride.goal) svg("path", { class: "end-mark", d: starPath(5.5), transform: `translate(${this.x(n)} ${this.y(this.ymax * 0.94)})` }, this.svg);
      else svg("circle", { class: "end-mark-off", cx: this.x(n), cy: this.y(this.ymax * 0.96), r: 3 }, this.svg);
    }

    // the time bar along the axis: sand → charcoal to the end of the ride, grid beyond
    svg("line", { class: "timebar-rest", x1: this.x(n), x2: this.x(this.xmax), y1: y0, y2: y0 }, this.svg);
    for (let k = 0; k < n; k++) svg("line", { class: "timebar", x1: this.x(k), x2: this.x(k + 1) + 0.3, y1: y0, y2: y0, stroke: timeColor(k + 0.5, n) }, this.svg);
    for (let k = MILESTONE; k < n; k += MILESTONE) svg("rect", { class: "milestone", x: this.x(k) - 3, y: y0 - 3, width: 6, height: 6, fill: timeColor(k, n) }, this.svg);
    if (this.ride.family === "detour") {
      for (let k = 0; k < n; k++) if (steps[k].prediction.forced) svg("line", { class: "forced-tick", x1: this.x(k), x2: this.x(k), y1: y0 + 5, y2: y0 + 9 }, this.svg);
    }

    // legend along the top, in the figure's words
    const lg = svg("g", { class: "legend" }, this.svg);
    let lx = M.l + 4;
    const items = [["true node write", "t"], ["strongest wrong node", "w"]];
    if (this.hasNoise) items.push(["noise, right scale", "n"]);
    if (this.ride.family === "detour") items.push(["forced move", "f"]);
    for (const [label, cls] of items) {
      const t = svg("text", { class: cls, x: lx, y: M.t - 9, text: label }, lg);
      lx += (t.getComputedTextLength ? t.getComputedTextLength() : label.length * 5.2) + 10;
    }

    this.hoverLine = svg("line", { class: "hover", x1: 0, x2: 0, y1: this.y(this.ymax), y2: y0 }, this.svg);
    this.cursor = svg("line", { class: "cursor", x1: 0, x2: 0, y1: this.y(this.ymax) - 2, y2: y0 + 4 }, this.svg);
    this.cursorHead = svg("path", { class: "cursor-head", d: "M-4 0L4 0L0 5Z" }, this.svg);
  }

  render(state) {
    if (!this.ride) return;
    this.lastState = state;
    if (this.container.clientWidth !== this.W || this.container.clientHeight !== H) this.draw();
    const x = this.x(state.step);
    this.cursor.setAttribute("x1", x); this.cursor.setAttribute("x2", x);
    this.cursorHead.setAttribute("transform", `translate(${x} ${this.y(this.ymax) - 7})`);
    this.trueLine.classList.toggle("lit", state.hover === "true");
    this.trueLine.classList.toggle("dim", state.hover === "wrong");
    this.wrongLine.classList.toggle("lit", state.hover === "wrong");
    this.wrongLine.classList.toggle("dim", state.hover === "true");
  }
  resize() { if (this.ride) this.draw(); }
}
