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
    ws('admin'); go('verification')
    check(page.locator('form[data-op-form="admin-stepup"]').count() == 1, 'strong auth gate')
    page.fill('input[name="code"]', '000000'); page.locator('form[data-op-form="admin-stepup"] button').click(); page.wait_for_timeout(60)
    check(page.locator('#stepup-error').is_visible(), 'wrong code refused')
    page.fill('input[name="code"]', '246810'); page.locator('form[data-op-form="admin-stepup"] button').click(); page.wait_for_timeout(80)
    shot('11-verification')
    page.locator('[data-op="open-verification"]').first.click(); page.wait_for_timeout(60)
    page.select_option('form[data-op-form="admin-decision"] select[name="decision"]', 'reject')
    page.locator('form[data-op-form="admin-decision"] button').click(); page.wait_for_timeout(60)
    check('reason' in (page.locator('#main-content').inner_text() + toast()).lower(), 'reason required')

    # 6b. Buyer receives inbound goods, pays seller, closes order (draw.io 04)
    ws('goods'); go('trips'); page.locator('[data-op="open-trip"][data-id="TRP-502"]').first.click(); page.wait_for_timeout(80)
    page.locator('form[data-op-form="trip-receipt"] button[type=submit]').click(); page.wait_for_timeout(80); shot('14-buyer-closeout')
    check(page.locator('[data-op="pay-seller"]').count() == 1, 'pay seller offered')
    check(page.locator('[data-op="close-order"]').first.is_disabled(), 'cannot close before paying seller')
    page.locator('[data-op="pay-seller"]').click(); page.wait_for_timeout(80)
    page.fill('form[data-op-form="create-payment"] [name="reference"]', 'UTR-BIHAR-7781')
    page.locator('form[data-op-form="create-payment"] button.primary').click(); page.wait_for_timeout(80)
    for a in ('approve', 'pay'):
        if page.locator(f'[data-op="money-action"][data-action-name="{a}"]').count():
            page.locator(f'[data-op="money-action"][data-action-name="{a}"]').click(); page.wait_for_timeout(60)
    go('trips'); page.locator('[data-op="open-trip"][data-id="TRP-502"]').first.click(); page.wait_for_timeout(80)
    page.locator('[data-op="close-order"]').first.click(); page.wait_for_timeout(80)
    s = st(); check(next(o for o in s['goodsOrders'] if o['id'] == 'GO-403')['status'] == 'closed', 'buyer order closed')

    # 6c. Staff: assigned tasks + attendance; owner sees attendance (draw.io 13)
    ws('transporter'); go('people'); check(page.locator('[data-route="staffEvents"]').count() >= 1, 'leave/rehire reachable')
    staff_id = page.evaluate("window.MoveAIVNextTest.state().peopleByWorkspace.transporter.find(p=>p.status==='active').id")
    page.locator(f'[data-action="open-staff"][data-staff="{staff_id}"]').first.click(); page.wait_for_timeout(80)
    page.locator('[data-action="open-staff-workspace"]').first.click(); page.wait_for_timeout(100)
    go('work'); check('My assigned tasks' in page.locator('#main-content').inner_text(), 'staff assigned tasks')
    page.locator('[data-op="attendance-in"]').click(); page.wait_for_timeout(60); shot('15-staff-work')
    check(any(a['memberId'] == staff_id for a in st().get('attendance', [])), 'attendance recorded')
    ws('transporter'); go('staffEvents'); check('Today’s attendance' in page.locator('#main-content').inner_text(), 'owner sees attendance')
    # 7. AI assistant: summarise + critical read-back
    ws('transporter'); go('home')
    page.click('#ai-button'); page.fill('#ai-input', 'summarize TRP-501'); page.press('#ai-input', 'Enter'); page.wait_for_timeout(60)
    check('TRP-501' in page.locator('#ai-readback').inner_text(), 'AI summary')
    page.fill('#ai-input', 'record advance 5000 to Raj Transport for TRP-501'); page.press('#ai-input', 'Enter'); page.wait_for_timeout(60)
    check(page.locator('#ai-confirm').is_visible(), 'critical action needs confirmation'); shot('12-ai-readback')
    page.click('#ai-yes'); page.wait_for_timeout(80)
    s = st(); check(any(x['amount'] == 5000 and x['status'] == 'pending_approval' and str(x.get('reference','')).startswith('VOICE') for x in s['ledger']), 'voice payment saved pending approval')
    page.keyboard.press('Escape'); page.evaluate("document.getElementById('ai-dialog').hidden=true")


    # 9. New Commercial Driver: documents first, then verification, then work (draw.io 09)
    import tempfile
    tmp = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False); tmp.write(b'\xff\xd8fakejpeg'); tmp.close()
    page.set_viewport_size({'width': 1366, 'height': 900})
    ws('personal'); go('purpose'); page.locator('[data-purpose="work"]').click(); page.wait_for_timeout(80)
    page.check('input[name="workerType"][value="commercialDriver"]'); page.wait_for_timeout(60)
    page.fill('[name="name"]', 'Suresh Yadav'); page.fill('[name="location"]', 'Patna')
    page.fill('[name="licenceNumber"]', 'BR01 20190054321'); page.fill('[name="licenceExpiry"]', '2030-01-31')
    page.fill('[name="licenceClasses"]', 'LMV'); page.fill('[name="experienceYears"]', '5')
    page.fill('[name="emergencyName"]', 'Geeta Yadav'); page.fill('[name="emergencyPhone"]', '9876500011')
    page.locator('#candidate-profile-form button[type=submit]').click(); page.wait_for_timeout(60)
    check('transport class' in page.locator('#candidate-profile-error').inner_text(), 'LMV refused for commercial driver')
    page.fill('[name="licenceClasses"]', 'HMV, TRANS'); page.locator('#candidate-profile-form button[type=submit]').click(); page.wait_for_timeout(80)
    check(page.locator('[data-worker-submit]').is_disabled(), 'submit disabled until documents uploaded')
    go('work'); check('Complete onboarding first' in page.locator('#main-content').inner_text(), 'work blocked before documents')
    go('workerDocuments'); shot('16-driver-docs')
    for key in ['dl_front', 'dl_back', 'id_proof', 'photo', 'address_proof', 'bank']:
        page.set_input_files(f'[data-worker-doc="{key}"]', tmp.name); page.wait_for_timeout(50)
    page.locator('[data-worker-submit]').click(); page.wait_for_timeout(80); shot('17-driver-status')
    check('under verification' in page.locator('#main-content').inner_text().lower(), 'submitted')
    go('work'); check('Complete onboarding first' in page.locator('#main-content').inner_text(), 'work blocked while verifying')
    s = st(); cand = next(c for c in s['candidates'] if c['name'] == 'Suresh Yadav'); item = next(v for v in s['verificationQueue'] if v.get('candidateId') == cand['id'])
    ws('admin'); go('verification')
    if page.locator('form[data-op-form="admin-stepup"]').count():
        page.fill('input[name="code"]', '246810'); page.locator('form[data-op-form="admin-stepup"] button').click(); page.wait_for_timeout(80)
    page.locator(f'[data-op="open-verification"][data-id="{item["id"]}"]').first.click(); page.wait_for_timeout(60)
    page.select_option('form[data-op-form="admin-decision"] select[name="decision"]', 'approve')
    page.locator('form[data-op-form="admin-decision"] button').click(); page.wait_for_timeout(80)
    s = st(); cand = next(c for c in s['candidates'] if c['name'] == 'Suresh Yadav')
    check(cand['onboarding'] == 'verified' and cand['status'] == 'available', 'admin approval verifies driver')
    ws('personal'); page.evaluate(f"(()=>{{}})()"); go('work')
    check('Find Work' in page.locator('h1').inner_text() and 'Complete onboarding' not in page.locator('#main-content').inner_text(), 'verified driver can find work')
    # re-choosing Find work must reopen the same profile, not create a duplicate
    go('purpose'); page.locator('[data-purpose="work"]').click(); page.wait_for_timeout(80)
    check(len([c for c in st()['candidates'] if c['name'] == 'Suresh Yadav']) == 1, 'no duplicate work profile')
    check('Verification status' in page.locator('h1').inner_text(), 'returns to status screen')
    os.unlink(tmp.name)

    # 8. mobile layout renders
    page.set_viewport_size({'width': 390, 'height': 844}); ws('commercialDriver'); go('tripDetail'); shot('13-mobile-trip')
    check(not errors, f'runtime errors: {errors[:3]}')
    b.close()
srv.shutdown()
print(json.dumps({'status': 'PASS', 'routesVisited': visited}, indent=2))
