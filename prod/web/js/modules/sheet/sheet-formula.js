// @ts-check
/**
 * sheet-formula.js — the spreadsheet's formula language, close to Excel's
 * and Google Sheets'.
 *
 *   =SUM(B2:B9) * 1.08          =IF(C2>=100, "big", "small")
 *   =VLOOKUP(A2, Prices!A:B, 2, FALSE)   =COUNTIF(D:D, ">5")   =TEXT(TODAY(), "mmm d")
 *   =$B$1 * C2   ($ keeps a column or row from moving when filled or copied)
 *
 * Values are numbers, text, TRUE/FALSE, blank (''), or errors (SheetError:
 * #DIV/0!, #VALUE!, #REF!, #NAME?, #N/A, #NUM!, #CYCLE!). Dates are numbers:
 * days since December 30, 1899, as in Excel, shown as dates by their format.
 *
 *   evaluateFormula(text, ctx) → a value. ctx = { cell(sheet, col, row), sheetIndex(name), current }
 *   tokenize(text) / rewriteRefs(text, fn)   (used when filling, copying, and inserting rows)
 *   FUNCTION_NAMES, FUNCTION_HELP            (autocomplete and hints)
 *   colName(0) → 'A', colIndex('AA') → 26
 */

export class SheetError {
  /** @param {string} code */
  constructor(code) { this.code = code; }
  toString() { return this.code; }
}
const err = (code) => new SheetError(code);
export const isError = (v) => v instanceof SheetError;

// ─── Names of columns and cells ─────────────────────────────────────────────

/** 0 → A, 25 → Z, 26 → AA. */
export function colName(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
/** A → 0, AA → 26. */
export function colIndex(name) {
  let n = 0;
  for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
export const cellName = (col, row) => `${colName(col)}${row + 1}`;
/** 'B12' → { col: 1, row: 11 } (ignores $), or null. */
export function parseCellName(name) {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,6})$/.exec(String(name));
  return m ? { col: colIndex(m[1]), row: Number(m[2]) - 1 } : null;
}

// ─── Dates (Excel serial numbers) ───────────────────────────────────────────

const EPOCH = Date.UTC(1899, 11, 30);
const DAY = 86400000;
export const dateToSerial = (y, m, d) => (Date.UTC(y, m - 1, d) - EPOCH) / DAY;
export const serialToDate = (serial) => new Date(EPOCH + Math.round(serial * DAY));
export const todaySerial = () => { const n = new Date(); return dateToSerial(n.getFullYear(), n.getMonth() + 1, n.getDate()); };

// ─── Tokens ─────────────────────────────────────────────────────────────────

/**
 * Tokens: { t: 'num'|'str'|'bool'|'ref'|'range'|'colrange'|'func'|'name'|'op'|'('|')'|','|'err', v, start, end, sheet? }
 * A ref's v is { col, row, absCol, absRow }; a range's v is [ref, ref].
 */
