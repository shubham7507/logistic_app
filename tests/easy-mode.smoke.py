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
    check('Staff (easy)' in main() and 'Bata' in main(), 'easy screen with business words')
    pg.fill('form[data-easy-form="voice"] [name=text]', 'Ramesh ko 2000 advance diya'); pg.locator('form[data-easy-form="voice"] button[type=submit], form[data-easy-form="voice"] button:not([type=button])').first.click(); pg.wait_for_timeout(150)
    check('advance to Ramesh Yadav' in main(), 'command understood'); pg.click('[data-easy="confirm"]'); pg.wait_for_timeout(150)
    check(next(x for x in st()['peopleByWorkspace']['transporter'] if x['id'] == 'WORKER-002').get('loan', {}).get('balance') == 2000, 'advance given')
    check(any('paid you' in m['text'] for m in st()['outbox']), 'SMS confirm sent')
    pg.click('[data-easy-act="present"]'); pg.wait_for_timeout(120); pg.locator('form[data-easy-form="present"] [name=who]').first.check(); pg.locator('form[data-easy-form="present"] button').click(); pg.wait_for_timeout(150)
    check(any(a.get('source') == 'easy' for a in st().get('attendance', [])), 'present marked')
    pg.click('[data-easy-act="balances"]'); pg.wait_for_timeout(120); check('Send on WhatsApp' in main(), 'balances with WhatsApp')
    if SHOTS: pg.screenshot(path=f'{SHOTS}/170-easy.png', full_page=True)
    # Hindi switch translates the screen and menu
    pg.locator('header.topbar [data-easy-lang]').click(); pg.wait_for_timeout(500); go('easyStaff')
    t = main(); check('स्टाफ़ (आसान)' in t and 'हाज़िरी लगाएँ' in t, 'Hindi screen')
    if SHOTS: pg.screenshot(path=f'{SHOTS}/171-easy-hi.png', full_page=True)
    pg.goto(f'{B}/partner.html#/myWork'); pg.wait_for_timeout(300); pg.evaluate("window.MoveAIVNextTest.switchWorkspace('helper')"); go('myWork'); check('मेरा काम और वेतन' in main(), 'worker hub in Hindi')
    check(not errs, f'runtime errors: {errs[:3]}')
    b.close()
srv.shutdown(); print(json.dumps({'status': 'PASS', 'suite': 'easy mode in the browser'}, indent=2))
