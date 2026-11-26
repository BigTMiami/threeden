// @ts-check
/**
 * about-module.js — "About" on a blog: who this is, in their own words.
 *
 *   (LL)  Leo L  @leo
 *         Urban policy student. Guitar in Porch Lights.
 *         I fix bikes at the Saturday pantry and write about housing…
 *         Ask me about  [bike repair] [zoning] [pedalboards]
 *         📍 Eastside    🔗 Porch Lights on Bandcamp
 *         In  Porch Lights · Eastside Mutual Aid       (public groups, if you choose)
 *
 * The blog's owner edits it in place (Edit). Data:
 *   { headline: '', text: '', askMeAbout: ['bike repair'], links: [{ label, url }], showGroups: false }
 * The name, photo, and area come from their account; the groups listed are
 * the public ones they're in.
 *
 * On a group's public page (Nov 20) it's the group's About instead: the
 * group's name, description, and member count, then what its admins write
 * ("Ask us about" and links too). Whoever may edit the group's name and
 * description (editDetails) edits it. showGroups doesn't apply there.
 */

import { blogShownIn } from '../../state/groups.js';
import { h, replaceChildren } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { avatar } from '../../ui/avatar.js';
import { renderText } from '../../ui/text.js';
import { getSpaceOfModule, getMember, getSpaces } from '../../state/store.js';
import { areaOf } from '../../state/events.js';
import { isPublicGroup } from '../../state/group-access.js';

const safeUrl = (url) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

function render(container, context) {
  const space = getSpaceOfModule(context.moduleId);
  if (space?.kind === 'group') { renderForGroup(container, context, space); return; }
  const owner = getMember(space?.memberIds[0]);
  const canEdit = !context.isVisitor && owner?.id === context.currentUser.id;
  let editing = false;
  const root = h('div', { class: 'about-block' });

  function view() {
    const d = context.getData();
    const area = owner ? areaOf(owner)?.label : null;
    // Only if they chose to list them (it tells strangers which groups they're in).
    const groups = d.showGroups ? getSpaces().filter((s) => s.kind === 'group' && s.memberIds.includes(owner?.id) && isPublicGroup(s) && blogShownIn(s, owner.id)) : [];
    const empty = !d.headline && !d.text && !(d.askMeAbout ?? []).length && !(d.links ?? []).length;
    return [
      h('div', { class: 'about-block__who' },
        avatar(owner, 64),
        h('div', {},
          h('p', { class: 'about-block__name' }, h('strong', {}, owner?.name ?? 'Someone'), owner?.username ? h('span', { class: 'about-block__handle' }, ` @${owner.username}`) : null),
          d.headline || owner?.bio ? h('p', { class: 'about-block__headline' }, d.headline || owner.bio) : null)),
      d.text ? h('p', { class: 'about-block__text' }, renderText(d.text)) : null,
      (d.askMeAbout ?? []).length ? h('div', { class: 'about-block__row' }, h('span', { class: 'about-block__label' }, 'Ask me about'), h('span', { class: 'about-block__chips' }, d.askMeAbout.map((t) => h('span', { class: 'chip' }, t)))) : null,
      area || (d.links ?? []).length ? h('div', { class: 'about-block__row about-block__facts' },
        area ? h('span', {}, icon('pin', 13), ` ${area}`) : null,
        (d.links ?? []).map((l) => h('a', { href: safeUrl(l.url), target: '_blank', rel: 'noopener noreferrer me' }, icon('link', 13), ` ${l.label || l.url.replace(/^https?:\/\//, '')}`))) : null,
      groups.length ? h('div', { class: 'about-block__row' }, h('span', { class: 'about-block__label' }, 'In'), h('span', {}, groups.map((g, i) => [i ? ' · ' : '', h('a', { href: `#space-${g.id}` }, g.name)]))) : null,
      canEdit ? h('div', { class: 'about-block__edit' },
        empty ? h('span', { class: 'about-block__hint' }, 'Say a little about yourself: what you do, what you care about, what people can ask you.') : null,
        h('button', { type: 'button', class: 'button button--small', onClick: () => { editing = true; draw(); } }, icon('pencil', 12), empty ? ' Write your About' : ' Edit')) : null,
    ];
  }

  function editor() {
    const d = context.getData();
    const headline = h('input', { type: 'text', class: 'input', maxlength: '120', value: d.headline ?? '', placeholder: owner?.bio || 'One line about you', 'aria-label': 'Headline' });
    const text = h('textarea', { class: 'input', rows: '4', maxlength: '1200', placeholder: 'A few sentences. #tags and @mentions work.', 'aria-label': 'About you' });
    text.value = d.text ?? '';
    const ask = h('input', { type: 'text', class: 'input', value: (d.askMeAbout ?? []).join(', '), placeholder: 'bike repair, zoning, pedalboards', 'aria-label': 'Ask me about (separate with commas)' });
    const links = h('textarea', { class: 'input', rows: '3', placeholder: 'One per line: Label | https://…', 'aria-label': 'Links' });
    const showGroups = h('input', { type: 'checkbox', checked: Boolean(d.showGroups) });
    links.value = (d.links ?? []).map((l) => (l.label ? `${l.label} | ${l.url}` : l.url)).join('\n');
    const field = (label, control, hint) => h('label', { class: 'settings-field' }, h('span', { class: 'settings-field__label' }, label), control, hint ? h('span', { class: 'settings-field__hint' }, hint) : null);
    return h('form', {
      class: 'about-block__form',
      onSubmit: (event) => {
        event.preventDefault();
        context.saveData({
          headline: headline.value.trim(),
          text: text.value.trim(),
          askMeAbout: ask.value.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 8),
          links: links.value.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 6).map((line) => {
            const [a, b] = line.split('|').map((x) => x.trim());
            return b ? { label: a, url: b } : { label: '', url: a };
          }),
          showGroups: showGroups.checked,
        });
        editing = false;
        draw();
      },
    },
    field('Headline', headline, 'Shown under your name. Leave empty to use your bio.'),
    field('About you', text),
    field('Ask me about', ask, 'A few topics, separated with commas.'),
    field('Links', links, 'Up to six. “Label | address”, or just the address.'),
    h('label', { class: 'settings-check' }, showGroups, ' List the public groups I’m in', h('span', { class: 'settings-field__hint' }, ' Anyone who reads your blog will see them. Private groups are never listed.')),
    h('div', { class: 'form-row' },
      h('button', { type: 'submit', class: 'button button--primary button--small' }, 'Save'),
      h('button', { type: 'button', class: 'link-button', onClick: () => { editing = false; draw(); } }, 'Cancel')));
  }

  function draw() { replaceChildren(root, editing ? editor() : view()); }
  draw();
  replaceChildren(container, root);
}

