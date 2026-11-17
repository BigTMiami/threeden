# The New post box: the text box starts two lines tall, grows with what you write (to about ten lines), then scrolls.
# Once a photo, video, vault file, event, or poll is added, a preview of the whole post, as the Feed will show it, sits at the
# top, and follows as you type. Posting clears it. A poll's fields sit above the text too.
# Editing a post: everything attached stays above, and the words are edited underneath it.
from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
from PIL import Image
Image.new('RGB', (640, 480), (90, 140, 200)).save('/tmp/composer-photo.png')
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_selector('.app-bar', timeout=20000); pg.wait_for_timeout(500)
    pg.evaluate("location.hash='#module-leo-feed'"); pg.wait_for_timeout(1000)
    v=pg.locator('#module-page-view')
    v.get_by_role('button', name='New post').first.click(); pg.wait_for_timeout(400)
    t=pg.locator('.feed-composer__text'); prev=pg.locator('.feed-composer__preview')
    h0=t.bounding_box()['height']; print('empty: height', round(h0), '| preview', prev.is_visible())
    if h0>70: errs.append('text box should start short')
    if prev.is_visible(): errs.append('no preview before anything is added')
    t.fill('Line one\nLine two\nLine three\nLine four'); pg.wait_for_timeout(100); h1=t.bounding_box()['height']
    t.fill('Lots of words. '*200); pg.wait_for_timeout(100); h2=t.bounding_box()['height']; ov=pg.evaluate("getComputedStyle(document.querySelector('.feed-composer__text')).overflowY")
    print('four lines:', round(h1), '| very long:', round(h2), ov)
    if not (h0 < h1 < h2 <= 245) or ov!='auto': errs.append('text box should grow, then scroll')
    t.fill('Saturday at the pantry.')
    # a photo
    pg.locator('.feed-composer input[type=file]').first.set_input_files('/tmp/composer-photo.png'); pg.wait_for_timeout(700)
    print('after a photo: preview', prev.is_visible(), '| on top:', prev.bounding_box()['y'] < t.bounding_box()['y'], '| picture in it:', prev.locator('img').count())
    if not prev.is_visible() or not prev.locator('img').count(): errs.append('no preview with the photo')
    t.fill('Saturday at the pantry. Bring a bike.'); pg.wait_for_timeout(450)
    print('preview follows typing:', 'Bring a bike' in prev.inner_text())
    if 'Bring a bike' not in prev.inner_text(): errs.append('preview did not follow the text')
    # an event
    pg.get_by_role('button', name='Event').click(); pg.wait_for_timeout(300)
    pg.locator('.sub-attach__vault-item').first.click(); pg.wait_for_timeout(500)
    print('event in preview:', prev.locator('.event-strip, .feed-post__event').count())
    pg.screenshot(path='test-output/composer-preview.png')
    # post: the preview goes away
    pg.locator('.feed-composer').get_by_role('button', name='Post', exact=True).click(); pg.wait_for_timeout(700)
    print('after posting: composer open', pg.locator('.feed-composer').count(), '| newest post:', v.locator('.feed-tile, .feed-row').first.get_attribute('aria-label'))
    # a poll's fields come above the text box
    v.get_by_role('button', name='New post').first.click(); pg.wait_for_timeout(400)
    pg.get_by_role('button', name='Poll').click(); pg.wait_for_timeout(300)
    above=pg.locator('.feed-composer .poll-attacher').bounding_box()['y'] < pg.locator('.feed-composer__text').bounding_box()['y']
    print('poll fields above the text:', above)
    if not above: errs.append('poll fields should be above the text')
    pg.get_by_role('button', name='Discard').click(); pg.wait_for_timeout(300)
    # editing Leo's post with a note: the note stays on top, the text box goes under it
    tile=v.locator('.feed-tile, .feed-row').filter(has_text='Pedalboard').first
    tile.click(); pg.wait_for_timeout(500)
    side=pg.locator('.photo-viewer__side .feed-post').first
    side.locator('.post-menu__button').first.click(); pg.wait_for_timeout(200)
    pg.locator('.post-menu__item', has_text='Edit').first.click(); pg.wait_for_timeout(400)
    doc=side.locator('.file-preview, .feed-media, .media-carousel, img').first.bounding_box(); box=side.locator('.feed-post__editor textarea').bounding_box()
    print('editing: attachment top', round(doc['y']), '| text box top', round(box['y']), '| text box height', round(box['height']))
    if box['y'] < doc['y']: errs.append('the text box should be under what is attached')
    pg.screenshot(path='test-output/edit-post-order.png')
    pg.locator('.photo-viewer__close').click(); pg.wait_for_timeout(200)
    # announcements and forum threads: photos and the poll come before the text in a new one
    pg.evaluate("location.hash='#module-tenants-announcements'"); pg.wait_for_timeout(900)
    pg.get_by_role('button', name='New announcement').first.click(); pg.wait_for_timeout(300)
    order=pg.evaluate("(()=>{const f=document.querySelector('.announcements-page__composer-title').closest('form'); const t=f.querySelector('textarea'); const p=f.querySelector('.poll-attacher'); return Boolean(p.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING)})()")
    print('announcement: poll fields before the text:', order)
    if not order: errs.append('announcement composer order')
    # photo tiles: the words only while hovering
    pg.evaluate("location.hash='#module-leo-feed'"); pg.wait_for_timeout(900)
    tile=pg.locator('#module-page-view .feed-tile--photo').filter(has=pg.locator('.feed-tile__caption')).first
    op=lambda: pg.evaluate("el=>getComputedStyle(el.querySelector('.feed-tile__caption')).opacity", tile.element_handle())
    pg.mouse.move(5, 5); pg.wait_for_timeout(250); before=op()
    tile.hover(); pg.wait_for_timeout(250); during=op()
    print('photo tile caption opacity: resting', before, '| hovering', during)
    if before!='0' or during!='1': errs.append('photo tile words should show only on hover')
    pg.screenshot(path='test-output/tile-hover.png')
    print('errors', errs)
