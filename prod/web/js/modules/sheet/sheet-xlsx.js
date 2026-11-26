// @ts-check
/**
 * sheet-xlsx.js — open and save Excel files (.xlsx), with no library.
 *
 *   await readXlsx(arrayBuffer) → a workbook (sheet-model.js shape): every
 *     sheet, its values and formulas, bold and italic, number formats, and
 *     column widths
 *   writeXlsx(workbook, calc) → a Blob: the same, with each formula's current
 *     answer saved alongside it (so Excel and Google Sheets show it at once)
 *
 * An .xlsx file is a zip of XML files. The zip reader uses the browser's
 * DecompressionStream; the writer stores files uncompressed (fine for the
 * sizes people make here).
 */

import { newSheet } from './sheet-model.js';
import { rawOf, styleOf } from './sheet-model.js';
import { cellName, parseCellName, colName } from './sheet-formula.js';
import { isError } from './sheet-formula.js';

// ─── Zip ────────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** files: [{ name, text }] → a zip as a Uint8Array (stored, not compressed). */
export function makeZip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const name = enc.encode(file.name);
    const data = enc.encode(file.text);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true); local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, data);
    const head = new DataView(new ArrayBuffer(46));
    head.setUint32(0, 0x02014b50, true); head.setUint16(4, 20, true); head.setUint16(6, 20, true); head.setUint16(8, 0x0800, true);
    head.setUint32(16, crc, true); head.setUint32(20, data.length, true); head.setUint32(24, data.length, true); head.setUint16(28, name.length, true);
    head.setUint32(42, offset, true);
    central.push(new Uint8Array(head.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const centralSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) { out.set(p, at); at += p.length; }
  return out;
}

/** A zip's files, as { name → text }. */
export async function readZip(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('Not a zip');
  const count = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  const dec = new TextDecoder();
  const files = {};
  for (let k = 0; k < count; k += 1) {
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localAt = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    const dataAt = localAt + 30 + view.getUint16(localAt + 26, true) + view.getUint16(localAt + 28, true);
    const data = bytes.subarray(dataAt, dataAt + size);
    if (!/\.(xml|rels)$/.test(name)) continue;
    if (method === 0) files[name] = dec.decode(data);
    else if (method === 8) {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      files[name] = await new Response(stream).text();
    }
  }
  return files;
}

// ─── Writing .xlsx ──────────────────────────────────────────────────────────

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const NUMFMT = { number: 4, integer: 3, percent: 10, shortdate: 14, currency: 164, date: 165, time: 166, datetime: 167 };

