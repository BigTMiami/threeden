// @ts-check
/**
 * sheet-model.js — a spreadsheet workbook: its saved shape, computing every
 * cell, formats, and the changes the editor makes (rows, columns, sort, fill,
 * paste, sheets).
 *
 * Saved shape (module data, or a vault file's data):
 *   {
 *     v: 2,
 *     active: 0,                                  ← the sheet showing
 *     sheets: [{
 *       id, name: 'Sheet1',
 *       cols: 12, rows: 60,                       ← the grid's size (it grows as you go)
 *       cells: { A1: 'Item', B5: '=SUM(B2:B4)',   ← plain cells are just what was typed
 *                C2: { v: '12.5', s: { b: true, n: 'currency' } } },  ← styled ones carry s
 *       widths: { 0: 160 },                       ← column widths in px (default 100)
 *       freeze: { rows: 1, cols: 0 },
 *       filters: { 2: { hide: ['Sold out'] } },   ← by column: values hidden (header row 1)
 *       validation: { C: { list: ['Yes', 'No'] } },  ← a dropdown for a column
 *       rules: [{ range: 'D2:D50', op: '<', value: 5, fill: '#fde2e1' }],  ← conditional formatting
 *       charts: [{ id, type: 'bar'|'line'|'pie', range: 'A1:B6', title }],
 *     }],
 *   }
 * Older data ({ cols, rows, cells, header, formats }) opens as one sheet.
 *
 * Styles (s): b bold, i italic, u underline, x strikethrough, c text color,
 * f fill, a align ('left'|'center'|'right'), w wrap, n number format
 * (FORMATS below), d decimals.
 */

import { makeId } from '../../ui/dom.js';
import {
  evaluateFormula, parseInput, isError, SheetError, cellName, colName, parseCellName, rewriteRefs, shiftFormula,
  formatGeneral, serialToDate, tokenize, DATE_FUNCTIONS,
} from './sheet-formula.js';

export const MAX_COLS = 200;
export const MAX_ROWS = 5000;
export const DEFAULT_WIDTH = 100;
export const ROW_HEIGHT = 26;

export const FORMATS = [
  { id: '', label: 'Automatic' },
  { id: 'number', label: 'Number', sample: '1,234.56' },
  { id: 'currency', label: 'Currency', sample: '$1,234.56' },
  { id: 'percent', label: 'Percent', sample: '12.5%' },
  { id: 'integer', label: 'Whole number', sample: '1,235' },
  { id: 'date', label: 'Date', sample: 'Nov 14, 2026' },
  { id: 'shortdate', label: 'Short date', sample: '11/14/2026' },
  { id: 'time', label: 'Time', sample: '6:30 PM' },
  { id: 'datetime', label: 'Date and time', sample: 'Nov 14, 6:30 PM' },
  { id: 'text', label: 'Plain text', sample: 'as typed' },
];

export const newSheet = (name = 'Sheet1') => ({ id: makeId('sh'), name, cols: 10, rows: 40, cells: {}, widths: {}, freeze: { rows: 0, cols: 0 }, filters: {}, validation: {}, rules: [], charts: [] });
export const newWorkbook = () => ({ v: 2, active: 0, sheets: [newSheet()] });

/** Any saved data (old single grid or a workbook) as a workbook. */
export function normalizeWorkbook(data) {
  if (data?.v === 2 && Array.isArray(data.sheets) && data.sheets.length) {
    return { ...data, active: Math.min(data.active ?? 0, data.sheets.length - 1), sheets: data.sheets.map((s) => ({ ...newSheet(s.name), ...s })) };
  }
  const sheet = newSheet('Sheet1');
  if (data && data.cells) {
    sheet.cols = Math.max(data.cols ?? 10, 10);
    sheet.rows = Math.max(data.rows ?? 40, 40);
    sheet.cells = {};
    for (const [name, raw] of Object.entries(data.cells)) {
      const pos = parseCellName(name);
      const fmt = pos ? data.formats?.[colName(pos.col)] : null;
      const bold = data.header && pos?.row === 0;
      sheet.cells[name] = fmt || bold ? { v: raw, s: { ...(fmt ? { n: fmt } : {}), ...(bold ? { b: true } : {}) } } : raw;
    }
    if (data.header) sheet.freeze = { rows: 1, cols: 0 };
  }
  return { v: 2, active: 0, sheets: [sheet] };
}

