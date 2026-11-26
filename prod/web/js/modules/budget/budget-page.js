// @ts-check
/**
 * budget-page.js — a Budget's full page, in four tabs:
 *
 *   [November 2026      ]  🏠 Household          [+ Add expense] [Record payment]
 *   Overview | Expenses (12) | Balances | Plan
 *
 *   Overview   tiles (spent, left, received), the goal or cost per guest,
 *              where the money went (bars), who owes whom, the latest five
 *   Expenses   everything in and out, by day; filter All / Mine / Shared /
 *              a category / search. Each row: who paid, how it's split, your
 *              part. Tap one to edit (or see it, for other people's).
 *   Balances   each person: paid, their share, paid back, where that leaves
 *              them (tap for the history between you); Settle up (the fewest
 *              payments) with Record payment and Remind; payments made;
 *              people outside the group; how new expenses split by default
 *   Plan       categories and planned amounts, currency, Start December,
 *              earlier months, Start over with another template
 */

import { h, replaceChildren } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { showToast } from '../../ui/toast.js';
import { formatShortDate, todayKey } from '../../utils/dates.js';
import { makeId } from '../../ui/dom.js';
import { findEvent } from '../../state/events.js';
import { eventHref } from '../../events/event-details.js';
import {
  normalizeBudget, totals, templateOf, balances, parseMoney, CURRENCIES, startNextPeriod, nextTitleFor, hasPeriods,
  isShared, sharesOf, splitOf, addPerson, everyoneFor,
} from './budget-data.js';
import {
  renderTemplatePicker, progressBar, renderSettleUp, money, memberIdsOf, everyoneIn, nameOf, faceOf,
  openExpenseSheet, openPaymentSheet, renderPersonHistory,
} from './budget-parts.js';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'balances', label: 'Balances' },
  { id: 'plan', label: 'Plan' },
];

