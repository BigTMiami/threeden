"""
Platform sweep (Nov 18): menus that open off screen or under something, and
choices that can't be picked. On a computer and a phone, it visits every
space and tab, every module's full page (one in ten of the generated year
groups, like sweep_signed_in.py), the app's own pages, and a few pages in
edit mode, and:

1. Menus: clicks each distinct button that opens something (aria-haspopup,
   aria-expanded, or a "+"/"Add"/"…"/"More" button), then checks every menu,
   popover, sheet, or dialog that appeared: all of it inside the screen (above
   the phone tab bar), and each item in its visible part is the element under
   its own middle (nothing covering it, no ancestor clipping it).
2. Choices: every visible radio button and checkbox: its label or box is the
   element under its middle (it can be tapped), and a disabled one is listed
   with its label so it can be checked for a reason on screen.

Each distinct menu (by its button's class and text) is checked once per
screen size. Prints problems; exits non-zero if any.
"""
from playwright.sync_api import sync_playwright
import json
import os
import sys
os.makedirs('test-output/out', exist_ok=True)

APP_PAGES = ['#feed', '#messages', '#messages-new', '#new-group', '#groups', '#groups-explore', '#friends', '#saved', '#search', '#help',
             '#account', '#account-notifications', '#account-privacy', '#account-calendars', '#account-blog', '#account-children',
             '#blog-leo', '#new-event-juniper', '#settings-juniper', '#settings-juniper--members', '#settings-juniper--permissions',
             '#settings-juniper--appearance', '#settings-juniper--moderation', '#settings-juniper--health', '#settings-tenants']
EDIT_PAGES = ['#space-juniper', '#space-porchlights', '#space-tenants']

TRIGGERS_JS = r"""() => {
  const root = document.body;
  const seen = new Set();
  const out = [];
  const els = [...root.querySelectorAll('button, [role=button], summary')].filter(b => {
    if (b.closest('dialog[open], .tab-bar')) return false;
    const r = b.getBoundingClientRect();
    if (!r.width || !r.height || getComputedStyle(b).visibility === 'hidden') return false;
    if (b.disabled) return false;
    const t = (b.innerText || b.getAttribute('aria-label') || '').trim();
    const opens = b.hasAttribute('aria-haspopup') || b.getAttribute('aria-expanded') === 'false' || b.tagName === 'SUMMARY'
      || /^(\+|…|⋯)$/.test(t) || /^(\+ ?)?(Add|More|New)\b/.test(t) || /(menu|more|options|add)/i.test(b.getAttribute('aria-label') || '');
    return opens;
  });
  for (const b of els) {
    const t = (b.innerText || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    const key = (b.className || b.tagName) + '|' + t.replace(/\d+/g, '#');
    if (seen.has(key)) continue;
    seen.add(key);
    b.dataset.sweepId = String(out.length);
    out.push({ id: out.length, key, text: t });
  }
  return out;
}"""

POPUPS_JS = r"""() => {
  const sel = '[role=menu], [role=listbox], [role=dialog], dialog[open], .media-attach__menu, [class*="__menu"], [class*="-menu"], [class*="popover"], [class*="dropdown"], [class*="sheet"]';
  return [...document.querySelectorAll(sel)].filter(el => {
    if (el.matches('button, a, input, select, textarea, li, span, svg') && !el.matches('[role=menu],[role=listbox],[role=dialog]')) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 20 && r.height > 20 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.hidden && !el.closest('[hidden]');
  });
}"""

