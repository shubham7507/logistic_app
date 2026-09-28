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


    # 9. Worker onboarding by levels (browse → verified → trip-ready), invite path, manual fallback
    import tempfile
    tmp = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False); tmp.write(b'\xff\xd8fakejpeg'); tmp.close()
    page.set_viewport_size({'width': 1366, 'height': 900})
    main = lambda: page.locator('#main-content').inner_text()
    page.evaluate("window.MoveAIVNextTest.switchWorkspace('personal','partner')"); go('home'); page.wait_for_timeout(80)
    check(page.evaluate('window.MoveAIVNextTest.product()') == 'partner', 'partner app')
    check('Raj Transport invited you' in main(), 'invite pre-fill shown')
    check(page.locator('input[name="workerType"][value="commercialDriver"]').is_checked(), 'invite pre-selects driver type')
    page.fill('[name="name"]', 'Suresh Yadav'); page.fill('[name="location"]', 'Patna')
    page.locator('#candidate-profile-form button[type=submit]').click(); page.wait_for_timeout(80)
    check('Level 1' in main(), 'level 1 browse after quick start')
    go('work'); check('Browsing only' in main() and 'Find Work' in main(), 'can browse jobs, cannot apply')
    go('workerStatus'); page.locator('[data-worker-check="licence"]').click(); page.wait_for_timeout(60)
    page.fill('[name="number"]', 'BR01 20190051111'); page.fill('[name="dob"]', '1990-05-01')
    page.locator('form[data-worker-verify="licence"] button[type=submit]').click(); page.wait_for_timeout(60)
    check('transport class' in page.locator('#worker-verify-error').inner_text(), 'LMV-only licence refused for trucks')
    page.fill('[name="number"]', 'BR01 20190054321'); page.locator('form[data-worker-verify="licence"] button[type=submit]').click(); page.wait_for_timeout(80)
    page.locator('[data-worker-check="selfie"]').click(); page.wait_for_timeout(60)
    page.set_input_files('form[data-worker-verify="selfie"] input[name="file"]', tmp.name)
    page.locator('form[data-worker-verify="selfie"] button[type=submit]').click(); page.wait_for_timeout(80)
    check('Level 2' in main(), 'verified after licence + selfie'); shot('16-worker-level2')
    check(page.locator('[data-worker-join]').count() == 1, 'join invite offered at level 2')
    for key, fields in [('aadhaar', {'aadhaar': '234567891234', 'otp': '123456'}), ('bank', {'account': '123456789012', 'confirm': '123456789012', 'ifsc': 'SBIN0001234'}), ('emergency', {'name': 'Geeta Yadav', 'phone': '9876500011'})]:
        page.locator(f'[data-worker-check="{key}"]').click(); page.wait_for_timeout(60)
        for n, v in fields.items(): page.fill(f'form[data-worker-verify="{key}"] [name="{n}"]', v)
        if key == 'aadhaar': page.check('form[data-worker-verify="aadhaar"] [name="consent"]')
        page.locator(f'form[data-worker-verify="{key}"] button[type=submit]').click(); page.wait_for_timeout(80)
    check('Level 3' in main(), 'trip-ready'); shot('17-worker-level3')
    page.locator('[data-worker-join]').click(); page.wait_for_timeout(60)
    check(any(i['status'] == 'accepted' for i in st()['workerInvites']), 'invite accepted')
    go('work'); check('Browsing only' not in main(), 'verified worker can apply')
    # re-choosing Find work reopens the same profile
    go('home'); check('Work profile' in page.locator('h1').inner_text(), 'partner home is the work profile')
    check(len([c for c in st()['candidates'] if c['name'] == 'Suresh Yadav']) == 1, 'no duplicate work profile')

    # manual fallback: police badge → admin approves
    go('workerStatus'); page.locator('[data-worker-check="police"]').click(); page.wait_for_timeout(60)
    page.set_input_files('form[data-worker-manual="police"] input[name="police"]', tmp.name)
    page.locator('form[data-worker-manual="police"] button[type=submit]').click(); page.wait_for_timeout(80)
    item = next(v for v in st()['verificationQueue'] if v.get('check') == 'police')
    ws('admin'); go('verification')
    if page.locator('form[data-op-form="admin-stepup"]').count():
        page.fill('input[name="code"]', '246810'); page.locator('form[data-op-form="admin-stepup"] button').click(); page.wait_for_timeout(80)
    page.locator(f'[data-op="open-verification"][data-id="{item["id"]}"]').first.click(); page.wait_for_timeout(60)
    page.select_option('form[data-op-form="admin-decision"] select[name="decision"]', 'approve')
    page.locator('form[data-op-form="admin-decision"] button').click(); page.wait_for_timeout(80)
    cand = next(c for c in st()['candidates'] if c['name'] == 'Suresh Yadav')
    check(cand['checks']['police']['status'] == 'verified', 'manual badge approved')

    # 10. Business instant checks: GST fetch, penny-drop; fleet RC lookup
    page.evaluate("window.MoveAIVNextTest.switchWorkspace('personal','business')"); go('businessDetails')
    check(page.locator('[data-gst-fetch]').count() == 1, 'GST fetch present')
    if True:
        page.fill('#business-details-form [name="gstin"]', '09AAACR5055K1Z9'); page.click('[data-gst-fetch]'); page.wait_for_timeout(40)
        check('cancelled' in page.locator('#gst-note').inner_text(), 'cancelled GSTIN flagged')
        page.fill('#business-details-form [name="gstin"]', '09AAACR5055K1Z5'); page.click('[data-gst-fetch]'); page.wait_for_timeout(40)
        check(page.input_value('#business-details-form [name="pan"]') == 'AAACR5055K', 'PAN filled from GSTIN')
    go('bank')
    check(page.locator('[data-penny-drop]').count() == 1, 'penny drop present')
    if True:
        page.fill('#bank-form [name="accountNumber"]', '123456789012'); page.fill('#bank-form [name="ifsc"]', 'HDFC0001842')
        page.click('[data-penny-drop]'); page.wait_for_timeout(40); check('holder name matched' in page.locator('#bank-note').inner_text(), 'penny drop ok')
    ws('vehicle'); go('addVehicle'); page.fill('form[data-op-form="add-vehicle"] [name="registration"]', 'BR01 GX 7745')
    page.click('[data-rc-fetch]'); page.wait_for_timeout(40); check('Found on Vahan' in page.locator('#rc-note').inner_text(), 'RC lookup')
    page.locator('form[data-op-form="add-vehicle"] button.primary').click(); page.wait_for_timeout(80)
    check('Ready to assign' in page.locator('#toast').inner_text(), 'vehicle verified from Vahan')
    os.unlink(tmp.name)

    # 11. Option C: each product shows only its own menus
    for product, file in [('customer', 'index.html'), ('partner', 'partner.html'), ('business', 'business.html'), ('admin', 'admin.html')]:
        page.goto(f'{BASE}/{file}#/home'); page.wait_for_load_state('networkidle'); page.wait_for_timeout(100)
        check(page.evaluate('window.MoveAIVNextTest.product()') == product, f'{file} opens {product}')
        nav = page.locator('#desktop-nav').inner_text()
        if product == 'customer':
            for word in ['Work', 'Invitations', 'Payments', 'Find work']: check(word not in nav, f'customer menu hides {word}')
            check('Book' in nav and 'Account' in nav, 'customer menu')
            check('Earn with MoveAI Partner' not in page.locator('#main-content').inner_text(), 'no partner pitch on customer home')
            page.click('#workspace-button'); lst = page.locator('#workspace-list').inner_text(); page.keyboard.press('Escape')
            check('Raj Logistics' not in lst.split('Other MoveAI apps')[0], 'customer switcher lists no business roles')
        if product == 'partner': check('Find work' in nav, 'partner menu')
        if product == 'business': check(page.evaluate('window.MoveAIVNextTest.state().currentWorkspace') in ['transporter', 'goods', 'vehicle', 'movers', 'personal', 'staff'], 'business roles only')
        if product == 'admin': check(page.evaluate('window.MoveAIVNextTest.state().currentWorkspace') == 'admin', 'admin only')
        shot(f'20-{product}-home')
    page.goto(f'{BASE}/index.html#/workerStatus'); page.wait_for_timeout(120)
    check(page.evaluate('window.MoveAIVNextTest.product()') == 'partner', 'partner deep link from customer app opens Partner')
    page.goto(f'{BASE}/index.html#/home'); page.wait_for_timeout(100)
    check(not errors, f'runtime errors: {errors[:3]}')

    # 8. mobile layout renders
    page.set_viewport_size({'width': 390, 'height': 844}); ws('commercialDriver'); go('tripDetail'); shot('13-mobile-trip')
    check(not errors, f'runtime errors: {errors[:3]}')
    b.close()
srv.shutdown()
print(json.dumps({'status': 'PASS', 'routesVisited': visited}, indent=2))