export function tokenize(text) {
  /** @type {any[]} */ const tokens = []; // refs and ranges also carry .sheet
  const src = String(text);
  let i = 0;
  const sheetPart = `(?:'((?:[^']|'')+)'|([A-Za-z_][\\w.]*))!`;
  const refPart = '(\\$?)([A-Za-z]{1,3})(\\$?)(\\d{1,6})';
  const reRange = new RegExp(`^(?:${sheetPart})?${refPart}:${refPart}`);
  const reRef = new RegExp(`^(?:${sheetPart})?${refPart}(?![\\w(])`);
  const reCol = new RegExp(`^(?:${sheetPart})?(\\$?)([A-Za-z]{1,3}):(\\$?)([A-Za-z]{1,3})(?![\\w(])`);
  while (i < src.length) {
    const rest = src.slice(i);
    const ws = /^\s+/.exec(rest);
    if (ws) { i += ws[0].length; continue; }
    let m;
    const push = (t, v, len, extra = {}) => { tokens.push({ t, v, start: i, end: i + len, ...extra }); i += len; };
    if ((m = /^"((?:[^"]|"")*)"/.exec(rest))) { push('str', m[1].replace(/""/g, '"'), m[0].length); continue; }
    if ((m = /^#(DIV\/0!|VALUE!|REF!|NAME\?|N\/A|NUM!|CYCLE!|NULL!)/.exec(rest))) { push('err', `#${m[1]}`, m[0].length); continue; }
    if ((m = /^(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/.exec(rest)) && !/^\d+:\d/.test(rest)) { push('num', Number(m[1]), m[0].length); continue; }
    if ((m = reRange.exec(rest))) {
      const sheet = m[1] ? m[1].replace(/''/g, "'") : m[2] ?? null;
      const a = { col: colIndex(m[4]), row: Number(m[6]) - 1, absCol: !!m[3], absRow: !!m[5] };
      const b = { col: colIndex(m[8]), row: Number(m[10]) - 1, absCol: !!m[7], absRow: !!m[9] };
      push('range', [a, b], m[0].length, { sheet }); continue;
    }
    if ((m = reRef.exec(rest))) {
      const sheet = m[1] ? m[1].replace(/''/g, "'") : m[2] ?? null;
      push('ref', { col: colIndex(m[4]), row: Number(m[6]) - 1, absCol: !!m[3], absRow: !!m[5] }, m[0].length, { sheet }); continue;
    }
    if ((m = reCol.exec(rest))) {
      const sheet = m[1] ? m[1].replace(/''/g, "'") : m[2] ?? null;
      push('colrange', [{ col: colIndex(m[4]), abs: !!m[3] }, { col: colIndex(m[6]), abs: !!m[5] }], m[0].length, { sheet }); continue;
    }
    if ((m = /^(TRUE|FALSE)(?![\w(])/i.exec(rest))) { push('bool', m[1].toUpperCase() === 'TRUE', m[0].length); continue; }
    if ((m = /^([A-Za-z_][\w.]*)\s*\(/.exec(rest))) { tokens.push({ t: 'func', v: m[1].toUpperCase(), start: i, end: i + m[1].length }); i += m[0].length; tokens.push({ t: '(', v: '(', start: i - 1, end: i }); continue; }
    if ((m = /^([A-Za-z_][\w.]*)/.exec(rest))) { push('name', m[1], m[0].length); continue; }
    if ((m = /^(<>|<=|>=|[-+*/^&=<>%])/.exec(rest))) { push('op', m[1], m[0].length); continue; }
    if (rest[0] === '(' || rest[0] === ')') { push(rest[0], rest[0], 1); continue; }
    if (rest[0] === ',' || rest[0] === ';') { push(',', ',', 1); continue; }
    push('bad', rest[0], 1);
  }
  return tokens;
}

/** The text of a ref, with $ where it's fixed. */
export const refText = (r) => `${r.absCol ? '$' : ''}${colName(r.col)}${r.absRow ? '$' : ''}${r.row + 1}`;
const sheetPrefix = (name) => (name ? (/^[A-Za-z_][\w.]*$/.test(name) ? `${name}!` : `'${name.replace(/'/g, "''")}'!`) : '');

/**
 * Rewrite every cell reference in a formula. `fn(ref, sheet)` returns a new
 * ref, or null for #REF!. Ranges get each corner rewritten.
 */
export function rewriteRefs(formula, fn) {
  if (!String(formula).startsWith('=')) return formula;
  const body = formula.slice(1);
  const tokens = tokenize(body);
  let out = '';
  let last = 0;
  for (const tok of tokens) {
    if (tok.t !== 'ref' && tok.t !== 'range' && tok.t !== 'colrange') continue;
    out += body.slice(last, tok.start);
    last = tok.end;
    const prefix = sheetPrefix(tok.sheet);
    if (tok.t === 'ref') {
      const next = fn(tok.v, tok.sheet);
      out += next ? prefix + refText(next) : '#REF!';
    } else if (tok.t === 'range') {
      const a = fn(tok.v[0], tok.sheet);
      const b = fn(tok.v[1], tok.sheet);
      out += a && b ? `${prefix}${refText(a)}:${refText(b)}` : '#REF!';
    } else {
      const a = fn({ col: tok.v[0].col, row: 0, absCol: tok.v[0].abs, absRow: true, wholeColumn: true }, tok.sheet);
      const b = fn({ col: tok.v[1].col, row: 0, absCol: tok.v[1].abs, absRow: true, wholeColumn: true }, tok.sheet);
      out += a && b ? `${prefix}${a.absCol ? '$' : ''}${colName(a.col)}:${b.absCol ? '$' : ''}${colName(b.col)}` : '#REF!';
    }
  }
  return `=${out}${body.slice(last)}`;
}

/** Move a formula by (dCol, dRow), as when filling or pasting: relative refs move, $ ones stay. */
export function shiftFormula(raw, dCol, dRow) {
  return rewriteRefs(raw, (r) => {
    const col = r.absCol ? r.col : r.col + dCol;
    const row = r.absRow || r.wholeColumn ? r.row : r.row + dRow;
    return col < 0 || row < 0 ? null : { ...r, col, row };
  });
}

// ─── Parsing ────────────────────────────────────────────────────────────────

class ParseError extends Error {}

function parse(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];
  const isOp = (...ops) => peek()?.t === 'op' && ops.includes(peek().v);

  function expr() { return comparison(); }
  function comparison() {
    let left = concat();
    while (isOp('=', '<>', '<', '>', '<=', '>=')) { const op = next().v; left = { k: 'bin', op, a: left, b: concat() }; }
    return left;
  }
  function concat() {
    let left = additive();
    while (isOp('&')) { next(); left = { k: 'bin', op: '&', a: left, b: additive() }; }
    return left;
  }
  function additive() {
    let left = multiplicative();
    while (isOp('+', '-')) { const op = next().v; left = { k: 'bin', op, a: left, b: multiplicative() }; }
    return left;
  }
  function multiplicative() {
    let left = power();
    while (isOp('*', '/')) { const op = next().v; left = { k: 'bin', op, a: left, b: power() }; }
    return left;
  }
  function power() {
    let left = unary();
    while (isOp('^')) { next(); left = { k: 'bin', op: '^', a: left, b: unary() }; }
    return left;
  }
  function unary() {
    if (isOp('-')) { next(); return { k: 'neg', a: unary() }; }
    if (isOp('+')) { next(); return unary(); }
    return percent();
  }
  function percent() {
    let node = primary();
    while (isOp('%')) { next(); node = { k: 'bin', op: '/', a: node, b: { k: 'lit', v: 100 } }; }
    return node;
  }
  function primary() {
    const tok = next();
    if (!tok) throw new ParseError('end');
    switch (tok.t) {
      case 'num': case 'str': case 'bool': return { k: 'lit', v: tok.v };
      case 'err': return { k: 'lit', v: err(tok.v) };
      case 'ref': return { k: 'ref', v: tok.v, sheet: tok.sheet };
      case 'range': return { k: 'range', v: tok.v, sheet: tok.sheet };
      case 'colrange': return { k: 'cols', v: tok.v, sheet: tok.sheet };
      case 'name': return { k: 'lit', v: err('#NAME?') };
      case '(': { const inner = expr(); if (next()?.t !== ')') throw new ParseError(')'); return inner; }
      case 'func': {
        next(); // the (
        const args = [];
        if (peek()?.t === ')') { next(); return { k: 'call', name: tok.v, args }; }
        for (;;) {
          if (peek()?.t === ',' ) { args.push({ k: 'lit', v: '' }); next(); continue; }
          args.push(expr());
          const sep = next();
          if (sep?.t === ')') break;
          if (sep?.t !== ',') throw new ParseError('args');
          if (peek()?.t === ')') { args.push({ k: 'lit', v: '' }); next(); break; }
        }
        return { k: 'call', name: tok.v, args };
      }
      default: throw new ParseError(tok.v);
    }
  }
  const tree = expr();
  if (p < tokens.length) throw new ParseError('extra');
  return tree;
}

const parseCache = new Map();
function parsed(body) {
  let tree = parseCache.get(body);
  if (tree === undefined) {
    try { tree = parse(tokenize(body)); } catch { tree = null; }
    if (parseCache.size > 5000) parseCache.clear();
    parseCache.set(body, tree);
  }
  return tree;
}

// ─── Values ─────────────────────────────────────────────────────────────────

/** A value as a number (for arithmetic), or an error. Blank is 0; text that looks like a number counts. */
function toNumber(v) {
  if (isError(v)) return v;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === '' || v == null) return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : err('#VALUE!');
}
const toText = (v) => (isError(v) ? v : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : typeof v === 'number' ? formatGeneral(v) : String(v ?? ''));
const toBool = (v) => (isError(v) ? v : typeof v === 'string' ? (v.toUpperCase() === 'TRUE' ? true : v.toUpperCase() === 'FALSE' ? false : v !== '') : Boolean(v));

/** A number as General format shows it: up to 10 significant digits, no trailing zeros. */
export function formatGeneral(n) {
  if (!Number.isFinite(n)) return '#NUM!';
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  const abs = Math.abs(n);
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-9)) return n.toExponential(4).replace(/\.?0+e/, 'e');
  return String(Number(n.toPrecision(10)));
}

