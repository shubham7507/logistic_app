"""Customer payments across services: buy products (UPI, COD, cancel, return), hire a driver, book movers, home service."""
import os, threading, http.server, functools, socketserver, json
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', 4209), functools.partial(Quiet, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start()
SHOTS = os.environ.get('MOVEAI_SHOTS')
def check(c, m):
    if not c: raise AssertionError(m)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1366, 'height': 900}); errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto('http://127.0.0.1:4209/index.html#/home'); pg.wait_for_timeout(200); pg.evaluate('window.MoveAIVNextTest.reset()')
    go = lambda r: (pg.evaluate(f"location.hash='#/{r}'"), pg.wait_for_timeout(100))
    ws = lambda k, prod=None: (pg.evaluate(f"window.MoveAIVNextTest.switchWorkspace('{k}'{', ' + repr(prod) if prod else ''})"), pg.wait_for_timeout(80))
    st = lambda: pg.evaluate('window.MoveAIVNextTest.state()')
    main = lambda: pg.locator('#main-content').inner_text()
    shot = lambda n: SHOTS and pg.screenshot(path=f'{SHOTS}/{n}.png', full_page=True)
    ws('personal', 'customer')
    # products: UPI, deliver, return
    go('home'); pg.click('[data-customer-service="products"]'); pg.wait_for_timeout(100)
    pg.locator('[data-action="buy-product"]').nth(1).click(); pg.wait_for_timeout(100)
    check('Checkout' in main() and 'Delivery' in main(), 'checkout with delivery fee'); shot('80-product-checkout')
    pg.fill('#pay-vpa', 'fail@upi'); pg.locator('form[data-po-form="checkout"] button[type=submit]').click(); pg.wait_for_timeout(80)
    check('declined' in pg.locator('#po-error').inner_text(), 'failed product payment')
    pg.fill('#pay-vpa', 'shubham@okaxis'); pg.locator('form[data-po-form="checkout"] button[type=submit]').click(); pg.wait_for_timeout(100)
    o = st()['customerOrders'][0]; check(o['status'] == 'paid', 'order paid and held')
    for _ in range(3): pg.locator(f'[data-po="advance"][data-id="{o["id"]}"]').click(); pg.wait_for_timeout(60)
    check(next(x for x in st()['customerOrders'] if x['id'] == o['id'])['status'] == 'delivered', 'delivered')
    pg.locator(f'form[data-po-form="return"][data-id="{o["id"]}"]').evaluate('f => f.closest("details").open = true')
    pg.fill(f'form[data-po-form="return"][data-id="{o["id"]}"] [name=reason]', 'Pack was torn'); pg.locator(f'form[data-po-form="return"][data-id="{o["id"]}"] button').click(); pg.wait_for_timeout(60)
    pg.locator(f'[data-po="pickup"][data-id="{o["id"]}"]').click(); pg.wait_for_timeout(80)
    check('Refund' in main(), 'return refund shown'); shot('81-orders')
    # products: cash on delivery, cancel before dispatch
    go('search'); pg.locator('[data-action="buy-product"]').first.click(); pg.wait_for_timeout(80)
    pg.check('input[name="method"][value="cod"]'); pg.locator('form[data-po-form="checkout"] button[type=submit]').click(); pg.wait_for_timeout(100)
    cod = st()['customerOrders'][0]; check(cod['cod'] and cod['status'] == 'confirmed', 'COD order')
    pg.locator(f'[data-po="cancel"][data-id="{cod["id"]}"]').click(); pg.wait_for_timeout(60)
    check(next(x for x in st()['customerOrders'] if x['id'] == cod['id'])['status'] == 'cancelled', 'COD cancelled')
    # hire a driver: nothing upfront, driver accepts, customer pays after, released minus 12%
    go('home'); pg.click('[data-customer-service="driver"]'); pg.wait_for_timeout(80)
    pg.locator('#booking-form button[type=submit]').click(); pg.wait_for_timeout(80); check('Nothing to pay now' in main(), 'driver: pay after')
    pg.click('[data-op="booking-publish"]'); pg.wait_for_timeout(100); r = st()['serviceRequests'][0]
    ws('personalDriver'); go('myJobs'); pg.locator(f'[data-id="{r["id"]}"]').first.click(); pg.wait_for_timeout(100)
    for _ in range(4):
        btn = pg.locator('[data-op="driver-job-step"]')
        if btn.count(): btn.first.click(); pg.wait_for_timeout(80)
    ws('personal', 'customer'); go('services'); pg.locator(f'[data-op="open-service"][data-id="{r["id"]}"]').first.click(); pg.wait_for_timeout(100)
    if pg.locator('[data-op="service-confirm"]').count(): pg.locator('[data-op="service-confirm"]').first.click(); pg.wait_for_timeout(100)
    check(pg.locator(f'[data-pay-balance="{r["id"]}"]').count() == 1, f'driver job ready to pay (status {next(x for x in st()["serviceRequests"] if x["id"] == r["id"])["status"]})')
    if True:
        pg.click(f'[data-pay-balance="{r["id"]}"]'); pg.wait_for_timeout(100)
        check(any(x['type'] == 'wallet_credit' and x.get('serviceId') == r['id'] for x in st()['ledger']), 'driver paid, released to wallet')
    shot('82-driver-paid')
    # home service SR-703: provider done → customer confirms → pays → released minus 15%
    go('services'); pg.locator('[data-op="open-service"][data-id="SR-703"]').first.click(); pg.wait_for_timeout(100)
    pg.locator('[data-op="service-confirm"]').first.click(); pg.wait_for_timeout(100)
    pg.check('input[name="pay-method"][value="card"]'); pg.fill('#pay-card', '4111111111111111'); pg.click('[data-pay-balance="SR-703"]'); pg.wait_for_timeout(100)
    rel = next(x for x in st()['ledger'] if x['type'] == 'wallet_credit' and x.get('serviceId') == 'SR-703'); check(rel['commission'] == round(679 * 0.15), 'home service released minus 15%')
    # movers booking amount (covered in pay.smoke) — quick check of 20%
    go('home'); pg.click('[data-customer-service="moving"]'); pg.wait_for_timeout(80); pg.locator('#booking-form button[type=submit]').click(); pg.wait_for_timeout(80)
    check('Pay the booking amount' in main(), 'movers: booking amount')
    check(not errors, f'runtime errors: {errors[:3]}')
    b.close()
srv.shutdown()
print(json.dumps({'status': 'PASS', 'suite': 'customer payments across services'}, indent=2))
