/**
 * budget-parts.js — pieces the Budget card and full page share.
 *
 *   renderTemplatePicker(context, onPick)    "What's this budget for?"
 *   progressBar(value, max, { over })        a bar, red when over
 *   quickAdd(context, { onAdd, openFull })   one line: amount, what for, category, [Add]
 *   openExpenseSheet(context, { entry, onSave })   add or edit an expense, with
 *                                            who paid and how it's split
 *   openPaymentSheet(context, { from, to, amount, onSave })   record a payback
 *   renderSettleUp(context, onChange, { onlyMine })   who owes whom: [Record payment] [Remind]
 *   renderPersonHistory(context, a, b)       why two people owe each other
 *   nameOf(context, id), faceOf(context, id) people in the group or added to the budget
 *   money(data) → (cents) => "$12.50" in the budget's currency
 */

import { h, replaceChildren } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { avatar } from '../../ui/avatar.js';
import { showToast } from '../../ui/toast.js';
import { todayKey, formatShortDate } from '../../utils/dates.js';
import { getSpace } from '../../state/store.js';
import { openDirectConversation, sendMessage } from '../../state/messages.js';
import { initialsFor } from '../../state/accounts.js';
import { upcomingEventsIn } from '../dashboard/dashboard-data.js';
import {
  templatesFor, applyTemplate, formatMoney, parseMoney, addEntry, addTransfer, addPerson, balances, settleUp, normalizeBudget,
  SPLIT_MODES, defaultSplitIds, everyoneFor, splitOf, sharesOf, between, PAY_METHODS,
} from './budget-data.js';

export const money = (data) => (cents, options) => formatMoney(cents, normalizeBudget(data).currency, options);

/** The space's members (just you on a homepage). */
export const memberIdsOf = (context) => context.members.map((m) => m.id);

/** Everyone who can be in on a cost: members, plus people added to this budget. */
export const everyoneIn = (context) => everyoneFor(context.getData(), memberIdsOf(context));

const outsider = (context, id) => normalizeBudget(context.getData()).people.find((p) => p.id === id);

export function nameOf(context, id, { you = true, first = true } = {}) {
  if (you && id === context.currentUser.id) return 'You';
  const member = context.getMember(id);
  if (member) return first ? member.name.split(' ')[0] : member.name;
  return outsider(context, id)?.name ?? 'Someone';
}

