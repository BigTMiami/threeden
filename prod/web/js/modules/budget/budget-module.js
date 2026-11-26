// @ts-check
/**
 * budget-module.js — the Budget module: plan what money comes in and goes
 * out, write down what's actually spent, and (for shared costs) see who
 * owes whom.
 *
 * It starts by asking what it's for, with a template for each use
 * (budget-data.js TEMPLATES):
 *   Personal           your month: income, rent, groceries, savings
 *   Group event        a party or dinner: costs, who paid, settle up, cost per guest
 *   Organization       a club's, union's, or nonprofit's year: dues, donations, grants
 *   Shared household   rent and bills split between housemates
 *   Trip               lodging, travel, food, split fairly
 *   Fundraiser         a goal with a progress bar
 *   Start blank
 *
 * Files in this folder:
 *   budget-module.js   ← this file: the module definition
 *   budget-card.js     the homepage card (totals, top categories, quick add)
 *   budget-page.js     the full page (categories, the ledger, splitting, earlier months)
 *   budget-parts.js    the template picker, bars, the add form, settle up
 *   budget-data.js     the data shape, templates, totals, and settling up
 */

import { renderBudgetCard } from './budget-card.js';
import { renderBudgetPage } from './budget-page.js';
import { newBudgetData } from './budget-data.js';

export const budgetModule = {
  type: 'budget',
  label: 'Budget',
  description: 'Plan and track money: personal, a group event, an organization, a household, a trip, or a fundraiser',
  icon: 'wallet',
  defaultSpan: 6,
  defaultRows: 16,
  available: true,
  createInitialData: newBudgetData,
  render: renderBudgetCard,
  renderFullPage: renderBudgetPage,
};
