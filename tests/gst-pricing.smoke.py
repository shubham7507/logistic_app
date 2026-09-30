"""Browser test: e-way bill from a trip, driver view, portal outage, Transporter ID; admin pricing rule applied at checkout; pending UPI payment."""
import os, threading, http.server, functools, socketserver, json
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', 4208), functools.partial(Quiet, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start()
SHOTS = os.environ.get('MOVEAI_SHOTS')
def check(c, m):
    if not c: raise AssertionError(m)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1366, 'height': 900}); errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto('http://127.0.0.1:4208/business.html#/home'); pg.wait_for_timeout(200); pg.evaluate('window.MoveAIVNextTest.reset()')
    go = lambda r: (pg.evaluate(f"location.hash='#/{r}'"), pg.wait_for_timeout(100))
    ws = lambda k, prod=None: (pg.evaluate(f"window.MoveAIVNextTest.switchWorkspace('{k}'{', ' + repr(prod) if prod else ''})"), pg.wait_for_timeout(80))
    st = lambda: pg.evaluate('window.MoveAIVNextTest.state()')
    main = lambda: pg.locator('#main-content').inner_text()
    shot = lambda n: SHOTS and pg.screenshot(path=f'{SHOTS}/{n}.png', full_page=True)
    # e-way bill: warning, outage, generate, driver card
    ws('transporter'); go('trips'); check('E-way bills need attention' in main(), 'missing e-way bill alert on Trips')
    pg.locator('[data-op="open-trip"][data-id="TRP-501"]').first.click(); pg.wait_for_timeout(100)
    form = pg.locator('form[data-gst-form="generate"]'); check(form.count() == 1, 'generate form on trip')
    pg.click('[data-gst-down]'); pg.wait_for_timeout(80)
    pg.locator('form[data-gst-form="generate"] button[type=submit]').click(); pg.wait_for_timeout(80)
    check('not responding' in main(), 'portal outage error shown')
    pg.click('[data-gst-down]'); pg.wait_for_timeout(80)
    pg.locator('form[data-gst-form="generate"] button[type=submit]').click(); pg.wait_for_timeout(100)
    e = [x for x in st()['ewbs'] if x['tripId'] == 'TRP-501']; check(len(e) == 1 and e[0]['partB'], 'e-way bill generated with truck'); shot('70-ewb-trip')
    go('ewayBills'); check(e[0]['no'] in main(), 'e-way bill list')
    ws('commercialDriver'); go('myJobs'); pg.locator('[data-op="open-trip"][data-id="TRP-501"]').first.click(); pg.wait_for_timeout(100)
    check('Show this to officers' in main(), 'driver e-way bill card'); shot('71-ewb-driver')
    ws('vehicle'); go('ewayBills'); pg.locator('form[data-gst-form="enrol"] button').click(); pg.wait_for_timeout(80)
    check(st()['transporterIds'].get('vehicle'), 'Transporter ID issued')
    # pricing rule → checkout
    ws('admin'); go('pricingRules')
    f = pg.locator('form[data-pr-form="add"]'); f.locator('[name=service]').select_option('moving'); f.locator('[name=city]').fill('Noida'); f.locator('[name=bookingPct]').fill('30'); f.locator('[name=commission]').fill('8'); f.locator('[name=note]').fill('Noida festive season')
    f.locator('button').click(); pg.wait_for_timeout(80); check(len(st()['pricingRules']) == 1, 'rule added'); shot('72-pricing')
    ws('personal', 'customer'); go('book'); pg.locator('#booking-form button[type=submit]').click(); pg.wait_for_timeout(100)
    check('Offer applied' in main(), 'rule shown at checkout')
    pg.fill('#pay-vpa', 'pending@upi'); pg.click('[data-op="booking-publish"]'); pg.wait_for_timeout(120)
    s = st(); r = s['serviceRequests'][0]; check(r['pricing']['bookingPct'] == 0.3 and r['pricing']['commission'] == 0.08, 'booking keeps rule snapshot')
    held = [x for x in s['ledger'] if x.get('serviceId') == r['id']][0]; check(held['status'] == 'pending' and held['amount'] == round(r['quote']['total'] * 0.3), '30% booking, pending')
    check('Payment processing' in main(), 'processing banner'); pg.locator(f'[data-pay-check="{r["id"]}"]').click(); pg.wait_for_timeout(80)
    check(next(x for x in st()['ledger'] if x['id'] == held['id'])['status'] == 'held', 'pending confirmed'); shot('73-pending-confirmed')
    check(not errors, f'runtime errors: {errors[:3]}')
    b.close()
srv.shutdown()
print(json.dumps({'status': 'PASS', 'suite': 'e-way bill + pricing + pending payment'}, indent=2))
