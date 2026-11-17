// @ts-check
/**
 * budget-data.js — what a Budget holds, its templates, and the arithmetic.
 *
 * Data shape (amounts are whole cents, so nothing rounds wrong):
 *
 *   {
 *     template: 'personal',       ← which template it started from (TEMPLATES), or null
 *                                   while it's still asking "What's it for?"
 *     title: 'November 2026',     ← what this budget covers: a month, an event, a year…
 *     currency: 'USD',
 *     categories: [{ id, name, kind: 'income' | 'expense', planned }],
 *     entries: [{ id, kind: 'income' | 'expense', categoryId, amount, note, date, paidBy, by, at,
 *                 split }]        ← paidBy: who paid (or received) it; by: who wrote it down
 *       split: { mode, ids, amounts, shares }   ← who an expense is shared between:
 *         'solo'    just whoever paid (not shared)
 *         'equal'   evenly between ids
 *         'exact'   amounts: { id: cents } (must add up to the amount)
 *         'shares'  shares: { id: 2 } (2 shares = twice as much)
 *       (no split: shared evenly if split.on, else solo; older budgets)
 *     split: { on, memberIds }    ← sharing costs: on by default for new expenses, and who's in
 *                                   (empty = everyone in the space, plus the people below)
 *     people: [{ id: 'bp-…', name, addedAt }]   ← people outside 3den or the group, to split with
 *                                   (not in on older, unsplit costs from before addedAt)
 *     transfers: [{ id, from, to, amount, date, at, method, note }]   ← paying each other back
 *     goal: 0,                    ← a fundraising goal (Fundraiser), or 0
 *     eventId: null,              ← the event it's for (Group event): cost per guest
 *     past: [{ title, income, spent, closedAt }]        ← earlier months or years
 *   }
 *
 *   TEMPLATES, templatesFor(spaceKind)   the starting points
 *   applyTemplate(data, id, context)     fill a new budget from one
 *   totals(data)                         income, spent, planned, left, by category
 *   sharesOf(entry, data, everyone)      { id: cents } each person's part of one expense
 *   balances(data, everyone)             who's paid what, their share, paid back, and net
 *   settleUp(balances)                   the fewest payments to even out
 *   between(data, a, b, everyone)        what two people owe each other, and why
 *   formatMoney(cents, currency)  parseMoney('12.50') → 1250
 */

import { makeId } from '../../ui/dom.js';
import { todayKey, monthName, fromDateKey } from '../../utils/dates.js';

export const CURRENCIES = ['USD', 'CAD', 'EUR', 'GBP', 'MXN', 'AUD', 'INR', 'JPY'];

const category = (name, planned, kind = 'expense') => ({ id: makeId('bc'), name, kind, planned: Math.round(planned * 100) });

function thisMonth() {
  const date = fromDateKey(todayKey());
  return `${monthName(date.getMonth())} ${date.getFullYear()}`;
}

/**
 * The templates. Each says what it's for, which kinds of space it suits
 * first, and what it starts with. Everything can be renamed or changed.
 */
