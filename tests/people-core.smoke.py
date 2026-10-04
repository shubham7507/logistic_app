"""Browser: Branches & teams for a transporter owner and a store manager — transfer, team, cover request, assign a trip."""
import os, threading, http.server, functools, socketserver, json
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', 4270), functools.partial(Quiet, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start()
B = 'http://127.0.0.1:4270'; SHOTS = os.environ.get('MOVEAI_SHOTS')
def check(c, m):
    if not c: raise AssertionError(m)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1366, 'height': 900}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    st = lambda: pg.evaluate('window.MoveAIVNextTest.state()'); main = lambda: pg.locator('#main-content').inner_text()
    go = lambda r: (pg.evaluate(f"location.hash='#/{r}'"), pg.wait_for_timeout(200))
    er = lambda: pg.locator('.pc-error').inner_text() if pg.locator('.pc-error').count() else ''
    pg.goto(f'{B}/business.html#/home'); pg.wait_for_timeout(300); pg.evaluate('window.MoveAIVNextTest.reset()'); pg.evaluate("window.MoveAIVNextTest.switchWorkspace('transporter')"); go('branchesTeams')
    t = main(); check('Branches & teams' in t and 'Noida HQ' in t and 'Jaipur Branch' in t and 'Fleet crew A' in t, 'branches and teams shown')
    check('No manager — owner approves' in t, 'owner fallback shown')
    # new crew at Jaipur, assign trip, cover request for Mohan
    f = pg.locator('form[data-pc-form="team-new"][data-branch="BR-002"]'); f.locator('[name=name]').fill('Fleet crew B'); f.locator('[name=kind]').select_option('crew'); f.locator('button').click(); pg.wait_for_timeout(150)
    crew = next(x for x in st()['teams'] if x['name'] == 'Fleet crew B'); check(crew['branchId'] == 'BR-002', f'team created ({er()})')
    c = pg.locator('form[data-pc-form="cover"][data-branch="BR-002"]'); c.locator('[name=empId]').select_option('EMP-WORKER-001'); c.locator('[name=reason]').fill('Big load'); c.locator('button').click(); pg.wait_for_timeout(150)
    check(st()['coverRequests'][0]['status'] == 'approved' and 'BR-002' in next(e for e in st()['employments'] if e['id'] == 'EMP-WORKER-001')['cover'], f'cover applied ({er()})')
    a = pg.locator('form[data-pc-form="assign"][data-id="TRP-503"]'); a.locator('[name=teamId]').select_option(crew['id']); a.locator('button').click(); pg.wait_for_timeout(150)
    check(next(x for x in st()['trips'] if x['id'] == 'TRP-503').get('teamId') == crew['id'], f'trip assigned to team ({er()})')
    # transfer Sunita to Jaipur with history
    pg.locator('details:has(form[data-pc-form="transfer"][data-id="EMP-STAFF-002"]) summary').first.click(); tf = pg.locator('form[data-pc-form="transfer"][data-id="EMP-STAFF-002"]'); tf.locator('[name=home]').select_option('BR-002'); tf.locator('[name=reason]').fill('Jaipur accounts'); tf.locator('button').click(); pg.wait_for_timeout(150)
    check(next(e for e in st()['employments'] if e['id'] == 'EMP-STAFF-002')['homeBranch'] == 'BR-002', f'transfer ({er()})')
    if SHOTS: pg.screenshot(path=f'{SHOTS}/150-branches-teams.png', full_page=True)
    # movers owner sees its own branches; store manager sees only Karol Bagh
    pg.evaluate("window.MoveAIVNextTest.switchWorkspace('movers')"); go('branchesTeams'); check('Gurugram Branch' in main() and 'Crew Alpha' in main(), 'movers branches')
    pg.goto(f'{B}/seller.html#/branchesTeams'); pg.wait_for_timeout(300); pg.evaluate("window.MoveAIVNextTest.switchWorkspace('groceryManager')"); go('branchesTeams')
    t = main(); check('you manage' in t and 'Karol Bagh' in t and 'Morning shift' in t and 'Noida ·' not in t, 'manager scope')
    check(not errs, f'runtime errors: {errs[:3]}')
    b.close()
srv.shutdown(); print(json.dumps({'status': 'PASS', 'suite': 'branches & teams in the browser'}, indent=2))