// ─── Cells ──────────────────────────────────────────────────────────────────

export const rawOf = (cell) => (cell == null ? '' : typeof cell === 'object' ? cell.v ?? '' : String(cell));
export const styleOf = (cell) => (cell && typeof cell === 'object' ? cell.s ?? {} : {});

/**
 * Set a cell's text and/or style; empty cells with no style are removed.
 * @param {any} sheet @param {string} name
 * @param {{ raw?: string, style?: Record<string, any> }} [changes]
 */
export function putCell(sheet, name, { raw = undefined, style = undefined } = {}) {
  const before = sheet.cells[name];
  const v = raw === undefined ? rawOf(before) : String(raw);
  const s = style === undefined ? styleOf(before) : Object.fromEntries(Object.entries({ ...styleOf(before), ...style }).filter(([, x]) => x !== undefined && x !== null && x !== false && x !== ''));
  if (v === '' && !Object.keys(s).length) delete sheet.cells[name];
  else sheet.cells[name] = Object.keys(s).length ? { v, s } : v;
  const pos = parseCellName(name);
  if (pos) { sheet.cols = Math.max(sheet.cols, pos.col + 1); sheet.rows = Math.max(sheet.rows, pos.row + 1); }
}

/** 'A1:C3' or {c1,r1,c2,r2} → {c1,r1,c2,r2}. */
export function toRange(spec) {
  if (typeof spec !== 'string') return spec;
  const [a, b] = spec.split(':').map(parseCellName);
  if (!a) return null;
  const e = b ?? a;
  return { c1: Math.min(a.col, e.col), r1: Math.min(a.row, e.row), c2: Math.max(a.col, e.col), r2: Math.max(a.row, e.row) };
}
export const rangeText = (r) => (r.c1 === r.c2 && r.r1 === r.r2 ? cellName(r.c1, r.r1) : `${cellName(r.c1, r.r1)}:${cellName(r.c2, r.r2)}`);
export const inRange = (r, col, row) => col >= r.c1 && col <= r.c2 && row >= r.r1 && row <= r.r2;
export function eachCell(r, fn) { for (let row = r.r1; row <= r.r2; row += 1) for (let col = r.c1; col <= r.c2; col += 1) fn(col, row); }

// ─── Computing ──────────────────────────────────────────────────────────────

/**
 * A calculator over the workbook: values are worked out when asked for and
 * remembered until the workbook changes (make a new one after each change).
 *   const calc = createCalc(wb); calc.value(sheetIndex, col, row); calc.display(...)
 */
