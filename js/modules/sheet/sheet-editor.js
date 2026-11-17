// @ts-check
/**
 * sheet-editor.js — the spreadsheet editor (full page, the homepage card, and
 * vault files), working much like Excel or Google Sheets.
 *
 *   [↶ ↷ | Automatic ▾ $ % .0← .00→ | B I U S | A▾ ▒▾ | ⟸ ≡ ⟹ ⤶ | Insert ▾ Delete ▾ | Sort ▾ Filter Freeze ▾ | Highlight Dropdown | Find | Chart | Import Download ▾]
 *   [ B5 ][ fx  =SUM(B2:B4)                                            ]   SUM(range, …) — adds numbers
 *      │ A          │ B      │ C │…        ← click a letter or number to select it; drag its edge to resize
 *    1 │ Item       │ Price  │
 *    2 │ T-shirt    │ $20.00 │      ■ ← drag the corner square to fill
 *   [Sheet1] [Totals] [+]                       Sum $64.00 · Average $21.33 · Count 3
 *
 * Keys: arrows (Ctrl+arrows jump to the edge of the data), Shift to select,
 * Enter / Tab move on, F2 or typing edits, Delete clears, Ctrl+C / X / V
 * (with Excel and Google Sheets too), Ctrl+Z / Y, Ctrl+B / I / U, Ctrl+D / R
 * fill down / right, Ctrl+A selects everything, Ctrl+F finds, Ctrl+; puts in
 * today's date. While typing a formula, click cells to put them in it.
 * Right-click a cell for more.
 *
 *   createSheetEditor(root, { getData, saveData, canEdit, compact, title })
 *   → { redraw() }
 */

import { h, replaceChildren } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { showToast } from '../../ui/toast.js';
import {
  normalizeWorkbook, createCalc, rawOf, styleOf, putCell, toRange, rangeText, inRange, eachCell, FORMATS, DEFAULT_WIDTH, ROW_HEIGHT,
  MAX_COLS, MAX_ROWS, insertRows, deleteRows, insertCols, deleteCols, copyBlock, pasteBlock, parseTable, placeTable, rangeAsText,
  fillSeries, clearRange, sortRange, hiddenRows, columnValues, RULE_OPS, ruleStyle, renameSheet, uniqueSheetName, newSheet,
  sheetToCsv, parseCsv, currentRegion, hasHeaderRow,
} from './sheet-model.js';
import { cellName, colName, parseCellName, FUNCTION_NAMES, FUNCTION_HELP, isError, todaySerial } from './sheet-formula.js';
import { readXlsx, writeXlsx } from './sheet-xlsx.js';
import { renderChart } from './sheet-chart.js';

const HISTORY_LIMIT = 100;
const HEADER_WIDTH = 46;
const TEXT_COLORS = ['', '#1f2328', '#b42318', '#c4320a', '#1a7f37', '#0b6bcb', '#6e40c9', '#6b7280'];
const FILL_COLORS = ['', '#fde2e1', '#feecdc', '#fef7c3', '#dcfae6', '#dbeafe', '#ede9fe', '#f2f4f7'];

/** What was last copied in 3den (so pasting keeps formulas and styles), with its text for matching. */
let clipboard = null; // { text, block, cut: { sheet, range } | null }