CHECK_JS = r"""(ids) => {
  const sel = '[role=menu], [role=listbox], [role=dialog], dialog[open], .media-attach__menu, [class*="__menu"], [class*="-menu"], [class*="popover"], [class*="dropdown"], [class*="sheet"]';
  const bar = document.querySelector('.tab-bar');
  const barTop = bar && bar.getClientRects().length ? bar.getBoundingClientRect().top : Infinity;
  const bottom = Math.min(innerHeight, barTop);
  const all = [...document.querySelectorAll(sel)].filter(el => {
    if (el.matches('button, a, input, select, textarea, li, span, svg') && !el.matches('[role=menu],[role=listbox],[role=dialog]')) return false;
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return r.width > 20 && r.height > 20 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.hidden && !el.closest('[hidden]');
  });
  const fresh = all.filter(el => !el.dataset.sweepSeen);
  // Only the outermost new popups.
  const top = fresh.filter(el => !fresh.some(o => o !== el && o.contains(el)));
  const problems = [];
  for (const el of top) {
    const r = el.getBoundingClientRect();
    const isSheetOrDialog = el.matches('dialog, [role=dialog]') || /sheet|modal/.test(el.className);
    const name = (el.getAttribute('aria-label') || el.className || el.tagName).toString().slice(0, 50);
    const limitBottom = el.matches('dialog') || el.closest('dialog') || /sheet/.test(el.className) ? innerHeight : bottom;
    const out = [];
    if (r.left < -1) out.push('left ' + Math.round(r.left));
    if (r.top < -1) out.push('top ' + Math.round(r.top));
    if (r.right > innerWidth + 1) out.push('right +' + Math.round(r.right - innerWidth));
    if (!isSheetOrDialog && r.bottom > limitBottom + 1) out.push('bottom +' + Math.round(r.bottom - limitBottom));
    // Items in the visible part of the popup must be what's under their middle.
    const vis = { top: Math.max(r.top, 0), bottom: Math.min(r.bottom, limitBottom), left: Math.max(r.left, 0), right: Math.min(r.right, innerWidth) };
    const covered = [];
    for (const item of el.querySelectorAll('[role=menuitem], [role=menuitemradio], [role=option], button, a[href], input, select')) {
      const b = item.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      if (cy < vis.top || cy > vis.bottom || cx < vis.left || cx > vis.right) continue;
      // Scrolled out of an inner scroller: not visible, fine.
      let clipped = false;
      for (let p = item.parentElement; p && p !== el.parentElement; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (/(auto|scroll|hidden)/.test(cs.overflowY + cs.overflowX)) { const pr = p.getBoundingClientRect(); if (cy < pr.top || cy > pr.bottom || cx < pr.left || cx > pr.right) { clipped = true; break; } }
      }
      if (clipped) continue;
      const hit = document.elementFromPoint(cx, cy);
      if (!hit || !(item.contains(hit) || hit.contains(item) || (item.labels && [...item.labels].some(l => l.contains(hit))) || (hit.tagName === 'LABEL' && hit.contains(item)))) {
        covered.push((item.innerText || item.getAttribute('aria-label') || item.value || item.tagName).trim().split('\n')[0].slice(0, 30) + ' ← ' + (hit ? (hit.className || hit.tagName).toString().slice(0, 40) : 'nothing'));
      }
    }
    if (covered.length) out.push('covered: ' + covered.slice(0, 4).join('; '));
    if (out.length) problems.push(name + ': ' + out.join(', '));
  }
  return { opened: top.length, problems };
}"""

CHOICES_JS = r"""() => {
  const bar = document.querySelector('.tab-bar');
  const barTop = bar && bar.getClientRects().length ? bar.getBoundingClientRect().top : Infinity;
  const problems = [], disabled = [];
  for (const input of document.querySelectorAll('input[type=radio], input[type=checkbox]')) {
    const label = input.closest('label') || (input.labels && input.labels[0]);
    const target = label || input;
    const r = target.getBoundingClientRect();
    if (!r.width || !r.height || input.closest('[hidden]') || getComputedStyle(target).visibility === 'hidden') continue;
    const text = (label ? label.innerText : input.getAttribute('aria-label') || input.name || '').trim().split('\n')[0].slice(0, 40);
    if (input.disabled) { disabled.push(text); continue; }
    // Check the box itself, or the label's first line, wherever it's on screen.
    const box = (getComputedStyle(input).opacity === '0' || input.getBoundingClientRect().width < 2 ? target : input).getBoundingClientRect();
    const cx = box.left + box.width / 2, cy = box.top + Math.min(box.height / 2, 12);
    if (cy < 0 || cy > Math.min(innerHeight, barTop) || cx < 0 || cx > innerWidth) continue;
    const hit = document.elementFromPoint(cx, cy);
    const ok = hit && (target.contains(hit) || hit === input || (input.labels && [...input.labels].some(l => l.contains(hit))));
    if (!ok) problems.push(text + ' ← ' + (hit ? (hit.className || hit.tagName).toString().slice(0, 40) : 'nothing'));
  }
  return { problems, disabled };
}"""


def mark_seen(pg):
    pg.evaluate(f"(() => {{ const f = {POPUPS_JS}; for (const el of f()) el.dataset.sweepSeen = '1'; }})()")


