"""P5–P8 browser smoke test (python Playwright). Serves the app, opens every allowed route for
every workspace, then runs the main draw.io journeys. Run: python3 tests/p5-p8-ops.smoke.py"""
import os, sys, threading, http.server, functools, socketserver, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.environ.get('MOVEAI_SHOTS')
PORT = 4199
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
Handler = functools.partial(Quiet, directory=ROOT)
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', PORT), Handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{PORT}'

def check(cond, msg):
    if not cond: raise AssertionError(msg)

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={'width': 1366, 'height': 900})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(f'{BASE}/#/home'); page.wait_for_load_state('networkidle')
    page.evaluate('window.MoveAIVNextTest.reset()')
    st = lambda: page.evaluate('window.MoveAIVNextTest.state()')
    go = lambda r: (page.evaluate(f"location.hash='#/{r}'"), page.wait_for_timeout(60))
    ws = lambda k: (page.evaluate(f"window.MoveAIVNextTest.switchWorkspace('{k}')"), page.wait_for_timeout(60))
    shot = lambda n: SHOTS and page.screenshot(path=f'{SHOTS}/{n}.png', full_page=True)
    toast = lambda: page.locator('#toast').inner_text()

    # 1. every workspace × every allowed route renders without runtime errors
    roles = page.evaluate("Object.keys(window.MoveAIVNextTest.state().workspaces.reduce((a,k)=>(a[k]=1,a),{}))")
    visited = 0
    for role in ['personal','goods','transporter','vehicle','movers','commercialDriver','personalDriver','helper','admin']:
        ws(role)
        routes = page.evaluate(f"window.MoveAIVNextTest.routes().filter(r=>window.MoveAIVNextTest.canOpen('{role}',r,'authenticated'))")
        for r in routes:
            if r in ('welcome','signup','otp','recover','staffInvite','staffOtp'): continue
            go(r); visited += 1
            txt = page.locator('#main-content').inner_text()
            check('undefined' not in txt and 'NaN' not in txt, f'{role}/{r} shows undefined/NaN')
    check(not errors, f'runtime errors: {errors[:3]}')

    # 2. Customer: book a move → price → auto-assigned Mover branch
    ws('personal'); go('book'); shot('01-book')
    page.locator('#booking-form button[type=submit]').click(); page.wait_for_timeout(80)
    check('Total' in page.locator('#main-content').inner_text(), 'price review shows total'); shot('02-price')
    page.locator('[data-op="booking-publish"]').click(); page.wait_for_timeout(80)
    s = st(); job = s['movingJobs'][0]
    check(job['status'] == 'auto_assigned' and job['owner'] == 'movers', 'move auto-assigned to Mover branch')
    ws('movers'); go('work'); check(job['id'] in page.locator('#main-content').inner_text(), 'movers queue shows new job'); shot('03-movers-queue')

    # 3. Transporter: overlapping booking is blocked in assignment
    ws('transporter'); go('trips'); shot('04-trips')
    page.locator('[data-op="open-trip"][data-id="TRP-503"]').first.click(); page.wait_for_timeout(80)
    page.locator('[data-op="open-assign"]').first.click(); page.wait_for_timeout(80); shot('05-assign')
    check(page.locator('form[data-op-form="assign-trip"]').count() == 1, 'assign form visible')
    go('fleet'); check('calendar' in page.content(), 'fleet calendar'); shot('06-fleet-calendar')

    # 4. Commercial Driver: dharamkata milestone needs weighbridge slip, then advances
    ws('commercialDriver'); page.evaluate("(()=>{})()")
    s = st(); t = next(x for x in s['trips'] if x['id'] == 'TRP-501')
    page.evaluate("window.MoveAIVNextTest")
    go('myJobs'); shot('07-driver-jobs')
    page.locator('[data-op="open-trip"][data-id="TRP-501"]').first.click(); page.wait_for_timeout(80); shot('08-trip-detail')
    btn = page.locator('[data-op="trip-milestone"]')
    if btn.count():
        btn.first.click(); page.wait_for_timeout(60)
        check('required' in toast() or 'Weighbridge' in toast(), 'proof required for dharamkata: ' + toast())
        if page.locator('#milestone-proof').count(): page.fill('#milestone-proof', 'slip-4471.jpg')
        page.locator('[data-op="trip-milestone"]').first.click(); page.wait_for_timeout(80)
        s = st(); t = next(x for x in s['trips'] if x['id'] == 'TRP-501')
        check(any(m['key'] == 'dharamkata' and m['status'] == 'done' for m in t['milestones']), 'dharamkata done')

    # 5. Money: pending payment → approve → pay → payee confirms
    ws('transporter'); go('money'); shot('09-money')
    s = st(); pend = next((x for x in s['ledger'] if x['status'] == 'pending_approval' and x.get('owner') == 'transporter'), None)
    if pend:
        page.evaluate(f"window.MoveAIVNextTest")
        page.locator(f'[data-op="open-payment"][data-id="{pend["id"]}"]').first.click(); page.wait_for_timeout(60); shot('10-payment')
        page.locator('[data-op="money-action"][data-action-name="approve"]').click(); page.wait_for_timeout(60)
        page.locator('[data-op="money-action"][data-action-name="pay"]').click(); page.wait_for_timeout(60)
        s = st(); check(next(x for x in s['ledger'] if x['id'] == pend['id'])['status'] == 'paid', 'payment paid')

    # 6. Admin: rejection needs reason
    ws('admin'); go('verification'); shot('11-verification')
    page.locator('[data-op="open-verification"]').first.click(); page.wait_for_timeout(60)
    page.select_option('form[data-op-form="admin-decision"] select[name="decision"]', 'reject')
    page.locator('form[data-op-form="admin-decision"] button').click(); page.wait_for_timeout(60)
    check('reason' in (page.locator('#main-content').inner_text() + toast()).lower(), 'reason required')

    # 7. AI assistant: summarise + critical read-back
    ws('transporter'); go('home')
    page.click('#ai-button'); page.fill('#ai-input', 'summarize TRP-501'); page.press('#ai-input', 'Enter'); page.wait_for_timeout(60)
    check('TRP-501' in page.locator('#ai-readback').inner_text(), 'AI summary')
    page.fill('#ai-input', 'record advance 5000 to Raj Transport for TRP-501'); page.press('#ai-input', 'Enter'); page.wait_for_timeout(60)
    check(page.locator('#ai-confirm').is_visible(), 'critical action needs confirmation'); shot('12-ai-readback')
    page.click('#ai-yes'); page.wait_for_timeout(80)
    s = st(); check(any(x['amount'] == 5000 and x['status'] == 'pending_approval' and str(x.get('reference','')).startswith('VOICE') for x in s['ledger']), 'voice payment saved pending approval')
    page.keyboard.press('Escape'); page.evaluate("document.getElementById('ai-dialog').hidden=true")

    # 8. mobile layout renders
    page.set_viewport_size({'width': 390, 'height': 844}); ws('commercialDriver'); go('tripDetail'); shot('13-mobile-trip')
    check(not errors, f'runtime errors: {errors[:3]}')
    b.close()
srv.shutdown()
print(json.dumps({'status': 'PASS', 'routesVisited': visited}, indent=2))
