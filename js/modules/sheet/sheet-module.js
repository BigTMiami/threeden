// @ts-check
/**
 * sheet-module.js — the Spreadsheet module: a workbook of sheets with
 * formulas, formatting, sorting, filters, charts, and Excel files, much like
 * Excel or Google Sheets. It can sit on a homepage or be a file in a vault.
 *
 * The homepage card is the same editor, smaller (no toolbar; the full page
 * has everything). Visitors can look, not change.
 *
 * Files in this folder:
 *   sheet-module.js    ← this file: the module
 *   sheet-editor.js    the editor (grid, toolbar, keys, menus, tabs, find, charts)
 *   sheet-model.js     the saved shape, computing, formats, rows and columns, fill, sort, filters
 *   sheet-formula.js   the formula language and its 130 functions
 *   sheet-xlsx.js      opening and saving .xlsx files
 *   sheet-chart.js     charts, as SVG
 */

import { h } from '../../ui/dom.js';
import { getModule } from '../../state/store.js';
import { createSheetEditor } from './sheet-editor.js';
import { newWorkbook } from './sheet-model.js';

function render(container, context, compact) {
  const root = h('div', {});
  container.append(root);
  const editor = createSheetEditor(root, {
    getData: () => context.getData(),
    saveData: (data) => context.saveData(data),
    canEdit: !context.isVisitor,
    compact,
    title: getModule(context.moduleId)?.title ?? 'Spreadsheet',
    onOpenFull: compact && context.openFullPage ? () => context.openFullPage() : null,
  });
  return () => editor.destroy();
}

export const sheetModule = {
  type: 'sheet',
  label: 'Spreadsheet',
  description: 'Sheets with formulas, formatting, sorting, filters, and charts. Opens and saves Excel files',
  icon: 'table',
  defaultSpan: 6,
  defaultRows: 14,
  available: true,
  createInitialData: newWorkbook,
  render: (container, context) => render(container, context, true),
  renderFullPage: (container, context) => render(container, context, false),
};
