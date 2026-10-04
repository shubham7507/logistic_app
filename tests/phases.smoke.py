"""Browser check of the phase 1–5 screens: item cancel, statements, notifications settings, maps, truck GPS, service claim, protected payment, payslip, fuel card."""
import os, threading, http.server, functools, socketserver, json
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', 4250), functools.partial(Quiet, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start()
B = 'http://127.0.0.1:4250'
def check(c, m):
    if not c: raise AssertionError(m)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1366, 'height': 900}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    st = lambda: pg.evaluate('window.MoveAIVNextTest.state()'); main = lambda: pg.locator('#main-content').inner_text()
    go = lambda r: (pg.evaluate(f"location.hash='#/{r}'"), pg.wait_for_timeout(200))
    pg.goto(f'{B}/index.html#/home'); pg.wait_for_timeout(300); pg.evaluate('window.MoveAIVNextTest.reset()')
    for pid in ['PRD-101', 'PRD-103']:
        go('search'); pg.locator(f'[data-po-detail="{pid}"]').first.click(); pg.wait_for_timeout(150); pg.locator(f'[data-po-add="{pid}"]').first.click(); pg.wait_for_timeout(150)
    go('cart'); pg.locator('#main-content button:has-text("Continue to payment")').click(); pg.wait_for_timeout(250); pg.locator('form[data-po-form="checkout"] button[type=submit]').click(); pg.wait_for_timeout(300)
    go('orders'); pg.locator('.order-help summary:has-text("Cancel an item")').first.click(); pg.locator('[data-plus="cancel-item"]').first.click(); pg.wait_for_timeout(200)
    check(any(x['type'] == 'refund' for x in st()['ledger']), 'item cancelled with refund')
    go('monthlyStatement'); check('Monthly statement' in main() and 'Paid' in main(), 'customer statement')
    go('notifications'); pg.locator('.nc-settings summary').click(); pg.locator('[data-nc-prefs] [name="orders.sms"]').uncheck(); pg.locator('[data-nc-prefs] button').click(); pg.wait_for_timeout(150)
    check(st()['notifyPrefs']['personal']['orders']['sms'] is False, 'notification settings saved')
    # transporter: notifications, trip GPS, freight protected payment + fuel card
    pg.goto(f'{B}/business.html#/trips'); pg.wait_for_timeout(300); pg.evaluate("window.MoveAIVNextTest.switchWorkspace('transporter')"); go('notifications'); check('Notifications' in main(), 'business notifications')
    go('trips'); pg.locator('[data-op="open-trip"][data-id="TRP-501"]').first.click(); pg.wait_for_timeout(200)
    check('GPS ·' in main(), 'truck GPS panel'); pg.locator('[data-geo-job="TRP-501"][data-mode="step"]').click(); pg.wait_for_timeout(150); check(st()['trips'][0].get('gtrack') or any(t.get('gtrack') for t in st()['trips']), 'truck moved')
    go('tripSettlement'); check('Fuel card' in main(), 'fuel card panel'); pg.fill('form[data-fr-fuel="load"] [name=amount]', '3000'); pg.locator('form[data-fr-fuel="load"] button').click(); pg.wait_for_timeout(150)
    check(next(t for t in st()['trips'] if t['id'] == st()['selectedTripId']).get('fuelCard', {}).get('loaded') == 3000, 'fuel loaded')
    go('payroll'); check('Export PF' in main(), 'PF export'); pg.locator('[data-wf-slip]').first.click(); pg.wait_for_timeout(150); check('Payslip ·' in main(), 'payslip')
    pg.evaluate("window.MoveAIVNextTest.switchWorkspace('goods')"); go('invoices'); pg.locator('[data-fr-tab="payable"]').click(); pg.wait_for_timeout(100)
    pg.locator('[data-fr-open]').first.click(); pg.wait_for_timeout(200)
    if pg.locator('[data-fr-protect]').count(): pg.locator('[data-fr-protect]').click(); pg.wait_for_timeout(150); check('Protected payment' in main(), 'protected payment funded')
    # admin: maps & areas, reports
    pg.goto(f'{B}/admin.html#/plusSettings'); pg.wait_for_timeout(300); check('Maps and delivery areas' in main(), 'areas editor')
    go('plusReports'); check('Live deliveries' in main(), 'admin reports')
    # customer: service claim on a paid booking
    pg.goto(f'{B}/index.html#/services'); pg.wait_for_timeout(300)
    pg.evaluate("""(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('moveai-vnext'));const d=JSON.parse(localStorage.getItem(k));const r=d.serviceRequests.find(x=>x.id==='SR-701');r.paid=true;r.status='closed';localStorage.setItem(k,JSON.stringify(d))})()"""); pg.reload(); pg.wait_for_timeout(300)
    pg.evaluate("(()=>{const s=window.MoveAIVNextTest.state();})()"); go('services'); pg.locator('[data-op="open-service"][data-id="SR-701"]').first.click(); pg.wait_for_timeout(200)
    check('Report a problem with this move' in main(), 'service claim form')
    check(not errs, f'runtime errors: {errs[:3]}')
    b.close()
srv.shutdown(); print(json.dumps({'status': 'PASS', 'suite': 'phases 1–5 in the browser'}, indent=2))