/** An avatar, or a gray initials badge for someone added just to this budget. */
export function faceOf(context, id, size = 24) {
  const member = context.getMember(id);
  if (member) return avatar(member, size);
  const name = outsider(context, id)?.name ?? '?';
  return h('span', { class: 'avatar budget-face--outside', style: { width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.4)}px` }, title: `${name} (not on 3den)` }, initialsFor(name));
}

// ─── "What's this budget for?" ───────────────────────────────────────────────

export function renderTemplatePicker(context, onPick) {
  const space = getSpace(context.spaceId);
  const events = space ? upcomingEventsIn(space).slice(0, 8) : [];
  const eventSelect = events.length ? h('select', { class: 'input input--compact', 'aria-label': 'Which event' },
    h('option', { value: '' }, 'Not linked to an event'),
    events.map(({ event, date }) => h('option', { value: event.id }, `${event.title} (${date})`))) : null;

  const pick = (template) => {
    const chosen = events.find(({ event }) => event.id === eventSelect?.value)?.event;
    const linked = template.id === 'event' && chosen ? { eventId: chosen.id, eventTitle: chosen.title } : {};
    onPick(applyTemplate(context.getData(), template.id, linked));
  };

  return h('div', { class: 'budget-templates' },
    h('p', { class: 'budget-templates__question' }, 'What’s this budget for?'),
    h('p', { class: 'budget-templates__hint' }, 'Pick a starting point. You can rename, add, or remove anything later.'),
    h('div', { class: 'budget-templates__grid' }, templatesFor(context.spaceKind).map((template) => h('button', {
      type: 'button', class: 'budget-template', disabled: context.isVisitor, onClick: () => pick(template),
    },
    h('span', { class: 'budget-template__icon', 'aria-hidden': 'true' }, template.icon),
    h('span', { class: 'budget-template__text' },
      h('strong', {}, template.label),
      h('span', {}, template.description))))),
    eventSelect ? h('label', { class: 'budget-templates__event' }, h('span', {}, 'For Group event, link it to: '), eventSelect) : null);
}

// ─── Small parts ─────────────────────────────────────────────────────────────

export function progressBar(value, max, { over = false, label = '' } = {}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return h('div', {
    class: `budget-bar${over ? ' is-over' : ''}`,
    role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(max), 'aria-valuenow': String(value), 'aria-label': label || undefined,
  }, h('span', { class: 'budget-bar__fill', style: { width: `${pct}%` } }));
}

/** A panel over the page (a sheet from the bottom on phones). Returns close(). */
function openSheet(heading, content) {
  const previousFocus = document.activeElement;
  const overlay = h('div', { class: 'sub-viewer budget-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': heading },
    h('div', { class: 'sub-viewer__panel budget-sheet__panel' },
      h('div', { class: 'sub-viewer__top' },
        h('h2', { class: 'sub-viewer__title' }, heading),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: () => close() }, icon('close', 18))),
      content));
  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    if (previousFocus?.isConnected) previousFocus.focus?.();
  }
  function onKey(event) { if (event.key === 'Escape') { event.stopPropagation(); close(); } }
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  overlay.querySelector('input, select, button:not(.icon-button)')?.focus();
  return close;
}

// ─── Adding money in or out ──────────────────────────────────────────────────

/**
 * The card's one line: amount, what for, category, Add. A shared budget
 * splits it the usual way (evenly, everyone in); "Split…" opens the sheet.
 */
export function quickAdd(context, { onAdd }) {
  const data = normalizeBudget(context.getData());
  const me = context.currentUser;
  const amount = h('input', { type: 'text', inputmode: 'decimal', class: 'input input--compact budget-add__amount', placeholder: '0.00', 'aria-label': 'Amount' });
  const note = h('input', { type: 'text', class: 'input input--compact budget-add__note', placeholder: 'What for?', 'aria-label': 'What for' });
  const categories = data.categories.filter((c) => c.kind === 'expense');
  const categorySelect = h('select', { class: 'input input--compact', 'aria-label': 'Category' },
    categories.length ? categories.map((c) => h('option', { value: c.id }, c.name)) : h('option', { value: '' }, 'No categories'));
  const shared = data.split.on && everyoneIn(context).length > 1;
  return h('form', {
    class: 'budget-add',
    onSubmit: (event) => {
      event.preventDefault();
      const cents = parseMoney(amount.value);
      if (!cents || cents <= 0) { amount.focus(); showToast('Enter an amount, like 12.50'); return; }
      if (!categorySelect.value) { showToast('Add a category first, on the full budget.'); return; }
      onAdd((saved) => addEntry(saved, {
        kind: 'expense', categoryId: categorySelect.value, amount: cents, note: note.value, paidBy: me.id, by: me.id,
        split: shared ? { mode: 'equal', ids: defaultSplitIds(saved, memberIdsOf(context)) } : { mode: 'solo', ids: [me.id] },
      }));
      showToast(shared ? `Added, paid by you, split ${defaultSplitIds(data, memberIdsOf(context)).length} ways.` : 'Added.');
      amount.value = '';
      note.value = '';
    },
  },
  amount, note, categorySelect,
  h('button', { type: 'submit', class: 'button button--small button--primary', disabled: context.isVisitor }, 'Add'),
  h('button', { type: 'button', class: 'link-button budget-add__more', onClick: () => openExpenseSheet(context, { onSave: onAdd }) }, shared ? 'Split…' : 'More…'));
}

/**
 * Add (or edit) an expense or money received:
 *
 *   [Spent | Received]
 *   Amount [ 84.00 ]   What for [ Groceries run ]
 *   Category [Food ▾]  Date [Nov 12]
 *   Paid by  (LL You) (MM Maya) (OT Owen) (+ Someone else)
 *   Split    [Evenly | Exact amounts | By shares | Not shared]
 *     ☑ You     $21.00
 *     ☑ Maya    $21.00
 *     ☐ Owen     —
 *   Adds up ✓ / $4.00 left to assign
 *                                   [Cancel] [Add expense]
 */
export function openExpenseSheet(context, { entry = null, onSave }) {
  const data = normalizeBudget(context.getData());
  const fmt = money(data);
  const me = context.currentUser;
  const memberIds = memberIdsOf(context);
  let people = everyoneIn(context);
  const isGroup = people.length > 1;
  let kind = entry?.kind ?? 'expense';
  let paidBy = entry?.paidBy ?? me.id;
  const start = entry ? splitOf(entry, data, memberIds) : (data.split.on && isGroup ? { mode: 'equal', ids: defaultSplitIds(data, memberIds) } : { mode: 'solo', ids: [me.id] });
  let mode = start.mode;
  const ids = new Set(start.mode === 'solo' ? defaultSplitIds(data, memberIds) : start.ids);
  const exact = { ...(start.amounts ?? {}) };
  const shares = { ...(start.shares ?? {}) };

  const amount = h('input', { type: 'text', inputmode: 'decimal', class: 'input', value: entry ? (entry.amount / 100).toString() : '', placeholder: '0.00', 'aria-label': 'Amount', onInput: () => drawSplit() });
  const note = h('input', { type: 'text', class: 'input', value: entry?.note ?? '', placeholder: 'e.g. Groceries for the party', 'aria-label': 'What for' });
  const date = h('input', { type: 'date', class: 'input', value: entry?.date ?? todayKey(), 'aria-label': 'Date' });
  const categorySelect = h('select', { class: 'input', 'aria-label': 'Category' });
  const kindRow = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Spent or received' });
  const payerRow = h('div', { class: 'budget-people', role: 'radiogroup', 'aria-label': 'Paid by' });
  const splitArea = h('div', { class: 'budget-split-editor' });
  const error = h('p', { class: 'form-error', role: 'alert' });

  const cents = () => parseMoney(amount.value) ?? 0;

  function drawKind() {
    replaceChildren(kindRow, [['expense', 'Spent'], ['income', 'Received']].map(([id, label]) => h('button', {
      type: 'button', class: `segmented__option${id === kind ? ' is-active' : ''}`, 'aria-pressed': String(id === kind),
      onClick: () => { kind = id; drawKind(); drawCategories(); drawPayer(); drawSplit(); },
    }, label)));
  }
  function drawCategories() {
    const list = data.categories.filter((c) => c.kind === kind);
    const current = entry?.categoryId;
    replaceChildren(categorySelect, list.length ? list.map((c) => h('option', { value: c.id, selected: c.id === current }, c.name)) : h('option', { value: '' }, 'No categories yet'));
  }
  function drawPayer() {
    if (!isGroup) { payerRow.closest('.budget-sheet__row')?.setAttribute('hidden', ''); return; }
    replaceChildren(payerRow,
      people.map((id) => h('button', {
        type: 'button', role: 'radio', class: `budget-person${id === paidBy ? ' is-on' : ''}`, 'aria-checked': String(id === paidBy),
        onClick: () => { paidBy = id; drawPayer(); drawSplit(); },
      }, faceOf(context, id, 22), ` ${nameOf(context, id)}`)),
      addSomeoneButton((person) => { people = [...people, person.id]; ids.add(person.id); drawPayer(); drawSplit(); }));
  }
  function addSomeoneButton(onAdded) {
    return h('button', {
      type: 'button', class: 'budget-person budget-person--add',
      onClick: (event) => {
        const input = h('input', { type: 'text', class: 'input input--compact', placeholder: 'Their name', 'aria-label': 'Name of someone else' });
        const form = h('span', { class: 'budget-person__new' }, input,
          h('button', {
            type: 'button', class: 'button button--small',
            onClick: () => {
              if (!input.value.trim()) { input.focus(); return; }
              const before = structuredClone(context.getData());
              const next = structuredClone(normalizeBudget(before));
              const person = addPerson(next, input.value);
              context.saveData(next);
              data.people = next.people;
              onAdded(person);
            },
          }, 'Add'));
        event.currentTarget.replaceWith(form);
        input.focus();
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); form.querySelector('button').click(); } });
      },
    }, icon('plus', 12), ' Someone else');
  }

  function partsNow() {
    const fake = { kind: 'expense', amount: cents(), paidBy, split: currentSplit() };
    return mode === 'solo' ? { [paidBy]: cents() } : sharesOf(fake, data, memberIds);
  }
  function currentSplit() {
    const list = people.filter((id) => ids.has(id));
    if (mode === 'solo') return { mode: 'solo', ids: [paidBy] };
    if (mode === 'exact') return { mode, ids: list, amounts: Object.fromEntries(list.map((id) => [id, exact[id] ?? 0])) };
    if (mode === 'shares') return { mode, ids: list, shares: Object.fromEntries(list.map((id) => [id, shares[id] ?? 1])) };
    return { mode, ids: list };
  }

  function drawSplit() {
    if (kind === 'income' || !isGroup) { replaceChildren(splitArea); splitArea.hidden = true; return; }
    splitArea.hidden = false;
    const parts = partsNow();
    const assigned = mode === 'exact' ? people.filter((id) => ids.has(id)).reduce((sum, id) => sum + (exact[id] ?? 0), 0) : cents();
    const gap = cents() - assigned;
    replaceChildren(splitArea,
      h('div', { class: 'segmented budget-split-editor__modes', role: 'group', 'aria-label': 'How to split it' }, SPLIT_MODES.map((m) => h('button', {
        type: 'button', class: `segmented__option${m.id === mode ? ' is-active' : ''}`, 'aria-pressed': String(m.id === mode),
        onClick: () => { mode = m.id; drawSplit(); },
      }, m.label))),
      mode === 'solo'
        ? h('p', { class: 'budget-muted' }, `${nameOf(context, paidBy)} ${paidBy === me.id ? 'cover' : 'covers'} it. Nobody owes anything for this one.`)
        : h('ul', { class: 'budget-split-editor__people' }, people.map((id) => {
          const on = ids.has(id);
          const toggle = h('input', { type: 'checkbox', checked: on, 'aria-label': `Include ${nameOf(context, id)}`, onChange: (event) => { if (event.target.checked) ids.add(id); else ids.delete(id); drawSplit(); } });
          let control;
          if (mode === 'exact' && on) {
            control = h('input', {
              type: 'text', inputmode: 'decimal', class: 'input input--compact budget-split-editor__amount', value: exact[id] != null ? (exact[id] / 100).toString() : '', placeholder: '0.00', 'aria-label': `Amount for ${nameOf(context, id)}`,
              onChange: (event) => { exact[id] = parseMoney(event.target.value) ?? 0; drawSplit(); },
            });
          } else if (mode === 'shares' && on) {
            control = h('span', { class: 'budget-stepper' },
              h('button', { type: 'button', class: 'icon-button icon-button--subtle', 'aria-label': 'Fewer shares', onClick: () => { shares[id] = Math.max(0, (shares[id] ?? 1) - 1); drawSplit(); } }, '−'),
              h('span', {}, `${shares[id] ?? 1}×`),
              h('button', { type: 'button', class: 'icon-button icon-button--subtle', 'aria-label': 'More shares', onClick: () => { shares[id] = (shares[id] ?? 1) + 1; drawSplit(); } }, '+'));
          }
          return h('li', { class: `budget-split-editor__person${on ? '' : ' is-off'}` },
            h('label', { class: 'budget-split-editor__who' }, toggle, faceOf(context, id, 22), ` ${nameOf(context, id)}`),
            control,
            h('span', { class: 'budget-split-editor__part' }, on && mode !== 'exact' ? fmt(parts[id] ?? 0) : on ? '' : '—'));
        })),
      mode === 'exact' ? h('p', { class: `budget-split-editor__check${gap === 0 ? ' is-ok' : ' is-over'}` },
        gap === 0 ? '✓ Adds up' : gap > 0 ? `${fmt(gap)} left to assign` : `${fmt(-gap)} too much`) : null,
      mode === 'equal' && ids.size > 1 && cents() ? h('p', { class: 'budget-muted' }, `${fmt(Math.floor(cents() / ids.size))} each, ${ids.size} ways.`) : null);
  }

  const save = h('button', { type: 'submit', class: 'button button--primary' }, entry ? 'Save' : kind === 'income' ? 'Add' : 'Add expense');
  const form = h('form', {
    class: 'budget-sheet__form',
    onSubmit: (event) => {
      event.preventDefault();
      const total = cents();
      if (!total || total <= 0) { error.textContent = 'Enter an amount.'; amount.focus(); return; }
      if (!categorySelect.value) { error.textContent = 'Add a category first.'; return; }
      const split = kind === 'income' || !isGroup ? null : currentSplit();
      if (split && split.mode !== 'solo' && !split.ids.length) { error.textContent = 'Pick at least one person to split it with.'; return; }
      if (split?.mode === 'exact' && Object.values(split.amounts).reduce((a, b) => a + b, 0) !== total) { error.textContent = 'The amounts need to add up to the total.'; return; }
      const fields = { kind, categoryId: categorySelect.value, amount: total, note: note.value.trim(), date: date.value || todayKey(), paidBy: kind === 'income' ? paidBy : paidBy, split };
      onSave((saved) => {
        if (entry) {
          const index = saved.entries.findIndex((e) => e.id === entry.id);
          if (index !== -1) {
            saved.entries[index] = { ...saved.entries[index], ...fields };
            if (!split) delete saved.entries[index].split;
          }
        } else {
          addEntry(saved, { ...fields, by: me.id });
        }
      });
      close();
      if (!entry && split && split.mode !== 'solo') showToast(`Added. ${split.ids.filter((id) => id !== paidBy).length} ${split.ids.filter((id) => id !== paidBy).length === 1 ? 'person owes' : 'people owe'} ${nameOf(context, paidBy, { you: true }).replace(/^You$/, 'you')} for it.`);
    },
  },
  h('div', { class: 'budget-sheet__row' }, kindRow),
  h('div', { class: 'budget-sheet__grid' },
    h('label', { class: 'budget-field' }, h('span', {}, 'Amount'), amount),
    h('label', { class: 'budget-field' }, h('span', {}, 'What for'), note),
    h('label', { class: 'budget-field' }, h('span', {}, 'Category'), categorySelect),
    h('label', { class: 'budget-field' }, h('span', {}, 'Date'), date)),
  isGroup ? h('div', { class: 'budget-sheet__row' }, h('span', { class: 'budget-field__label' }, kind === 'income' ? 'Received by' : 'Paid by'), payerRow) : null,
  isGroup ? h('div', { class: 'budget-sheet__row' }, h('span', { class: 'budget-field__label' }, 'Split'), splitArea) : null,
  error,
  h('div', { class: 'form-row form-row--end' }, h('button', { type: 'button', class: 'button button--quiet', onClick: () => close() }, 'Cancel'), save));

  drawKind();
  drawCategories();
  drawPayer();
  drawSplit();
  const close = openSheet(entry ? 'Edit' : 'Add an expense', form);
  amount.focus();
}

// ─── Paying each other back ──────────────────────────────────────────────────

/** Record a payback (cash, Venmo…). Prefilled from Settle up. */
export function openPaymentSheet(context, { from, to, amount = 0, onSave }) {
  const fmt = money(context.getData());
  const people = everyoneIn(context);
  const fromSelect = h('select', { class: 'input', 'aria-label': 'Who paid' }, people.map((id) => h('option', { value: id, selected: id === from }, nameOf(context, id, { first: false }))));
  const toSelect = h('select', { class: 'input', 'aria-label': 'Paid to' }, people.map((id) => h('option', { value: id, selected: id === to }, nameOf(context, id, { first: false }))));
  const amountInput = h('input', { type: 'text', inputmode: 'decimal', class: 'input', value: amount ? (amount / 100).toFixed(2) : '', 'aria-label': 'Amount' });
  const method = h('select', { class: 'input', 'aria-label': 'How' }, h('option', { value: '' }, 'How? (optional)'), PAY_METHODS.map((m) => h('option', { value: m }, m)));
  const note = h('input', { type: 'text', class: 'input', placeholder: 'Note (optional)', 'aria-label': 'Note' });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const form = h('form', {
    class: 'budget-sheet__form',
    onSubmit: (event) => {
      event.preventDefault();
      const cents = parseMoney(amountInput.value);
      if (!cents || cents <= 0) { error.textContent = 'Enter an amount.'; return; }
      if (fromSelect.value === toSelect.value) { error.textContent = 'Pick two different people.'; return; }
      onSave((saved) => addTransfer(saved, { from: fromSelect.value, to: toSelect.value, amount: cents, method: method.value, note: note.value }));
      close();
      showToast(`Recorded: ${nameOf(context, fromSelect.value)} paid ${nameOf(context, toSelect.value).replace(/^You$/, 'you')} ${fmt(cents)}.`);
    },
  },
  h('div', { class: 'budget-sheet__grid' },
    h('label', { class: 'budget-field' }, h('span', {}, 'Who paid'), fromSelect),
    h('label', { class: 'budget-field' }, h('span', {}, 'To'), toSelect),
    h('label', { class: 'budget-field' }, h('span', {}, 'Amount'), amountInput),
    h('label', { class: 'budget-field' }, h('span', {}, 'How'), method)),
  note, error,
  h('p', { class: 'budget-muted' }, 'This just keeps track. Send the money however you usually do.'),
  h('div', { class: 'form-row form-row--end' }, h('button', { type: 'button', class: 'button button--quiet', onClick: () => close() }, 'Cancel'), h('button', { type: 'submit', class: 'button button--primary' }, 'Record payment')));
  const close = openSheet('Record a payment', form);
}

/** A friendly nudge in Messages (people on 3den only). */
function remind(context, p) {
  const me = context.currentUser;
  const fmt = money(context.getData());
  const data = normalizeBudget(context.getData());
  const conversation = openDirectConversation(me.id, p.from);
  sendMessage(conversation.id, me.id, `Hey! Just a reminder: you owe ${p.to === me.id ? 'me' : nameOf(context, p.to, { you: false })} ${fmt(p.amount)} for “${data.title}”. No rush. 🙂`);
  showToast(`Sent ${nameOf(context, p.from)} a reminder in Messages.`);
}

/**
 * Who owes whom, fewest payments first. On the card, only lines with you
 * (or "You're all square"). Each line: [Record payment] (and [Remind] when
 * they owe you and they're on 3den).
 */
export function renderSettleUp(context, onChange, { onlyMine = false } = {}) {
  const data = normalizeBudget(context.getData());
  const fmt = money(data);
  const me = context.currentUser;
  const list = balances(data, memberIdsOf(context));
  let payments = settleUp(list);
  if (onlyMine) payments = payments.filter((p) => p.from === me.id || p.to === me.id);
  if (!payments.length) {
    const anyShared = list.some((b) => b.paid > 0);
    return anyShared ? h('p', { class: 'budget-square' }, icon('check', 14), onlyMine ? ' You’re all square.' : ' Everyone’s square.') : null;
  }
  return h('ul', { class: 'budget-settle' }, payments.map((p) => {
    const mineToPay = p.from === me.id;
    const owedToMe = p.to === me.id;
    return h('li', { class: `budget-settle__row${mineToPay ? ' is-mine' : owedToMe ? ' is-owed' : ''}` },
      h('span', { class: 'budget-settle__faces' }, faceOf(context, p.from, 24), h('span', { class: 'budget-settle__arrow', 'aria-hidden': 'true' }, '→'), faceOf(context, p.to, 24)),
      h('span', { class: 'budget-settle__text' },
        `${nameOf(context, p.from)} ${mineToPay ? 'owe' : 'owes'} ${owedToMe ? 'you' : nameOf(context, p.to)} `,
        h('strong', {}, fmt(p.amount))),
      context.isVisitor ? null : h('span', { class: 'budget-settle__actions' },
        owedToMe && context.getMember(p.from) ? h('button', { type: 'button', class: 'link-button', onClick: () => remind(context, p) }, 'Remind') : null,
        h('button', { type: 'button', class: 'button button--small', onClick: () => openPaymentSheet(context, { ...p, onSave: onChange }) }, mineToPay ? 'I paid' : 'Mark paid')));
  }));
}

/** Why two people owe each other: each shared cost and payback between them. */
export function renderPersonHistory(context, a, b) {
  const data = normalizeBudget(context.getData());
  const fmt = money(data);
  const { net, lines } = between(data, a, b, memberIdsOf(context));
  const nameOfCat = (id) => data.categories.find((c) => c.id === id)?.name ?? 'Other';
  return h('div', { class: 'budget-history' },
    h('p', { class: 'budget-history__sum' }, Math.abs(net) < 50 ? 'Even between you.' : net > 0 ? `${nameOf(context, b)} ${b === context.currentUser.id ? 'owe' : 'owes'} ${nameOf(context, a).replace(/^You$/, 'you')} ${fmt(net)}` : `${nameOf(context, a)} ${a === context.currentUser.id ? 'owe' : 'owes'} ${nameOf(context, b).replace(/^You$/, 'you')} ${fmt(-net)}`),
    lines.length ? h('ul', { class: 'budget-history__list' }, lines.map((line) => h('li', {},
      h('span', { class: 'budget-history__date' }, formatShortDate(line.date)),
      h('span', { class: 'budget-history__what' }, line.entry
        ? `${line.entry.note || nameOfCat(line.entry.categoryId)} · ${nameOf(context, line.entry.paidBy)} paid ${fmt(line.entry.amount)}`
        : `${nameOf(context, line.transfer.from)} paid back${line.transfer.method ? ` (${line.transfer.method})` : ''}`),
      h('span', { class: `budget-history__amount${line.amount < 0 ? ' is-neg' : ''}` }, fmt(line.amount, { sign: true }))))) : h('p', { class: 'budget-muted' }, 'Nothing shared between you yet.'));
}
