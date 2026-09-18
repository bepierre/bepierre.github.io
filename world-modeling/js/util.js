// Small shared helpers: the palette (from the paper's plots/viz.py), SVG construction, colour and number formatting.

export const P = {
  ink: "#1a1a1a", charcoal: "#383838", muted: "#6f6f6f", sand: "#B3A89A", grid: "#DCD6CC",
  clay: "#CC785C", slate: "#5B6E8C", good: "#5E8C57", bad: "#B0463A",
};

// the eight move tokens in compass order for display, plus END; bearings in math convention (E = 0, N = 90)
export const MOVES = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export const TOKENS = [...MOVES, "END"];
export const MOVE_ANGLE = { E: 0, NE: 45, N: 90, NW: 135, W: 180, SW: 225, S: 270, SE: 315 };
export const MILESTONE = 20;   // the paper marks every 20 moves on the route and the time axis

const NS = "http://www.w3.org/2000/svg";

export function svg(tag, attrs = {}, parent = null) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    if (k === "text") el.textContent = v;
    else el.setAttribute(k, v);
  }
  if (parent) parent.appendChild(el);
  return el;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

export function el(tag, attrs = {}, parent = null) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    if (k === "text") e.textContent = v;
    else if (k === "html") e.innerHTML = v;
    else if (k === "class") e.className = v;
    else e.setAttribute(k, v);
  }
  if (parent) parent.appendChild(e);
  return e;
}

function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function mix(a, b, t) {
  const A = hex(a), B = hex(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * Math.min(1, Math.max(0, t))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
// the route's time colour: sand at the start, charcoal at the end (plots/failure_examples.py)
export function timeColor(k, n) { return mix(P.sand, P.charcoal, n > 0 ? k / n : 0); }

export function softmax(obj, keys) {
  const vals = keys.map(k => obj[k]);
  const m = Math.max(...vals);
  const ex = vals.map(v => Math.exp(v - m));
  const s = ex.reduce((a, b) => a + b, 0);
  const out = {};
  keys.forEach((k, i) => { out[k] = ex[i] / s; });
  return out;
}

export const rad = d => d * Math.PI / 180;
export const wrap = d => ((d + 180) % 360 + 360) % 360 - 180;
export function fmtDeg(d) { return d === null || d === undefined ? "–" : `${Math.round(((d % 360) + 360) % 360)}°`; }
export function fmtNum(v, digits = 0) { return v === null || v === undefined ? "–" : v.toFixed(digits); }
export function fmtPct(p) { return p >= 0.995 ? ">99%" : p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`; }

// a five-point star path centred on (0,0), radius r
export function starPath(r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rr = i % 2 ? r * 0.42 : r;
    pts.push(`${(Math.cos(a) * rr).toFixed(2)},${(Math.sin(a) * rr).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
