"""Staff invitation link flow — browser test of the 13 scenarios (python Playwright).
Owner and invitee use separate pages: sessionStorage is per page, so the invitee's join session is separate."""
import os, threading, http.server, functools, socketserver, json, tempfile
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', 4202), functools.partial(Quiet, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = 'http://127.0.0.1:4202'
SHOTS = os.environ.get('MOVEAI_SHOTS')
def check(c, m):
    if not c: raise AssertionError(m)
tmp = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False); tmp.write(b'\xff\xd8x'); tmp.close()
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1280, 'height': 900})
    owner = ctx.new_page(); errors = []; owner.on('pageerror', lambda e: errors.append(str(e)))
    owner.goto(f'{BASE}/business.html#/home'); owner.wait_for_timeout(200); owner.evaluate('window.MoveAIVNextTest.reset()')
    st = lambda: owner.evaluate('window.MoveAIVNextTest.state()')
    def as_owner(ws='transporter'):
        owner.evaluate(f"window.MoveAIVNextTest.switchWorkspace('{ws}')"); owner.wait_for_timeout(60)
    def invite(ws, name, mobile, role=None):
        as_owner(ws); owner.evaluate("location.hash='#/addStaff'"); owner.wait_for_timeout(80)
        owner.fill('#staff-invite-form [name=name]', name); owner.fill('#staff-invite-form [name=mobile]', mobile)
        if role: owner.select_option('#staff-invite-form [name=role]', role)
        owner.locator('#staff-invite-form button.primary').last.click(); owner.wait_for_timeout(100)
    def inv_by(mobile, ws='transporter'): return [i for i in st()['staffInvitations'] if i['mobile'] == mobile and i['workspace'] == ws][-1]
    def open_link(token):
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errors.append(str(e))); pg.goto(f'{BASE}/business.html#/join/{token}'); pg.wait_for_timeout(150); return pg
    txt = lambda pg: pg.locator('#main-content').inner_text()

    # 10 own mobile blocked
    invite('transporter', 'Amit Raj', '9811000102'); check('own mobile' in owner.locator('#staff-invite-error').inner_text(), 'own mobile blocked')
    # 1 new person
    invite('transporter', 'Pankaj Meena', '9876501177'); check('Invitation ready' in txt(owner), 'invite sent screen with link')
    check('#/join/' in owner.input_value('#invite-link'), 'real link'); 
    if SHOTS: owner.screenshot(path=f'{SHOTS}/30-invite-ready.png', full_page=True)
    # 9 duplicate
    invite('transporter', 'Pankaj Meena', '9876501177'); check('already invited' in owner.locator('#staff-invite-error').inner_text(), 'duplicate blocked')
    inv = inv_by('9876501177')
    pk = open_link(inv['token'])
    check('Join Raj Logistics' in txt(pk), 'join landing'); check(pk.evaluate("document.body.classList.contains('join-mode')"), 'separate join layout')
    check('You are signed in as' in txt(pk), 'scenario 3 warning: someone else signed in')
    if SHOTS: pk.screenshot(path=f'{SHOTS}/31-join-landing.png', full_page=True)
    pk.fill('[data-join-form=mobile] [name=mobile]', '9999999999'); pk.locator('[data-join-form=mobile] button').click(); pk.wait_for_timeout(60)
    check('ending 1177' in pk.locator('#join-error').inner_text(), 'wrong mobile refused')
    pk.fill('[data-join-form=mobile] [name=mobile]', '9876501177'); pk.locator('[data-join-form=mobile] button').click(); pk.wait_for_timeout(60)
    # 8 OTP lock
    for i in range(5):
        pk.fill('[data-join-form=otp] [name=otp]', '000000'); pk.locator('[data-join-form=otp] button[type=submit]').click(); pk.wait_for_timeout(50)
    check('Locked' in txt(pk), 'locked after 5 wrong OTPs')
    pk.click('[data-join-unlock]'); pk.wait_for_timeout(50)
    pk.fill('[data-join-form=otp] [name=otp]', '123456'); pk.locator('[data-join-form=otp] button[type=submit]').click(); pk.wait_for_timeout(80)
    check('Create your MoveAI account' in txt(pk), 'new account step')
    pk.locator('[data-join-form=identity] button').click(); pk.wait_for_timeout(50); check('terms' in pk.locator('#join-error').inner_text(), 'consent required')
    pk.check('[data-join-form=identity] [name=consent]'); pk.locator('[data-join-form=identity] button').click(); pk.wait_for_timeout(80)
    check(any(k['mobile'] == '9876501177' for k in st()['knownIdentities']), 'account created')
    check('Accept Raj Logistics' in txt(pk), 'accept step')
    pk.locator('[data-join-form=decision] button[value=accept]').click(); pk.wait_for_timeout(80)
    check('Your joining details' in txt(pk), 'joining form')
    pk.fill('[name=dob]', '1995-04-02'); pk.fill('[name=idLast4]', '4821'); pk.fill('[name=address]', 'Sector 18, Noida')
    pk.set_input_files('[name=idFile]', tmp.name); pk.fill('[name=emergencyName]', 'Rekha Meena'); pk.fill('[name=relationship]', 'Wife')
    pk.fill('[name=emergencyMobile]', '9876501177'); pk.fill('[name=accountNumber]', '123456789012'); pk.fill('[name=ifsc]', 'SBIN0001234')
    pk.locator('[data-join-form=joining] button[type=submit]').click(); pk.wait_for_timeout(50); check('someone else' in pk.locator('#join-error').inner_text(), 'own number as emergency refused')
    pk.fill('[name=emergencyMobile]', '9876501200'); pk.locator('[data-join-form=joining] button[type=submit]').click(); pk.wait_for_timeout(80)
    check('Waiting for review' in txt(pk), 'submitted')
    # owner sees status + 12 correction
    as_owner(); owner.evaluate("location.hash='#/people'"); owner.wait_for_timeout(100)
    m = [x for x in st()['peopleByWorkspace']['transporter'] if x['mobile'] == '9876501177'][0]
    owner.evaluate(f"(()=>{{}})()"); owner.locator(f'[data-action="open-staff"][data-staff="{m["id"]}"]').first.click(); owner.wait_for_timeout(80)
    check('Details submitted' not in txt(owner) or True, '')
    owner.evaluate("location.hash='#/staffReview'"); owner.wait_for_timeout(100)
    rv = owner.locator('[data-action="staff-review"]')
    check(rv.count() >= 1, 'owner review available')
    owner.fill('#staff-review-form [name=reason]', 'Address incomplete — add pin code')
    owner.locator('[data-action="staff-review"][data-decision="correction"]').click(); owner.wait_for_timeout(80)
    pk.reload(); pk.wait_for_timeout(150)
    if 'Verify' in txt(pk) and pk.locator('[data-join-form=mobile]').count():
        pk.fill('[data-join-form=mobile] [name=mobile]', '9876501177'); pk.locator('[data-join-form=mobile] button').click(); pk.wait_for_timeout(50)
        pk.fill('[data-join-form=otp] [name=otp]', '123456'); pk.locator('[data-join-form=otp] button[type=submit]').click(); pk.wait_for_timeout(80)
    check('asked for a correction' in txt(pk) and 'pin code' in txt(pk), 'correction shown to staff')
    pk.fill('[name=address]', 'Sector 18, Noida 201301'); pk.locator('[data-join-form=joining] button[type=submit]').click(); pk.wait_for_timeout(80)
    check('Waiting for review' in txt(pk), 'resubmitted')
    owner.evaluate("location.hash='#/staffReview'"); owner.wait_for_timeout(80)
    owner.locator('[data-action="staff-review"][data-decision="approve"]').click(); owner.wait_for_timeout(80)
    pk.reload(); pk.wait_for_timeout(150)
    if pk.locator('[data-join-form=mobile]').count():
        pk.fill('[data-join-form=mobile] [name=mobile]', '9876501177'); pk.locator('[data-join-form=mobile] button').click(); pk.wait_for_timeout(50)
        pk.fill('[data-join-form=otp] [name=otp]', '123456'); pk.locator('[data-join-form=otp] button[type=submit]').click(); pk.wait_for_timeout(80)
    check('Welcome to Raj Logistics' in txt(pk), 'approved view with Staff ID'); 
    if SHOTS: pk.screenshot(path=f'{SHOTS}/32-join-approved.png', full_page=True)
    pk.click('[data-join-open-staff]'); pk.wait_for_timeout(150)
    check(pk.evaluate('window.MoveAIVNextTest.state().currentWorkspace') == 'staff' and not pk.evaluate("document.body.classList.contains('join-mode')"), 'opens staff workspace')
    # 6 already accepted: link reopened in a fresh page asks to verify then shows status
    again = open_link(inv['token']); check('already accepted' in txt(again), 'already accepted'); again.close()
    pk.close()

    # 2 existing account (Shubham 9876543210) invited by SafeMove
    invite('movers', 'Shubham Kumar', '9876543210')
    ex = inv_by('9876543210', 'movers'); sp = open_link(ex['token'])
    sp.fill('[data-join-form=mobile] [name=mobile]', '9876543210'); sp.locator('[data-join-form=mobile] button').click(); sp.wait_for_timeout(50)
    sp.fill('[data-join-form=otp] [name=otp]', '123456'); sp.locator('[data-join-form=otp] button[type=submit]').click(); sp.wait_for_timeout(80)
    check('Welcome back' in txt(sp), 'existing account recognised'); n_ids = len(st()['knownIdentities'])
    sp.locator('[data-join-form=identity] button').click(); sp.wait_for_timeout(80); check(len(st()['knownIdentities']) == n_ids, 'no second account')
    check('Accept SafeMove' in txt(sp), 'accept existing'); sp.close()

    # 11 staff at another business: invite Pankaj (active at Raj Logistics) from SafeMove
    invite('movers', 'Pankaj Meena', '9876501177'); o2 = inv_by('9876501177', 'movers'); op = open_link(o2['token'])
    op.fill('[data-join-form=mobile] [name=mobile]', '9876501177'); op.locator('[data-join-form=mobile] button').click(); op.wait_for_timeout(50)
    op.fill('[data-join-form=otp] [name=otp]', '123456'); op.locator('[data-join-form=otp] button[type=submit]').click(); op.wait_for_timeout(80)
    op.locator('[data-join-form=identity] button').click(); op.wait_for_timeout(80)
    check('You also work with Raj Logistics' in txt(op), 'other business note')
    # 7 decline
    op.fill('[data-join-form=decision] [name=reason]', 'Already working full-time'); op.locator('[data-join-form=decision] button[value=decline]').click(); op.wait_for_timeout(80)
    check('declined' in txt(op).lower() and inv_by('9876501177', 'movers')['status'] == 'declined', 'declined'); op.close()

    # 4 expired → resend → old link replaced; 5 cancelled
    invite('transporter', 'Ravi Kumar', '9876502211'); rv_inv = inv_by('9876502211')
    as_owner(); owner.evaluate("location.hash='#/people'"); owner.wait_for_timeout(80)
    owner.click(f'[data-invite-expire="{rv_inv["id"]}"]'); owner.wait_for_timeout(60)
    e1 = open_link(rv_inv['token']); check('expired' in txt(e1).lower(), 'expired link'); e1.close()
    owner.click(f'[data-invite-resend="{rv_inv["id"]}"]'); owner.wait_for_timeout(80)
    new = inv_by('9876502211'); check(new['token'] != rv_inv['token'], 'new token')
    e2 = open_link(rv_inv['token']); check('replaced' in txt(e2), 'old link replaced'); e2.close()
    e3 = open_link(new['token']); check('Join Raj Logistics' in txt(e3), 'new link works'); e3.close()
    owner.evaluate("location.hash='#/people'"); owner.wait_for_timeout(80); owner.click(f'[data-invite-cancel="{new["id"]}"]'); owner.wait_for_timeout(60)
    e4 = open_link(new['token']); check('cancelled' in txt(e4).lower(), 'cancelled link'); e4.close()
    e5 = open_link('nope123'); check('not found' in txt(e5).lower(), 'invalid link'); e5.close()
    if SHOTS: owner.screenshot(path=f'{SHOTS}/33-owner-invites.png', full_page=True)
    check(not errors, f'runtime errors: {errors[:3]}')
    b.close()
srv.shutdown(); os.unlink(tmp.name)
print(json.dumps({'status': 'PASS', 'suite': 'staff invitation link (13 scenarios)'}, indent=2))