export const TEMPLATES = [
  {
    id: 'personal', label: 'Personal', icon: '👤', for: ['personal'],
    description: 'Your month: income, rent, groceries, and the rest. Only you see it on your homepage.',
    title: () => thisMonth(),
    period: 'month',
    categories: () => [
      category('Paycheck', 3200, 'income'), category('Other income', 0, 'income'),
      category('Rent', 1400), category('Groceries', 350), category('Utilities', 120), category('Phone & internet', 90),
      category('Getting around', 130), category('Eating out', 150), category('Fun', 120), category('Savings', 400),
    ],
  },
  {
    id: 'event', label: 'Group event', icon: '🎉', for: ['group', 'personal'],
    description: 'A party, a trip, a dinner: plan the costs, track who paid for what, and settle up after.',
    title: (context) => context.eventTitle ?? 'Our event',
    period: 'event',
    split: true,
    categories: () => [
      category('Chipping in', 0, 'income'),
      category('Venue', 0), category('Food & drink', 200), category('Decorations', 40), category('Supplies', 50), category('Music', 0), category('Other', 30),
    ],
  },
  {
    id: 'org', label: 'Organization', icon: '🏛️', for: ['group'],
    description: 'A club, union, or nonprofit’s year: dues, donations, grants, and what it all pays for. A shared ledger the members can see.',
    title: () => `${fromDateKey(todayKey()).getFullYear()} budget`,
    period: 'year',
    categories: () => [
      category('Dues', 2400, 'income'), category('Donations', 1500, 'income'), category('Grants', 0, 'income'), category('Fundraisers', 800, 'income'),
      category('Space rental', 1200), category('Printing & flyers', 400), category('Food for meetings', 600), category('Supplies', 300),
      category('Transportation', 200), category('Fees & software', 150), category('Reserve', 500),
    ],
  },
  {
    id: 'household', label: 'Shared household', icon: '🏠', for: ['group'],
    description: 'Rent, utilities, and shared groceries, split between housemates, with who owes whom.',
    title: () => thisMonth(),
    period: 'month',
    split: true,
    categories: () => [
      category('Rent', 2800), category('Utilities', 180), category('Internet', 60), category('Shared groceries', 300), category('Cleaning & supplies', 40),
    ],
  },
  {
    id: 'trip', label: 'Trip', icon: '🧳', for: ['group', 'personal'],
    description: 'Travel with friends or family: lodging, travel, food, and activities, split fairly.',
    title: () => 'Our trip',
    period: 'trip',
    split: true,
    categories: () => [
      category('Lodging', 600), category('Getting there', 300), category('Food', 250), category('Activities', 150), category('Other', 50),
    ],
  },
  {
    id: 'fundraiser', label: 'Fundraiser', icon: '🎯', for: ['group', 'personal'],
    description: 'Raising money for something: a goal with a progress bar, donations coming in, and costs going out.',
    title: () => 'Our fundraiser',
    period: 'project',
    goal: 2000,
    categories: () => [
      category('Donations', 2000, 'income'), category('Ticket sales', 0, 'income'),
      category('Event costs', 150), category('Printing', 50), category('Payment fees', 60),
    ],
  },
  {
    id: 'blank', label: 'Start blank', icon: '✏️', for: ['group', 'personal'],
    description: 'No categories yet: add your own.',
    title: () => 'Budget',
    period: 'other',
    categories: () => [],
  },
];

/** Templates in the order that suits a kind of space: its own first. */
export function templatesFor(spaceKind) {
  const others = TEMPLATES.filter((t) => t.id !== 'blank');
  const rank = (t) => (t.for[0] === spaceKind ? 0 : t.for.includes(spaceKind) ? 1 : 2);
  return [...others].sort((a, b) => rank(a) - rank(b)).concat(TEMPLATES.find((t) => t.id === 'blank'));
}

export function newBudgetData() {
  return { template: null };
}

/** Fill a budget from a template. context: { eventTitle, eventId } (optional). */
export function applyTemplate(data, templateId, context = {}) {
  const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES.find((t) => t.id === 'blank');
  return {
    ...normalizeBudget({}),
    ...data,
    template: template.id,
    title: template.title(context),
    categories: template.categories(),
    entries: [],
    transfers: [],
    split: { on: Boolean(template.split), memberIds: [] },
    people: [],
    goal: Math.round((template.goal ?? 0) * 100),
    eventId: context.eventId ?? null,
    past: [],
  };
}

export function templateOf(data) {
  return TEMPLATES.find((t) => t.id === data.template) ?? null;
}

export function normalizeBudget(data = {}) {
  return {
    template: data.template ?? null,
    title: data.title ?? 'Budget',
    currency: CURRENCIES.includes(data.currency) ? data.currency : 'USD',
    categories: data.categories ?? [],
    entries: data.entries ?? [],
    split: { on: false, memberIds: [], ...(data.split ?? {}) },
    people: data.people ?? [],
    transfers: data.transfers ?? [],
    goal: data.goal ?? 0,
    eventId: data.eventId ?? null,
    past: data.past ?? [],
  };
}

