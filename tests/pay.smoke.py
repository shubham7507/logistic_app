"""MoveAI Pay browser test: book with booking amount, failed payment, balance after OTP, release, wallet payout, cancellation refund, admin view."""
import os, threading, http.server, functools, socketserver, json
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', 4205), functools.partial(Quiet, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start()
SHOTS = os.environ.get('MOVEAI_SHOTS')
def check(c, m):
    if not c: raise AssertionError(m)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1366, 'height': 900}); errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto('http://127.0.0.1:4205/index.html#/home'); pg.wait_for_timeout(200); pg.evaluate('window.MoveAIVNextTest.reset()')
    go = lambda r: (pg.evaluate(f"location.hash='#/{r}'"), pg.wait_for_timeout(100))
    ws = lambda k, prod=None: (pg.evaluate(f"window.MoveAIVNextTest.switchWorkspace('{k}'{', ' + repr(prod) if prod else ''})"), pg.wait_for_timeout(80))
    st = lambda: pg.evaluate('window.MoveAIVNextTest.state()')
    main = lambda: pg.locator('#main-content').inner_text()
    shot = lambda n: SHOTS and pg.screenshot(path=f'{SHOTS}/{n}.png', full_page=True)
    # 1. book a move: failed UPI, then success → booking amount held
    ws('personal', 'customer'); go('book'); pg.locator('#booking-form button[type=submit]').click(); pg.wait_for_timeout(100)
    check('Pay the booking amount' in main(), 'checkout shown'); shot('50-checkout')
    pg.fill('#pay-vpa', 'fail@upi'); pg.click('[data-op="booking-publish"]'); pg.wait_for_timeout(80)
    check('declined' in pg.locator('#pay-error').inner_text(), 'failed payment shown, not booked')
    n0 = len(st()['serviceRequests'])
    pg.fill('#pay-vpa', 'shubham@okaxis'); pg.click('[data-op="booking-publish"]'); pg.wait_for_timeout(120)
    s = st(); check(len(s['serviceRequests']) == n0 + 1, 'booked after payment'); r = s['serviceRequests'][0]
    held = [x for x in s['ledger'] if x.get('serviceId') == r['id'] and x['status'] == 'held']; check(len(held) == 1, 'booking amount held')
    check('Payment · MoveAI Pay' in main() and 'held until done' in main(), 'pay panel'); shot('51-booked')
    # 2. cancel the new booking (free: not yet assigned) → full refund
    pg.click('.cancel-box summary'); pg.locator(f'[data-pay-cancel="{r["id"]}"]').click(); pg.wait_for_timeout(100)
    s = st(); check(any(x['type'] == 'refund' and x.get('serviceId') == r['id'] and x['amount'] == held[0]['amount'] for x in s['ledger']), 'full refund before crew')
    # 3. seeded MOV-601 (SR-701): drive to OTP, customer pays balance online, movers close → release
    # fast-forward the seeded job to 'OTP verified' (earlier steps are covered by the P5–P8 smoke test)
    pg.evaluate("""(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('moveai-vnext'));const d=JSON.parse(localStorage.getItem(k));const j=d.movingJobs.find(x=>x.id==='MOV-601');j.status='otp_verified';localStorage.setItem(k,JSON.stringify(d))})()""")
    pg.reload(); pg.wait_for_timeout(200)
    s = st(); j = next(x for x in s['movingJobs'] if x['id'] == 'MOV-601')
    check(j['status'] == 'otp_verified', f'job reached OTP (at {j["status"]})')
    ws('personal', 'customer'); go('services'); pg.locator('[data-op="open-service"][data-id="SR-701"]').first.click(); pg.wait_for_timeout(100)
    check(pg.locator('[data-pay-balance="SR-701"]').count() == 1, 'balance form after OTP'); pg.click('[data-pay-balance="SR-701"]'); pg.wait_for_timeout(100)
    s = st(); check(next(x for x in s['serviceRequests'] if x['id'] == 'SR-701')['paid'], 'balance paid')
    ws('movers'); go('work'); pg.locator('[data-op="open-moving"][data-id="MOV-601"]').first.click(); pg.wait_for_timeout(80)
    for _ in range(2):
        if pg.locator('[data-op="moving-step"]').count(): pg.locator('[data-op="moving-step"]').first.click(); pg.wait_for_timeout(100)
    s = st(); check(next(x for x in s['movingJobs'] if x['id'] == 'MOV-601')['status'] == 'closed', 'job closed')
    check(any(x['type'] == 'wallet_credit' and x.get('serviceId') == 'SR-701' for x in s['ledger']), 'released to wallet')
    go('money'); check('MoveAI Pay wallet' in main(), 'wallet panel'); shot('52-wallet')
    pg.locator('form[data-pay-account] input').fill('9999000'); pg.locator('form[data-pay-account] button').click(); pg.wait_for_timeout(60)
    pg.locator('[data-pay-instant]').click(); pg.wait_for_timeout(80); check('failed' in main().lower(), 'payout failure visible')
    pg.locator('form[data-pay-account] input').fill('safemove@okhdfc'); pg.locator('form[data-pay-account] button').click(); pg.wait_for_timeout(60)
    pg.locator('[data-pay-retry]').first.click(); pg.wait_for_timeout(80)
    s = st(); check(any(x['type'] == 'payout' and x['status'] == 'paid' for x in s['ledger']), 'retry succeeded')
    # 4. admin
    ws('admin'); go('payOps'); check('Held for customers' in main() and 'Partner wallets' in main(), 'admin pay ops'); shot('53-payops')
    check(not errors, f'runtime errors: {errors[:3]}')
    b.close()
srv.shutdown()
print(json.dumps({'status': 'PASS', 'suite': 'MoveAI Pay journeys'}, indent=2))