export function writeXlsx(wb, calc) {
  // One style per combination of bold, italic and number format.
  const combos = ['0|0|'];
  const styleIndex = (s) => {
    const key = `${s.b ? 1 : 0}|${s.i ? 1 : 0}|${s.n ?? ''}`;
    let i = combos.indexOf(key);
    if (i < 0) { combos.push(key); i = combos.length - 1; }
    return i;
  };
  const sheetsXml = wb.sheets.map((sheet, si) => {
    const byRow = new Map();
    for (const [name, cell] of Object.entries(sheet.cells)) {
      const p = parseCellName(name);
      if (!p) continue;
      if (!byRow.has(p.row)) byRow.set(p.row, []);
      byRow.get(p.row).push({ ...p, name, cell });
    }
    const rows = [...byRow.keys()].sort((a, b) => a - b).map((r) => {
      const cellsXml = byRow.get(r).sort((a, b) => a.col - b.col).map(({ name, cell, col, row }) => {
        const raw = rawOf(cell);
        const st = styleOf(cell);
        const fmt = st.n || calc.formatOf(si, col, row);
        const sAttr = st.b || st.i || fmt ? ` s="${styleIndex({ ...st, n: fmt })}"` : '';
        const value = calc.value(si, col, row);
        if (raw.startsWith('=')) {
          const f = `<f>${esc(raw.slice(1))}</f>`;
          if (typeof value === 'number') return `<c r="${name}"${sAttr}>${f}<v>${value}</v></c>`;
          if (typeof value === 'boolean') return `<c r="${name}"${sAttr} t="b">${f}<v>${value ? 1 : 0}</v></c>`;
          if (isError(value)) return `<c r="${name}"${sAttr} t="e">${f}<v>${esc(value.code)}</v></c>`;
          return `<c r="${name}"${sAttr} t="str">${f}<v>${esc(value)}</v></c>`;
        }
        if (typeof value === 'number') return `<c r="${name}"${sAttr}><v>${value}</v></c>`;
        if (typeof value === 'boolean') return `<c r="${name}"${sAttr} t="b"><v>${value ? 1 : 0}</v></c>`;
        if (value === '') return sAttr ? `<c r="${name}"${sAttr}/>` : '';
        return `<c r="${name}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
      }).join('');
      return `<row r="${r + 1}">${cellsXml}</row>`;
    }).join('');
    const widths = Object.entries(sheet.widths ?? {}).map(([c, w]) => `<col min="${Number(c) + 1}" max="${Number(c) + 1}" width="${(Number(w) / 7).toFixed(2)}" customWidth="1"/>`).join('');
    const pane = sheet.freeze?.rows || sheet.freeze?.cols
      ? `<sheetViews><sheetView workbookViewId="0"><pane ${sheet.freeze.cols ? `xSplit="${sheet.freeze.cols}" ` : ''}${sheet.freeze.rows ? `ySplit="${sheet.freeze.rows}" ` : ''}topLeftCell="${cellName(sheet.freeze.cols || 0, sheet.freeze.rows || 0)}" state="frozen"/></sheetView></sheetViews>`
      : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}${widths ? `<cols>${widths}</cols>` : ''}<sheetData>${rows}</sheetData></worksheet>`;
  });
  const fonts = ['<font><sz val="11"/><name val="Calibri"/></font>', '<font><b/><sz val="11"/><name val="Calibri"/></font>', '<font><i/><sz val="11"/><name val="Calibri"/></font>', '<font><b/><i/><sz val="11"/><name val="Calibri"/></font>'];
  const xfs = combos.map((key) => {
    const [b, i, n] = key.split('|');
    const font = (b === '1' ? 1 : 0) + (i === '1' ? 2 : 0);
    const numFmtId = NUMFMT[n] ?? 0;
    return `<xf numFmtId="${numFmtId}" fontId="${font}" fillId="0" borderId="0" xfId="0"${numFmtId ? ' applyNumberFormat="1"' : ''}${font ? ' applyFont="1"' : ''}/>`;
  }).join('');
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="4"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="mmm d, yyyy"/><numFmt numFmtId="166" formatCode="h:mm AM/PM"/><numFmt numFmtId="167" formatCode="mmm d, h:mm AM/PM"/></numFmts><fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${combos.length}">${xfs}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const files = [
    { name: '[Content_Types].xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${wb.sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { name: '_rels/.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${wb.sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr fullCalcOnLoad="1"/></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${wb.sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${wb.sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', text: styles },
    ...sheetsXml.map((text, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text })),
  ];
  return new Blob([makeZip(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ─── Reading .xlsx ──────────────────────────────────────────────────────────

/** Which of our formats an Excel number format is closest to. */
function formatFromCode(id, code) {
  if (id >= 14 && id <= 17) return 'shortdate';
  if (id === 18 || id === 19 || id === 20 || id === 21) return 'time';
  if (id === 22) return 'datetime';
  if (id === 9 || id === 10) return 'percent';
  if (id === 3) return 'integer';
  if (id === 4 || id === 2) return 'number';
  const c = String(code ?? '').replace(/"[^"]*"|\[[^\]]*\]/g, (m) => (m.includes('$') ? '$' : ''));
  if (!c) return '';
  if (/%/.test(c)) return 'percent';
  if (/\$|€|£/.test(c)) return 'currency';
  if (/[dy]/i.test(c) && /h/i.test(c)) return 'datetime';
  if ((/[dy]/i.test(c) || /mmm/i.test(c)) && c.includes('/')) return 'shortdate';
  if (/[dy]/i.test(c) || /mmm/i.test(c)) return 'date';
  if (/h/i.test(c)) return 'time';
  if (/0\.0/.test(c)) return 'number';
  return '';
}

export async function readXlsx(buffer) {
  const files = await readZip(buffer);
  const xml = (name) => (files[name] ? new DOMParser().parseFromString(files[name], 'application/xml') : null);
  const all = (doc, tag) => (doc ? [...doc.getElementsByTagNameNS('*', tag)] : []);
  const shared = all(xml('xl/sharedStrings.xml'), 'si').map((si) => all(si, 't').map((t) => t.textContent).join(''));
  const stylesDoc = xml('xl/styles.xml');
  const codes = Object.fromEntries(all(stylesDoc, 'numFmt').map((n) => [n.getAttribute('numFmtId'), n.getAttribute('formatCode')]));
  const fontsBold = all(stylesDoc, 'font').map((f) => ({ b: f.getElementsByTagNameNS('*', 'b').length > 0, i: f.getElementsByTagNameNS('*', 'i').length > 0 }));
  const cellXfs = stylesDoc ? stylesDoc.getElementsByTagNameNS('*', 'cellXfs')[0] : null;
  /** @type {{ n: string, b?: boolean, i?: boolean }[]} */
  const xfs = cellXfs ? [...cellXfs.getElementsByTagNameNS('*', 'xf')].map((xf) => {
    const id = Number(xf.getAttribute('numFmtId') ?? 0);
    const font = fontsBold[Number(xf.getAttribute('fontId') ?? 0)] ?? { b: false, i: false };
    return { n: formatFromCode(id, codes[id]), b: font.b, i: font.i };
  }) : [];
  const relDoc = xml('xl/_rels/workbook.xml.rels');
  const targets = Object.fromEntries(all(relDoc, 'Relationship').map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]));
  const sheets = all(xml('xl/workbook.xml'), 'sheet').map((el) => {
    const rid = el.getAttribute('r:id') ?? el.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    let target = targets[rid] ?? '';
    target = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    const doc = xml(target);
    const sheet = newSheet(el.getAttribute('name') ?? 'Sheet');
    for (const c of all(doc, 'c')) {
      const ref = c.getAttribute('r');
      const p = parseCellName(ref ?? '');
      if (!p) continue;
      const t = c.getAttribute('t');
      const f = c.getElementsByTagNameNS('*', 'f')[0]?.textContent;
      const v = c.getElementsByTagNameNS('*', 'v')[0]?.textContent ?? '';
      let raw;
      if (f) raw = `=${f}`;
      else if (t === 's') raw = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') raw = all(c, 't').map((x) => x.textContent).join('');
      else if (t === 'b') raw = v === '1' ? 'TRUE' : 'FALSE';
      else if (t === 'e') raw = v;
      else raw = v;
      const xf = xfs[Number(c.getAttribute('s') ?? 0)] ?? { n: '' };
      const style = Object.fromEntries(Object.entries({ b: xf.b, i: xf.i, n: xf.n }).filter(([, x]) => x));
      // Text that looks like a number or date stays text.
      if ((t === 's' || t === 'inlineStr') && /^[-$\d.,%/: ]+$/.test(raw) && raw.trim() !== '') raw = `'${raw}`;
      if (raw === '' && !Object.keys(style).length) continue;
      sheet.cells[ref] = Object.keys(style).length ? { v: raw, s: style } : raw;
      sheet.cols = Math.max(sheet.cols, p.col + 1);
      sheet.rows = Math.max(sheet.rows, p.row + 1);
    }
    for (const col of all(doc, 'col')) {
      const w = Number(col.getAttribute('width'));
      if (!w) continue;
      for (let i = Number(col.getAttribute('min')) - 1; i <= Number(col.getAttribute('max')) - 1 && i < 200; i += 1) sheet.widths[i] = Math.round(w * 7 + 5);
    }
    const pane = all(doc, 'pane')[0];
    if (pane?.getAttribute('state') === 'frozen') sheet.freeze = { rows: Number(pane.getAttribute('ySplit') ?? 0), cols: Number(pane.getAttribute('xSplit') ?? 0) };
    sheet.cols = Math.min(Math.max(sheet.cols + 2, 10), 200);
    sheet.rows = Math.min(Math.max(sheet.rows + 10, 40), 5000);
    return sheet;
  });
  if (!sheets.length) throw new Error('No sheets');
  return { v: 2, active: 0, sheets };
}

export { colName };