def close_all(pg, hsh):
    pg.keyboard.press('Escape'); pg.wait_for_timeout(80)
    pg.evaluate("document.querySelectorAll('dialog[open]').forEach(d => { try { d.close(); } catch {} d.remove(); }); document.documentElement.classList.remove('has-modal')")
    if pg.evaluate('location.hash') != hsh:
        pg.evaluate(f"location.hash = '{hsh}'"); pg.wait_for_timeout(250)
    pg.mouse.click(2, 2); pg.wait_for_timeout(60)


report = {'menus': [], 'choices': [], 'disabled': {}, 'errors': []}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for label, opts in [('computer', dict(viewport={'width': 1300, 'height': 860})), ('phone', dict(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True))]:
        pg = b.new_page(**opts)
        pg.on('pageerror', lambda e: report['errors'].append(f'{label}: {e}'))
        pg.on('dialog', lambda d: d.dismiss())
        pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(600)
        pages = pg.evaluate("""async () => { const { getSpaces } = await import('./js/state/store.js'); return getSpaces().filter((s, i) => !(s.id.startsWith('y-grp-') || s.id.startsWith('blog-y-') || s.id.startsWith('grow-')) || i % 10 === 0).flatMap(s => [ '#space-'+s.id, ...(s.tabs || []).slice(1).map(t => '#space-'+s.id+'--'+t.id), ...s.modules.map(m => '#module-'+m.id) ]); }""")
        pages = APP_PAGES + pages + [('edit', h) for h in EDIT_PAGES]
        tested = set()
        opened = 0
        for entry in pages:
            edit = isinstance(entry, tuple)
            hsh = entry[1] if edit else entry
            pg.evaluate(f"location.hash = '{hsh}'"); pg.wait_for_timeout(300)
            if edit:
                try:
                    pg.locator('#space-header').get_by_role('button', name='Edit', exact=True).first.click(); pg.wait_for_timeout(150)
                    pg.get_by_role('menuitem', name='Edit this page').click(); pg.wait_for_timeout(400)
                except Exception as e:
                    report['menus'].append(f'{label} {hsh}: could not enter edit mode ({str(e)[:60]})'); continue
            where = f'{label} {hsh}{" (editing)" if edit else ""}'
            ch = pg.evaluate(CHOICES_JS)
            for prob in ch['problems']:
                report['choices'].append(f'{where}: {prob}')
            for d in ch['disabled']:
                report['disabled'].setdefault(d, []).append(where)
            triggers = pg.evaluate(TRIGGERS_JS)
            for t in triggers:
                key = t['key'] + ('|edit' if edit else '')
                if key in tested:
                    continue
                tested.add(key)
                mark_seen(pg)
                btn = pg.locator(f'[data-sweep-id="{t["id"]}"]').first
                try:
                    if not btn.count():
                        continue
                    btn.scroll_into_view_if_needed(timeout=1500)
                    btn.click(timeout=1500); pg.wait_for_timeout(250)
                except Exception:
                    close_all(pg, hsh); continue
                if pg.evaluate('location.hash') != hsh and not pg.evaluate("!!document.querySelector('dialog[open]')"):
                    close_all(pg, hsh)
                    if edit:
                        break
                    continue
                res = pg.evaluate(CHECK_JS, None)
                opened += res['opened']
                for prob in res['problems']:
                    report['menus'].append(f'{where} [{t["text"]}]: {prob}')
                    pg.screenshot(path=f'test-output/out/sweep-menu-{len(report["menus"])}.png')
                close_all(pg, hsh)
            if edit:
                try:
                    pg.locator('#space-header').get_by_role('button', name='Done editing').click(timeout=1500); pg.wait_for_timeout(200)
                except Exception:
                    pass
        print(f'{label}: {len(pages)} pages, {len(tested)} distinct buttons tried, {opened} menus checked')
        pg.close()
    b.close()

print('\nMENU PROBLEMS', len(report['menus']))
for m in report['menus']:
    print('  ', m)
print('\nCHOICES THAT CAN\'T BE TAPPED', len(report['choices']))
for c in sorted(set(report['choices'])):
    print('  ', c)
print('\nDISABLED CHOICES (check each has a reason on screen)', len(report['disabled']))
for text, where in sorted(report['disabled'].items()):
    print('  ', repr(text), '·', len(where), 'page(s), e.g.', where[0])
print('\nPAGE ERRORS', report['errors'][:10])
json.dump(report, open('test-output/sweep-menus-choices.json', 'w'), indent=1)
sys.exit(1 if report['menus'] or report['choices'] or report['errors'] else 0)