const flat = (args) => args.flat(Infinity);
/**
 * Numbers among the arguments, as Excel counts them: in ranges and cell
 * references only real numbers count (text and blanks are skipped); numbers
 * typed into the formula count, and so does text that reads as a number.
 * `kinds[i]` is 'lit', 'ref', or 'expr' (what the argument was written as).
 */
function numbersOf(args, kinds) {
  const out = [];
  args.forEach((arg, i) => {
    if (Array.isArray(arg) || kinds?.[i] === 'ref') {
      for (const v of flat([arg])) { if (isError(v)) throw v; if (typeof v === 'number') out.push(v); }
      return;
    }
    if (arg === '' || arg == null) return;
    const n = typeof arg === 'number' ? arg : typeof arg === 'boolean' ? (arg ? 1 : 0) : toNumber(arg);
    if (isError(n)) throw n;
    out.push(n);
  });
  return out;
}

/** COUNTIF-style criteria: 5, ">5", "<>done", "a*", "=". */
function matcher(criteria) {
  if (typeof criteria === 'number') return (v) => typeof v === 'number' ? v === criteria : String(v) === String(criteria);
  const s = String(criteria ?? '');
  const m = /^(<=|>=|<>|<|>|=)?(.*)$/.exec(s);
  const op = m[1] ?? '';
  const target = m[2];
  const num = target !== '' && Number.isFinite(Number(target)) ? Number(target) : null;
  if (num !== null && op && op !== '=' && op !== '<>') {
    return (v) => typeof v === 'number' && ({ '<': v < num, '>': v > num, '<=': v <= num, '>=': v >= num })[op];
  }
  if (target === '' && (op === '=' || op === '')) return (v) => v === '' || v == null;
  if (target === '' && op === '<>') return (v) => v !== '' && v != null;
  const wild = new RegExp(`^${target.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
  const eq = (v) => (num !== null && typeof v === 'number' ? v === num : wild.test(toText(v)));
  return op === '<>' ? (v) => !eq(v) : eq;
}

const as2d = (v) => (Array.isArray(v) ? (Array.isArray(v[0]) ? v : [v]) : [[v]]);
const cells = (v) => flat(as2d(v));

// ─── Functions ──────────────────────────────────────────────────────────────

const round = (n, d) => { const f = 10 ** d; return Math.round((n + Number.EPSILON * Math.sign(n)) * f) / f; };
const n1 = (v) => { const n = toNumber(v); if (isError(n)) throw n; return n; };
const t1 = (v) => { const t = toText(v); if (isError(t)) throw t; return t; };

function lookupExact(list, target) {
  const want = typeof target === 'string' ? target.toLowerCase() : target;
  return list.findIndex((v) => (typeof v === 'string' ? v.toLowerCase() : v) === want);
}
function lookupApprox(list, target) {
  let found = -1;
  for (let i = 0; i < list.length; i += 1) {
    const v = list[i];
    if (v === '' ) continue;
    if (typeof target === 'number' ? (typeof v === 'number' && v <= target) : String(v).toLowerCase() <= String(target).toLowerCase()) found = i; else break;
  }
  return found;
}

function textFormat(value, pattern) {
  const p = String(pattern);
  const n = toNumber(value);
  if (isError(n)) return toText(value);
  if (/[dmyhs]/i.test(p) && !/[#0]/.test(p)) {
    const d = serialToDate(n);
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const hours = d.getUTCHours();
    return p.replace(/yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|AM\/PM/g, (tok) => ({
      yyyy: String(d.getUTCFullYear()), yy: String(d.getUTCFullYear()).slice(2), mmmm: months[d.getUTCMonth()], mmm: months[d.getUTCMonth()].slice(0, 3),
      mm: String(d.getUTCMonth() + 1).padStart(2, '0'), m: String(d.getUTCMonth() + 1), dddd: days[d.getUTCDay()], ddd: days[d.getUTCDay()].slice(0, 3),
      dd: String(d.getUTCDate()).padStart(2, '0'), d: String(d.getUTCDate()), hh: String(p.includes('AM/PM') ? ((hours + 11) % 12) + 1 : hours).padStart(2, '0'),
      h: String(p.includes('AM/PM') ? ((hours + 11) % 12) + 1 : hours), ss: String(d.getUTCSeconds()).padStart(2, '0'), 'AM/PM': hours < 12 ? 'AM' : 'PM',
    })[tok]);
  }
  const pct = p.includes('%');
  const num = pct ? n * 100 : n;
  const decimals = (p.split('.')[1] ?? '').replace(/[^0#]/g, '').length;
  const grouped = p.includes(',');
  const body = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouped });
  const prefix = (p.match(/^[^#0.,]*/)?.[0] ?? '').replace(/"/g, '');
  return `${num < 0 ? '-' : ''}${prefix}${body}${pct ? '%' : ''}`;
}

/** Functions that get their arguments unevaluated (thunks), to skip the branch not taken. */
const LAZY = new Set(['IF', 'IFERROR', 'IFNA', 'IFS', 'SWITCH', 'CHOOSE']);

/** @type {Record<string, (args: any[], kinds?: string[]) => any>} */
const F = {
  // Math
  SUM: (a, raw) => numbersOf(a, raw).reduce((x, y) => x + y, 0),
  AVERAGE: (a, raw) => { const n = numbersOf(a, raw); if (!n.length) throw err('#DIV/0!'); return n.reduce((x, y) => x + y, 0) / n.length; },
  MIN: (a, raw) => { const n = numbersOf(a, raw); return n.length ? Math.min(...n) : 0; },
  MAX: (a, raw) => { const n = numbersOf(a, raw); return n.length ? Math.max(...n) : 0; },
  COUNT: (a) => flat(a).filter((v) => typeof v === 'number').length,
  COUNTA: (a) => flat(a).filter((v) => v !== '' && v != null).length,
  COUNTBLANK: (a) => flat(a).filter((v) => v === '' || v == null).length,
  PRODUCT: (a, raw) => numbersOf(a, raw).reduce((x, y) => x * y, 1),
  MEDIAN: (a, raw) => { const n = numbersOf(a, raw).sort((x, y) => x - y); if (!n.length) throw err('#NUM!'); const m = Math.floor(n.length / 2); return n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2; },
  MODE: (a, raw) => { const n = numbersOf(a, raw); const c = new Map(); let best = null; let bc = 1; for (const v of n) { const k = (c.get(v) ?? 0) + 1; c.set(v, k); if (k > bc) { bc = k; best = v; } } if (best === null) throw err('#N/A'); return best; },
  STDEV: (a, raw) => { const n = numbersOf(a, raw); if (n.length < 2) throw err('#DIV/0!'); const m = n.reduce((x, y) => x + y, 0) / n.length; return Math.sqrt(n.reduce((s, v) => s + (v - m) ** 2, 0) / (n.length - 1)); },
  STDEVP: (a, raw) => { const n = numbersOf(a, raw); if (!n.length) throw err('#DIV/0!'); const m = n.reduce((x, y) => x + y, 0) / n.length; return Math.sqrt(n.reduce((s, v) => s + (v - m) ** 2, 0) / n.length); },
  VAR: (a, raw) => { const n = numbersOf(a, raw); if (n.length < 2) throw err('#DIV/0!'); const m = n.reduce((x, y) => x + y, 0) / n.length; return n.reduce((s, v) => s + (v - m) ** 2, 0) / (n.length - 1); },
  LARGE: ([r, k]) => { const n = cells(r).filter((v) => typeof v === 'number').sort((x, y) => y - x); const i = n1(k) - 1; if (i < 0 || i >= n.length) throw err('#NUM!'); return n[i]; },
  SMALL: ([r, k]) => { const n = cells(r).filter((v) => typeof v === 'number').sort((x, y) => x - y); const i = n1(k) - 1; if (i < 0 || i >= n.length) throw err('#NUM!'); return n[i]; },
  RANK: ([v, r, order = 0]) => { const n = cells(r).filter((x) => typeof x === 'number'); const x = n1(v); if (!n.includes(x)) throw err('#N/A'); return 1 + n.filter((y) => (n1(order) ? y < x : y > x)).length; },
  ROUND: ([v, d = 0]) => round(n1(v), n1(d)),
  ROUNDUP: ([v, d = 0]) => { const f = 10 ** n1(d); const x = n1(v); return Math.sign(x) * Math.ceil(Math.abs(x) * f - 1e-9) / f; },
  ROUNDDOWN: ([v, d = 0]) => { const f = 10 ** n1(d); const x = n1(v); return Math.sign(x) * Math.floor(Math.abs(x) * f + 1e-9) / f; },
  INT: ([v]) => Math.floor(n1(v)),
  TRUNC: ([v, d = 0]) => { const f = 10 ** n1(d); return Math.trunc(n1(v) * f) / f; },
  MOD: ([a, b]) => { const d = n1(b); if (d === 0) throw err('#DIV/0!'); const x = n1(a); return x - d * Math.floor(x / d); },
  ABS: ([v]) => Math.abs(n1(v)),
  SIGN: ([v]) => Math.sign(n1(v)),
  SQRT: ([v]) => { const x = n1(v); if (x < 0) throw err('#NUM!'); return Math.sqrt(x); },
  POWER: ([a, b]) => n1(a) ** n1(b),
  EXP: ([v]) => Math.exp(n1(v)),
  LN: ([v]) => { const x = n1(v); if (x <= 0) throw err('#NUM!'); return Math.log(x); },
  LOG: ([v, base = 10]) => { const x = n1(v); if (x <= 0) throw err('#NUM!'); return Math.log(x) / Math.log(n1(base)); },
  LOG10: ([v]) => Math.log10(n1(v)),
  PI: () => Math.PI,
  CEILING: ([v, s = 1]) => { const step = n1(s) || 1; return Math.ceil(n1(v) / step - 1e-12) * step; },
  FLOOR: ([v, s = 1]) => { const step = n1(s) || 1; return Math.floor(n1(v) / step + 1e-12) * step; },
  RAND: () => Math.random(),
  RANDBETWEEN: ([lo, hi]) => { const a = Math.ceil(n1(lo)); const b = Math.floor(n1(hi)); return a + Math.floor(Math.random() * (b - a + 1)); },
  SUMPRODUCT: (a) => { const arrays = a.map((x) => cells(x)); const len = arrays[0]?.length ?? 0; if (arrays.some((x) => x.length !== len)) throw err('#VALUE!'); let s = 0; for (let i = 0; i < len; i += 1) s += arrays.reduce((p, arr) => p * (typeof arr[i] === 'number' ? arr[i] : 0), 1); return s; },
  // Conditional sums and counts
  COUNTIF: ([r, c]) => cells(r).filter(matcher(c)).length,
  SUMIF: ([r, c, s]) => { const test = cells(r); const sum = s === undefined ? test : cells(s); const ok = matcher(c); return test.reduce((acc, v, i) => acc + (ok(v) && typeof sum[i] === 'number' ? sum[i] : 0), 0); },
  AVERAGEIF: ([r, c, s]) => { const test = cells(r); const vals = s === undefined ? test : cells(s); const ok = matcher(c); const n = test.map((v, i) => (ok(v) && typeof vals[i] === 'number' ? vals[i] : null)).filter((x) => x !== null); if (!n.length) throw err('#DIV/0!'); return n.reduce((x, y) => x + y, 0) / n.length; },
  COUNTIFS: (a) => { const pairs = []; for (let i = 0; i < a.length; i += 2) pairs.push([cells(a[i]), matcher(a[i + 1])]); const len = pairs[0][0].length; let n = 0; for (let i = 0; i < len; i += 1) if (pairs.every(([r, ok]) => ok(r[i]))) n += 1; return n; },
  SUMIFS: ([s, ...rest]) => { const sum = cells(s); const pairs = []; for (let i = 0; i < rest.length; i += 2) pairs.push([cells(rest[i]), matcher(rest[i + 1])]); return sum.reduce((acc, v, i) => acc + (pairs.every(([r, ok]) => ok(r[i])) && typeof v === 'number' ? v : 0), 0); },
  AVERAGEIFS: ([s, ...rest]) => { const vals = cells(s); const pairs = []; for (let i = 0; i < rest.length; i += 2) pairs.push([cells(rest[i]), matcher(rest[i + 1])]); const n = vals.filter((v, i) => pairs.every(([r, ok]) => ok(r[i])) && typeof v === 'number'); if (!n.length) throw err('#DIV/0!'); return n.reduce((x, y) => x + y, 0) / n.length; },
  MAXIFS: ([s, ...rest]) => { const vals = cells(s); const pairs = []; for (let i = 0; i < rest.length; i += 2) pairs.push([cells(rest[i]), matcher(rest[i + 1])]); const n = vals.filter((v, i) => pairs.every(([r, ok]) => ok(r[i])) && typeof v === 'number'); return n.length ? Math.max(...n) : 0; },
  MINIFS: ([s, ...rest]) => { const vals = cells(s); const pairs = []; for (let i = 0; i < rest.length; i += 2) pairs.push([cells(rest[i]), matcher(rest[i + 1])]); const n = vals.filter((v, i) => pairs.every(([r, ok]) => ok(r[i])) && typeof v === 'number'); return n.length ? Math.min(...n) : 0; },
  // Logic
  IF: ([test, yes, no]) => { const t = toBool(test()); if (isError(t)) return t; return t ? (yes ? yes() : true) : (no ? no() : false); },
  IFERROR: ([v, fallback]) => { const x = v(); return isError(x) ? fallback() : x; },
  IFNA: ([v, fallback]) => { const x = v(); return isError(x) && x.code === '#N/A' ? fallback() : x; },
  IFS: (a) => { for (let i = 0; i < a.length; i += 2) { const t = toBool(a[i]()); if (isError(t)) return t; if (t) return a[i + 1](); } return err('#N/A'); },
  SWITCH: ([v, ...rest]) => { const x = v(); for (let i = 0; i + 1 < rest.length; i += 2) { const c = rest[i](); if (c === x || (typeof c === 'string' && typeof x === 'string' && c.toLowerCase() === x.toLowerCase())) return rest[i + 1](); } return rest.length % 2 ? rest[rest.length - 1]() : err('#N/A'); },
  CHOOSE: ([i, ...rest]) => { const k = n1(i()); if (k < 1 || k > rest.length) throw err('#VALUE!'); return rest[Math.floor(k) - 1](); },
  AND: (a) => flat(a).filter((v) => v !== '').every((v) => { const b = toBool(v); if (isError(b)) throw b; return b; }),
  OR: (a) => flat(a).filter((v) => v !== '').some((v) => { const b = toBool(v); if (isError(b)) throw b; return b; }),
  XOR: (a) => flat(a).filter((v) => v !== '' && toBool(v) === true).length % 2 === 1,
  NOT: ([v]) => !toBool(v),
  TRUE: () => true,
  FALSE: () => false,
  // Lookup
  VLOOKUP: ([key, table, col, approx = true]) => { const t = as2d(table); const k = n1(col) - 1; if (k < 0 || k >= (t[0]?.length ?? 0)) throw err('#REF!'); const first = t.map((r) => r[0]); const i = toBool(approx) ? lookupApprox(first, key) : lookupExact(first, key); if (i < 0) throw err('#N/A'); return t[i][k]; },
  HLOOKUP: ([key, table, row, approx = true]) => { const t = as2d(table); const k = n1(row) - 1; if (k < 0 || k >= t.length) throw err('#REF!'); const i = toBool(approx) ? lookupApprox(t[0], key) : lookupExact(t[0], key); if (i < 0) throw err('#N/A'); return t[k][i]; },
  XLOOKUP: ([key, look, ret, notFound]) => { const l = cells(look); const r = as2d(ret); const i = lookupExact(l, key); if (i < 0) { if (notFound !== undefined) return notFound; throw err('#N/A'); } return r.length === 1 ? r[0][i] : r[i][0]; },
  MATCH: ([key, look, type = 1]) => { const l = cells(look); const t = n1(type); const i = t === 0 ? lookupExact(l, key) : lookupApprox(l, key); if (i < 0) throw err('#N/A'); return i + 1; },
  INDEX: ([table, row, col = 1]) => { const t = as2d(table); const r = n1(row) - 1; const c = n1(col) - 1; const rr = t.length === 1 && n1(col) === 1 ? 0 : r; const cc = t.length === 1 && n1(col) === 1 ? r : c; if (!t[rr] || t[rr][cc] === undefined) throw err('#REF!'); return t[rr][cc]; },
  ROWS: ([r]) => as2d(r).length,
  COLUMNS: ([r]) => as2d(r)[0]?.length ?? 0,
  // Text
  CONCAT: (a) => flat(a).map(t1).join(''),
  CONCATENATE: (a) => flat(a).map(t1).join(''),
  TEXTJOIN: ([sep, skip, ...rest]) => flat(rest).filter((v) => !(toBool(skip) && (v === '' || v == null))).map(t1).join(t1(sep)),
  LEN: ([v]) => t1(v).length,
  LEFT: ([v, n = 1]) => t1(v).slice(0, n1(n)),
  RIGHT: ([v, n = 1]) => { const s = t1(v); return n1(n) ? s.slice(-n1(n)) : ''; },
  MID: ([v, start, n]) => t1(v).substr(n1(start) - 1, n1(n)),
  UPPER: ([v]) => t1(v).toUpperCase(),
  LOWER: ([v]) => t1(v).toLowerCase(),
  PROPER: ([v]) => t1(v).toLowerCase().replace(/(^|[^a-z])([a-z])/g, (m, a, b) => a + b.toUpperCase()),
  TRIM: ([v]) => t1(v).trim().replace(/\s+/g, ' '),
  SUBSTITUTE: ([v, from, to, nth]) => { const s = t1(v); const f = t1(from); if (!f) return s; if (nth === undefined) return s.split(f).join(t1(to)); let count = 0; return s.replace(new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), (m) => (++count === n1(nth) ? t1(to) : m)); },
  REPLACE: ([v, start, n, text]) => { const s = t1(v); const i = n1(start) - 1; return s.slice(0, i) + t1(text) + s.slice(i + n1(n)); },
  FIND: ([needle, hay, start = 1]) => { const i = t1(hay).indexOf(t1(needle), n1(start) - 1); if (i < 0) throw err('#VALUE!'); return i + 1; },
  SEARCH: ([needle, hay, start = 1]) => { const i = t1(hay).toLowerCase().indexOf(t1(needle).toLowerCase(), n1(start) - 1); if (i < 0) throw err('#VALUE!'); return i + 1; },
  REPT: ([v, n]) => t1(v).repeat(Math.max(0, n1(n))),
  EXACT: ([a, b]) => t1(a) === t1(b),
  TEXT: ([v, pattern]) => textFormat(v, t1(pattern)),
  VALUE: ([v]) => { const parsed = parseInput(t1(v)); if (typeof parsed.value !== 'number') throw err('#VALUE!'); return parsed.value; },
  T: ([v]) => (typeof v === 'string' ? v : ''),
  N: ([v]) => (typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : 0),
  CHAR: ([v]) => String.fromCharCode(n1(v)),
  // Dates
  TODAY: () => todaySerial(),
  NOW: () => { const n = new Date(); return todaySerial() + (n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds()) / 86400; },
  DATE: ([y, m, d]) => dateToSerial(n1(y), n1(m), n1(d)),
  TIME: ([h, m, s]) => (n1(h) * 3600 + n1(m) * 60 + n1(s)) / 86400,
  YEAR: ([v]) => serialToDate(n1(v)).getUTCFullYear(),
  MONTH: ([v]) => serialToDate(n1(v)).getUTCMonth() + 1,
  DAY: ([v]) => serialToDate(n1(v)).getUTCDate(),
  HOUR: ([v]) => Math.floor((n1(v) % 1) * 24 + 1e-9),
  MINUTE: ([v]) => Math.floor(((n1(v) % 1) * 1440 + 1e-9) % 60),
  WEEKDAY: ([v, type = 1]) => { const d = serialToDate(n1(v)).getUTCDay(); return n1(type) === 2 ? ((d + 6) % 7) + 1 : d + 1; },
  WEEKNUM: ([v]) => { const d = serialToDate(n1(v)); const start = Date.UTC(d.getUTCFullYear(), 0, 1); return Math.ceil(((d.getTime() - start) / DAY + new Date(start).getUTCDay() + 1) / 7); },
  EDATE: ([v, months]) => { const d = serialToDate(n1(v)); return dateToSerial(d.getUTCFullYear(), d.getUTCMonth() + 1 + n1(months), d.getUTCDate()); },
  EOMONTH: ([v, months]) => { const d = serialToDate(n1(v)); return dateToSerial(d.getUTCFullYear(), d.getUTCMonth() + 2 + n1(months), 0); },
  DAYS: ([end, start]) => Math.round(n1(end) - n1(start)),
  DATEDIF: ([start, end, unit]) => {
    const a = serialToDate(n1(start)); const b = serialToDate(n1(end)); const u = t1(unit).toUpperCase();
    if (b < a) throw err('#NUM!');
    if (u === 'D') return Math.round((b.getTime() - a.getTime()) / DAY);
    const months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) - (b.getUTCDate() < a.getUTCDate() ? 1 : 0);
    if (u === 'M') return months;
    if (u === 'Y') return Math.floor(months / 12);
    throw err('#NUM!');
  },
  NETWORKDAYS: ([start, end]) => { let n = 0; const a = Math.round(n1(start)); const b = Math.round(n1(end)); for (let s = Math.min(a, b); s <= Math.max(a, b); s += 1) { const d = serialToDate(s).getUTCDay(); if (d !== 0 && d !== 6) n += 1; } return a <= b ? n : -n; },
  // Information
  ISBLANK: ([v]) => v === '' || v == null,
  ISNUMBER: ([v]) => typeof v === 'number',
  ISTEXT: ([v]) => typeof v === 'string' && v !== '',
  ISLOGICAL: ([v]) => typeof v === 'boolean',
  ISERROR: ([v]) => isError(v),
  ISNA: ([v]) => isError(v) && v.code === '#N/A',
  ISEVEN: ([v]) => Math.floor(n1(v)) % 2 === 0,
  ISODD: ([v]) => Math.abs(Math.floor(n1(v)) % 2) === 1,
  NA: () => err('#N/A'),
  // Money
  PMT: ([rate, n, pv, fv = 0, type = 0]) => { const r = n1(rate); const k = n1(n); const p = n1(pv); const f = n1(fv); const t = n1(type); if (r === 0) return -(p + f) / k; const x = (1 + r) ** k; return -(r * (p * x + f)) / ((1 + r * t) * (x - 1)); },
  FV: ([rate, n, pmt, pv = 0, type = 0]) => { const r = n1(rate); const k = n1(n); const m = n1(pmt); const p = n1(pv); const t = n1(type); if (r === 0) return -(p + m * k); const x = (1 + r) ** k; return -(p * x + m * (1 + r * t) * (x - 1) / r); },
  NPV: ([rate, ...flows]) => { const r = n1(rate); return numbersOf(flows).reduce((s, v, i) => s + v / (1 + r) ** (i + 1), 0); },
};
F.AVG = F.AVERAGE;
F['STDEV.S'] = F.STDEV; F['STDEV.P'] = F.STDEVP; F['VAR.S'] = F.VAR;

export const FUNCTION_NAMES = Object.keys(F).sort();

/** One-line hints for the formula bar: =NAME(arguments) — what it does. */
export const FUNCTION_HELP = {
  SUM: 'SUM(range, …) — adds numbers', AVERAGE: 'AVERAGE(range, …) — the mean', MIN: 'MIN(range, …)', MAX: 'MAX(range, …)',
  COUNT: 'COUNT(range) — how many numbers', COUNTA: 'COUNTA(range) — how many aren’t blank', COUNTIF: 'COUNTIF(range, criteria) — e.g. ">5", "done"',
  COUNTIFS: 'COUNTIFS(range1, criteria1, range2, criteria2, …)', SUMIF: 'SUMIF(range, criteria, [sum_range])', SUMIFS: 'SUMIFS(sum_range, range1, criteria1, …)',
  AVERAGEIF: 'AVERAGEIF(range, criteria, [average_range])', IF: 'IF(test, if_true, if_false)', IFS: 'IFS(test1, value1, test2, value2, …)',
  IFERROR: 'IFERROR(value, if_error)', AND: 'AND(test, …)', OR: 'OR(test, …)', NOT: 'NOT(test)',
  VLOOKUP: 'VLOOKUP(key, table, column, [approximate]) — use FALSE for an exact match', XLOOKUP: 'XLOOKUP(key, look_in, return_from, [if_not_found])',
  HLOOKUP: 'HLOOKUP(key, table, row, [approximate])', INDEX: 'INDEX(range, row, [column])', MATCH: 'MATCH(key, range, [0 for exact])',
  ROUND: 'ROUND(number, digits)', ROUNDUP: 'ROUNDUP(number, digits)', ROUNDDOWN: 'ROUNDDOWN(number, digits)', MOD: 'MOD(number, divisor)',
  CONCAT: 'CONCAT(text, …)', TEXTJOIN: 'TEXTJOIN(separator, skip_blanks, text, …)', LEFT: 'LEFT(text, count)', RIGHT: 'RIGHT(text, count)',
  MID: 'MID(text, start, count)', LEN: 'LEN(text)', TRIM: 'TRIM(text)', UPPER: 'UPPER(text)', LOWER: 'LOWER(text)', PROPER: 'PROPER(text)',
  SUBSTITUTE: 'SUBSTITUTE(text, find, replace, [which])', TEXT: 'TEXT(value, "format") — e.g. "mmm d", "$#,##0.00", "0%"',
  TODAY: 'TODAY() — today’s date', NOW: 'NOW() — date and time', DATE: 'DATE(year, month, day)', DATEDIF: 'DATEDIF(start, end, "D"|"M"|"Y")',
  EDATE: 'EDATE(date, months)', EOMONTH: 'EOMONTH(date, months) — last day of a month', WEEKDAY: 'WEEKDAY(date) — 1 is Sunday',
  NETWORKDAYS: 'NETWORKDAYS(start, end) — weekdays between', YEAR: 'YEAR(date)', MONTH: 'MONTH(date)', DAY: 'DAY(date)',
  MEDIAN: 'MEDIAN(range)', LARGE: 'LARGE(range, k) — k-th largest', SMALL: 'SMALL(range, k)', RANK: 'RANK(value, range, [ascending])',
  SUMPRODUCT: 'SUMPRODUCT(range1, range2, …)', PMT: 'PMT(rate, periods, present_value) — a loan payment', UNIQUE: '',
};

// ─── Evaluating ─────────────────────────────────────────────────────────────

/**
 * @param {string} text  the formula, with or without the leading =
 * @param {{ cell: (sheet: number, col: number, row: number) => any, sheetIndex: (name: string | null) => number, current: number, maxRow: (sheet: number) => number }} ctx
 */
export function evaluateFormula(text, ctx) {
  const body = String(text).replace(/^=/, '');
  const tree = parsed(body);
  if (!tree) return err('#ERROR!');
  try {
    const v = evalNode(tree, ctx);
    return Array.isArray(v) ? (as2d(v)[0]?.[0] ?? '') : v; // a range by itself shows its first cell
  } catch (e) {
    if (isError(e)) return e;
    return err('#ERROR!');
  }
}

function sheetOf(node, ctx) {
  if (!node.sheet) return ctx.current;
  const i = ctx.sheetIndex(node.sheet);
  if (i < 0) throw err('#REF!');
  return i;
}

function evalNode(node, ctx) {
  switch (node.k) {
    case 'lit': return node.v;
    case 'ref': return ctx.cell(sheetOf(node, ctx), node.v.col, node.v.row);
    case 'range': {
      const s = sheetOf(node, ctx);
      const [a, b] = node.v;
      const c1 = Math.min(a.col, b.col); const c2 = Math.max(a.col, b.col);
      const r1 = Math.min(a.row, b.row); const r2 = Math.max(a.row, b.row);
      const rows = [];
      for (let r = r1; r <= r2; r += 1) { const row = []; for (let c = c1; c <= c2; c += 1) row.push(ctx.cell(s, c, r)); rows.push(row); }
      return rows;
    }
    case 'cols': {
      const s = sheetOf(node, ctx);
      const c1 = Math.min(node.v[0].col, node.v[1].col); const c2 = Math.max(node.v[0].col, node.v[1].col);
      const last = ctx.maxRow(s);
      const rows = [];
      for (let r = 0; r <= last; r += 1) { const row = []; for (let c = c1; c <= c2; c += 1) row.push(ctx.cell(s, c, r)); rows.push(row); }
      return rows;
    }
    case 'neg': { const v = toNumber(single(evalNode(node.a, ctx))); return isError(v) ? v : -v; }
    case 'bin': return binary(node.op, single(evalNode(node.a, ctx)), single(evalNode(node.b, ctx)));
    case 'call': {
      const fn = F[node.name];
      if (!fn) return err('#NAME?');
      if (LAZY.has(node.name)) {
        const thunks = node.args.map((a) => () => single(evalNode(a, ctx)));
        return fn(thunks);
      }
      const args = node.args.map((a) => evalNode(a, ctx));
      // An error passed straight in (not inside a range) is the answer, except where a function handles errors.
      const handlesErrors = /^IS|^IFERROR|^IFNA|^COUNT/.test(node.name);
      if (!handlesErrors) for (const a of args) if (isError(a)) return a;
      const kinds = node.args.map((a) => (a.k === 'lit' ? 'lit' : a.k === 'ref' ? 'ref' : 'expr'));
      const result = fn(args, kinds);
      return result === undefined ? '' : result;
    }
    default: return err('#ERROR!');
  }
}

const single = (v) => (Array.isArray(v) ? (as2d(v)[0]?.[0] ?? '') : v);

function binary(op, a, b) {
  if (isError(a)) return a;
  if (isError(b)) return b;
  if (op === '&') return toText(a) + toText(b);
  if (['=', '<>', '<', '>', '<=', '>='].includes(op)) {
    const norm = (v) => (typeof v === 'string' ? v.toLowerCase() : v === '' ? 0 : v);
    let x = norm(a); let y = norm(b);
    if (typeof x !== typeof y) { if (a === '' ) x = typeof y === 'string' ? '' : 0; if (b === '') y = typeof x === 'string' ? '' : 0; }
    if (typeof x !== typeof y) { const rank = (v) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2); x = rank(x); y = rank(y); }
    return ({ '=': x === y, '<>': x !== y, '<': x < y, '>': x > y, '<=': x <= y, '>=': x >= y })[op];
  }
  const x = toNumber(a); if (isError(x)) return x;
  const y = toNumber(b); if (isError(y)) return y;
  switch (op) {
    case '+': return x + y;
    case '-': return x - y;
    case '*': return x * y;
    case '/': return y === 0 ? err('#DIV/0!') : x / y;
    case '^': { const r = x ** y; return Number.isFinite(r) ? r : err('#NUM!'); }
    default: return err('#ERROR!');
  }
}

// ─── What a typed entry means ───────────────────────────────────────────────

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * What someone typed, as a value, and the format it suggests:
 *   "12" → 12; "$1,200.50" → 1200.5 (currency); "15%" → 0.15 (percent);
 *   "11/14/2026", "2026-11-14", "Nov 14" → a date; "6:30 pm" → a time; "TRUE" → true.
 */
export function parseInput(raw) {
  const s = String(raw ?? '').trim();
  if (s === '') return { value: '' };
  if (/^'/.test(raw)) return { value: String(raw).slice(1) }; // a leading ' keeps it as text
  if (/^(true|false)$/i.test(s)) return { value: s.toLowerCase() === 'true' };
  let m;
  if ((m = /^(-)?\$\s?(-)?([\d,]*\.?\d+)$/.exec(s)) && /^\d{1,3}(,\d{3})*(\.\d+)?$|^\d*\.?\d+$/.test(m[3])) return { value: (m[1] || m[2] ? -1 : 1) * Number(m[3].replace(/,/g, '')), fmt: 'currency' };
  if ((m = /^(-?[\d,]*\.?\d+)\s?%$/.exec(s))) return { value: Number(m[1].replace(/,/g, '')) / 100, fmt: 'percent' };
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return { value: Number(s.replace(/,/g, '')), fmt: 'number' };
  if (/^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return { value: Number(s) };
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) return { value: dateToSerial(+m[1], +m[2], +m[3]), fmt: 'date' };
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s))) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return { value: dateToSerial(y, +m[1], +m[2]), fmt: 'date' }; }
  if ((m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?$/.exec(s)) && MONTHS.includes(m[1].slice(0, 3).toLowerCase())) {
    return { value: dateToSerial(m[3] ? +m[3] : new Date().getFullYear(), MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, +m[2]), fmt: 'date' };
  }
  if ((m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i.exec(s))) {
    let h = +m[1]; const ap = m[4]?.[0]?.toLowerCase();
    if (ap === 'p' && h < 12) h += 12; if (ap === 'a' && h === 12) h = 0;
    return { value: (h * 3600 + +m[2] * 60 + (+m[3] || 0)) / 86400, fmt: 'time' };
  }
  return { value: String(raw) };
}

/** Functions whose answer is a date (so a cell with no format shows one). */
export const DATE_FUNCTIONS = new Set(['TODAY', 'DATE', 'EDATE', 'EOMONTH']);