export function createCalc(wb) {
  const cache = new Map();
  const visiting = new Set();
  const names = wb.sheets.map((s) => s.name.toLowerCase());
  const lastRow = wb.sheets.map((s) => {
    let max = 0;
    for (const name of Object.keys(s.cells)) { const p = parseCellName(name); if (p && p.row > max) max = p.row; }
    return max;
  });
  const ctxFor = (current) => ({
    cell: (s, c, r) => value(s, c, r),
    sheetIndex: (name) => (name ? names.indexOf(name.toLowerCase()) : current),
    current,
    maxRow: (s) => lastRow[s] ?? 0,
  });

  function value(s, col, row) {
    const key = `${s}:${col}:${row}`;
    if (cache.has(key)) return cache.get(key);
    const sheet = wb.sheets[s];
    const raw = rawOf(sheet?.cells[cellName(col, row)]);
    let v;
    if (raw.startsWith('=') && raw.length > 1) {
      if (visiting.has(key)) return new SheetError('#CYCLE!');
      visiting.add(key);
      v = evaluateFormula(raw, ctxFor(s));
      visiting.delete(key);
    } else v = parseInput(raw).value;
    cache.set(key, v);
    return v;
  }

  /** The format a cell shows in: its own, or what was typed suggests ($, %, a date), or its formula's. */
  function formatOf(s, col, row) {
    const cell = wb.sheets[s]?.cells[cellName(col, row)];
    const own = styleOf(cell).n;
    if (own) return own;
    const raw = rawOf(cell);
    if (raw.startsWith('=')) {
      const first = tokenize(raw.slice(1)).find((t) => t.t === 'func');
      return first && DATE_FUNCTIONS.has(first.v) ? 'date' : '';
    }
    return parseInput(raw).fmt ?? '';
  }

  return {
    value,
    formatOf,
    display: (s, col, row) => {
      const cell = wb.sheets[s]?.cells[cellName(col, row)];
      return formatValue(value(s, col, row), formatOf(s, col, row), styleOf(cell).d);
    },
  };
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const clock = (serial) => { const total = Math.round((serial % 1) * 1440); const h = Math.floor(total / 60) % 24; const m = total % 60; return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };

/** A value as shown in a format. */
export function formatValue(value, fmt = '', decimals = undefined) {
  if (isError(value)) return value.code;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value !== 'number') return String(value ?? '');
  const d = decimals ?? (fmt === 'integer' ? 0 : fmt === 'percent' ? (Math.abs(value * 100 % 1) > 1e-9 ? 1 : 0) : 2);
  const num = (n, places) => n.toLocaleString('en-US', { minimumFractionDigits: places, maximumFractionDigits: places });
  switch (fmt) {
    case 'number': return num(value, d);
    case 'integer': return num(value, decimals ?? 0);
    case 'currency': return `${value < 0 ? '-' : ''}$${num(Math.abs(value), d)}`;
    case 'percent': return `${num(value * 100, d)}%`;
    case 'date': { const dt = serialToDate(value); return `${MONTHS_SHORT[dt.getUTCMonth()]} ${dt.getUTCDate()}, ${dt.getUTCFullYear()}`; }
    case 'shortdate': { const dt = serialToDate(value); return `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}/${dt.getUTCFullYear()}`; }
    case 'time': return clock(value);
    case 'datetime': { const dt = serialToDate(value); return `${MONTHS_SHORT[dt.getUTCMonth()]} ${dt.getUTCDate()}, ${clock(value)}`; }
    case 'text': return formatGeneral(value);
    default: return decimals !== undefined ? num(value, decimals) : formatGeneral(value);
  }
}

// ─── Rows and columns ───────────────────────────────────────────────────────

/** Move every cell (and fix every formula in the workbook) when rows or columns are added or removed. */
function shiftLines(wb, sheetIndex, axis, at, count) {
  const sheet = wb.sheets[sheetIndex];
  const isCol = axis === 'col';
  const moved = {};
  for (const [name, cell] of Object.entries(sheet.cells)) {
    const p = parseCellName(name);
    if (!p) continue;
    const pos = isCol ? p.col : p.row;
    if (count < 0 && pos >= at && pos < at - count) continue; // deleted
    const next = pos >= at ? pos + count : pos;
    moved[isCol ? cellName(next, p.row) : cellName(p.col, next)] = cell;
  }
  sheet.cells = moved;
  if (isCol) {
    const widths = {};
    for (const [k, w] of Object.entries(sheet.widths ?? {})) { const c = Number(k); if (count < 0 && c >= at && c < at - count) continue; widths[c >= at ? c + count : c] = w; }
    sheet.widths = widths;
    sheet.cols = Math.max(1, sheet.cols + count);
  } else sheet.rows = Math.max(1, sheet.rows + count);
  // Formulas everywhere that point at this sheet.
  const thisName = sheet.name.toLowerCase();
  wb.sheets.forEach((other, i) => {
    for (const [name, cell] of Object.entries(other.cells)) {
      const raw = rawOf(cell);
      if (!raw.startsWith('=')) continue;
      const next = rewriteRefs(raw, (r, refSheet) => {
        const targetsThis = refSheet ? refSheet.toLowerCase() === thisName : i === sheetIndex;
        if (!targetsThis || (!isCol && r.wholeColumn)) return r;
        const pos = isCol ? r.col : r.row;
        if (count < 0 && pos >= at && pos < at - count) return null;
        const n = pos >= at ? pos + count : pos;
        return isCol ? { ...r, col: n } : { ...r, row: n };
      });
      if (next !== raw) other.cells[name] = typeof cell === 'object' ? { ...cell, v: next } : next;
    }
  });
}

