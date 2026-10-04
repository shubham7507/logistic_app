"""Browser: checkout pin, courier demo drive in one tab while the customer watches the map in another, notification centre."""
import os, threading, http.server, functools, socketserver, json
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', 4240), functools.partial(Quiet, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start()
B = 'http://127.0.0.1:4240'; SHOTS = os.environ.get('MOVEAI_SHOTS')
def check(c, m):
    if not c: raise AssertionError(m)
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1366, 'height': 900}); cust = ctx.new_page(); errs = []
    cust.on('pageerror', lambda e: errs.append(str(e)))
    st = lambda pg: pg.evaluate('window.MoveAIVNextTest.state()')
    cust.goto(f'{B}/index.html#/home'); cust.wait_for_timeout(300); cust.evaluate('window.MoveAIVNextTest.reset()')
    cust.evaluate("location.hash='#/search'"); cust.wait_for_timeout(150); cust.locator('[data-po-detail="PRD-103"]').first.click(); cust.wait_for_timeout(150); cust.locator('[data-po-add="PRD-103"]').first.click(); cust.wait_for_timeout(200)
    cust.evaluate("location.hash='#/cart'"); cust.wait_for_timeout(150); cust.locator('#main-content button:has-text("Continue to payment")').click(); cust.wait_for_timeout(250)
    check('Delivery location (map pin)' in cust.locator('#main-content').inner_text(), 'checkout pin')
    cust.select_option('[data-geo-area]', 'Sector 62, Noida'); cust.wait_for_timeout(200); check('outside its' in cust.locator('#main-content').inner_text(), 'outside delivery area shown')
    cust.select_option('[data-geo-area]', 'Connaught Place, Delhi'); cust.wait_for_timeout(200)
    if SHOTS: cust.screenshot(path=f'{SHOTS}/130-pin.png', full_page=True)
    cust.locator('form[data-po-form="checkout"] button[type=submit]').click(); cust.wait_for_timeout(300)
    o = [x for x in st(cust)['customerOrders'] if x['status'] == 'paid'][0]; oid = o['id']; check(o['destLabel'] == 'Connaught Place, Delhi', 'pin saved')
    # store: accept, pick (demo scan), pack
    sel = ctx.new_page(); sel.on('pageerror', lambda e: errs.append(str(e))); sel.goto(f'{B}/seller.html#/shopOrders'); sel.wait_for_timeout(300)
    sel.locator(f'[data-commerce="accept"][data-id="{oid}"]').click(); sel.wait_for_timeout(150); sel.locator(f'[data-commerce="pick-start"][data-id="{oid}"]').click(); sel.wait_for_timeout(150)
    sel.locator(f'[data-plus-demo-scan^="{oid}|"]').first.click(); sel.locator(f'[data-commerce="pick-check"][data-id="{oid}"]').first.click(); sel.wait_for_timeout(150)
    sel.locator(f'[data-commerce="pick-complete"][data-id="{oid}"]').click(); sel.wait_for_timeout(150); sel.locator(f'[data-commerce="pack"][data-id="{oid}"]').click(); sel.wait_for_timeout(200)
    o = next(x for x in st(sel)['customerOrders'] if x['id'] == oid); pid = o['deliveryAssignment']['partnerId']
    # courier tab
    cour = ctx.new_page(); cour.on('pageerror', lambda e: errs.append(str(e))); cour.goto(f'{B}/delivery.html#/deliveryJobs'); cour.wait_for_timeout(300)
    wsk = [k for k, v in st(cour)['deliveryPartners'].items() if v['id'] == pid][0]; cour.evaluate(f"window.MoveAIVNextTest.switchWorkspace('{wsk}')"); cour.evaluate("location.hash='#/deliveryJobs'"); cour.wait_for_timeout(200)
    cour.locator(f'[data-commerce="accept-job"][data-id="{oid}"]').click(); cour.wait_for_timeout(200)
    check('Navigate' in cour.locator('#main-content').inner_text(), 'courier map + navigate')
    for _ in range(40):
        if next(x for x in st(cour)['customerOrders'] if x['id'] == oid).get('geo', {}).get('arrivedStoreAt'): break
        cour.locator(f'[data-geo-step="{oid}"]').first.click(); cour.wait_for_timeout(60)
    check(next(x for x in st(cour)['customerOrders'] if x['id'] == oid)['geo'].get('arrivedStoreAt'), 'auto arrival at store')
    o = next(x for x in st(cour)['customerOrders'] if x['id'] == oid); cour.fill(f'[data-code="{oid}"]', o['pickupCode'])
    if cour.locator(f'[data-collected-bags="{oid}"]').count(): cour.fill(f'[data-collected-bags="{oid}"]', str(o.get('bagCount') or 1))
    cour.locator(f'[data-commerce="pickup"][data-id="{oid}"]').click(); cour.wait_for_timeout(200)
    for _ in range(6): cour.locator(f'[data-geo-step="{oid}"]').first.click(); cour.wait_for_timeout(60)
    # customer tab sees the courier moving (storage event re-render)
    cust.evaluate(f"(()=>{{}})()"); cust.goto(f'{B}/index.html#/orders'); cust.wait_for_timeout(250); cust.locator('#main-content button:has-text("Track order")').first.click(); cust.wait_for_timeout(250)
    t = cust.locator('#main-content').inner_text(); check('On the way to you' in t and 'Live location' in t, 'customer live tracking'); check(cust.locator('svg.geo-map').count() >= 1, 'map drawn')
    if SHOTS: cust.screenshot(path=f'{SHOTS}/131-track.png', full_page=True)
    for _ in range(60):
        if next(x for x in st(cour)['customerOrders'] if x['id'] == oid)['geo'].get('arrivedDoorAt'): break
        cour.locator(f'[data-geo-step="{oid}"]').first.click(); cour.wait_for_timeout(50)
    o = next(x for x in st(cour)['customerOrders'] if x['id'] == oid); check(o['geo'].get('arrivingAt') and o['geo'].get('arrivedDoorAt'), 'arriving + arrived')
    cour.fill(f'[data-code="{oid}"]', o['deliveryCode']); cour.locator(f'[data-commerce="deliver"][data-id="{oid}"]').click(); cour.wait_for_timeout(200)
    check(next(x for x in st(cour)['customerOrders'] if x['id'] == oid)['status'] == 'delivered', 'delivered')
    # notification centre
    cust.goto(f'{B}/index.html#/notifications'); cust.wait_for_timeout(300); t = cust.locator('#main-content').inner_text()
    check('Needs your action' in t and 'Rate your items' in t and 'Past orders' in t, 'notification centre sections')
    badge = cust.locator('.bell-count').inner_text(); check(badge == '' or int(badge) < 10, f'badge counts orders, not events ({badge})')
    if SHOTS: cust.screenshot(path=f'{SHOTS}/132-notifications.png', full_page=True)
    adm = ctx.new_page(); adm.goto(f'{B}/admin.html#/plusReports'); adm.wait_for_timeout(300); check('Live deliveries' in adm.locator('#main-content').inner_text(), 'admin live view')
    check(not errs, f'runtime errors: {errs[:3]}')
    b.close()
srv.shutdown(); print(json.dumps({'status': 'PASS', 'suite': 'GPS tracking + notifications in the browser'}, indent=2))