export function createSheetEditor(root, { getData, saveData, canEdit = true, compact = false, title = 'Spreadsheet', onOpenFull = null }) {
  let wb = normalizeWorkbook(getData());
  let calc = createCalc(wb);
  const history = []; const future = [];
  let sel = { col: 0, row: 0 };
  let anchor = null; // the other corner of the selection
  let editing = null; // { input, col, row, from: 'cell' | 'bar' }
  let pointRef = null; // while typing a formula: the range being pointed at { start, text }
  let dragMode = null; // 'select' | 'fill' | 'point' | 'resize'
  let fillTarget = null;
  let filterUi = false;
  let findOpen = false;
  let hidden = new Set();
  let viewport = { first: 0, count: 40 };

  const sheetIndex = () => wb.active;
  const sheet = () => wb.sheets[wb.active];
  const range = () => {
    const a = anchor ?? sel;
    return { c1: Math.min(a.col, sel.col), r1: Math.min(a.row, sel.row), c2: Math.max(a.col, sel.col), r2: Math.max(a.row, sel.row) };
  };
  const widthOf = (c) => sheet().widths?.[c] ?? DEFAULT_WIDTH;

  // ─── Changes, saving, undo ────────────────────────────────────────────────

  /** Make a change to the workbook: kept for Undo, saved, and redrawn. */
  function change(fn, { redraw = true } = {}) {
    if (!canEdit) return;
    history.push(JSON.stringify(wb));
    if (history.length > HISTORY_LIMIT) history.shift();
    future.length = 0;
    fn(wb, sheet());
    commitChange(redraw);
  }
  function commitChange(redraw = true) {
    calc = createCalc(wb);
    saveData(structuredClone(wb));
    if (redraw) drawAll();
  }
  function undo() { if (!history.length) return; future.push(JSON.stringify(wb)); wb = JSON.parse(history.pop()); commitChange(); }
  function redo() { if (!future.length) return; history.push(JSON.stringify(wb)); wb = JSON.parse(future.pop()); commitChange(); }

  // ─── The parts of the page ────────────────────────────────────────────────

  const toolbar = h('div', { class: 'sheet__tools', role: 'toolbar', 'aria-label': 'Spreadsheet tools' });
  const nameBox = h('input', {
    class: 'sheet__where', type: 'text', 'aria-label': 'Selected cell or range (type one to go there)', spellcheck: 'false',
    onKeydown: (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const r = toRange(nameBox.value.toUpperCase().trim());
      if (r) { anchor = { col: r.c1, row: r.r1 }; sel = { col: r.c2, row: r.r2 }; if (r.c1 === r.c2 && r.r1 === r.r2) anchor = null; ensureVisible(); showSelection(); grid.focus(); }
    },
  });
  const formulaBar = h('input', {
    class: 'sheet__formula', type: 'text', 'aria-label': 'What’s in the selected cell', spellcheck: 'false', disabled: !canEdit,
    onFocus: () => { if (canEdit && !editing) startEditing(null, 'bar'); },
    onInput: () => { if (editing?.from === 'bar') { syncEditorText(formulaBar.value, 'bar'); suggest(formulaBar); } },
    onKeydown: (e) => editorKeydown(e, formulaBar),
  });
  const hint = h('div', { class: 'sheet__hint', role: 'status', 'aria-live': 'polite' });
  const suggestions = h('ul', { class: 'sheet__suggest', role: 'listbox', hidden: true });
  const status = h('div', { class: 'sheet__status', 'aria-live': 'polite' });
  const tabs = h('div', { class: 'sheet__tabs', role: 'tablist', 'aria-label': 'Sheets' });
  const findBar = h('div', { class: 'sheet__find', hidden: true });
  const chartsArea = h('div', { class: 'sheet__charts' });
  const menuLayer = h('div', { class: 'sheet__menu-layer' });

  const colgroup = h('colgroup', {});
  const thead = h('thead', {});
  const tbody = h('tbody', {});
  const table = h('table', { class: 'sheet__table', role: 'grid', 'aria-label': `${title}. Arrow keys move, Enter edits, Shift plus arrows selects.`, 'aria-multiselectable': 'true' }, colgroup, thead, tbody);
  const fillHandle = h('div', { class: 'sheet__fill-handle', title: 'Drag to fill', hidden: !canEdit });
  const grid = h('div', { class: 'sheet__scroll', tabindex: '0' }, table, fillHandle);

  root.classList.add('sheet', compact ? 'sheet--card' : 'sheet--page');
  replaceChildren(root,
    compact ? null : toolbar,
    h('div', { class: 'sheet__bar' }, nameBox, h('span', { class: 'sheet__fx', 'aria-hidden': 'true' }, 'fx'), h('div', { class: 'sheet__formula-wrap' }, formulaBar, suggestions)),
    compact ? null : hint,
    findBar,
    grid,
    h('div', { class: 'sheet__foot' }, tabs, status),
    compact ? null : chartsArea,
    menuLayer);
  if (compact && onOpenFull) root.append(h('button', { type: 'button', class: 'link-button sheet__more', onClick: onOpenFull }, 'Open the full sheet →'));

  // ─── Drawing ──────────────────────────────────────────────────────────────

  /** The rows to show, in order (filtered ones left out), and the frozen ones. */
  function rowList() {
    const sh = sheet();
    hidden = hiddenRows(wb, sheetIndex(), calc);
    const frozen = Math.min(sh.freeze?.rows ?? 0, sh.rows);
    const rows = [];
    for (let r = frozen; r < sh.rows; r += 1) if (!hidden.has(r)) rows.push(r);
    return { frozen, rows };
  }

  function drawAll() {
    if (!compact) drawToolbar();
    drawGrid();
    drawTabs();
    if (!compact) drawCharts();
    showSelection();
  }

  function drawGrid() {
    const sh = sheet();
    const { frozen, rows } = rowList();
    const frozenCols = Math.min(sh.freeze?.cols ?? 0, sh.cols);
    const lefts = [HEADER_WIDTH];
    for (let c = 0; c < sh.cols; c += 1) lefts.push(lefts[c] + widthOf(c));
    replaceChildren(colgroup, h('col', { style: { width: `${HEADER_WIDTH}px` } }), Array.from({ length: sh.cols }, (_, c) => h('col', { style: { width: `${widthOf(c)}px` } })));
    table.style.width = `${lefts[sh.cols]}px`;
    const stickyLeft = (c) => (c < frozenCols ? { position: 'sticky', left: `${lefts[c]}px`, zIndex: '1' } : null);
    const headerRowIndex = Math.max(1, frozen) - 1; // where filter buttons go
    const headRow = h('tr', { class: 'sheet__letters' },
      h('th', { class: 'sheet__corner', title: 'Select everything', onMousedown: (e) => { e.preventDefault(); anchor = { col: 0, row: 0 }; sel = { col: sh.cols - 1, row: sh.rows - 1 }; showSelection(); grid.focus(); } }),
      Array.from({ length: sh.cols }, (_, c) => h('th', {
        scope: 'col', 'data-col-head': String(c), style: stickyLeft(c),
        onMousedown: (e) => { if (e.target.closest('.sheet__resize')) return; e.preventDefault(); selectColumn(c, e.shiftKey); },
        onContextmenu: (e) => { e.preventDefault(); selectColumn(c, false); openContextMenu(e.clientX, e.clientY); },
      }, colName(c), canEdit ? h('span', { class: 'sheet__resize', 'aria-hidden': 'true', onMousedown: (e) => startResize(e, c), onDblclick: () => autoFit(c) }) : null)));
    const frozenRows = Array.from({ length: frozen }, (_, r) => renderRow(r, { frozen: true, top: (r + 1) * ROW_HEIGHT, stickyLeft, headerRowIndex }));
    replaceChildren(thead, headRow, frozenRows);
    // Only the rows in view (plus a few) are drawn; spacers keep the scroll height right.
    const total = rows.length;
    const first = Math.max(0, Math.min(viewport.first, Math.max(0, total - viewport.count)));
    const last = Math.min(total, first + viewport.count);
    const before = first * ROW_HEIGHT;
    const after = (total - last) * ROW_HEIGHT;
    replaceChildren(tbody,
      before ? h('tr', { class: 'sheet__spacer', 'aria-hidden': 'true' }, h('td', { colspan: String(sh.cols + 1), style: { height: `${before}px` } })) : null,
      rows.slice(first, last).map((r) => renderRow(r, { stickyLeft, headerRowIndex })),
      after ? h('tr', { class: 'sheet__spacer', 'aria-hidden': 'true' }, h('td', { colspan: String(sh.cols + 1), style: { height: `${after}px` } })) : null);
  }

  function renderRow(r, { frozen = false, top = 0, stickyLeft, headerRowIndex }) {
    const sh = sheet();
    const s = sheetIndex();
    return h('tr', { 'data-row-index': String(r), class: frozen ? 'is-frozen' : '', style: frozen ? { position: 'sticky', top: `${top}px`, zIndex: '2' } : null },
      h('th', {
        scope: 'row', class: 'sheet__rownum', title: `Row ${r + 1}`,
        onMousedown: (e) => { e.preventDefault(); selectRow(r, e.shiftKey); },
        onContextmenu: (e) => { e.preventDefault(); selectRow(r, false); openContextMenu(e.clientX, e.clientY); },
      }, String(r + 1)),
      Array.from({ length: sh.cols }, (_, c) => {
        const name = cellName(c, r);
        const cell = sh.cells[name];
        const st = styleOf(cell);
        const value = calc.value(s, c, r);
        const shown = calc.display(s, c, r);
        const rule = ruleStyle(sh, calc, s, c, r);
        const align = st.a ?? (typeof value === 'number' ? 'right' : typeof value === 'boolean' || isError(value) ? 'center' : 'left');
        const validation = sh.validation?.[colName(c)];
        const invalid = validation?.list && r > headerRowIndex && shown !== '' && !validation.list.includes(shown);
        const filter = filterUi && r === headerRowIndex ? h('button', {
          type: 'button', class: `sheet__filter-btn${sh.filters?.[c]?.hide?.length || sh.filters?.[c]?.text ? ' is-on' : ''}`, 'aria-label': `Filter column ${colName(c)}`,
          onMousedown: (e) => { e.stopPropagation(); e.preventDefault(); openFilter(c, e.currentTarget); },
        }, icon('filter', 11)) : null;
        return h('td', {
          'data-col': String(c), 'data-row': String(r), role: 'gridcell', title: isError(value) ? errorHelp(value.code) : shown.length > 18 ? shown : null,
          class: [typeof value === 'number' ? 'is-number' : '', isError(value) ? 'is-error' : '', st.w ? 'is-wrap' : '', invalid ? 'is-invalid' : '', validation?.list && r > headerRowIndex ? 'has-list' : ''].filter(Boolean).join(' '),
          style: {
            ...stickyLeft(c),
            fontWeight: st.b ? '700' : null, fontStyle: st.i ? 'italic' : null,
            textDecoration: [st.u ? 'underline' : '', st.x ? 'line-through' : ''].filter(Boolean).join(' ') || null,
            color: rule?.color ?? st.c ?? null, background: rule?.fill ?? st.f ?? null, textAlign: align,
          },
        }, h('span', { class: 'sheet__val' }, shown), filter,
        validation?.list && r > headerRowIndex && canEdit ? h('span', { class: 'sheet__list-caret', 'aria-hidden': 'true' }, '▾') : null);
      }));
  }

  const errorHelp = (code) => ({
    '#DIV/0!': 'Dividing by zero (or by an empty cell).', '#VALUE!': 'A value of the wrong kind, like text where a number is needed.',
    '#REF!': 'A cell this formula used was deleted.', '#NAME?': 'There’s no function with that name. Check the spelling.',
    '#N/A': 'Not found: the lookup didn’t find a match.', '#CYCLE!': 'This formula depends on itself.', '#NUM!': 'A number that’s out of range.',
    '#ERROR!': 'The formula couldn’t be read. Check its brackets and commas.',
  })[code] ?? code;

  // ─── Selection ────────────────────────────────────────────────────────────

  const cellEl = (c, r) => /** @type {HTMLElement | null} */ (table.querySelector(`td[data-col="${c}"][data-row="${r}"]`));

  function showSelection() {
    const r = range();
    table.querySelectorAll('td.is-selected, td.is-in-range, th.is-active').forEach((el) => el.classList.remove('is-selected', 'is-in-range', 'is-active'));
    const multi = r.c1 !== r.c2 || r.r1 !== r.r2;
    table.querySelectorAll('td[data-col]').forEach((td) => {
      const c = Number(/** @type {HTMLElement} */ (td).dataset.col); const row = Number(/** @type {HTMLElement} */ (td).dataset.row);
      if (multi && inRange(r, c, row)) td.classList.add('is-in-range');
    });
    cellEl(sel.col, sel.row)?.classList.add('is-selected');
    for (let c = r.c1; c <= r.c2; c += 1) table.querySelector(`th[data-col-head="${c}"]`)?.classList.add('is-active');
    table.querySelectorAll('tr[data-row-index]').forEach((tr) => { const row = Number(/** @type {HTMLElement} */ (tr).dataset.rowIndex); if (row >= r.r1 && row <= r.r2) tr.querySelector('th')?.classList.add('is-active'); });
    nameBox.value = rangeText(r);
    if (!editing) formulaBar.value = rawOf(sheet().cells[cellName(sel.col, sel.row)]);
    placeFillHandle();
    drawStatus();
    drawHint(rawOf(sheet().cells[cellName(sel.col, sel.row)]));
  }

  function placeFillHandle() {
    const r = range();
    const corner = cellEl(r.c2, r.r2);
    if (!corner || !canEdit || editing) { fillHandle.hidden = true; return; }
    fillHandle.hidden = false;
    fillHandle.style.left = `${corner.offsetLeft + corner.offsetWidth - 4}px`;
    fillHandle.style.top = `${corner.offsetTop + corner.offsetHeight - 4}px`;
  }

  function select(col, row, extend = false) {
    const sh = sheet();
    col = Math.max(0, Math.min(col, sh.cols - 1));
    row = Math.max(0, Math.min(row, sh.rows - 1));
    if (extend) { if (!anchor) anchor = { ...sel }; } else anchor = null;
    sel = { col, row };
    ensureVisible();
    showSelection();
  }
  function selectColumn(c, extend) {
    const sh = sheet();
    if (extend && anchor) { sel = { col: c, row: sh.rows - 1 }; } else { anchor = { col: c, row: 0 }; sel = { col: c, row: sh.rows - 1 }; }
    showSelection(); grid.focus();
  }
  function selectRow(r, extend) {
    const sh = sheet();
    if (extend && anchor) { sel = { col: sh.cols - 1, row: r }; } else { anchor = { col: 0, row: r }; sel = { col: sh.cols - 1, row: r }; }
    showSelection(); grid.focus();
  }

  /** Scroll so the selected cell is in view (and draw its rows if they weren't). */
  function ensureVisible() {
    const { frozen, rows } = rowList();
    if (sel.row >= frozen) {
      const i = rows.indexOf(sel.row);
      if (i >= 0 && (i < viewport.first || i >= viewport.first + viewport.count - 2)) {
        viewport.first = Math.max(0, i - 5);
        drawGrid();
      }
      if (i >= 0) {
        const y = (frozen + 1) * ROW_HEIGHT + i * ROW_HEIGHT;
        if (y < grid.scrollTop + (frozen + 1) * ROW_HEIGHT) grid.scrollTop = y - (frozen + 1) * ROW_HEIGHT;
        else if (y + ROW_HEIGHT > grid.scrollTop + grid.clientHeight) grid.scrollTop = y + ROW_HEIGHT - grid.clientHeight + 4;
      }
    }
    const td = cellEl(sel.col, sel.row);
    if (td) {
      const frozenW = HEADER_WIDTH + Array.from({ length: sheet().freeze?.cols ?? 0 }, (_, c) => widthOf(c)).reduce((a, b) => a + b, 0);
      if (td.offsetLeft < grid.scrollLeft + frozenW && sel.col >= (sheet().freeze?.cols ?? 0)) grid.scrollLeft = td.offsetLeft - frozenW;
      else if (td.offsetLeft + td.offsetWidth > grid.scrollLeft + grid.clientWidth) grid.scrollLeft = td.offsetLeft + td.offsetWidth - grid.clientWidth + 4;
    }
  }

  grid.addEventListener('scroll', () => {
    const { frozen } = rowList();
    const firstVisible = Math.floor(Math.max(0, grid.scrollTop) / ROW_HEIGHT);
    const count = Math.ceil(grid.clientHeight / ROW_HEIGHT) + 20;
    const want = Math.max(0, firstVisible - 8 - frozen * 0);
    if (Math.abs(want - viewport.first) > 6 || count !== viewport.count) {
      viewport = { first: want, count };
      drawGrid();
      showSelection();
      if (editing?.from === 'cell') reattachEditor();
    }
  }, { passive: true });

  // ─── Editing ──────────────────────────────────────────────────────────────

  function startEditing(initial = null, how = 'cell') {
    if (!canEdit) return;
    const from = how === 'cell-free' ? 'cell' : how; // 'cell-free': typing in a dropdown-list cell

    const name = cellName(sel.col, sel.row);
    const current = rawOf(sheet().cells[name]);
    const validation = sheet().validation?.[colName(sel.col)];
    if (validation?.list && how === 'cell' && initial === null && sel.row > Math.max(1, sheet().freeze?.rows ?? 0) - 1) { openListPicker(validation.list); return; }
    if (from === 'bar') {
      editing = { input: formulaBar, col: sel.col, row: sel.row, from };
      fillHandle.hidden = true;
      return;
    }
    const td = cellEl(sel.col, sel.row);
    if (!td) return;
    const input = h('input', { class: 'sheet__cell-input', type: 'text', spellcheck: 'false', 'aria-label': `Cell ${name}` });
    input.value = initial ?? current;
    input.addEventListener('keydown', (e) => editorKeydown(e, input));
    input.addEventListener('input', () => { syncEditorText(input.value, 'cell'); suggest(input); });
    input.addEventListener('blur', () => { setTimeout(() => { if (editing?.input === input && document.activeElement !== formulaBar && !dragMode) commitEdit(); }, 0); });
    editing = { input, col: sel.col, row: sel.row, from };
    replaceChildren(td, input);
    td.classList.add('is-editing');
    fillHandle.hidden = true;
    input.focus();
    if (initial !== null) input.setSelectionRange(input.value.length, input.value.length);
    syncEditorText(input.value, 'cell');
  }

  function reattachEditor() {
    if (!editing || editing.from !== 'cell') return;
    const td = cellEl(editing.col, editing.row);
    if (td && !td.contains(editing.input)) { replaceChildren(td, editing.input); editing.input.focus(); }
  }

  function syncEditorText(text, from) {
    if (from === 'cell') formulaBar.value = text;
    else if (editing?.from === 'cell') editing.input.value = text;
    drawHint(text, editing?.input);
  }

  function commitEdit(text = editing?.input.value) {
    if (!editing) return;
    const { col, row } = editing;
    const name = cellName(col, row);
    const before = rawOf(sheet().cells[name]);
    editing = null;
    pointRef = null;
    hideSuggest();
    let next = String(text ?? '');
    // A formula missing its last bracket is fixed for you, as in Excel.
    if (next.startsWith('=')) { const open = (next.match(/\(/g) ?? []).length - (next.match(/\)/g) ?? []).length; if (open > 0) next += ')'.repeat(open); }
    if (next !== before) change((_, sh) => putCell(sh, name, { raw: next }));
    else drawGrid();
    showSelection();
  }
  function cancelEdit() { editing = null; pointRef = null; hideSuggest(); drawGrid(); showSelection(); grid.focus(); }

  function editorKeydown(e, input) {
    if (!suggestions.hidden) {
      const items = [...suggestions.querySelectorAll('li')];
      const at = items.findIndex((li) => li.classList.contains('is-active'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items.forEach((li, i) => li.classList.toggle('is-active', i === n)); return; }
      if ((e.key === 'Tab' || e.key === 'Enter') && at >= 0) { e.preventDefault(); acceptSuggestion(input, items[at].dataset.name); return; }
      if (e.key === 'Escape') { e.preventDefault(); hideSuggest(); return; }
    }
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(input.value); select(sel.col, sel.row + (e.shiftKey ? -1 : 1)); grid.focus(); }
    else if (e.key === 'Tab') { e.preventDefault(); commitEdit(input.value); select(sel.col + (e.shiftKey ? -1 : 1), sel.row); grid.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
    else if (editing?.from === 'cell' && !String(input.value).startsWith('=') && ['ArrowUp', 'ArrowDown'].includes(e.key) && input.selectionStart === input.value.length) {
      e.preventDefault(); commitEdit(input.value); select(sel.col, sel.row + (e.key === 'ArrowDown' ? 1 : -1)); grid.focus();
    }
  }

  /** Is the caret at a spot where a cell reference could go (=, (, an operator, a comma)? */
  const canPoint = (input) => {
    const v = input.value.slice(0, input.selectionStart ?? input.value.length);
    return v.startsWith('=') && /[=(+\-*/^&,<>:]\s*$/.test(v);
  };

  /** Put a cell or range into the formula being typed (clicking cells while typing one). */
  function insertRef(text) {
    if (!editing) return;
    const input = editing.input;
    const pos = input.selectionStart ?? input.value.length;
    if (pointRef) {
      input.value = input.value.slice(0, pointRef.start) + text + input.value.slice(pointRef.start + pointRef.text.length);
      pointRef.text = text;
    } else {
      input.value = input.value.slice(0, pos) + text + input.value.slice(pos);
      pointRef = { start: pos, text };
    }
    const end = pointRef.start + text.length;
    input.focus();
    input.setSelectionRange(end, end);
    syncEditorText(input.value, editing.from);
  }

  // ─── Function names and hints ─────────────────────────────────────────────

  function suggest(input) {
    pointRef = null;
    const before = input.value.slice(0, input.selectionStart ?? input.value.length);
    const m = before.startsWith('=') ? /([A-Za-z][A-Za-z0-9.]*)$/.exec(before) : null;
    if (!m || /[A-Za-z]\d+$/.test(m[1])) { hideSuggest(); return; }
    const word = m[1].toUpperCase();
    const matches = FUNCTION_NAMES.filter((n) => n.startsWith(word)).slice(0, 8);
    if (!matches.length || (matches.length === 1 && matches[0] === word)) { hideSuggest(); return; }
    replaceChildren(suggestions, matches.map((name, i) => h('li', {
      role: 'option', class: i === 0 ? 'is-active' : '', 'data-name': name,
      onMousedown: (e) => { e.preventDefault(); acceptSuggestion(input, name); },
    }, h('strong', {}, name), FUNCTION_HELP[name] ? h('span', {}, ` ${FUNCTION_HELP[name].split('—')[1]?.trim() ?? ''}`) : null)));
    suggestions.hidden = false;
    suggestions.style.left = editing?.from === 'cell' ? `${Math.max(0, input.getBoundingClientRect().left - formulaBar.getBoundingClientRect().left)}px` : '0px';
  }
  function hideSuggest() { suggestions.hidden = true; replaceChildren(suggestions); }
  function acceptSuggestion(input, name) {
    const pos = input.selectionStart ?? input.value.length;
    const before = input.value.slice(0, pos).replace(/([A-Za-z][A-Za-z0-9.]*)$/, `${name}(`);
    input.value = before + input.value.slice(pos);
    input.setSelectionRange(before.length, before.length);
    input.focus();
    hideSuggest();
    syncEditorText(input.value, editing?.from ?? 'cell');
  }

  /** "SUM(range, …) — adds numbers" for the function the caret is inside. */
  function drawHint(text, input = null) {
    if (compact) return;
    const upto = input ? text.slice(0, input.selectionStart ?? text.length) : text;
    if (!String(upto).startsWith('=')) { replaceChildren(hint); return; }
    let depth = 0; let name = null;
    for (let i = upto.length - 1; i >= 0; i -= 1) {
      const ch = upto[i];
      if (ch === ')') depth += 1;
      else if (ch === '(') { if (depth === 0) { name = /([A-Za-z][A-Za-z0-9.]*)$/.exec(upto.slice(0, i))?.[1]?.toUpperCase(); break; } depth -= 1; }
    }
    const help = name && (FUNCTION_HELP[name] || (FUNCTION_NAMES.includes(name) ? `${name}(…)` : ''));
    replaceChildren(hint, help ? [h('code', {}, help.split(' — ')[0]), help.includes(' — ') ? ` ${help.split(' — ')[1]}` : ''] : null);
  }

  // ─── Status (sum of the selection) ────────────────────────────────────────

  function drawStatus() {
    const r = range();
    if (r.c1 === r.c2 && r.r1 === r.r2) { replaceChildren(status); return; }
    const nums = []; let count = 0;
    let fmt = '';
    eachCell(r, (c, row) => {
      if (hidden.has(row)) return;
      const v = calc.value(sheetIndex(), c, row);
      if (v !== '' && v != null) count += 1;
      if (typeof v === 'number') { nums.push(v); fmt ||= calc.formatOf(sheetIndex(), c, row); }
    });
    if (!count) { replaceChildren(status); return; }
    const show = (v) => (fmt && fmt !== 'percent' ? displayAs(v, fmt) : String(+v.toFixed(6)));
    replaceChildren(status, nums.length
      ? `Sum ${show(nums.reduce((a, b) => a + b, 0))} · Average ${show(nums.reduce((a, b) => a + b, 0) / nums.length)} · Count ${count}`
      : `Count ${count}`);
  }
  const displayAs = (v, fmt) => { const tmp = createCalc({ sheets: [{ name: 'x', cells: { A1: { v: String(v), s: { n: fmt } } } }] }); return tmp.display(0, 0, 0); };

  // ─── Mouse ────────────────────────────────────────────────────────────────

  table.addEventListener('mousedown', (e) => {
    const td = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('td[data-col]'));
    if (!td || e.button !== 0) return;
    const col = Number(td.dataset.col); const row = Number(td.dataset.row);
    if (editing && editing.input.contains(/** @type {Node} */ (e.target))) return;
    if (editing && (col !== editing.col || row !== editing.row) && (pointRef || canPoint(editing.input))) {
      e.preventDefault();
      dragMode = 'point';
      const start = { col, row };
      insertRef(cellName(col, row));
      pointRef.anchor = start;
      return;
    }
    if (editing) commitEdit();
    e.preventDefault();
    grid.focus();
    select(col, row, e.shiftKey);
    dragMode = 'select';
  });
  table.addEventListener('mouseover', (/** @type {MouseEvent} */ e) => {
    const td = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('td[data-col]'));
    if (!td || !dragMode) return;
    if (!(e.buttons & 1)) { dragMode = null; return; } // the button was let go somewhere we didn't hear
    const col = Number(td.dataset.col); const row = Number(td.dataset.row);
    if (dragMode === 'select') { if (!anchor) anchor = { ...sel }; sel = { col, row }; showSelection(); }
    else if (dragMode === 'point' && pointRef?.anchor) {
      const a = pointRef.anchor;
      insertRef(a.col === col && a.row === row ? cellName(col, row) : rangeText({ c1: Math.min(a.col, col), r1: Math.min(a.row, row), c2: Math.max(a.col, col), r2: Math.max(a.row, row) }));
    } else if (dragMode === 'fill') {
      const r = range();
      // Fill goes one way: down/up or right/left, whichever the pointer has moved further.
      const dRow = row > r.r2 ? row - r.r2 : row < r.r1 ? row - r.r1 : 0;
      const dCol = col > r.c2 ? col - r.c2 : col < r.c1 ? col - r.c1 : 0;
      fillTarget = Math.abs(dRow) >= Math.abs(dCol)
        ? { c1: r.c1, c2: r.c2, r1: Math.min(r.r1, row), r2: Math.max(r.r2, row) }
        : { r1: r.r1, r2: r.r2, c1: Math.min(r.c1, col), c2: Math.max(r.c2, col) };
      table.querySelectorAll('td.is-fill-preview').forEach((x) => x.classList.remove('is-fill-preview'));
      eachCell(fillTarget, (c, rr) => { if (!inRange(r, c, rr)) cellEl(c, rr)?.classList.add('is-fill-preview'); });
    }
  });
  const onUp = () => {
    if (dragMode === 'fill' && fillTarget) {
      const source = range();
      const target = fillTarget;
      fillTarget = null;
      table.querySelectorAll('td.is-fill-preview').forEach((x) => x.classList.remove('is-fill-preview'));
      if (target.r1 !== source.r1 || target.r2 !== source.r2 || target.c1 !== source.c1 || target.c2 !== source.c2) {
        change((_, sh) => fillSeries(sh, source, target));
        anchor = { col: target.c1, row: target.r1 }; sel = { col: target.c2, row: target.r2 };
        showSelection();
      }
    }
    if (dragMode === 'point') editing?.input.focus();
    dragMode = null;
  };
  document.addEventListener('mouseup', onUp);
  fillHandle.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); dragMode = 'fill'; fillTarget = null; });
  fillHandle.addEventListener('dblclick', (e) => {
    // Double-click the square: fill down as far as the column next to it has data.
    e.preventDefault();
    const r = range(); const sh = sheet();
    const nextCol = r.c1 > 0 ? r.c1 - 1 : r.c2 + 1;
    let last = r.r2;
    while (last + 1 < sh.rows && rawOf(sh.cells[cellName(nextCol, last + 1)]) !== '') last += 1;
    if (last > r.r2) { change((_, s2) => fillSeries(s2, r, { ...r, r2: last })); sel = { col: r.c2, row: last }; anchor = { col: r.c1, row: r.r1 }; showSelection(); }
  });
  table.addEventListener('dblclick', (e) => { if (/** @type {HTMLElement} */ (e.target).closest('td[data-col]')) startEditing(); });
  table.addEventListener('contextmenu', (e) => {
    const td = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('td[data-col]'));
    if (!td) return;
    e.preventDefault();
    const col = Number(td.dataset.col); const row = Number(td.dataset.row);
    if (!inRange(range(), col, row)) select(col, row);
    openContextMenu(e.clientX, e.clientY);
  });

  // Column widths: drag a letter's right edge; double-click it to fit.
  function startResize(e, c) {
    e.preventDefault(); e.stopPropagation();
    dragMode = 'resize';
    const startX = e.clientX; const startW = widthOf(c);
    const move = (ev) => { const w = Math.max(30, Math.min(800, startW + ev.clientX - startX)); sheet().widths = { ...sheet().widths, [c]: w }; colgroup.children[c + 1].setAttribute('style', `width: ${w}px`); table.style.width = `${[...colgroup.children].reduce((n, el) => n + parseFloat(/** @type {HTMLElement} */ (el).style.width || '0'), 0)}px`; placeFillHandle(); };
    const up = () => {
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
      dragMode = null;
      const w = sheet().widths[c];
      sheet().widths[c] = startW;
      if (w !== startW) change((_, sh) => { sh.widths = { ...sh.widths, [c]: w }; });
    };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  }
  function autoFit(c) {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = '13px system-ui, sans-serif';
    let max = 40;
    for (let r = 0; r < Math.min(sheet().rows, 1000); r += 1) { const t = calc.display(sheetIndex(), c, r); if (t) max = Math.max(max, ctx.measureText(t).width + 22); }
    change((_, sh) => { sh.widths = { ...sh.widths, [c]: Math.min(500, Math.ceil(max)) }; });
  }

  // ─── Keyboard ─────────────────────────────────────────────────────────────

  /** Ctrl+arrow: to the edge of the block of data, as in Excel. */
  function jump(dc, dr) {
    const sh = sheet();
    const filled = (c, r) => rawOf(sh.cells[cellName(c, r)]) !== '';
    let c = sel.col; let r = sel.row;
    const inside = (cc, rr) => cc >= 0 && rr >= 0 && cc < sh.cols && rr < sh.rows;
    if (inside(c + dc, r + dr) && filled(c, r) && filled(c + dc, r + dr)) {
      while (inside(c + dc, r + dr) && filled(c + dc, r + dr)) { c += dc; r += dr; }
    } else {
      c += dc; r += dr;
      while (inside(c, r) && !filled(c, r) && inside(c + dc, r + dr)) { c += dc; r += dr; }
    }
    return { col: Math.max(0, Math.min(c, sh.cols - 1)), row: Math.max(0, Math.min(r, sh.rows - 1)) };
  }

  grid.addEventListener('keydown', (e) => {
    if (editing || /** @type {HTMLElement} */ (e.target).closest('input, select, textarea, button')) return;
    const mod = e.ctrlKey || e.metaKey;
    const arrows = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (arrows[e.key]) {
      e.preventDefault();
      const [dc, dr] = arrows[e.key];
      if (mod) { const to = jump(dc, dr); select(to.col, to.row, e.shiftKey); return; }
      let row = sel.row + dr;
      while (dr && hidden.has(row) && row > 0 && row < sheet().rows - 1) row += dr; // skip filtered-out rows
      select(sel.col + dc, row, e.shiftKey);
      return;
    }
    const key = e.key.toLowerCase();
    if (mod && key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && key === 'y') { e.preventDefault(); redo(); return; }
    if (mod && key === 'a') { e.preventDefault(); anchor = { col: 0, row: 0 }; sel = { col: sheet().cols - 1, row: sheet().rows - 1 }; showSelection(); return; }
    if (mod && key === 'c') { e.preventDefault(); copy(false); return; }
    if (mod && key === 'x') { e.preventDefault(); copy(true); return; }
    if (mod && key === 'b') { e.preventDefault(); toggleStyle('b'); return; }
    if (mod && key === 'i') { e.preventDefault(); toggleStyle('i'); return; }
    if (mod && key === 'u') { e.preventDefault(); toggleStyle('u'); return; }
    if (mod && key === 'f') { e.preventDefault(); openFind(); return; }
    if (mod && (key === 'd' || key === 'r')) { e.preventDefault(); fillShortcut(key === 'd' ? 'down' : 'right'); return; }
    if (mod && e.key === ';') { e.preventDefault(); const d = new Date(); change((_, sh) => putCell(sh, cellName(sel.col, sel.row), { raw: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })); return; }
    if (mod && key === 'home') { e.preventDefault(); select(0, 0); return; }
    if (e.key === 'Home') { e.preventDefault(); select(0, sel.row, e.shiftKey); return; }
    if (e.key === 'End') { e.preventDefault(); select(sheet().cols - 1, sel.row, e.shiftKey); return; }
    if (e.key === 'PageDown' || e.key === 'PageUp') { e.preventDefault(); const n = Math.floor(grid.clientHeight / ROW_HEIGHT) - 1; select(sel.col, sel.row + (e.key === 'PageDown' ? n : -n), e.shiftKey); return; }
    if (e.key === 'Tab') { e.preventDefault(); select(sel.col + (e.shiftKey ? -1 : 1), sel.row); return; }
    if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) select(sel.col, sel.row - 1); else startEditing(); return; }
    if (e.key === 'F2') { e.preventDefault(); startEditing(); return; }
    if (e.key === 'Escape') { if (anchor) { anchor = null; showSelection(); } closeMenus(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); if (canEdit) change((_, sh) => clearRange(sh, range())); return; }
    if (e.key.length === 1 && !mod && !e.altKey && canEdit) { e.preventDefault(); startEditing(e.key); }
  });

  function fillShortcut(direction) {
    const r = range();
    if (direction === 'down') {
      if (r.r1 === r.r2) { if (r.r1 === 0) return; change((_, sh) => fillSeries(sh, { ...r, r1: r.r1 - 1, r2: r.r1 - 1 }, { ...r, r1: r.r1 - 1 })); return; }
      change((_, sh) => eachCell({ ...r, r1: r.r1 + 1 }, (c, row) => { const from = sh.cells[cellName(c, r.r1)]; pasteBlock(sh, { cols: 1, rows: 1, cells: [[from ?? null]], from: { col: c, row: r.r1 } }, c, row); }));
    } else {
      if (r.c1 === r.c2) { if (r.c1 === 0) return; change((_, sh) => fillSeries(sh, { ...r, c1: r.c1 - 1, c2: r.c1 - 1 }, { ...r, c1: r.c1 - 1 })); return; }
      change((_, sh) => eachCell({ ...r, c1: r.c1 + 1 }, (c, row) => { const from = sh.cells[cellName(r.c1, row)]; pasteBlock(sh, { cols: 1, rows: 1, cells: [[from ?? null]], from: { col: r.c1, row } }, c, row); }));
    }
  }

  // ─── Clipboard ────────────────────────────────────────────────────────────

  function copy(cut) {
    const r = range();
    const text = rangeAsText(calc, sheetIndex(), r);
    clipboard = { text, block: copyBlock(sheet(), r), cut: cut ? { sheet: sheetIndex(), range: r } : null };
    navigator.clipboard?.writeText(text).catch(() => {});
    showToast(cut ? `Cut ${rangeText(r)}. Paste it where it goes.` : `Copied ${rangeText(r)}.`);
  }
  grid.addEventListener('paste', (e) => {
    if (editing || !canEdit) return;
    const text = e.clipboardData?.getData('text/plain') ?? '';
    e.preventDefault();
    pasteText(text);
  });
  // The grid itself takes Ctrl+V too (it isn't a text field, so the browser may not send "paste").
  grid.addEventListener('keydown', async (e) => {
    if (editing || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'v' || !canEdit) return;
    try {
      const text = await navigator.clipboard.readText();
      e.preventDefault();
      pasteText(text, e.shiftKey);
    } catch { /* the browser's own paste event handles it */ }
  });
  function pasteText(text, valuesOnly = false) {
    const at = { col: range().c1, row: range().r1 };
    if (clipboard && clipboard.text === text) {
      const cb = clipboard;
      change((w, sh) => {
        if (cb.cut) clearRange(w.sheets[cb.cut.sheet], cb.cut.range, { formats: true });
        const filled = pasteBlock(sh, cb.block, at.col, at.row, { valuesOnly });
        anchor = { col: filled.c1, row: filled.r1 }; sel = { col: filled.c2, row: filled.r2 };
      });
      if (cb.cut) clipboard = null;
    } else if (text) {
      const rows = parseTable(text);
      change((_, sh) => { const filled = placeTable(sh, rows, at.col, at.row); anchor = { col: filled.c1, row: filled.r1 }; sel = { col: filled.c2, row: filled.r2 }; });
    }
    showSelection();
  }

  // ─── Formatting ───────────────────────────────────────────────────────────

  function styleRange(style) { change((_, sh) => eachCell(range(), (c, r) => putCell(sh, cellName(c, r), { style }))); }
  function toggleStyle(key) {
    const on = !styleOf(sheet().cells[cellName(sel.col, sel.row)])[key];
    styleRange({ [key]: on || undefined });
  }
  function bumpDecimals(delta) {
    const st = styleOf(sheet().cells[cellName(sel.col, sel.row)]);
    const fmt = st.n || calc.formatOf(sheetIndex(), sel.col, sel.row) || 'number';
    const base = st.d ?? (fmt === 'integer' ? 0 : fmt === 'percent' ? 0 : 2);
    styleRange({ n: fmt, d: Math.max(0, Math.min(8, base + delta)) });
  }

  // ─── Menus ────────────────────────────────────────────────────────────────

  function closeMenus() { replaceChildren(menuLayer); }
  function openMenu(anchorEl, items, { x = null, y = null } = {}) {
    closeMenus();
    const rect = anchorEl?.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const list = h('div', { class: 'sheet__menu', role: 'menu', style: { left: `${(x ?? rect.left) - rootRect.left}px`, top: `${(y ?? rect.bottom + 2) - rootRect.top}px` } },
      items.filter(Boolean).map((item) => (item === '-' ? h('hr', {})
        : h('button', { type: 'button', role: 'menuitem', class: 'sheet__menu-item', disabled: item.disabled, onClick: () => { closeMenus(); item.run(); } }, item.label, item.keys ? h('kbd', {}, item.keys) : null))));
    menuLayer.append(list);
    const away = (ev) => { if (!list.contains(ev.target)) { closeMenus(); document.removeEventListener('mousedown', away, true); } };
    setTimeout(() => document.addEventListener('mousedown', away, true), 0);
    /** @type {HTMLElement | null} */ (list.querySelector('button'))?.focus();
  }

  const rowCount = () => range().r2 - range().r1 + 1;
  const colCount = () => range().c2 - range().c1 + 1;
  const insertMenu = () => [
    { label: rowCount() > 1 ? `${rowCount()} rows above` : 'Row above', run: () => change((w) => insertRows(w, sheetIndex(), range().r1, rowCount())) },
    { label: rowCount() > 1 ? `${rowCount()} rows below` : 'Row below', run: () => change((w) => insertRows(w, sheetIndex(), range().r2 + 1, rowCount())) },
    { label: colCount() > 1 ? `${colCount()} columns left` : 'Column left', run: () => change((w) => insertCols(w, sheetIndex(), range().c1, colCount())) },
    { label: colCount() > 1 ? `${colCount()} columns right` : 'Column right', run: () => change((w) => insertCols(w, sheetIndex(), range().c2 + 1, colCount())) },
  ];
  const deleteMenu = () => [
    { label: rowCount() > 1 ? `Rows ${range().r1 + 1}–${range().r2 + 1}` : `Row ${range().r1 + 1}`, run: () => { const r = range(); change((w) => deleteRows(w, sheetIndex(), r.r1, r.r2 - r.r1 + 1)); select(r.c1, r.r1); } },
    { label: colCount() > 1 ? `Columns ${colName(range().c1)}–${colName(range().c2)}` : `Column ${colName(range().c1)}`, run: () => { const r = range(); change((w) => deleteCols(w, sheetIndex(), r.c1, r.c2 - r.c1 + 1)); select(r.c1, r.r1); } },
    { label: 'Clear contents', keys: 'Del', run: () => change((_, sh) => clearRange(sh, range())) },
    { label: 'Clear contents and formatting', run: () => change((_, sh) => clearRange(sh, range(), { formats: true })) },
  ];
  /** Sort the rows of the table around the selection by the selected column (a header row stays put). */
  function sortBy(descending) {
    const sh = sheet();
    const r = range();
    let block = r;
    if (r.r1 === r.r2) {
      const region = currentRegion(sh, sel.col, sel.row);
      block = hasHeaderRow(sh, calc, sheetIndex(), region) ? { ...region, r1: region.r1 + 1 } : region;
    }
    if (block.r2 <= block.r1) return;
    change((w) => sortRange(w, sheetIndex(), block, sel.col, descending));
    showToast(`Sorted ${rangeText(block)} by column ${colName(sel.col)}, ${descending ? 'Z → A' : 'A → Z'}.`);
  }
  function openContextMenu(x, y) {
    openMenu(null, [
      { label: 'Cut', keys: 'Ctrl+X', run: () => copy(true), disabled: !canEdit },
      { label: 'Copy', keys: 'Ctrl+C', run: () => copy(false) },
      { label: 'Paste', keys: 'Ctrl+V', run: async () => { try { pasteText(await navigator.clipboard.readText()); } catch { if (clipboard) pasteText(clipboard.text); } }, disabled: !canEdit },
      { label: 'Paste values only', keys: 'Ctrl+Shift+V', run: async () => { try { pasteText(await navigator.clipboard.readText(), true); } catch { if (clipboard) pasteText(clipboard.text, true); } }, disabled: !canEdit },
      '-',
      ...(canEdit ? insertMenu().map((i) => ({ ...i, label: `Insert ${i.label.toLowerCase()}` })) : []),
      '-',
      ...(canEdit ? deleteMenu().map((i) => ({ ...i, label: i.label.startsWith('Clear') ? i.label : `Delete ${i.label.toLowerCase()}` })) : []),
      '-',
      canEdit ? { label: 'Sort A → Z by this column', run: () => sortBy(false) } : null,
      canEdit ? { label: 'Sort Z → A by this column', run: () => sortBy(true) } : null,
    ], { x, y });
  }

  // ─── The toolbar ──────────────────────────────────────────────────────────

  const tool = (iconName, label, run, { on = false, text = null, disabled = false } = {}) => h('button', {
    type: 'button', class: `sheet__tool${on ? ' is-on' : ''}`, 'aria-label': label, title: label, 'aria-pressed': on ? 'true' : null, disabled: disabled || !canEdit,
    onMousedown: (e) => e.preventDefault(), onClick: run,
  }, iconName ? icon(iconName, 15) : null, text ? h('span', { class: 'sheet__tool-text' }, text) : null);
  const menuTool = (label, items, iconName = null) => h('button', {
    type: 'button', class: 'sheet__tool sheet__tool--menu', 'aria-haspopup': 'menu', disabled: !canEdit,
    onMousedown: (e) => e.preventDefault(), onClick: (e) => openMenu(e.currentTarget, items()),
  }, iconName ? icon(iconName, 15) : null, h('span', { class: 'sheet__tool-text' }, label), icon('chevronDown', 12));
  const swatches = (label, colors, key) => h('button', {
    type: 'button', class: 'sheet__tool sheet__tool--menu', 'aria-label': label, title: label, disabled: !canEdit,
    onMousedown: (e) => e.preventDefault(),
    onClick: (e) => {
      closeMenus();
      const rect = e.currentTarget.getBoundingClientRect(); const rootRect = root.getBoundingClientRect();
      const pop = h('div', { class: 'sheet__menu sheet__swatches', role: 'menu', style: { left: `${rect.left - rootRect.left}px`, top: `${rect.bottom - rootRect.top + 2}px` } },
        colors.map((c) => h('button', { type: 'button', class: 'sheet__swatch', 'aria-label': c ? `Color ${c}` : 'None', style: { background: c || 'transparent' }, onClick: () => { closeMenus(); styleRange({ [key]: c || undefined }); } }, c ? '' : '∅')));
      menuLayer.append(pop);
      const away = (ev) => { if (!pop.contains(ev.target)) { closeMenus(); document.removeEventListener('mousedown', away, true); } };
      setTimeout(() => document.addEventListener('mousedown', away, true), 0);
    },
  }, h('span', { class: `sheet__color-mark sheet__color-mark--${key}`, style: { [key === 'c' ? 'borderBottomColor' : 'background']: styleOf(sheet().cells[cellName(sel.col, sel.row)])[key] || (key === 'c' ? '#1f2328' : '#ffffff') } }, key === 'c' ? 'A' : ''), icon('chevronDown', 12));

  function drawToolbar() {
    const st = styleOf(sheet().cells[cellName(sel.col, sel.row)]);
    const fmt = st.n ?? '';
    const sh = sheet();
    const formatSelect = h('select', { class: 'sheet__format-select', 'aria-label': 'Number format', disabled: !canEdit, onChange: (e) => styleRange({ n: e.target.value || undefined, d: undefined }) },
      FORMATS.map((f) => h('option', { value: f.id, selected: f.id === fmt }, f.sample ? `${f.label} (${f.sample})` : f.label)));
    replaceChildren(toolbar,
      tool('undo', 'Undo (Ctrl+Z)', undo, { disabled: !history.length }),
      tool('redo', 'Redo (Ctrl+Y)', redo, { disabled: !future.length }),
      h('span', { class: 'sheet__divider' }),
      h('label', { class: 'sheet__format' }, h('span', { class: 'visually-hidden' }, 'Number format'), formatSelect),
      tool(null, 'Currency', () => styleRange({ n: 'currency', d: undefined }), { text: '$', on: fmt === 'currency' }),
      tool(null, 'Percent', () => styleRange({ n: 'percent', d: undefined }), { text: '%', on: fmt === 'percent' }),
      tool(null, 'Fewer decimal places', () => bumpDecimals(-1), { text: '.0' }),
      tool(null, 'More decimal places', () => bumpDecimals(1), { text: '.00' }),
      h('span', { class: 'sheet__divider' }),
      tool(null, 'Bold (Ctrl+B)', () => toggleStyle('b'), { text: 'B', on: !!st.b }),
      tool(null, 'Italic (Ctrl+I)', () => toggleStyle('i'), { text: 'I', on: !!st.i }),
      tool(null, 'Underline (Ctrl+U)', () => toggleStyle('u'), { text: 'U', on: !!st.u }),
      tool('strike', 'Strikethrough', () => toggleStyle('x'), { on: !!st.x }),
      swatches('Text color', TEXT_COLORS, 'c'),
      swatches('Fill color', FILL_COLORS, 'f'),
      h('span', { class: 'sheet__divider' }),
      tool('alignLeft', 'Align left', () => styleRange({ a: st.a === 'left' ? undefined : 'left' }), { on: st.a === 'left' }),
      tool('alignCenter', 'Align center', () => styleRange({ a: st.a === 'center' ? undefined : 'center' }), { on: st.a === 'center' }),
      tool('alignRight', 'Align right', () => styleRange({ a: st.a === 'right' ? undefined : 'right' }), { on: st.a === 'right' }),
      tool(null, 'Wrap text', () => toggleStyle('w'), { on: !!st.w, text: 'Wrap' }),
      h('span', { class: 'sheet__divider' }),
      menuTool('Insert', insertMenu, 'plus'),
      menuTool('Delete', deleteMenu, 'trash'),
      h('span', { class: 'sheet__divider' }),
      menuTool('Sort', () => [{ label: `A → Z by column ${colName(sel.col)}`, run: () => sortBy(false) }, { label: `Z → A by column ${colName(sel.col)}`, run: () => sortBy(true) }], 'sort'),
      tool('filter', filterUi ? 'Hide filters' : 'Filter: show a filter on each column', () => { filterUi = !filterUi; if (!filterUi && Object.keys(sh.filters ?? {}).length) change((_, s2) => { s2.filters = {}; }); else drawAll(); }, { on: filterUi || Object.keys(sh.filters ?? {}).length > 0, text: 'Filter' }),
      menuTool('Freeze', () => [
        { label: 'No rows', run: () => change((_, s2) => { s2.freeze = { ...s2.freeze, rows: 0 }; }) },
        { label: '1 row', run: () => change((_, s2) => { s2.freeze = { ...s2.freeze, rows: 1 }; }) },
        { label: '2 rows', run: () => change((_, s2) => { s2.freeze = { ...s2.freeze, rows: 2 }; }) },
        { label: `Up to row ${sel.row + 1}`, run: () => change((_, s2) => { s2.freeze = { ...s2.freeze, rows: sel.row + 1 }; }) },
        '-',
        { label: 'No columns', run: () => change((_, s2) => { s2.freeze = { ...s2.freeze, cols: 0 }; }) },
        { label: '1 column', run: () => change((_, s2) => { s2.freeze = { ...s2.freeze, cols: 1 }; }) },
        { label: `Up to column ${colName(sel.col)}`, run: () => change((_, s2) => { s2.freeze = { ...s2.freeze, cols: sel.col + 1 }; }) },
      ]),
      h('span', { class: 'sheet__divider' }),
      tool('highlight', 'Highlight cells that match a rule', openRules, { text: 'Highlight' }),
      tool('listBullet', 'Dropdown list for this column', openValidation, { text: 'Dropdown' }),
      tool('search', 'Find and replace (Ctrl+F)', openFind, { text: 'Find' }),
      tool('slides', 'Chart from the selection', addChart, { text: 'Chart' }),
      h('span', { class: 'sheet__divider' }),
      h('button', { type: 'button', class: 'sheet__tool sheet__tool--menu', onMousedown: (e) => e.preventDefault(), onClick: (e) => openMenu(e.currentTarget, [
        canEdit ? { label: 'Import a file (.xlsx or .csv)…', run: pickImport } : null,
        { label: 'Download as Excel (.xlsx)', run: downloadXlsx },
        { label: `Download this sheet as CSV`, run: downloadCsv },
      ]) }, icon('download', 15), h('span', { class: 'sheet__tool-text' }, 'File'), icon('chevronDown', 12)));
  }

  // ─── Filters ──────────────────────────────────────────────────────────────

  function openFilter(c, btn) {
    closeMenus();
    const sh = sheet();
    const current = sh.filters?.[c] ?? {};
    const hiddenValues = new Set(current.hide ?? []);
    const values = columnValues(wb, sheetIndex(), c, calc);
    const search = h('input', { type: 'search', class: 'input input--compact', placeholder: 'Contains…', value: current.text ?? '', 'aria-label': 'Show rows containing' });
    const list = h('div', { class: 'sheet__filter-list' }, values.map(([v, n]) => h('label', { class: 'sheet__filter-row' },
      h('input', { type: 'checkbox', checked: !hiddenValues.has(v), onChange: (e) => { if (e.target.checked) hiddenValues.delete(v); else hiddenValues.add(v); } }),
      h('span', {}, v === '' ? '(Blanks)' : v), h('span', { class: 'sheet__filter-n' }, String(n)))));
    const rect = btn.getBoundingClientRect(); const rootRect = root.getBoundingClientRect();
    const pop = h('div', { class: 'sheet__menu sheet__filter', style: { left: `${Math.max(0, rect.left - rootRect.left - 180)}px`, top: `${rect.bottom - rootRect.top + 2}px` } },
      h('div', { class: 'form-row' },
        h('button', { type: 'button', class: 'link-button', onClick: () => { sortCol(c, false); } }, 'Sort A → Z'),
        h('button', { type: 'button', class: 'link-button', onClick: () => { sortCol(c, true); } }, 'Sort Z → A')),
      search,
      h('div', { class: 'form-row' },
        h('button', { type: 'button', class: 'link-button', onClick: () => { hiddenValues.clear(); list.querySelectorAll('input').forEach((x) => { /** @type {HTMLInputElement} */ (x).checked = true; }); } }, 'Select all'),
        h('button', { type: 'button', class: 'link-button', onClick: () => { values.forEach(([v]) => hiddenValues.add(v)); list.querySelectorAll('input').forEach((x) => { /** @type {HTMLInputElement} */ (x).checked = false; }); } }, 'Clear')),
      list,
      h('div', { class: 'form-row form-row--end' },
        h('button', { type: 'button', class: 'button button--small', onClick: closeMenus }, 'Cancel'),
        h('button', { type: 'button', class: 'button button--primary button--small', onClick: () => {
          closeMenus();
          change((_, s2) => { const f = { ...(s2.filters ?? {}) }; if (!hiddenValues.size && !search.value.trim()) delete f[c]; else f[c] = { hide: [...hiddenValues], text: search.value.trim() }; s2.filters = f; });
        } }, 'OK')));
    menuLayer.append(pop);
    const away = (ev) => { if (!pop.contains(ev.target)) { closeMenus(); document.removeEventListener('mousedown', away, true); } };
    setTimeout(() => document.addEventListener('mousedown', away, true), 0);
    function sortCol(col, desc) { closeMenus(); sel = { ...sel, col }; anchor = null; sortBy(desc); }
  }

  // ─── Dropdown lists (data validation) ─────────────────────────────────────

  function openListPicker(list) {
    const td = cellEl(sel.col, sel.row);
    if (!td) return;
    openMenu(td, [...list.map((v) => ({ label: v, run: () => change((_, sh) => putCell(sh, cellName(sel.col, sel.row), { raw: v })) })), '-', { label: 'Clear', run: () => change((_, sh) => putCell(sh, cellName(sel.col, sel.row), { raw: '' })) }, { label: 'Type something else…', run: () => { startEditing(rawOf(sheet().cells[cellName(sel.col, sel.row)]), 'cell-free'); } }]);
  }
  function openValidation() {
    const key = colName(sel.col);
    const current = sheet().validation?.[key]?.list ?? [];
    dialog(`Dropdown list for column ${key}`, (body, close) => {
      const input = h('input', { type: 'text', class: 'input', value: current.join(', '), placeholder: 'Yes, No, Maybe', 'aria-label': 'Choices, separated by commas' });
      body.append(h('p', { class: 'settings-field__hint' }, 'Cells in this column (below the header) show these choices. Leave it empty to remove the list.'), input,
        h('div', { class: 'form-row form-row--end' },
          h('button', { type: 'button', class: 'button button--small', onClick: close }, 'Cancel'),
          h('button', { type: 'button', class: 'button button--primary button--small', onClick: () => {
            const list = input.value.split(',').map((x) => x.trim()).filter(Boolean);
            close();
            change((_, sh) => { const v = { ...(sh.validation ?? {}) }; if (list.length) v[key] = { list }; else delete v[key]; sh.validation = v; });
          } }, 'Save')));
      requestAnimationFrame(() => input.focus());
    });
  }

  // ─── Highlight rules (conditional formatting) ─────────────────────────────

  function openRules() {
    dialog('Highlight cells', (body, close) => {
      const draw = () => {
        const rules = sheet().rules ?? [];
        const rangeInput = h('input', { type: 'text', class: 'input input--compact', value: rangeText(range()), 'aria-label': 'Range' });
        const op = h('select', { class: 'input input--compact', 'aria-label': 'Rule' }, RULE_OPS.map((o) => h('option', { value: o.id }, o.label)));
        const value = h('input', { type: 'text', class: 'input input--compact', placeholder: 'Value', 'aria-label': 'Value' });
        let fill = '#fde2e1';
        const colors = h('span', { class: 'sheet__rule-colors' }, FILL_COLORS.filter(Boolean).map((c) => h('button', { type: 'button', class: `sheet__swatch${c === fill ? ' is-on' : ''}`, style: { background: c }, 'aria-label': `Color ${c}`, onClick: (e) => { fill = c; colors.querySelectorAll('.sheet__swatch').forEach((x) => x.classList.remove('is-on')); e.currentTarget.classList.add('is-on'); } })));
        replaceChildren(body,
          rules.length ? h('ul', { class: 'sheet__rules' }, rules.map((rule, i) => h('li', {},
            h('span', { class: 'sheet__swatch', style: { background: rule.fill } }),
            ` ${rule.range}: ${RULE_OPS.find((o) => o.id === rule.op)?.label ?? rule.op} ${rule.op === 'empty' || rule.op === 'notempty' ? '' : rule.value}`,
            h('button', { type: 'button', class: 'link-button link-button--danger', onClick: () => { change((_, sh) => { sh.rules = sh.rules.filter((_, k) => k !== i); }); draw(); } }, 'Remove')))) : h('p', { class: 'settings-field__hint' }, 'No rules yet. Cells that match a rule get its color.'),
          h('div', { class: 'sheet__rule-form' }, rangeInput, op, value, colors),
          h('div', { class: 'form-row form-row--end' },
            h('button', { type: 'button', class: 'button button--small', onClick: close }, 'Done'),
            h('button', { type: 'button', class: 'button button--primary button--small', onClick: () => {
              if (!toRange(rangeInput.value.toUpperCase())) { showToast('Type a range like D2:D40.'); return; }
              change((_, sh) => { sh.rules = [...(sh.rules ?? []), { range: rangeInput.value.toUpperCase(), op: op.value, value: value.value, fill }]; });
              draw();
            } }, 'Add rule')));
      };
      draw();
    });
  }

  function dialog(heading, fill) {
    closeMenus();
    const body = h('div', { class: 'sheet__dialog-body' });
    const close = () => closeMenus();
    menuLayer.append(h('div', { class: 'sheet__dialog', role: 'dialog', 'aria-label': heading }, h('h3', {}, heading), body));
    fill(body, close);
  }

  // ─── Find and replace ─────────────────────────────────────────────────────

  function openFind() {
    findOpen = true;
    findBar.hidden = false;
    const what = h('input', { type: 'search', class: 'input input--compact', placeholder: 'Find', 'aria-label': 'Find' });
    const withText = h('input', { type: 'text', class: 'input input--compact', placeholder: 'Replace with', 'aria-label': 'Replace with', disabled: !canEdit });
    const caseBox = h('input', { type: 'checkbox', 'aria-label': 'Match case' });
    const found = h('span', { class: 'sheet__find-count' });
    const matches = () => {
      const q = what.value; if (!q) return [];
      const out = [];
      const sh = sheet();
      for (let r = 0; r < sh.rows; r += 1) for (let c = 0; c < sh.cols; c += 1) {
        const shown = calc.display(sheetIndex(), c, r); const raw = rawOf(sh.cells[cellName(c, r)]);
        const test = (s) => (caseBox.checked ? s.includes(q) : s.toLowerCase().includes(q.toLowerCase()));
        if (shown && (test(shown) || test(raw))) out.push({ col: c, row: r });
      }
      return out;
    };
    const go = (dir) => {
      const list = matches();
      found.textContent = list.length ? '' : what.value ? 'Not found' : '';
      if (!list.length) return;
      const i = list.findIndex((m) => m.row > sel.row || (m.row === sel.row && m.col > sel.col));
      const next = dir > 0 ? list[i < 0 ? 0 : i] : list[(i < 0 ? list.length : (list.findIndex((m) => m.row === sel.row && m.col === sel.col) >= 0 ? list.findIndex((m) => m.row === sel.row && m.col === sel.col) : i)) - 1] ?? list[list.length - 1];
      select(next.col, next.row);
      found.textContent = `${list.findIndex((m) => m.col === next.col && m.row === next.row) + 1} of ${list.length}`;
    };
    const replaceIn = (raw) => (caseBox.checked ? raw.split(what.value).join(withText.value) : raw.replace(new RegExp(what.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), withText.value));
    replaceChildren(findBar, what,
      h('button', { type: 'button', class: 'button button--small', onClick: () => go(-1) }, '↑'),
      h('button', { type: 'button', class: 'button button--small', onClick: () => go(1) }, 'Find next'),
      found,
      withText,
      h('button', { type: 'button', class: 'button button--small', disabled: !canEdit, onClick: () => { const name = cellName(sel.col, sel.row); const raw = rawOf(sheet().cells[name]); const next = replaceIn(raw); if (next !== raw) change((_, sh) => putCell(sh, name, { raw: next })); go(1); } }, 'Replace'),
      h('button', { type: 'button', class: 'button button--small', disabled: !canEdit, onClick: () => { const list = matches(); let n = 0; change((_, sh) => list.forEach(({ col, row }) => { const name = cellName(col, row); const raw = rawOf(sh.cells[name]); const next = replaceIn(raw); if (next !== raw) { putCell(sh, name, { raw: next }); n += 1; } })); showToast(`Replaced in ${n} ${n === 1 ? 'cell' : 'cells'}.`); } }, 'Replace all'),
      h('label', { class: 'sheet__check' }, caseBox, ' Match case'),
      h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close find', onClick: () => { findOpen = false; findBar.hidden = true; grid.focus(); } }, icon('close', 14)));
    what.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') { findOpen = false; findBar.hidden = true; grid.focus(); } });
    what.focus();
  }

  // ─── Charts ───────────────────────────────────────────────────────────────

  function addChart() {
    const r = range();
    const spec = r.c1 === r.c2 && r.r1 === r.r2 ? guessTable() : rangeText(r);
    change((_, sh) => { sh.charts = [...(sh.charts ?? []), { id: `chart-${Date.now().toString(36)}`, type: 'bar', range: spec, title: '' }]; });
    showToast('Chart added under the sheet.');
    requestAnimationFrame(() => chartsArea.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }
  function guessTable() {
    let maxRow = 0; let maxCol = 0;
    for (const name of Object.keys(sheet().cells)) { const p = parseCellName(name); if (p && rawOf(sheet().cells[name]) !== '') { maxRow = Math.max(maxRow, p.row); maxCol = Math.max(maxCol, p.col); } }
    return rangeText({ c1: 0, r1: 0, c2: Math.min(maxCol, 3), r2: maxRow });
  }
  function drawCharts() {
    const sh = sheet();
    replaceChildren(chartsArea, (sh.charts ?? []).map((chart, i) => h('figure', { class: 'sheet-chart' },
      h('div', { class: 'sheet-chart__top' },
        h('input', { type: 'text', class: 'sheet-chart__title', value: chart.title, placeholder: 'Chart title', 'aria-label': 'Chart title', disabled: !canEdit, onChange: (e) => change((_, s2) => { s2.charts[i] = { ...s2.charts[i], title: e.target.value }; }) }),
        h('select', { class: 'input input--compact', 'aria-label': 'Chart type', disabled: !canEdit, onChange: (e) => change((_, s2) => { s2.charts[i] = { ...s2.charts[i], type: e.target.value }; }) },
          [['bar', 'Bars'], ['line', 'Line'], ['pie', 'Pie']].map(([id, label]) => h('option', { value: id, selected: chart.type === id }, label))),
        h('input', { type: 'text', class: 'input input--compact sheet-chart__range', value: chart.range, 'aria-label': 'Chart range', disabled: !canEdit, onChange: (e) => { if (toRange(e.target.value.toUpperCase())) change((_, s2) => { s2.charts[i] = { ...s2.charts[i], range: e.target.value.toUpperCase() }; }); } }),
        canEdit ? h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Delete chart', onClick: () => change((_, s2) => { s2.charts = s2.charts.filter((_, k) => k !== i); }) }, icon('trash', 14)) : null),
      renderChart(chart, wb, sheetIndex(), calc))));
  }

  // ─── Sheets (tabs) ────────────────────────────────────────────────────────

  function drawTabs() {
    replaceChildren(tabs,
      wb.sheets.map((s, i) => h('button', {
        type: 'button', role: 'tab', class: `sheet__tab${i === wb.active ? ' is-active' : ''}`, 'aria-selected': String(i === wb.active),
        onClick: () => { if (i !== wb.active) { wb.active = i; sel = { col: 0, row: 0 }; anchor = null; viewport.first = 0; grid.scrollTop = 0; calc = createCalc(wb); saveData(structuredClone(wb)); drawAll(); } },
        onDblclick: () => canEdit && renameTab(i),
        onContextmenu: (e) => { e.preventDefault(); if (!canEdit) return; openMenu(null, [
          { label: 'Rename', run: () => renameTab(i) },
          { label: 'Duplicate', run: () => change((w) => { const copySheet = structuredClone(w.sheets[i]); copySheet.id = `sh-${Date.now().toString(36)}`; copySheet.name = uniqueSheetName(w, `${w.sheets[i].name} copy `); w.sheets.splice(i + 1, 0, copySheet); w.active = i + 1; }) },
          { label: 'Move left', disabled: i === 0, run: () => change((w) => { [w.sheets[i - 1], w.sheets[i]] = [w.sheets[i], w.sheets[i - 1]]; w.active = i - 1; }) },
          { label: 'Move right', disabled: i === wb.sheets.length - 1, run: () => change((w) => { [w.sheets[i + 1], w.sheets[i]] = [w.sheets[i], w.sheets[i + 1]]; w.active = i + 1; }) },
          { label: 'Delete', disabled: wb.sheets.length === 1, run: () => { const name = wb.sheets[i].name; change((w) => { w.sheets.splice(i, 1); w.active = Math.max(0, Math.min(w.active, w.sheets.length - 1)); }); showToast(`Deleted ${name}.`, { actionLabel: 'Undo', onAction: undo }); } },
        ], { x: e.clientX, y: e.clientY }); },
      }, s.name)),
      canEdit ? h('button', { type: 'button', class: 'sheet__tab sheet__tab--add', 'aria-label': 'Add a sheet', title: 'Add a sheet', onClick: () => change((w) => { w.sheets.push(newSheet(uniqueSheetName(w))); w.active = w.sheets.length - 1; sel = { col: 0, row: 0 }; anchor = null; }) }, icon('plus', 13)) : null);
  }
  function renameTab(i) {
    const btn = tabs.children[i];
    const input = h('input', { type: 'text', class: 'sheet__tab-input', value: wb.sheets[i].name, 'aria-label': 'Sheet name' });
    let finished = false;
    const done = (save) => { if (finished) return; finished = true; if (save && input.value.trim() !== wb.sheets[i].name) { let ok = true; change((w) => { ok = renameSheet(w, i, input.value); }); if (!ok) showToast('That name is taken or empty.'); } else drawTabs(); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(true); } if (e.key === 'Escape') done(false); });
    input.addEventListener('blur', () => done(true));
    btn.replaceWith(input);
    input.focus(); input.select();
  }

  // ─── Files ────────────────────────────────────────────────────────────────

  function pickImport() {
    const file = h('input', { type: 'file', accept: '.xlsx,.csv,.tsv,text/csv', hidden: true });
    file.addEventListener('change', async () => {
      const picked = file.files?.[0];
      if (!picked) return;
      try {
        if (/\.xlsx$/i.test(picked.name)) {
          const imported = await readXlsx(await picked.arrayBuffer());
          change((w) => {
            const empty = Object.keys(w.sheets[w.active].cells).length === 0 && w.sheets.length === 1;
            for (const s of imported.sheets) s.name = w.sheets.some((x) => x.name.toLowerCase() === s.name.toLowerCase()) && !empty ? uniqueSheetName(w, `${s.name} `) : s.name;
            if (empty) w.sheets = imported.sheets; else w.sheets.push(...imported.sheets);
            w.active = empty ? 0 : w.sheets.length - imported.sheets.length;
          });
          showToast(`Opened ${picked.name}: ${imported.sheets.length} ${imported.sheets.length === 1 ? 'sheet' : 'sheets'}.`);
        } else {
          const text = await picked.text();
          const rows = picked.name.endsWith('.tsv') ? text.split(/\r?\n/).map((l) => l.split('\t')) : parseCsv(text.replace(/\r\n?/g, '\n'));
          change((w) => {
            const empty = Object.keys(w.sheets[w.active].cells).length === 0;
            if (!empty) { w.sheets.push(newSheet(uniqueSheetName(w, picked.name.replace(/\.\w+$/, '').slice(0, 20) + ' '))); w.active = w.sheets.length - 1; }
            placeTable(w.sheets[w.active], rows, 0, 0);
          });
          showToast(`Imported ${rows.length} rows from ${picked.name}.`);
        }
        sel = { col: 0, row: 0 }; anchor = null;
      } catch { showToast('That file couldn’t be opened. Try saving it as .xlsx or .csv.'); }
    });
    root.append(file); file.click(); file.remove();
  }
  const fileName = (ext) => `${(title || 'Spreadsheet').replace(/[\\/:*?"<>|]/g, '')}.${ext}`;
  function downloadBlob(blob, name) { const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
  function downloadXlsx() { downloadBlob(writeXlsx(wb, calc), fileName('xlsx')); }
  function downloadCsv() { downloadBlob(new Blob([sheetToCsv(wb, sheetIndex())], { type: 'text/csv' }), fileName('csv')); }

  // ─── Start ────────────────────────────────────────────────────────────────

  viewport = { first: 0, count: compact ? 30 : 60 };
  drawAll();

  return {
    /** Data changed elsewhere (another window): show it, unless someone's typing here. */
    redraw() {
      if (editing) return;
      wb = normalizeWorkbook(getData());
      calc = createCalc(wb);
      drawAll();
    },
    destroy() { document.removeEventListener('mouseup', onUp); },
    get workbook() { return wb; },
    focus() { grid.focus(); },
    _todaySerial: todaySerial,
    _findOpen: () => findOpen,
    _limits: { MAX_COLS, MAX_ROWS },
  };
}