export const insertRows = (wb, s, at, count = 1) => shiftLines(wb, s, 'row', at, count);
export const deleteRows = (wb, s, at, count = 1) => shiftLines(wb, s, 'row', at, -count);
export const insertCols = (wb, s, at, count = 1) => shiftLines(wb, s, 'col', at, count);
export const deleteCols = (wb, s, at, count = 1) => shiftLines(wb, s, 'col', at, -count);

// ─── Copy, paste, fill ──────────────────────────────────────────────────────

/** A block of cells (raw text and styles), for copying inside 3den: { cols, rows, cells: [[cell]], from: {col,row} }. */
export function copyBlock(sheet, r) {
  const cells = [];
  for (let row = r.r1; row <= r.r2; row += 1) {
    const line = [];
    for (let col = r.c1; col <= r.c2; col += 1) line.push(structuredClone(sheet.cells[cellName(col, row)] ?? null));
    cells.push(line);
  }
  return { cols: r.c2 - r.c1 + 1, rows: r.r2 - r.r1 + 1, cells, from: { col: r.c1, row: r.r1 } };
}

/** Paste a block at (col, row); formulas move with it. Returns the range filled. */
export function pasteBlock(sheet, block, col, row, { valuesOnly = false } = {}) {
  for (let dr = 0; dr < block.rows; dr += 1) {
    for (let dc = 0; dc < block.cols; dc += 1) {
      const cell = block.cells[dr][dc];
      const name = cellName(col + dc, row + dr);
      if (cell == null) { delete sheet.cells[name]; continue; }
      let raw = rawOf(cell);
      if (raw.startsWith('=') && !valuesOnly) raw = shiftFormula(raw, col + dc - (block.from.col + dc), row + dr - (block.from.row + dr));
      putCell(sheet, name, { raw, style: valuesOnly ? undefined : styleOf(cell) });
    }
  }
  return { c1: col, r1: row, c2: col + block.cols - 1, r2: row + block.rows - 1 };
}

/** Rows of text from the clipboard (tabs, or a CSV), as the cells' raw text. */
export function parseTable(text) {
  const t = String(text).replace(/\r\n?/g, '\n').replace(/\n$/, '');
  if (t.includes('\t') || !t.includes(',')) return t.split('\n').map((line) => line.split('\t'));
  return parseCsv(t);
}

export function parseCsv(text) {
  const rows = [];
  let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; } else if (ch === '"') quoted = false; else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; } else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; } else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function placeTable(sheet, rows, col, row) {
  rows.forEach((line, dr) => line.forEach((raw, dc) => putCell(sheet, cellName(col + dc, row + dr), { raw })));
  return { c1: col, r1: row, c2: col + Math.max(...rows.map((l) => l.length)) - 1, r2: row + rows.length - 1 };
}

/** The values (as shown) in a range, as tab-separated text, for the clipboard. */
export function rangeAsText(calc, s, r) {
  const lines = [];
  for (let row = r.r1; row <= r.r2; row += 1) {
    const line = [];
    for (let col = r.c1; col <= r.c2; col += 1) line.push(calc.display(s, col, row));
    lines.push(line.join('\t'));
  }
  return lines.join('\n');
}

