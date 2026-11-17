// @ts-check
/**
 * sheet-chart.js — a chart from a range of cells, drawn as SVG.
 *
 *   renderChart(chart, wb, sheetIndex, calc) → an <svg>
 *   chart = { type: 'bar' | 'line' | 'pie', range: 'A1:C7', title }
 *
 * The first column is the labels; each other column is a series (named by
 * its first row, when that row is text). Bars and lines share one scale;
 * a pie uses the first series.
 */

import { toRange } from './sheet-model.js';

const NS = 'http://www.w3.org/2000/svg';
const COLORS = ['#2b5bd7', '#e07a1f', '#1a7f5a', '#9b3fc7', '#c2185b', '#00838f'];

function el(tag, attrs = {}, ...children) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) node.setAttribute(k, String(v));
  for (const c of children) if (c != null) node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return node;
}

/** Labels and series from the range. */
export function chartData(chart, wb, s, calc) {
  const r = toRange(chart.range);
  if (!r) return { labels: [], series: [] };
  const firstRowIsHeader = (() => {
    for (let c = r.c1 + 1; c <= r.c2; c += 1) if (typeof calc.value(s, c, r.r1) === 'string' && calc.value(s, c, r.r1) !== '') return true;
    return false;
  })();
  const start = firstRowIsHeader ? r.r1 + 1 : r.r1;
  const labels = [];
  for (let row = start; row <= r.r2; row += 1) labels.push(calc.display(s, r.c1, row));
  const series = [];
  const firstSeriesCol = r.c2 > r.c1 ? r.c1 + 1 : r.c1;
  for (let c = firstSeriesCol; c <= r.c2; c += 1) {
    const values = [];
    for (let row = start; row <= r.r2; row += 1) { const v = calc.value(s, c, row); values.push(typeof v === 'number' ? v : 0); }
    series.push({ name: firstRowIsHeader ? calc.display(s, c, r.r1) : `Series ${series.length + 1}`, values });
  }
  return { labels, series };
}

export function renderChart(chart, wb, s, calc) {
  const W = 560; const H = 300;
  const { labels, series } = chartData(chart, wb, s, calc);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'sheet-chart__svg', role: 'img', 'aria-label': chart.title || 'Chart' });
  if (!series.length || !labels.length) { svg.append(el('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', fill: '#6b7280', 'font-size': 13 }, 'Pick a range with labels and numbers')); return svg; }

  if (chart.type === 'pie') {
    const values = series[0].values.map((v) => Math.max(0, v));
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const cx = 160; const cy = H / 2; const rad = 115;
    let angle = -Math.PI / 2;
    values.forEach((v, i) => {
      const a2 = angle + (v / total) * Math.PI * 2;
      const large = a2 - angle > Math.PI ? 1 : 0;
      const p1 = [cx + rad * Math.cos(angle), cy + rad * Math.sin(angle)];
      const p2 = [cx + rad * Math.cos(a2), cy + rad * Math.sin(a2)];
      const path = values.length === 1 ? el('circle', { cx, cy, r: rad, fill: COLORS[0] }) : el('path', { d: `M${cx},${cy} L${p1[0]},${p1[1]} A${rad},${rad} 0 ${large} 1 ${p2[0]},${p2[1]} Z`, fill: COLORS[i % COLORS.length], stroke: '#fff', 'stroke-width': 2 });
      path.append(el('title', {}, `${labels[i]}: ${v} (${Math.round((v / total) * 100)}%)`));
      svg.append(path);
      angle = a2;
    });
    labels.slice(0, 10).forEach((label, i) => {
      svg.append(el('rect', { x: 320, y: 40 + i * 24, width: 12, height: 12, rx: 2, fill: COLORS[i % COLORS.length] }));
      svg.append(el('text', { x: 340, y: 51 + i * 24, 'font-size': 12, fill: '#374151' }, `${label} · ${Math.round((values[i] / total) * 100)}%`));
    });
    return svg;
  }

  const left = 48; const right = 16; const top = 16; const bottom = 48;
  const all = series.flatMap((x) => x.values);
  const max = Math.max(0, ...all); const min = Math.min(0, ...all);
  const span = max - min || 1;
  const step = niceStep(span / 5);
  const top0 = Math.ceil(max / step) * step; const bot0 = Math.floor(min / step) * step;
  const y = (v) => top + (H - top - bottom) * (1 - (v - bot0) / ((top0 - bot0) || 1));
  for (let v = bot0; v <= top0 + 1e-9; v += step) {
    svg.append(el('line', { x1: left, x2: W - right, y1: y(v), y2: y(v), stroke: '#e5e7eb' }));
    svg.append(el('text', { x: left - 6, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: '#6b7280' }, short(v)));
  }
  const band = (W - left - right) / labels.length;
  labels.forEach((label, i) => {
    if (labels.length <= 16 || i % Math.ceil(labels.length / 16) === 0) {
      svg.append(el('text', { x: left + band * (i + 0.5), y: H - bottom + 16, 'text-anchor': 'middle', 'font-size': 11, fill: '#6b7280' }, String(label).slice(0, 12)));
    }
  });
  if (chart.type === 'line') {
    series.forEach((ser, k) => {
      const pts = ser.values.map((v, i) => `${left + band * (i + 0.5)},${y(v)}`).join(' ');
      svg.append(el('polyline', { points: pts, fill: 'none', stroke: COLORS[k % COLORS.length], 'stroke-width': 2.5 }));
      ser.values.forEach((v, i) => { const c = el('circle', { cx: left + band * (i + 0.5), cy: y(v), r: 3.5, fill: COLORS[k % COLORS.length] }); c.append(el('title', {}, `${ser.name}, ${labels[i]}: ${v}`)); svg.append(c); });
    });
  } else {
    const inner = band * 0.72; const w = inner / series.length;
    series.forEach((ser, k) => ser.values.forEach((v, i) => {
      const x = left + band * i + (band - inner) / 2 + w * k;
      const rect = el('rect', { x, y: Math.min(y(v), y(0)), width: Math.max(1, w - 2), height: Math.abs(y(v) - y(0)), rx: 2, fill: COLORS[k % COLORS.length] });
      rect.append(el('title', {}, `${ser.name}, ${labels[i]}: ${v}`));
      svg.append(rect);
    }));
  }
  if (series.length > 1) {
    series.forEach((ser, k) => {
      svg.append(el('rect', { x: left + k * 120, y: H - 18, width: 10, height: 10, rx: 2, fill: COLORS[k % COLORS.length] }));
      svg.append(el('text', { x: left + 14 + k * 120, y: H - 9, 'font-size': 11, fill: '#374151' }, String(ser.name).slice(0, 14)));
    });
  }
  return svg;
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
const short = (v) => (Math.abs(v) >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${+(v / 1e3).toFixed(1)}k` : String(+v.toFixed(2)));
