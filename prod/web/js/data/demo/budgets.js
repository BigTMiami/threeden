// @ts-check
/**
 * budgets.js — sample Budget modules (js/modules/budget/), one per kind of use:
 *
 *   createHouseBudget()        14 Juniper Lane: Shared household, split four ways, with an
 *                              exact split, a not-shared expense, and a Venmo payback
 *   createThanksgivingBudget() Larsen family: Group event, linked to Thanksgiving dinner, with
 *                              Aunt Karin (not on 3den), a split by shares, and a cash payback
 *   createTenantsBudget()      Juniper Tenants Union: Organization, the year so far
 *   createPersonalBudget()     Leo's homepage: Personal, this month
 *
 * Amounts are in cents. Dates are relative to today.
 */

import { daysFromToday, hoursAgo } from './helpers.js';
import { toDateKey, monthName } from '../../utils/dates.js';

const cat = (id, name, planned, kind = 'expense') => ({ id, name, kind, planned: planned * 100 });
let entryCount = 0;
/** Start the entry ids over, so every build of the demo gives the same ids (js/state/upgrade.js relies on it). */
export const resetBudgetIds = () => { entryCount = 0; };
const spent = (categoryId, dollars, note, daysAgo, paidBy, kind = 'expense', split = null) => ({
  id: `demo-be-${++entryCount}`, kind, categoryId, amount: Math.round(dollars * 100), note, date: daysFromToday(-daysAgo), paidBy, by: paidBy, at: hoursAgo(daysAgo * 24),
  ...(split ? { split } : {}),
});
const cents = (dollars) => Math.round(dollars * 100);

function thisMonth() {
  const today = new Date();
  return `${monthName(today.getMonth())} ${today.getFullYear()}`;
}
function lastMonth() {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - 1);
  return `${monthName(date.getMonth())} ${date.getFullYear()}`;
}
/** Days since the 1st, so this month's entries stay in this month. */
const intoMonth = () => Number(toDateKey(new Date()).slice(8)) - 1;
const early = (n) => Math.min(n, intoMonth());

export function createHouseBudget() {
  return {
    id: 'house-budget', type: 'budget', title: 'House bills', span: 5, rows: 18,
    data: {
      template: 'household', title: thisMonth(), currency: 'USD',
      categories: [cat('hb-rent', 'Rent', 2800), cat('hb-util', 'Utilities', 180), cat('hb-net', 'Internet', 60), cat('hb-food', 'Shared groceries', 300), cat('hb-clean', 'Cleaning & supplies', 40)],
      entries: [
        spent('hb-rent', 2800, 'Rent to Crestline', early(1), 'm-maya'),
        spent('hb-net', 60, 'Internet', early(3), 'm-owen'),
        spent('hb-util', 96.4, 'Gas & electric', early(5), 'm-leo'),
        spent('hb-food', 84.15, 'Big grocery run', early(2), 'm-theo'),
        spent('hb-food', 41.8, 'Farmers market', early(0), 'm-leo'),
        spent('hb-clean', 23.5, 'Dish soap, sponges, trash bags', early(4), 'm-owen'),
        // Theo's oat milk: just Theo and Leo drink it (exact amounts).
        spent('hb-food', 18, 'Oat milk (Theo + Leo)', early(1), 'm-theo', 'expense', { mode: 'exact', ids: ['m-theo', 'm-leo'], amounts: { 'm-theo': cents(9), 'm-leo': cents(9) } }),
        // Not shared: Maya's own plants.
        spent('hb-clean', 32, 'Plants for my room', early(3), 'm-maya', 'expense', { mode: 'solo', ids: ['m-maya'] }),
      ],
      split: { on: true, memberIds: [] },
      transfers: [{ id: 'hb-t1', from: 'm-leo', to: 'm-maya', amount: 70000, date: daysFromToday(-early(1)), at: hoursAgo(20), method: 'Venmo', note: 'Rent' }],
      people: [],
      goal: 0, eventId: null,
      past: [{ title: lastMonth(), income: 0, spent: 345210, closedAt: hoursAgo(24 * (intoMonth() + 1)) }],
    },
  };
}