/**
 * Fill from `source` out to `target` (which contains it), like dragging the
 * fill handle: a run of numbers or dates continues its step ("1, 2" → 3, 4),
 * text ending in a number counts on ("Week 1" → "Week 2"), formulas move,
 * and anything else repeats.
 */
export function fillSeries(sheet, source, target) {
  const down = target.r2 > source.r2 || target.r1 < source.r1;
  const lines = down ? source.c2 - source.c1 + 1 : source.r2 - source.r1 + 1;
  for (let k = 0; k < lines; k += 1) {
    const src = [];
    const len = down ? source.r2 - source.r1 + 1 : source.c2 - source.c1 + 1;
    for (let i = 0; i < len; i += 1) {
      const col = down ? source.c1 + k : source.c1 + i;
      const row = down ? source.r1 + i : source.r1 + k;
      src.push({ col, row, cell: sheet.cells[cellName(col, row)] ?? null });
    }
    const raws = src.map((x) => rawOf(x.cell));
    const nums = raws.map((r) => parseInput(r));
    const allNums = raws.every((r) => r !== '' && !r.startsWith('=')) && nums.every((p) => typeof p.value === 'number');
    const step = allNums && nums.length > 1 ? nums[nums.length - 1].value - nums[nums.length - 2].value : 1;
    const textNum = raws.length === 1 && /^(.*?)(\d+)$/.exec(raws[0]) && !raws[0].startsWith('=') && typeof nums[0].value !== 'number' ? /^(.*?)(\d+)$/.exec(raws[0]) : null;
    const fromEnd = down ? target.r2 > source.r2 : target.c2 > source.c2;
    const count = down ? (fromEnd ? target.r2 - source.r2 : source.r1 - target.r1) : (fromEnd ? target.c2 - source.c2 : source.c1 - target.c1);
    for (let n = 1; n <= count; n += 1) {
      const col = down ? source.c1 + k : (fromEnd ? source.c2 + n : source.c1 - n);
      const row = down ? (fromEnd ? source.r2 + n : source.r1 - n) : source.r1 + k;
      const from = src[fromEnd ? (n - 1) % src.length : src.length - 1 - ((n - 1) % src.length)];
      let raw;
      if (allNums && (nums.length > 1 || nums[0].fmt === 'date')) {
        const last = fromEnd ? nums[nums.length - 1].value : nums[0].value;
        const v = last + (fromEnd ? step : -step) * n;
        raw = nums[0].fmt === 'date' ? isoDate(v) : formatGeneral(v);
      } else if (textNum) raw = `${textNum[1]}${Number(textNum[2]) + (fromEnd ? n : -n)}`;
      else {
        raw = rawOf(from.cell);
        if (raw.startsWith('=')) raw = shiftFormula(raw, col - from.col, row - from.row);
      }
      putCell(sheet, cellName(col, row), { raw, style: styleOf(from.cell) });
    }
  }
}
const isoDate = (serial) => { const d = serialToDate(serial); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; };

export function clearRange(sheet, r, { formats = false } = {}) {
  eachCell(r, (col, row) => {
    const name = cellName(col, row);
    if (formats) delete sheet.cells[name];
    else putCell(sheet, name, { raw: '' });
  });
}

// ─── Sort and filter ────────────────────────────────────────────────────────

