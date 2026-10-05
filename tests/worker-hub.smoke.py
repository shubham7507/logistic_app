"""Browser: My work & pay for a helper (view as Sanju: current job, past work, statement, history), delivery partner and picker."""
import os, threading, http.server, functools, socketserver, json
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', 4290), functools.partial(Quiet, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start()
B = 'http://127.0.0.1:4290'; SHOTS = os.environ.get('MOVEAI_SHOTS')
def check(c, m):
    if not c: raise AssertionError(m)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1366, 'height': 900}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    st = lambda: pg.evaluate('window.MoveAIVNextTest.state()'); main = lambda: pg.locator('#main-content').inner_text()
    go = lambda r: (pg.evaluate(f"location.hash='#/{r}'"), pg.wait_for_timeout(200))
    pg.goto(f'{B}/partner.html#/home'); pg.wait_for_timeout(300); pg.evaluate('window.MoveAIVNextTest.reset()'); pg.evaluate("window.MoveAIVNextTest.switchWorkspace('helper')"); go('myWork')
    check('My work & pay' in main() and 'Ramesh Yadav' in main(), 'helper sees own hub')
    pg.select_option('form[data-hub-form="viewas"] [name=pid]', 'P-9876507001'); pg.locator('form[data-hub-form="viewas"] button').click(); pg.wait_for_timeout(200)
    t = main(); check('Sanju Kumar' in t and 'Raj Logistics' in t and 'Khalasi' in t, 'Sanju current job')
    check('Past work' in t and 'ABC Grocery' in t and '₹11,220' in t, 'past work + statement')
    check('Work history' in t, 'work history')
    pg.locator('[data-hub-consent]').check(); pg.wait_for_timeout(120); check(st()['persons']['P-9876507001']['consentWorkHistory'], 'consent saved')
    if SHOTS: pg.screenshot(path=f'{SHOTS}/160-sanju.png', full_page=True)
    pg.goto(f'{B}/delivery.html#/myWork'); pg.wait_for_timeout(300); go('myWork'); check('MoveAI Delivery' in main() and 'Delivery partner' in main(), 'delivery partner hub')
    pg.goto(f'{B}/picker.html#/myWork'); pg.wait_for_timeout(300); go('myWork'); check('ABC Grocery' in main() and 'Asha Picker' in main(), 'picker hub')
    check(not errs, f'runtime errors: {errs[:3]}')
    b.close()
srv.shutdown(); print(json.dumps({'status': 'PASS', 'suite': 'worker hub in the browser'}, indent=2))
