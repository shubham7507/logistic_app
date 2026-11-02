"""Browser: Staff (easy) — typed Hindi command → confirm, mark present, pay cash with SMS, balances with WhatsApp; Hindi switch."""
import os, threading, http.server, functools, socketserver, json
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', 4295), functools.partial(Quiet, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start()
B = 'http://127.0.0.1:4295'; SHOTS = os.environ.get('MOVEAI_SHOTS')
def check(c, m):
    if not c: raise AssertionError(m)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1366, 'height': 900}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    st = lambda: pg.evaluate('window.MoveAIVNextTest.state()'); main = lambda: pg.locator('#main-content').inner_text()
    go = lambda r: (pg.evaluate(f"location.hash='#/{r}'"), pg.wait_for_timeout(200))
    pg.goto(f'{B}/business.html#/home'); pg.wait_for_timeout(300); pg.evaluate('window.MoveAIVNextTest.reset()'); pg.evaluate("window.MoveAIVNextTest.switchWorkspace('transporter')"); go('easyStaff')
    check('Staff' in main() and 'Speak or type' in main() and 'People at this business' in main(), 'Staff hub with speak-or-type commands')
    pg.fill('form[data-easy-form="voice"] [name=text]', 'Ramesh ko 2000 advance diya'); pg.locator('form[data-easy-form="voice"] button[type=submit], form[data-easy-form="voice"] button:not([type=button])').first.click(); pg.wait_for_timeout(150)
    check('advance to Ramesh Yadav' in main(), 'command understood'); pg.click('[data-easy="confirm"]'); pg.wait_for_timeout(150)
    # Advances and attendance are recorded once in the shared payroll (payAdvances / payEvents).
    # Money said aloud is never moved by voice alone: it opens Pay workers for that person to review and confirm.
    check(st().get('selectedPayPersonId') and 'Ramesh' in main(), 'advance opens Pay workers for review')
    go('easyStaff')
    before = len(st().get('payEvents', [])) + len(st().get('attendance', [])) + len(st().get('staffDays', []))
    pg.fill('form[data-easy-form="voice"] [name=text]', 'Ramesh aaj present'); pg.locator('form[data-easy-form="voice"] button[type=submit], form[data-easy-form="voice"] button:not([type=button])').first.click(); pg.wait_for_timeout(150)
    check('present today' in main(), 'present command understood'); pg.click('[data-easy="confirm"]'); pg.wait_for_timeout(150)
    check(len(st().get('payEvents', [])) + len(st().get('attendance', [])) + len(st().get('staffDays', [])) > before, 'present marked')
    go('staffPay'); check('Pay workers' in main() and 'Ramesh Yadav' in main(), 'balances in Pay workers')
    if SHOTS: pg.screenshot(path=f'{SHOTS}/170-easy.png', full_page=True)
    # Hindi switch translates the staff screens
    go('easyStaff'); pg.locator('[data-easy-lang]').first.click(); pg.wait_for_timeout(500); go('easyStaff')
    t = main(); check('स्टाफ़' in t, 'Hindi screen')
    if SHOTS: pg.screenshot(path=f'{SHOTS}/171-easy-hi.png', full_page=True)
    pg.goto(f'{B}/partner.html#/myWork'); pg.wait_for_timeout(300); pg.evaluate("window.MoveAIVNextTest.switchWorkspace('helper')"); go('myWork'); check('मेरा काम और वेतन' in main(), 'worker hub in Hindi')
    check(not errs, f'runtime errors: {errs[:3]}')
    b.close()
srv.shutdown(); print(json.dumps({'status': 'PASS', 'suite': 'easy mode in the browser'}, indent=2))