/** Sort the rows of `r` by column `col` (numbers before text, blanks last). */
export function sortRange(wb, s, r, col, descending = false) {
  const sheet = wb.sheets[s];
  const calc = createCalc(wb);
  const rows = [];
  for (let row = r.r1; row <= r.r2; row += 1) {
    const line = [];
    for (let c = r.c1; c <= r.c2; c += 1) line.push(sheet.cells[cellName(c, row)] ?? null);
    rows.push({ row, line, key: calc.value(s, col, row) });
  }
  const rank = (v) => (v === '' || v == null ? 2 : typeof v === 'number' ? 0 : 1);
  rows.sort((a, b) => {
    const ra = rank(a.key); const rb = rank(b.key);
    if (ra !== rb) return ra - rb; // blanks stay last either way
    const cmp = ra === 0 ? a.key - b.key : String(a.key).localeCompare(String(b.key), undefined, { numeric: true, sensitivity: 'base' });
    return descending ? -cmp : cmp;
  });
  rows.forEach((item, i) => {
    const target = r.r1 + i;
    item.line.forEach((cell, j) => {
      const name = cellName(r.c1 + j, target);
      let next = cell;
      const raw = rawOf(cell);
      if (raw.startsWith('=')) next = typeof cell === 'object' ? { ...cell, v: shiftFormula(raw, 0, target - item.row) } : shiftFormula(raw, 0, target - item.row);
      if (next == null) delete sheet.cells[name]; else sheet.cells[name] = next;
    });
  });
}

/** The block of data around a cell, out to the first empty row and column (Excel's "current region"). */
export function currentRegion(sheet, col, row) {
  const filled = (c, r) => rawOf(sheet.cells[cellName(c, r)]) !== '';
  const r = { c1: col, c2: col, r1: row, r2: row };
  const rowHas = (rr) => { for (let c = Math.max(0, r.c1 - 1); c <= r.c2 + 1; c += 1) if (filled(c, rr)) return true; return false; };
  const colHas = (cc) => { for (let rr = Math.max(0, r.r1 - 1); rr <= r.r2 + 1; rr += 1) if (filled(cc, rr)) return true; return false; };
  for (let grew = true; grew;) {
    grew = false;
    if (r.r1 > 0 && rowHas(r.r1 - 1)) { r.r1 -= 1; grew = true; }
    if (r.r2 < sheet.rows - 1 && rowHas(r.r2 + 1)) { r.r2 += 1; grew = true; }
    if (r.c1 > 0 && colHas(r.c1 - 1)) { r.c1 -= 1; grew = true; }
    if (r.c2 < sheet.cols - 1 && colHas(r.c2 + 1)) { r.c2 += 1; grew = true; }
  }
  return r;
}

/** Does this block start with a header row? (Bold, or text over a row with numbers, or a frozen row.) */
export function hasHeaderRow(sheet, calc, s, r) {
  if (r.r2 <= r.r1) return false;
  if (r.r1 < (sheet.freeze?.rows ?? 0)) return true;
  let allText = true; let bold = true; let numbersBelow = false;
  for (let c = r.c1; c <= r.c2; c += 1) {
    const v = calc.value(s, c, r.r1);
    if (typeof v === 'number') allText = false;
    if (!styleOf(sheet.cells[cellName(c, r.r1)]).b) bold = false;
    if (typeof calc.value(s, c, r.r1 + 1) === 'number') numbersBelow = true;
  }
  return allText && (bold || numbersBelow);
}

/** Rows hidden by the column filters (the header row, row 1, never is). */
export function hiddenRows(wb, s, calc) {
  const sheet = wb.sheets[s];
  const filters = Object.entries(sheet.filters ?? {}).filter(([, f]) => f?.hide?.length || f?.text);
  const hidden = new Set();
  if (!filters.length) return hidden;
  const header = Math.max(1, sheet.freeze?.rows ?? 1);
  for (let row = header; row < sheet.rows; row += 1) {
    for (const [c, f] of filters) {
      const shown = calc.display(s, Number(c), row);
      if (f.hide?.includes(shown) || (f.text && !shown.toLowerCase().includes(f.text.toLowerCase()))) { hidden.add(row); break; }
    }
  }
  return hidden;
}