export function createThanksgivingBudget() {
  return {
    id: 'larsen-budget', type: 'budget', title: 'Thanksgiving budget', span: 12, rows: 16,
    data: {
      template: 'event', title: 'Thanksgiving dinner', currency: 'USD',
      categories: [
        cat('tg-in', 'Chipping in', 0, 'income'),
        cat('tg-turkey', 'Turkey & sides', 180), cat('tg-drinks', 'Drinks', 80), cat('tg-pies', 'Pies', 45), cat('tg-table', 'Folding table & chairs rental', 60), cat('tg-other', 'Other', 30),
      ],
      entries: [
        spent('tg-turkey', 92.4, '18 lb turkey', 3, 'm-ingrid'),
        spent('tg-turkey', 54.1, 'Potatoes, squash, cranberries', 2, 'm-joe'),
        spent('tg-drinks', 63.75, 'Cider and wine', 2, 'm-erik'),
        spent('tg-table', 60, 'Table and 8 chairs', 4, 'm-nora'),
        spent('tg-pies', 28, 'Pecan pie supplies (Leo’s practice run!)', 6, 'm-leo'),
        // Aunt Karin isn't on 3den; she's added to this budget by name.
        spent('tg-pies', 36, 'Two apple pies from the bakery', 1, 'tg-karin'),
        // Wine: only the grown-ups, and Erik's household counts double.
        spent('tg-drinks', 48, 'Wine for the grown-ups', 1, 'm-joe', 'expense', { mode: 'shares', ids: ['m-joe', 'm-ingrid', 'm-erik', 'tg-karin'], shares: { 'm-joe': 1, 'm-ingrid': 1, 'm-erik': 2, 'tg-karin': 1 } }),
      ],
      split: { on: true, memberIds: [] },
      people: [{ id: 'tg-karin', name: 'Aunt Karin' }],
      transfers: [{ id: 'tg-t1', from: 'm-leo', to: 'm-ingrid', amount: 2000, date: daysFromToday(-1), at: hoursAgo(20), method: 'Cash', note: '' }],
      goal: 0, eventId: 'larsen-ev-dinner', past: [],
    },
  };
}

export function createTenantsBudget() {
  return {
    id: 'tenants-budget', type: 'budget', title: 'Union budget', span: 12, rows: 18, tabId: 'tenants-tab-campaign',
    data: {
      template: 'org', title: `${new Date().getFullYear()} budget`, currency: 'USD',
      categories: [
        cat('tu-dues', 'Dues', 2400, 'income'), cat('tu-don', 'Donations', 1500, 'income'), cat('tu-fund', 'Fundraisers', 800, 'income'),
        cat('tu-space', 'Space rental', 1200), cat('tu-print', 'Printing & flyers', 400), cat('tu-food', 'Food for meetings', 600),
        cat('tu-legal', 'Legal aid fund', 500), cat('tu-supplies', 'Supplies', 300), cat('tu-reserve', 'Reserve', 500),
      ],
      entries: [
        spent('tu-dues', 1860, 'Dues, January to now (31 households)', 20, 'm-maya', 'income'),
        spent('tu-don', 640, 'Spring appeal', 120, 'm-priya', 'income'),
        spent('tu-don', 250, 'St. Mark’s congregation', 40, 'm-priya', 'income'),
        spent('tu-fund', 512, 'Chili cook-off', 60, 'm-iris', 'income'),
        spent('tu-space', 900, 'Building A community room, 9 months', 10, 'm-maya'),
        spent('tu-print', 186.4, 'Heat complaint flyers (500)', 25, 'm-iris'),
        spent('tu-print', 92, 'Door hangers', 8, 'm-priya'),
        spent('tu-food', 410.25, 'Meeting snacks and childcare pizza', 5, 'm-maya'),
        spent('tu-legal', 350, 'Consultation, rent increase letters', 4, 'm-priya'),
        spent('tu-supplies', 64.9, 'Clipboards and pens', 30, 'm-owen'),
      ],
      split: { on: false, memberIds: [] }, transfers: [], goal: 0, eventId: null, past: [],
    },
  };
}

export function createPersonalBudget() {
  return {
    id: 'me-budget', type: 'budget', title: 'My budget', span: 6, rows: 17,
    data: {
      template: 'personal', title: thisMonth(), currency: 'USD',
      categories: [
        cat('pb-pay', 'Paychecks', 2400, 'income'), cat('pb-other', 'Other income', 150, 'income'),
        cat('pb-rent', 'Rent (my share)', 700), cat('pb-food', 'Groceries', 250), cat('pb-transit', 'Getting around', 90),
        cat('pb-phone', 'Phone', 45), cat('pb-out', 'Eating out', 100), cat('pb-books', 'Books & school', 80), cat('pb-fun', 'Fun', 80), cat('pb-save', 'Savings', 300),
      ],
      entries: [
        spent('pb-pay', 1200, 'Bike shop, first half', early(1), 'm-leo', 'income'),
        spent('pb-rent', 700, 'Paid Maya back for rent', early(1), 'm-leo'),
        spent('pb-food', 64.2, 'Groceries', early(3), 'm-leo'),
        spent('pb-transit', 34, 'Train fare', early(2), 'm-leo'),
        spent('pb-phone', 45, 'Phone bill', early(4), 'm-leo'),
        spent('pb-out', 118.5, 'Burritos, the café, Jamal’s gig', early(0), 'm-leo'),
        spent('pb-books', 42, 'The Death and Life of Great American Cities', early(5), 'm-leo'),
      ],
      split: { on: false, memberIds: [] }, transfers: [], goal: 0, eventId: null,
      past: [{ title: lastMonth(), income: 255000, spent: 231840, closedAt: hoursAgo(24 * (intoMonth() + 1)) }],
    },
  };
}