/** The group's About: the same block, about the group. */
function renderForGroup(container, context, space) {
  const canEdit = !context.isVisitor && context.can('editDetails');
  let editing = false;
  const root = h('div', { class: 'about-block about-block--group' });
  const members = space.memberIds?.length ?? 0;

  function view() {
    const d = context.getData();
    const empty = !d.headline && !d.text && !(d.askMeAbout ?? []).length && !(d.links ?? []).length;
    return [
      h('div', { class: 'about-block__who' },
        h('span', { class: 'about-block__badge', 'aria-hidden': 'true' }, icon('people', 28)),
        h('div', {},
          h('p', { class: 'about-block__name' }, h('strong', {}, space.name), h('span', { class: 'about-block__handle' }, ` · ${members === 1 ? '1 member' : `${members} members`}`)),
          d.headline || space.description ? h('p', { class: 'about-block__headline' }, d.headline || space.description) : null)),
      d.text ? h('p', { class: 'about-block__text' }, renderText(d.text)) : null,
      (d.askMeAbout ?? []).length ? h('div', { class: 'about-block__row' }, h('span', { class: 'about-block__label' }, 'Ask us about'), h('span', { class: 'about-block__chips' }, d.askMeAbout.map((t) => h('span', { class: 'chip' }, t)))) : null,
      (d.links ?? []).length ? h('div', { class: 'about-block__row about-block__facts' },
        d.links.map((l) => h('a', { href: safeUrl(l.url), target: '_blank', rel: 'noopener noreferrer' }, icon('link', 13), ` ${l.label || l.url.replace(/^https?:\/\//, '')}`))) : null,
      canEdit ? h('div', { class: 'about-block__edit' },
        empty ? h('span', { class: 'about-block__hint' }, 'Tell visitors who you are, what you do, and how to reach you.') : null,
        h('button', { type: 'button', class: 'button button--small', onClick: () => { editing = true; draw(); } }, icon('pencil', 12), empty ? ' Write the group’s About' : ' Edit')) : null,
    ];
  }

  function editor() {
    const d = context.getData();
    const headline = h('input', { type: 'text', class: 'input', maxlength: '120', value: d.headline ?? '', placeholder: space.description || 'One line about the group', 'aria-label': 'Headline' });
    const text = h('textarea', { class: 'input', rows: '4', maxlength: '1200', placeholder: 'A few sentences. #tags and @mentions work.', 'aria-label': 'About the group' });
    text.value = d.text ?? '';
    const ask = h('input', { type: 'text', class: 'input', value: (d.askMeAbout ?? []).join(', '), placeholder: 'booking, lessons, merch', 'aria-label': 'Ask us about (separate with commas)' });
    const links = h('textarea', { class: 'input', rows: '3', placeholder: 'One per line: Label | https://…', 'aria-label': 'Links' });
    links.value = (d.links ?? []).map((l) => (l.label ? `${l.label} | ${l.url}` : l.url)).join('\n');
    const field = (label, control, hint) => h('label', { class: 'settings-field' }, h('span', { class: 'settings-field__label' }, label), control, hint ? h('span', { class: 'settings-field__hint' }, hint) : null);
    return h('form', {
      class: 'about-block__form',
      onSubmit: (event) => {
        event.preventDefault();
        context.saveData({
          ...d,
          headline: headline.value.trim(),
          text: text.value.trim(),
          askMeAbout: ask.value.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 8),
          links: links.value.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 6).map((line) => {
            const [a, b] = line.split('|').map((x) => x.trim());
            return b ? { label: a, url: b } : { label: '', url: a };
          }),
        });
        editing = false;
        draw();
      },
    },
    field('Headline', headline, 'Shown under the group’s name. Leave empty to use its description.'),
    field('About the group', text),
    field('Ask us about', ask, 'A few topics, separated with commas.'),
    field('Links', links, 'Up to six. “Label | address”, or just the address.'),
    h('div', { class: 'form-row' },
      h('button', { type: 'submit', class: 'button button--primary button--small' }, 'Save'),
      h('button', { type: 'button', class: 'link-button', onClick: () => { editing = false; draw(); } }, 'Cancel')));
  }

  function draw() { replaceChildren(root, editing ? editor() : view()); }
  draw();
  replaceChildren(container, root);
}

export const aboutModule = {
  type: 'about',
  label: 'About',
  description: 'Who you are, what people can ask you about, and your links',
  icon: 'user',
  defaultSpan: 4,
  defaultRows: 10,
  available: true,
  spaceKinds: ['blog', 'group'],  // a group's public page only (js/modules/module-lists.js)
  createInitialData: () => ({ headline: '', text: '', askMeAbout: [], links: [], showGroups: false }),
  render,
};
