# Budget rework: splits, people outside the group, paybacks, tabs, Daylight default.
import os; os.makedirs('test-output', exist_ok=True)
from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for vw in [1300, 400]:
        pg=b.new_page(viewport={'width':vw,'height':1000}); pg.on('pageerror', lambda e: errs.append(str(e)))
        hv=pg.locator('#homepage-view'); mv=pg.locator('#module-page-view')
        pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_timeout(500)
        print(vw, 'theme:', pg.evaluate("document.documentElement.dataset.theme"), pg.evaluate("getComputedStyle(document.body).fontFamily.slice(0,20)"))
        pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(600)
        card=hv.locator('.module-frame', has=pg.locator('.budget')).first
        card.scroll_into_view_if_needed(); pg.wait_for_timeout(200)
        print(' card:', card.locator('.budget').inner_text().replace('\n',' / ')[:330])
        card.screenshot(path=f'test-output/t110_card_{vw}.png')
        # Full page tabs
        pg.evaluate("location.hash='#module-larsen-budget'"); pg.wait_for_timeout(600)
        print(' tabs:', mv.locator('.budget-tabs__tab').all_inner_texts())
        print(' tiles:', mv.locator('.budget-tile').all_inner_texts())
        print(' settle:', mv.locator('.budget-settle__row .budget-settle__text').all_inner_texts())
        pg.screenshot(path=f'test-output/t110_overview_{vw}.png', full_page=True)
        mv.get_by_role('tab', name='Expenses').click(); pg.wait_for_timeout(200)
        print(' expense rows:', mv.locator('.budget-ledger__row').count(), '|', mv.locator('.budget-ledger__cat').all_inner_texts()[:3])
        mv.get_by_role('button', name='Shared', exact=True).click(); pg.wait_for_timeout(200)
        print(' shared filter rows:', mv.locator('.budget-ledger__row').count())
        pg.screenshot(path=f'test-output/t110_expenses_{vw}.png', full_page=True)
        # Add an expense with exact split + add someone else
        mv.get_by_role('button', name='Add expense').click(); pg.wait_for_timeout(200)
        sh=pg.locator('.budget-sheet')
        sh.get_by_label('Amount').fill('30'); sh.get_by_label('What for').fill('Ice')
        sh.locator('.budget-person--add').click(); sh.get_by_placeholder('Their name').fill('Cousin Dag'); sh.locator('.budget-person__new button').click(); pg.wait_for_timeout(200)
        print(' people now:', sh.locator('.budget-people .budget-person').all_inner_texts())
        sh.get_by_role('button', name='Exact amounts').click(); pg.wait_for_timeout(100)
        # uncheck all but me and Dag
        for row in sh.locator('.budget-split-editor__person').all():
            t=row.inner_text()
            if 'You' not in t and 'Dag' not in t:
                cb=row.locator('input[type=checkbox]')
                if cb.is_checked(): cb.uncheck(); pg.wait_for_timeout(30)
        amts=sh.locator('.budget-split-editor__amount')
        amts.nth(0).fill('10'); amts.nth(0).press('Tab'); pg.wait_for_timeout(80)
        print(' check before:', sh.locator('.budget-split-editor__check').inner_text())
        sh.locator('.budget-split-editor__amount').nth(1).fill('20'); sh.locator('.budget-split-editor__amount').nth(1).press('Tab'); pg.wait_for_timeout(80)
        print(' check after:', sh.locator('.budget-split-editor__check').inner_text())
        pg.screenshot(path=f'test-output/t110_sheet_{vw}.png')
        sh.get_by_role('button', name='Add expense').click(); pg.wait_for_timeout(300)
        # Balances tab
        mv.get_by_role('tab', name='Balances').click(); pg.wait_for_timeout(200)
        print(' balances:', [x.replace('\n',' ') for x in mv.locator('.budget-balance__row').all_inner_texts()][:8])
        mv.locator('.budget-balance__row', has_text='Cousin Dag').click(); pg.wait_for_timeout(150)
        print(' history:', mv.locator('.budget-history').inner_text().replace('\n',' | ')[:200])
        pg.screenshot(path=f'test-output/t110_balances_{vw}.png', full_page=True)
        # Record payment from settle up
        n=mv.locator('.budget-settle__row').count()
        mv.locator('.budget-settle__row').first.locator('button.button').click(); pg.wait_for_timeout(150)
        pg.locator('.budget-sheet').get_by_label('How').select_option('Venmo')
        pg.locator('.budget-sheet').get_by_role('button', name='Record payment').click(); pg.wait_for_timeout(300)
        print(' settle rows', n, '->', mv.locator('.budget-settle__row').count(), '| payments section:', mv.locator('.budget-panel__title', has_text='Payments').inner_text())
        # Remind
        rem=mv.locator('.budget-settle__row', has_text='owes you').get_by_role('button', name='Remind')
        if rem.count(): rem.first.click(); pg.wait_for_timeout(200); print(' remind toast:', pg.locator('.toast').last.inner_text())
        # Plan tab + next period carry-over on house
        pg.evaluate("location.hash='#module-house-budget'"); pg.wait_for_timeout(600)
        mv.get_by_role('tab', name='Plan').click(); pg.wait_for_timeout(200)
        before=pg.evaluate("(async()=>{const s=await import('./js/state/store.js');const d=await import('./js/modules/budget/budget-data.js');const m=s.getModule('house-budget');return d.settleUp(d.balances(m.data,['m-leo','m-maya','m-owen','m-theo']))})()")
        mv.locator('button', has_text='Start ').first.click(); pg.wait_for_timeout(300)
        after=pg.evaluate("(async()=>{const s=await import('./js/state/store.js');const d=await import('./js/modules/budget/budget-data.js');const m=s.getModule('house-budget');return [m.data.title, d.settleUp(d.balances(m.data,['m-leo','m-maya','m-owen','m-theo'])), d.totals(m.data).spent]})()")
        print(' carry over same debts:', before==after[1], after[0], 'spent', after[2])
        pg.screenshot(path=f'test-output/t110_plan_{vw}.png', full_page=True)
        print(' overflow:', pg.evaluate('document.documentElement.scrollWidth - innerWidth'))
        pg.close()
    b.close()
print('ERRORS', errs)
