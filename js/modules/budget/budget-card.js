// @ts-check
/**
 * budget-card.js — the Budget module on a homepage.
 *
 *   November 2026                                   Household
 *   $1,240 spent of $2,800                      $1,560 left
 *   [██████████░░░░░░░░░░░]
 *   ┌───────────────────────────────────────────────┐
 *   │ You’re owed $42.10                 Settle up → │   ← shared costs only
 *   │ (MM) → (LL) Maya owes you $42.10  Remind  Mark paid
 *   └───────────────────────────────────────────────┘
 *   Rent          $1,400 / $1,400  ▇▇▇▇▇▇▇▇▇▇
 *   Groceries       $212 / $350    ▇▇▇▇▇▇░░░░
 *   Latest: Farmers market · $41.80 · you paid, split 4 ways
 *   [ 0.00 ][ What for? ][ Groceries ▾ ][Add] Split…
 *   Full budget
 *
 * A new Budget asks what it's for first (budget-parts.js). A Fundraiser
 * shows its goal; a Group event linked to an event shows the cost per
 * person going.
 */

import { emptyState } from '../../ui/empty-state.js';
import { h, replaceChildren } from '../../ui/dom.js';
import { findEvent } from '../../state/events.js';
import { eventHref } from '../../events/event-details.js';
import { normalizeBudget, totals, templateOf, balances, isShared, sharesOf } from './budget-data.js';
import { renderTemplatePicker, progressBar, quickAdd, renderSettleUp, money, memberIdsOf, nameOf } from './budget-parts.js';

const CARD_CATEGORIES = 4;

export function renderBudgetCard(container, context) {
  const root = h('div', { class: 'budget' });
  const me = context.currentUser;

  function update(changeFn) {
    const data = structuredClone(normalizeBudget(context.getData()));
    changeFn(data);
    context.saveData(data);
    draw();
  }

  function draw() {
    const raw = context.getData() ?? {};
    if (!raw.template) {
      replaceChildren(root, renderTemplatePicker(context, (data) => { context.saveData(data); draw(); }));
      return;
    }
    const data = normalizeBudget(raw);
    const fmt = money(data);
    const t = totals(data);
    const template = templateOf(data);
    const memberIds = memberIdsOf(context);
    const expenses = t.rows.filter((r) => r.category.kind === 'expense')
      .sort((a, b) => Number(b.actual > 0) - Number(a.actual > 0) || b.category.planned - a.category.planned)
      .slice(0, CARD_CATEGORIES);
    const linked = data.eventId ? findEvent(data.eventId) : null;
    const going = linked ? Object.values(linked.event.rsvps ?? {}).filter((a) => a === 'going').length : 0;
    const anyShared = data.split.on || data.entries.some((e) => isShared(e, data, memberIds));
    const mine = anyShared ? balances(data, memberIds).find((b) => b.memberId === me.id) : null;
    const latest = [...data.entries].sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at)[0];

    replaceChildren(root,
      h('div', { class: 'budget__top' },
        h('span', { class: 'budget__title' }, data.title),
        template ? h('span', { class: 'budget__kind' }, `${template.icon} ${template.label}`) : null),
      data.goal
        ? [
          h('p', { class: 'budget__headline' }, h('strong', {}, fmt(t.income)), h('span', { class: 'budget-muted' }, ` raised of ${fmt(data.goal)}`),
            h('span', { class: 'budget__left' }, t.income >= data.goal ? 'Goal reached!' : `${fmt(data.goal - t.income)} to go`)),
          progressBar(t.income, data.goal, { label: 'Raised so far' }),
        ]
        : [
          h('p', { class: 'budget__headline' }, h('strong', {}, fmt(t.spent)), h('span', { class: 'budget-muted' }, t.plannedSpend ? ` spent of ${fmt(t.plannedSpend)}` : ' spent'),
            t.plannedSpend ? h('span', { class: `budget__left${t.left < 0 ? ' is-over' : ''}` }, t.left < 0 ? `${fmt(-t.left)} over` : `${fmt(t.left)} left`) : null),
          t.plannedSpend ? progressBar(t.spent, t.plannedSpend, { over: t.left < 0, label: 'Spent so far' }) : null,
        ],
      linked && going ? h('p', { class: 'budget-muted budget__per-person' },
        `${going} going to `, h('a', { href: eventHref(linked.event.id) }, linked.event.title), ` · about ${fmt(Math.round((t.spent || t.plannedSpend) / going))} each`) : null,
      mine ? h('div', { class: `budget-you${mine.net > 50 ? ' is-owed' : mine.net < -50 ? ' is-owing' : ''}` },
        h('div', { class: 'budget-you__head' },
          h('strong', {}, mine.net > 50 ? `You’re owed ${fmt(mine.net)}` : mine.net < -50 ? `You owe ${fmt(-mine.net)}` : 'You’re all square'),
          h('button', { type: 'button', class: 'link-button', onClick: () => context.openFullPage() }, 'Balances →')),
        Math.abs(mine.net) > 50 ? renderSettleUp(context, update, { onlyMine: true }) : null) : null,
      expenses.length ? h('ul', { class: 'budget__rows' }, expenses.map((row) => h('li', { class: `budget__row${row.over ? ' is-over' : ''}` },
        h('span', { class: 'budget__row-name' }, row.category.name),
        h('span', { class: 'budget__row-amount' }, fmt(row.actual), row.category.planned ? h('span', { class: 'budget-muted' }, ` / ${fmt(row.category.planned)}`) : null),
        row.category.planned ? progressBar(row.actual, row.category.planned, { over: row.over, label: row.category.name }) : h('span'))))
        : emptyState({ icon: 'wallet', title: 'No categories yet', text: 'Add categories like Rent or Food, then write down what you spend.', action: context.openFullPage ? { label: 'Set up the budget', onClick: () => context.openFullPage() } : null }),
      latest ? h('p', { class: 'budget__latest budget-muted' }, 'Latest: ',
        h('span', { class: 'budget__latest-what' }, latest.note || data.categories.find((c) => c.id === latest.categoryId)?.name || 'Something'),
        ` · ${fmt(latest.amount)} · ${nameOf(context, latest.paidBy).replace(/^You$/, 'you')} ${latest.kind === 'income' ? 'received' : 'paid'}`,
        isShared(latest, data, memberIds) ? `, split ${Object.keys(sharesOf(latest, data, memberIds)).length} ways` : '') : null,
      context.isVisitor ? null : quickAdd(context, { onAdd: update }),
      h('button', { type: 'button', class: 'link-button budget__more', onClick: () => context.openFullPage() }, 'Full budget →'));
  }

  draw();
  container.append(root);
}
