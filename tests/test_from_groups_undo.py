"""
From groups on the Feed (Nov 18): two items at a time; answering one (an
RSVP, a vote, taking a task, Not for me) clears it at once, the next one
moves up, and a small Undo line at the top puts it back.
"""
from playwright.sync_api import sync_playwright
import os
os.makedirs('test-output/out', exist_ok=True)
fails = []


def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok:
        fails.append(label)


def rows(pg):
    return pg.evaluate("[...document.querySelectorAll('.needs__row')].map(r => r.className.replace('needs__row needs__row--', '') + '|' + r.querySelector('.needs__text').innerText.slice(0, 60))")


def total(pg):
    return int(pg.locator('.needs__count').inner_text())


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    errs = []
    for label, opts in [('computer', dict(viewport={'width': 1300, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True))]:
        pg = b.new_page(**opts)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
        pg.evaluate("location.hash='#feed'"); pg.wait_for_timeout(1000)
        start = rows(pg)
        n = total(pg)
        check(len(start) == 2 and n > 2, f'{label}: two items shown of {n}')
        first, second = start
        # Answer the first, whatever kind it is.
        row = pg.locator('.needs__row').first
        kind = first.split('|')[0]
        if kind == 'rsvp':
            row.get_by_role('button', name='Going').first.click()
        elif kind == 'task':
            row.get_by_role('button', name='I’ll do it').click()
        elif kind in ('poll', 'signup'):
            row.locator('.needs__choice').first.click()
        elif kind == 'announcement':
            row.get_by_role('button', name='Mark read').click()
        else:
            row.locator('.needs__actions button').first.click()
        pg.wait_for_timeout(500)
        after = rows(pg)
        check(first not in after and after[0] == second, f'{label}: the answered {kind} is gone and the next moves up ({after[0][:40]!r})')
        check(total(pg) == n - 1 and len(after) == 2, f'{label}: one fewer, still two shown ({total(pg)})')
        undo = pg.locator('.needs__undo')
        check(undo.count() == 1 and undo.locator('button', has_text='Undo').count() == 1, f'{label}: a small Undo line at the top ({undo.inner_text().strip()[:50]!r})')
        top = pg.evaluate("(() => { const u = document.querySelector('.needs__undo'), l = document.querySelector('.needs__list'); return u && l && u.getBoundingClientRect().top < l.getBoundingClientRect().top; })()")
        check(top, f'{label}: Undo sits above the items')
        pg.screenshot(path=f'test-output/out/from-groups-undo-{label}.png')
        undo.get_by_role('button', name='Undo').click(); pg.wait_for_timeout(500)
        back = rows(pg)
        check(back[0] == first and total(pg) == n and pg.locator('.needs__undo').count() == 0, f'{label}: Undo puts it back ({back[0][:40]!r})')
        # Not for me, too.
        pg.locator('.needs__row').first.get_by_role('button', name='Not for me').click(); pg.wait_for_timeout(400)
        check(total(pg) == n - 1 and pg.locator('.needs__undo', has_text='Hidden').count() == 1, f'{label}: Not for me clears it with Undo')
        pg.get_by_role('button', name='Undo').click(); pg.wait_for_timeout(400)
        check(total(pg) == n, f'{label}: and Undo brings it back')
        check(pg.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'{label}: nothing runs off the side')
        pg.close()
    check(not errs, f'no page errors {errs}')
    b.close()
print('PASS' if not fails else f'FAILED: {fails}')