// ─── Money ───────────────────────────────────────────────────────────────────

const formatters = new Map();
/** "$1,400" for whole amounts, "$96.40" otherwise. */
export function formatMoney(cents, currency = 'USD', { sign = false } = {}) {
  const whole = currency === 'JPY' || Math.round(cents) % 100 === 0;
  const key = `${currency}:${whole}`;
  if (!formatters.has(key)) {
    formatters.set(key, new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: whole ? 0 : 2, minimumFractionDigits: whole ? 0 : 2 }));
  }
  const text = formatters.get(key).format(Math.abs(cents) / 100);
  if (cents < 0) return `−${text}`;
  return sign && cents > 0 ? `+${text}` : text;
}

/** "12.50", "$12.50", "1,200" → cents, or null if it isn't a number. */
export function parseMoney(text) {
  const cleaned = String(text ?? '').replace(/[^0-9.,-]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.');
  if (!cleaned || Number.isNaN(Number(cleaned))) return null;
  return Math.round(Number(cleaned) * 100);
}

// ─── Totals ──────────────────────────────────────────────────────────────────

/**
 * {
 *   income, spent, plannedIncome, plannedSpend, left (planned spend − spent),
 *   balance (income − spent),
 *   rows: [{ category, actual, left, over, share }]   ← share: actual ÷ planned (0–1+)
 * }
 */
export function totals(data) {
  const budget = normalizeBudget(data);
  const counted = budget.entries.filter((e) => !e.carried); // carried-over balances aren't new spending
  const sumFor = (id) => counted.filter((e) => e.categoryId === id).reduce((sum, e) => sum + e.amount, 0);
  const rows = budget.categories.map((c) => {
    const actual = sumFor(c.id);
    return { category: c, actual, left: c.planned - actual, over: c.kind === 'expense' && c.planned > 0 && actual > c.planned, share: c.planned ? actual / c.planned : 0 };
  });
  // Entries whose category was deleted count as "Other".
  const known = new Set(budget.categories.map((c) => c.id));
  const loose = budget.entries.filter((e) => !known.has(e.categoryId));
  const sum = (list) => list.reduce((s, x) => s + x, 0);
  const income = sum(budget.entries.filter((e) => e.kind === 'income').map((e) => e.amount));
  const spent = sum(counted.filter((e) => e.kind !== 'income').map((e) => e.amount));
  const plannedIncome = sum(budget.categories.filter((c) => c.kind === 'income').map((c) => c.planned));
  const plannedSpend = sum(budget.categories.filter((c) => c.kind === 'expense').map((c) => c.planned));
  return {
    income, spent, plannedIncome, plannedSpend,
    left: plannedSpend - spent,
    balance: income - spent,
    rows,
    looseCount: loose.length,
  };
}

// ─── Splitting costs ─────────────────────────────────────────────────────────

export const SPLIT_MODES = [
  { id: 'equal', label: 'Evenly' },
  { id: 'exact', label: 'Exact amounts' },
  { id: 'shares', label: 'By shares' },
  { id: 'solo', label: 'Not shared' },
];

/** Everyone who can be in on costs: the space's members and the budget's own people. */
export function everyoneFor(data, memberIds) {
  return [...new Set([...memberIds, ...normalizeBudget(data).people.map((p) => p.id)])];
}

/** Who's in by default, for a new expense. */
export function defaultSplitIds(data, memberIds) {
  const budget = normalizeBudget(data);
  return budget.split.memberIds.length ? budget.split.memberIds : everyoneFor(budget, memberIds);
}

/** The split an expense actually uses (older entries have none). */
export function splitOf(entry, data, memberIds) {
  if (entry.kind === 'income') return { mode: 'solo', ids: [entry.paidBy] };
  if (entry.split) return entry.split;
  // Someone added to the budget later isn't in on costs from before they joined.
  const budget = normalizeBudget(data);
  const ids = defaultSplitIds(budget, memberIds).filter((id) => {
    const person = budget.people.find((p) => p.id === id);
    return !person?.addedAt || person.addedAt <= entry.at;
  });
  return budget.split.on ? { mode: 'equal', ids } : { mode: 'solo', ids: [entry.paidBy] };
}

/** Each person's part of an expense, in cents, adding up exactly to the amount. */
export function sharesOf(entry, data, memberIds) {
  const split = splitOf(entry, data, memberIds);
  const result = {};
  if (split.mode === 'solo' || !split.ids?.length) {
    result[entry.paidBy] = entry.amount;
    return result;
  }
  if (split.mode === 'exact') {
    for (const id of split.ids) result[id] = Math.round(split.amounts?.[id] ?? 0);
    return result;
  }
  const weights = split.ids.map((id) => (split.mode === 'shares' ? Math.max(0, Number(split.shares?.[id] ?? 1)) : 1));
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
  let assigned = 0;
  split.ids.forEach((id, i) => {
    const part = Math.floor((entry.amount * weights[i]) / totalWeight);
    result[id] = part;
    assigned += part;
  });
  // The leftover cent or two goes to whoever paid if they're in, else the first person.
  const leftover = entry.amount - assigned;
  const gets = split.ids.includes(entry.paidBy) ? entry.paidBy : split.ids[0];
  result[gets] += leftover;
  return result;
}

export const isShared = (entry, data, memberIds) => {
  const split = splitOf(entry, data, memberIds);
  return split.mode !== 'solo' && split.ids.some((id) => id !== entry.paidBy);
};

/**
 * Per person: paid (shared expenses they covered), share (their part),
 * sent and received (paybacks), and net (+ they're owed, − they owe).
 * Only shared expenses count; "not shared" ones are just spending.
 */
export function balances(data, memberIds) {
  const budget = normalizeBudget(data);
  const people = new Map();
  const row = (id) => {
    if (!people.has(id)) people.set(id, { memberId: id, paid: 0, share: 0, sent: 0, received: 0, net: 0 });
    return people.get(id);
  };
  for (const id of defaultSplitIds(budget, memberIds)) row(id);
  for (const entry of budget.entries) {
    if (entry.kind === 'income' || !isShared(entry, budget, memberIds)) continue;
    row(entry.paidBy).paid += entry.amount;
    for (const [id, part] of Object.entries(sharesOf(entry, budget, memberIds))) row(id).share += part;
  }
  for (const t of budget.transfers) {
    row(t.from).sent += t.amount;
    row(t.to).received += t.amount;
  }
  for (const b of people.values()) b.net = b.paid - b.share + b.sent - b.received;
  return [...people.values()];
}

/** The fewest payments that even everyone out: [{ from, to, amount }]. */
export function settleUp(list) {
  const owe = list.filter((b) => b.net < -50).map((b) => ({ id: b.memberId, amount: -b.net })).sort((a, b) => b.amount - a.amount);
  const owed = list.filter((b) => b.net > 50).map((b) => ({ id: b.memberId, amount: b.net })).sort((a, b) => b.amount - a.amount);
  const payments = [];
  let i = 0;
  let j = 0;
  while (i < owe.length && j < owed.length) {
    const amount = Math.min(owe[i].amount, owed[j].amount);
    payments.push({ from: owe[i].id, to: owed[j].id, amount });
    owe[i].amount -= amount;
    owed[j].amount -= amount;
    if (owe[i].amount < 50) i += 1;
    if (owed[j].amount < 50) j += 1;
  }
  return payments;
}

/**
 * What two people owe each other directly, and why: every shared expense
 * one paid that the other had a part in, and paybacks between them.
 *   → { net (+ b owes a, − a owes b), lines: [{ date, text, amount (+ toward a) }] }
 */
export function between(data, a, b, memberIds) {
  const budget = normalizeBudget(data);
  const lines = [];
  for (const entry of budget.entries) {
    if (entry.kind === 'income' || !isShared(entry, budget, memberIds)) continue;
    const parts = sharesOf(entry, budget, memberIds);
    if (entry.paidBy === a && parts[b]) lines.push({ date: entry.date, at: entry.at, entry, amount: parts[b] });
    if (entry.paidBy === b && parts[a]) lines.push({ date: entry.date, at: entry.at, entry, amount: -parts[a] });
  }
  for (const t of budget.transfers) {
    if (t.from === b && t.to === a) lines.push({ date: t.date, at: t.at, transfer: t, amount: -t.amount });
    if (t.from === a && t.to === b) lines.push({ date: t.date, at: t.at, transfer: t, amount: t.amount });
  }
  lines.sort((x, y) => y.date.localeCompare(x.date) || y.at - x.at);
  return { net: lines.reduce((sum, l) => sum + l.amount, 0), lines };
}

export const PAY_METHODS = ['Cash', 'Venmo', 'Zelle', 'Cash App', 'PayPal', 'Bank transfer', 'Other'];

// ─── Changes ─────────────────────────────────────────────────────────────────

export function addEntry(data, { kind = 'expense', categoryId, amount, note = '', date = todayKey(), paidBy, by, split = null }) {
  const entry = { id: makeId('be'), kind, categoryId, amount, note: note.trim(), date, paidBy: paidBy ?? by, by, at: Date.now() };
  if (split && kind !== 'income') entry.split = split;
  data.entries = [...(data.entries ?? []), entry];
  return entry;
}

export function addTransfer(data, { from, to, amount, method = '', note = '', date = todayKey() }) {
  data.transfers = [...(data.transfers ?? []), { id: makeId('bt'), from, to, amount, date, method, note: note.trim(), at: Date.now() }];
}

/** Someone outside the group (or outside 3den) to split costs with. */
export function addPerson(data, name) {
  const person = { id: makeId('bp'), name: name.trim(), addedAt: Date.now() };
  data.people = [...(data.people ?? []), person];
  return person;
}

/**
 * Close this month (or year) and start the next with the same plan: the
 * totals go into `past`, entries and paybacks start fresh.
 */
export function startNextPeriod(data, nextTitle, memberIds = []) {
  const t = totals(data);
  // Unsettled balances carry over, as "carried over" costs owed to the same people.
  const carry = settleUp(balances(data, memberIds));
  const carryCategory = data.categories.find((c) => c.kind === 'expense')?.id ?? null;
  data.past = [{ title: data.title, income: t.income, spent: t.spent, closedAt: Date.now() }, ...(data.past ?? [])];
  data.entries = carry.map((p) => ({
    id: makeId('be'), kind: 'expense', categoryId: carryCategory, amount: p.amount, note: `Carried over from ${data.title}`, carried: true,
    date: todayKey(), paidBy: p.to, by: p.to, at: Date.now(), split: { mode: 'exact', ids: [p.from], amounts: { [p.from]: p.amount } },
  }));
  data.transfers = [];
  data.title = nextTitle;
}

/** What comes after "November 2026" ("December 2026") or "2026 budget" ("2027 budget"). */
export function nextTitleFor(title) {
  const months = Array.from({ length: 12 }, (_, i) => monthName(i));
  const monthMatch = title.match(new RegExp(`^(${months.join('|')}) (\\d{4})$`));
  if (monthMatch) {
    const index = months.indexOf(monthMatch[1]);
    const year = Number(monthMatch[2]);
    return index === 11 ? `${months[0]} ${year + 1}` : `${months[index + 1]} ${year}`;
  }
  const yearMatch = title.match(/(\d{4})/);
  if (yearMatch) return title.replace(yearMatch[1], String(Number(yearMatch[1]) + 1));
  return `${title} (next)`;
}

/** Can this budget roll over to a next month or year? */
export function hasPeriods(data) {
  return ['month', 'year'].includes(templateOf(data)?.period) || /\b\d{4}\b/.test(data.title ?? '');
}