/** The distinct values in a column below its header, for a filter list. */
export function columnValues(wb, s, col, calc) {
  const sheet = wb.sheets[s];
  const header = Math.max(1, sheet.freeze?.rows ?? 1);
  const seen = new Map();
  for (let row = header; row < sheet.rows; row += 1) { const v = calc.display(s, col, row); seen.set(v, (seen.get(v) ?? 0) + 1); }
  return [...seen.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true }));
}

// ─── Conditional formatting ─────────────────────────────────────────────────

export const RULE_OPS = [
  { id: '>', label: 'is greater than' }, { id: '<', label: 'is less than' }, { id: '=', label: 'is equal to' },
  { id: 'contains', label: 'contains' }, { id: 'empty', label: 'is empty' }, { id: 'notempty', label: 'is not empty' },
];

/** The fill (and text color) the rules give a cell, or null. */
export function ruleStyle(sheet, calc, s, col, row) {
  for (const rule of sheet.rules ?? []) {
    const r = toRange(rule.range);
    if (!r || !inRange(r, col, row)) continue;
    const v = calc.value(s, col, row);
    const target = Number(rule.value);
    const hit = rule.op === '>' ? typeof v === 'number' && v > target
      : rule.op === '<' ? typeof v === 'number' && v < target
        : rule.op === '=' ? String(v).toLowerCase() === String(rule.value ?? '').toLowerCase() || v === target
          : rule.op === 'contains' ? String(v).toLowerCase().includes(String(rule.value ?? '').toLowerCase())
            : rule.op === 'empty' ? v === ''
              : rule.op === 'notempty' ? v !== '' : false;
    if (hit) return { fill: rule.fill, color: rule.color };
  }
  return null;
}

// ─── Sheets ─────────────────────────────────────────────────────────────────

/** Rename a sheet, fixing formulas in the others that point at it. */
export function renameSheet(wb, s, name) {
  const old = wb.sheets[s].name;
  const clean = name.trim().replace(/[!'[\]:*?/\\]/g, '').slice(0, 40);
  if (!clean || wb.sheets.some((x, i) => i !== s && x.name.toLowerCase() === clean.toLowerCase())) return false;
  wb.sheets[s].name = clean;
  for (const sheet of wb.sheets) {
    for (const [cellKey, cell] of Object.entries(sheet.cells)) {
      const raw = rawOf(cell);
      if (!raw.startsWith('=') || !raw.toLowerCase().includes(old.toLowerCase())) continue;
      // Swap the sheet prefix: Old!A1 or 'Old name'!A1.
      const re = new RegExp(`(^|[^\\w'])('?${old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "''")}'?)!`, 'gi');
      const prefix = /^[A-Za-z_][\w.]*$/.test(clean) ? clean : `'${clean.replace(/'/g, "''")}'`;
      const next = raw.replace(re, (m, before) => `${before}${prefix}!`);
      if (next !== raw) sheet.cells[cellKey] = typeof cell === 'object' ? { ...cell, v: next } : next;
    }
  }
  return true;
}

export function uniqueSheetName(wb, base = 'Sheet') {
  for (let n = wb.sheets.length + 1; ; n += 1) { const name = `${base}${n}`; if (!wb.sheets.some((s) => s.name.toLowerCase() === name.toLowerCase())) return name; }
}

/** The whole sheet as CSV (values as shown). */
export function sheetToCsv(wb, s) {
  const calc = createCalc(wb);
  const sheet = wb.sheets[s];
  let maxRow = -1; let maxCol = -1;
  for (const name of Object.keys(sheet.cells)) { const p = parseCellName(name); if (p && rawOf(sheet.cells[name]) !== '') { maxRow = Math.max(maxRow, p.row); maxCol = Math.max(maxCol, p.col); } }
  const lines = [];
  for (let row = 0; row <= maxRow; row += 1) {
    const line = [];
    for (let col = 0; col <= maxCol; col += 1) {
      const v = calc.display(s, col, row);
      line.push(/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    }
    lines.push(line.join(','));
  }
  return lines.join('\n');
}

export { cellName, colName, parseCellName };