export function renderBudgetPage(container, context) {
  const root = h('div', { class: 'budget budget--page' });
  const canEdit = !context.isVisitor;
  const me = context.currentUser;
  let tab = 'overview';
  const filter = { who: 'all', categoryId: '', search: '' };
  let openPerson = null; // Balances: whose history is open

  function update(changeFn, { redraw = true } = {}) {
    const data = structuredClone(normalizeBudget(context.getData()));
    changeFn(data);
    context.saveData(data);
    if (redraw) draw();
  }
  function updateWithUndo(message, changeFn) {
    const before = structuredClone(context.getData());
    update(changeFn);
    showToast(message, { actionLabel: 'Undo', onAction: () => { context.saveData(before); draw(); } });
  }

  function draw() {
    const raw = context.getData() ?? {};
    if (!raw.template) {
      replaceChildren(root, renderTemplatePicker(context, (data) => { context.saveData(data); draw(); }));
      return;
    }
    const data = normalizeBudget(raw);
    const scroll = window.scrollY;
    replaceChildren(root,
      renderHeader(data),
      h('div', { class: 'budget-tabs', role: 'tablist', 'aria-label': 'Budget' }, TABS.map((t) => h('button', {
        type: 'button', role: 'tab', class: `budget-tabs__tab${t.id === tab ? ' is-active' : ''}`, 'aria-selected': String(t.id === tab),
        onClick: () => { tab = t.id; draw(); },
      }, t.label, t.id === 'expenses' && data.entries.length ? h('span', { class: 'budget-tabs__count' }, String(data.entries.length)) : null))),
      h('div', { class: 'budget-tabs__panel', role: 'tabpanel' },
        tab === 'overview' ? renderOverview(data)
          : tab === 'expenses' ? renderExpenses(data)
            : tab === 'balances' ? renderBalances(data)
              : renderPlan(data)));
    window.scrollTo({ top: scroll });
  }

  // ─── Header ────────────────────────────────────────────────────────────────

  function renderHeader(data) {
    const template = templateOf(data);
    const group = everyoneIn(context).length > 1;
    return h('div', { class: 'budget-page__head' },
      h('label', { class: 'visually-hidden', for: `budget-title-${context.moduleId}` }, 'What this budget covers'),
      h('input', {
        id: `budget-title-${context.moduleId}`, type: 'text', class: 'budget-page__title', value: data.title, disabled: !canEdit,
        onChange: (event) => update((saved) => { saved.title = event.target.value.trim() || 'Budget'; }, { redraw: false }),
      }),
      template ? h('span', { class: 'budget__kind' }, `${template.icon} ${template.label}`) : null,
      canEdit ? h('span', { class: 'budget-page__actions' },
        h('button', { type: 'button', class: 'button button--primary button--small', onClick: () => openExpenseSheet(context, { onSave: update }) }, icon('plus', 14), ' Add expense'),
        group ? h('button', { type: 'button', class: 'button button--small', onClick: () => openPaymentSheet(context, { from: me.id, to: everyoneIn(context).find((id) => id !== me.id), onSave: update }) }, 'Record payment') : null) : null);
  }

  // ─── Overview ──────────────────────────────────────────────────────────────

  function renderOverview(data) {
    const fmt = money(data);
    const t = totals(data);
    const memberIds = memberIdsOf(context);
    const linked = data.eventId ? findEvent(data.eventId) : null;
    const going = linked ? Object.values(linked.event.rsvps ?? {}).filter((a) => a === 'going').length : 0;
    const tile = (label, value, sub, extra = '') => h('div', { class: `budget-tile ${extra}` },
      h('span', { class: 'budget-tile__label' }, label), h('strong', { class: 'budget-tile__value' }, value), sub ? h('span', { class: 'budget-tile__sub' }, sub) : null);
    const mine = balances(data, memberIds).find((b) => b.memberId === me.id);
    const anyShared = data.split.on || data.entries.some((e) => isShared(e, data, memberIds));
    const spentRows = t.rows.filter((r) => r.category.kind === 'expense' && (r.actual || r.category.planned)).sort((a, b) => b.actual - a.actual);
    const recent = [...data.entries].sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at).slice(0, 5);
    return [
      h('div', { class: 'budget-tiles' },
        tile('Spent', fmt(t.spent), t.plannedSpend ? `of ${fmt(t.plannedSpend)} planned` : null),
        t.plannedSpend ? tile(t.left < 0 ? 'Over' : 'Left', fmt(Math.abs(t.left)), t.left < 0 ? 'over the plan' : 'to spend', t.left < 0 ? 'is-over' : '') : null,
        t.plannedIncome || t.income ? tile('Received', fmt(t.income), t.plannedIncome ? `of ${fmt(t.plannedIncome)} expected` : null) : null,
        anyShared && mine ? (Math.abs(mine.net) <= 50 ? tile('Your balance', 'Even', 'all square') : tile(mine.net > 0 ? 'You’re owed' : 'You owe', fmt(Math.abs(mine.net)), null, mine.net < 0 ? 'is-over' : 'is-good')) : null),
      data.goal ? h('div', { class: 'budget-page__goal' },
        h('p', {}, h('strong', {}, fmt(t.income)), ` raised of a ${fmt(data.goal)} goal`),
        progressBar(t.income, data.goal, { label: 'Raised so far' })) : null,
      t.plannedSpend && !data.goal ? progressBar(t.spent, t.plannedSpend, { over: t.left < 0, label: 'Spent so far' }) : null,
      linked ? h('p', { class: 'budget-muted' }, 'For ', h('a', { href: eventHref(linked.event.id) }, linked.event.title),
        going ? ` · ${going} going · about ${fmt(Math.round((t.spent || t.plannedSpend) / going))} per person` : ' · nobody’s said Going yet') : null,
      h('div', { class: 'budget-columns' },
        h('section', { class: 'budget-panel' },
          h('h3', { class: 'budget-panel__title' }, 'Where it went'),
          spentRows.length ? h('ul', { class: 'budget__rows' }, spentRows.map((row) => h('li', { class: `budget__row${row.over ? ' is-over' : ''}` },
            h('span', { class: 'budget__row-name' }, row.category.name),
            h('span', { class: 'budget__row-amount' }, fmt(row.actual), row.category.planned ? h('span', { class: 'budget-muted' }, ` / ${fmt(row.category.planned)}`) : null),
            row.category.planned ? progressBar(row.actual, row.category.planned, { over: row.over, label: row.category.name }) : h('span'))))
            : h('p', { class: 'module-empty' }, 'Nothing spent yet.')),
        h('section', { class: 'budget-panel' },
          anyShared ? [
            h('h3', { class: 'budget-panel__title' }, 'Settle up', h('button', { type: 'button', class: 'link-button', onClick: () => { tab = 'balances'; draw(); } }, 'Balances →')),
            renderSettleUp(context, update) ?? h('p', { class: 'module-empty' }, 'Nothing shared yet.'),
          ] : null,
          h('h3', { class: 'budget-panel__title' }, 'Latest', data.entries.length > 5 ? h('button', { type: 'button', class: 'link-button', onClick: () => { tab = 'expenses'; draw(); } }, 'All →') : null),
          recent.length ? h('ul', { class: 'budget-ledger budget-ledger--compact' }, recent.map((entry) => ledgerRow(data, entry)))
            : h('p', { class: 'module-empty' }, 'Nothing written down yet.'))),
    ];
  }

  // ─── Expenses ──────────────────────────────────────────────────────────────

  function ledgerRow(data, entry) {
    const fmt = money(data);
    const memberIds = memberIdsOf(context);
    const category = data.categories.find((c) => c.id === entry.categoryId)?.name ?? 'Other';
    const shared = isShared(entry, data, memberIds);
    const parts = shared ? sharesOf(entry, data, memberIds) : null;
    const split = splitOf(entry, data, memberIds);
    const myPart = parts?.[me.id];
    const canChange = canEdit && (entry.by === me.id || entry.paidBy === me.id || context.can?.('moderate') || everyoneIn(context).length <= 1);
    const how = shared
      ? `${nameOf(context, entry.paidBy)} paid · ${split.mode === 'equal' ? `split ${Object.keys(parts).length} ways` : split.mode === 'exact' ? 'split by amounts' : 'split by shares'}`
      : entry.kind === 'income' ? `${nameOf(context, entry.paidBy)} received` : everyoneIn(context).length > 1 ? `${nameOf(context, entry.paidBy)} paid · not shared` : null;
    return h('li', { class: `budget-ledger__row budget-ledger__row--${entry.kind}` },
      h('button', {
        type: 'button', class: 'budget-ledger__open', disabled: !canChange,
        title: canChange ? 'Edit' : undefined,
        onClick: () => openExpenseSheet(context, { entry, onSave: update }),
      },
      everyoneIn(context).length > 1 ? faceOf(context, entry.paidBy, 28) : h('span', { class: 'budget-ledger__icon', 'aria-hidden': 'true' }, icon(entry.kind === 'income' ? 'plus' : 'wallet', 14)),
      h('span', { class: 'budget-ledger__what' },
        h('span', { class: 'budget-ledger__note' }, entry.note || category),
        h('span', { class: 'budget-ledger__cat' }, [entry.note ? category : null, how, formatShortDate(entry.date)].filter(Boolean).join(' · '))),
      h('span', { class: 'budget-ledger__money' },
        h('span', { class: 'budget-ledger__amount' }, entry.kind === 'income' ? fmt(entry.amount, { sign: true }) : fmt(entry.amount)),
        shared && myPart != null ? h('span', { class: 'budget-ledger__mine' }, entry.paidBy === me.id ? `you lent ${fmt(entry.amount - myPart)}` : `your part ${fmt(myPart)}`) : null)),
      canChange ? h('button', {
        type: 'button', class: 'icon-button icon-button--subtle', 'aria-label': 'Remove this entry',
        onClick: () => updateWithUndo('Removed.', (saved) => { saved.entries = saved.entries.filter((e) => e.id !== entry.id); }),
      }, icon('close', 14)) : null);
  }

  function renderExpenses(data) {
    const fmt = money(data);
    const memberIds = memberIdsOf(context);
    const group = everyoneIn(context).length > 1;
    const search = filter.search.trim().toLowerCase();
    const shown = [...data.entries]
      .filter((e) => !filter.categoryId || e.categoryId === filter.categoryId)
      .filter((e) => filter.who !== 'mine' || e.paidBy === me.id || (isShared(e, data, memberIds) && sharesOf(e, data, memberIds)[me.id]))
      .filter((e) => filter.who !== 'shared' || isShared(e, data, memberIds))
      .filter((e) => filter.who !== 'in' || e.kind === 'income')
      .filter((e) => !search || `${e.note} ${data.categories.find((c) => c.id === e.categoryId)?.name ?? ''}`.toLowerCase().includes(search))
      .sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);
    const days = [];
    for (const entry of shown) {
      const last = days[days.length - 1];
      if (last?.date === entry.date) last.entries.push(entry); else days.push({ date: entry.date, entries: [entry] });
    }
    const chip = (id, label) => h('button', {
      type: 'button', class: `chip budget-filter${filter.who === id ? ' is-on' : ''}`, 'aria-pressed': String(filter.who === id),
      onClick: () => { filter.who = id; draw(); },
    }, label);
    const searchInput = h('input', {
      type: 'search', class: 'input input--compact budget-filters__search', placeholder: 'Search', value: filter.search, 'aria-label': 'Search expenses',
      onInput: (event) => { filter.search = event.target.value; clearTimeout(searchInput.timer); searchInput.timer = setTimeout(() => { draw(); root.querySelector('.budget-filters__search')?.focus(); }, 250); },
    });
    const total = shown.reduce((sum, e) => sum + (e.kind === 'income' ? 0 : e.amount), 0);
    return [
      h('div', { class: 'budget-filters' },
        chip('all', 'All'), group ? chip('mine', 'Involves me') : null, group ? chip('shared', 'Shared') : null, chip('in', 'Money in'),
        h('select', {
          class: 'input input--compact', 'aria-label': 'Category',
          onChange: (event) => { filter.categoryId = event.target.value; draw(); },
        }, h('option', { value: '' }, 'All categories'), data.categories.map((c) => h('option', { value: c.id, selected: c.id === filter.categoryId }, c.name))),
        searchInput),
      shown.length ? h('p', { class: 'budget-muted' }, `${shown.length} ${shown.length === 1 ? 'entry' : 'entries'} · ${fmt(total)} spent`) : null,
      days.length ? days.map((day) => h('section', { class: 'budget-day' },
        h('h3', { class: 'budget-day__date' }, day.date === todayKey() ? 'Today' : formatShortDate(day.date)),
        h('ul', { class: 'budget-ledger' }, day.entries.map((entry) => ledgerRow(data, entry)))))
        : h('p', { class: 'module-empty' }, data.entries.length ? 'Nothing matches.' : 'Nothing written down yet. Add what you spend (or receive) with + Add expense.'),
    ];
  }

  // ─── Balances ──────────────────────────────────────────────────────────────

  function renderBalances(data) {
    const fmt = money(data);
    const memberIds = memberIdsOf(context);
    const everyone = everyoneFor(data, memberIds);
    const list = balances(data, memberIds).sort((a, b) => Number(b.memberId === me.id) - Number(a.memberId === me.id) || b.net - a.net);
    const inDefault = data.split.memberIds.length ? data.split.memberIds : everyone;
    const name = h('input', { type: 'text', class: 'input input--compact', placeholder: 'Name', 'aria-label': 'Name of someone to add' });
    const used = (id) => data.entries.some((e) => e.paidBy === id || (e.split?.ids ?? []).includes(id)) || data.transfers.some((t) => t.from === id || t.to === id);
    return [
      h('section', { class: 'budget-panel' },
        h('h3', { class: 'budget-panel__title' }, 'Settle up'),
        renderSettleUp(context, update) ?? h('p', { class: 'module-empty' }, 'Nothing shared yet. Split an expense to start keeping track.'),
        h('p', { class: 'budget-muted' }, 'The fewest payments that even everyone out. 3den only keeps track; send money however you usually do.')),
      h('section', { class: 'budget-panel' },
        h('h3', { class: 'budget-panel__title' }, 'Everyone'),
        h('ul', { class: 'budget-balances' }, list.map((b) => {
          const isOpen = openPerson === b.memberId;
          return h('li', { class: `budget-balance${isOpen ? ' is-open' : ''}` },
            h('button', {
              type: 'button', class: 'budget-balance__row', 'aria-expanded': String(isOpen),
              onClick: () => { openPerson = isOpen ? null : b.memberId; draw(); },
            },
            faceOf(context, b.memberId, 32),
            h('span', { class: 'budget-balance__who' },
              h('strong', {}, nameOf(context, b.memberId, { first: false })),
              h('span', { class: 'budget-muted' }, `paid ${fmt(b.paid)} · share ${fmt(b.share)}${b.sent || b.received ? ` · paid back ${fmt(b.sent)} · got back ${fmt(b.received)}` : ''}`)),
            h('span', { class: `budget-balance__net${b.net > 50 ? ' is-good' : b.net < -50 ? ' is-over' : ''}` },
              Math.abs(b.net) <= 50 ? 'Even' : b.net > 0 ? `gets back ${fmt(b.net)}` : `owes ${fmt(-b.net)}`),
            icon(isOpen ? 'chevronUp' : 'chevronDown', 14)),
            isOpen && b.memberId !== me.id ? renderPersonHistory(context, me.id, b.memberId) : null,
            isOpen && b.memberId === me.id ? h('p', { class: 'budget-muted budget-balance__self' }, 'Open someone else to see what’s between you.') : null);
        }))),
      data.transfers.length ? h('section', { class: 'budget-panel' },
        h('h3', { class: 'budget-panel__title' }, `Payments (${data.transfers.length})`),
        h('ul', { class: 'budget-ledger budget-ledger--compact' }, [...data.transfers].sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at).map((tr) => h('li', { class: 'budget-ledger__row' },
          h('span', { class: 'budget-settle__faces' }, faceOf(context, tr.from, 22), h('span', { class: 'budget-settle__arrow', 'aria-hidden': 'true' }, '→'), faceOf(context, tr.to, 22)),
          h('span', { class: 'budget-ledger__what' },
            h('span', { class: 'budget-ledger__note' }, `${nameOf(context, tr.from)} paid ${nameOf(context, tr.to).replace(/^You$/, 'you')}`),
            h('span', { class: 'budget-ledger__cat' }, [tr.method, tr.note, formatShortDate(tr.date)].filter(Boolean).join(' · '))),
          h('span', { class: 'budget-ledger__amount' }, fmt(tr.amount)),
          canEdit ? h('button', {
            type: 'button', class: 'icon-button icon-button--subtle', 'aria-label': 'Remove this payment',
            onClick: () => updateWithUndo('Removed the payment.', (saved) => { saved.transfers = saved.transfers.filter((x) => x.id !== tr.id); }),
          }, icon('close', 14)) : null)))) : null,
      h('section', { class: 'budget-panel' },
        h('h3', { class: 'budget-panel__title' }, 'Sharing'),
        h('label', { class: 'settings-toggle' },
          h('input', { type: 'checkbox', checked: data.split.on, disabled: !canEdit, onChange: (event) => update((saved) => { saved.split.on = event.target.checked; }) }),
          ' Split new expenses evenly by default'),
        everyone.length > 1 ? h('div', { class: 'budget-split__who', role: 'group', 'aria-label': 'Who’s in by default' },
          h('span', { class: 'budget-field__label' }, 'Who’s in by default'),
          everyone.map((id) => h('label', { class: `chip budget-filter${inDefault.includes(id) ? ' is-on' : ''}` },
            h('input', {
              type: 'checkbox', class: 'visually-hidden', checked: inDefault.includes(id), disabled: !canEdit,
              onChange: (event) => update((saved) => {
                const current = saved.split.memberIds.length ? saved.split.memberIds : everyone;
                const next = event.target.checked ? [...new Set([...current, id])] : current.filter((x) => x !== id);
                saved.split.memberIds = next.length === everyone.length ? [] : next;
              }),
            }),
            faceOf(context, id, 18), ` ${nameOf(context, id)}`))) : null,
        h('span', { class: 'budget-field__label' }, 'People outside the group'),
        data.people.length ? h('ul', { class: 'budget-outsiders' }, data.people.map((person) => h('li', {},
          faceOf(context, person.id, 22), ` ${person.name}`,
          canEdit && !used(person.id) ? h('button', { type: 'button', class: 'link-button link-button--danger', onClick: () => update((saved) => { saved.people = saved.people.filter((p) => p.id !== person.id); saved.split.memberIds = saved.split.memberIds.filter((x) => x !== person.id); }) }, 'Remove') : null)))
          : h('p', { class: 'budget-muted' }, 'Splitting with a friend who isn’t here? Add them by name. They don’t need a 3den account.'),
        canEdit ? h('form', {
          class: 'form-row',
          onSubmit: (event) => {
            event.preventDefault();
            if (!name.value.trim()) { name.focus(); return; }
            update((saved) => { addPerson(saved, name.value); });
            showToast('Added. They can be in on costs and paybacks now.');
          },
        }, name, h('button', { type: 'submit', class: 'button button--small' }, icon('plus', 14), ' Add')) : null),
    ];
  }

  // ─── Plan ──────────────────────────────────────────────────────────────────

  function renderPlan(data) {
    const fmt = money(data);
    const t = totals(data);
    const next = nextTitleFor(data.title);
    const table = (kind, heading) => {
      const rows = t.rows.filter((r) => r.category.kind === kind);
      const name = h('input', { type: 'text', class: 'input input--compact', placeholder: kind === 'income' ? 'e.g. Ticket sales' : 'e.g. Snacks', 'aria-label': `New ${heading.toLowerCase()} category` });
      const planned = h('input', { type: 'text', inputmode: 'decimal', class: 'input input--compact budget-cats__money', placeholder: '0', 'aria-label': 'Planned amount' });
      const sum = rows.reduce((s, r) => s + r.category.planned, 0);
      return h('section', { class: 'budget-panel' },
        h('h3', { class: 'budget-panel__title' }, heading, h('span', { class: 'budget-muted' }, `${fmt(sum)} ${kind === 'income' ? 'expected' : 'planned'}`)),
        rows.length ? h('ul', { class: 'budget-cats' }, rows.map(({ category, actual, over }) => h('li', { class: `budget-cats__row${over ? ' is-over' : ''}` },
          h('input', {
            type: 'text', class: 'input input--compact budget-cats__name', value: category.name, disabled: !canEdit, 'aria-label': 'Category name',
            onChange: (event) => update((saved) => { saved.categories.find((c) => c.id === category.id).name = event.target.value.trim() || category.name; }, { redraw: false }),
          }),
          h('input', {
            type: 'text', inputmode: 'decimal', class: 'input input--compact budget-cats__money', value: (category.planned / 100).toString(), disabled: !canEdit, 'aria-label': `Planned for ${category.name}`,
            onChange: (event) => { const cents = parseMoney(event.target.value); if (cents != null) update((saved) => { saved.categories.find((c) => c.id === category.id).planned = cents; }); },
          }),
          h('span', { class: 'budget-cats__actual' }, `${fmt(actual)} ${kind === 'income' ? 'in' : 'spent'}`),
          category.planned ? progressBar(actual, category.planned, { over, label: category.name }) : h('span'),
          canEdit ? h('button', {
            type: 'button', class: 'icon-button icon-button--subtle', 'aria-label': `Remove ${category.name}`,
            onClick: () => updateWithUndo(`Removed ${category.name}.`, (saved) => { saved.categories = saved.categories.filter((c) => c.id !== category.id); }),
          }, icon('close', 14)) : null)))
          : h('p', { class: 'module-empty' }, 'None yet.'),
        canEdit ? h('form', {
          class: 'form-row budget-cats__add',
          onSubmit: (event) => {
            event.preventDefault();
            if (!name.value.trim()) { name.focus(); return; }
            update((saved) => { saved.categories.push({ id: makeId('bc'), name: name.value.trim(), kind, planned: parseMoney(planned.value) ?? 0 }); });
          },
        }, name, planned, h('button', { type: 'submit', class: 'button button--small' }, icon('plus', 14), ' Add')) : null);
    };
    return [
      h('div', { class: 'budget-columns' }, table('expense', 'Spending'), table('income', 'Money coming in')),
      h('section', { class: 'budget-panel' },
        h('h3', { class: 'budget-panel__title' }, 'Settings'),
        h('div', { class: 'form-row' },
          h('label', { class: 'budget-field budget-field--inline' }, h('span', {}, 'Currency'),
            h('select', { class: 'input input--compact', disabled: !canEdit, onChange: (event) => update((saved) => { saved.currency = event.target.value; }) },
              CURRENCIES.map((c) => h('option', { value: c, selected: c === data.currency }, c)))),
          data.goal || templateOf(data)?.id === 'fundraiser' ? h('label', { class: 'budget-field budget-field--inline' }, h('span', {}, 'Goal'),
            h('input', {
              type: 'text', inputmode: 'decimal', class: 'input input--compact budget-cats__money', value: (data.goal / 100).toString(), disabled: !canEdit,
              onChange: (event) => { const cents = parseMoney(event.target.value); if (cents != null) update((saved) => { saved.goal = cents; }); },
            })) : null),
        canEdit && hasPeriods(data) ? h('p', {}, h('button', {
          type: 'button', class: 'button button--small',
          onClick: () => updateWithUndo(`Started ${next}. ${data.title} is under Earlier.`, (saved) => startNextPeriod(saved, next, memberIdsOf(context))),
        }, `Start ${next}`), h('span', { class: 'budget-muted' }, ' Keeps this one’s totals below and starts fresh with the same plan. Unsettled balances carry over as payments to make.')) : null,
        data.past.length ? h('ul', { class: 'budget-past' }, data.past.map((p) => h('li', {},
          h('strong', {}, p.title), ` · in ${fmt(p.income)} · out ${fmt(p.spent)} · `,
          h('span', { class: p.income - p.spent < 0 ? 'is-over' : '' }, `${p.income - p.spent < 0 ? 'short' : 'left over'} ${fmt(Math.abs(p.income - p.spent))}`)))) : null,
        canEdit ? h('p', {}, h('button', {
          type: 'button', class: 'link-button',
          onClick: () => updateWithUndo('Back to choosing a template.', (saved) => { saved.template = null; }),
        }, 'Start over with another template')) : null),
    ];
  }

  draw();
  container.append(root);
}
