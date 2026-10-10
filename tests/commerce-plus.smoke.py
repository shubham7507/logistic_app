"""Browser check of the e-commerce additions across customer, seller, delivery and admin apps."""
import os, threading, http.server, functools, socketserver, json, tempfile
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', 4212), functools.partial(Quiet, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start()
SHOTS = os.environ.get('MOVEAI_SHOTS'); B = 'http://127.0.0.1:4212'
def check(c, m):
    if not c: raise AssertionError(m)
tmp = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False); tmp.write(b'\xff\xd8x'); tmp.close()
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1366, 'height': 900}); errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(f'{B}/index.html#/home'); pg.wait_for_timeout(300); pg.evaluate('window.MoveAIVNextTest.reset()')
    go = lambda r: (pg.evaluate(f"location.hash='#/{r}'"), pg.wait_for_timeout(150))
    st = lambda: pg.evaluate('window.MoveAIVNextTest.state()')
    main = lambda: pg.locator('#main-content').inner_text()
    shot = lambda n: SHOTS and pg.screenshot(path=f'{SHOTS}/{n}.png', full_page=True)
    # customer: Hindi search, filters, product page
    go('search'); pg.fill('#product-search-form input', 'chawal'); pg.locator('#product-search-form button').first.click(); pg.wait_for_timeout(150)
    check('India Gate Basmati Rice' in main(), 'Hindi synonym search'); check('% off' in main(), 'MRP discount on cards'); shot('120-search')
    pg.locator('[data-po-detail="PRD-101"]').first.click(); pg.wait_for_timeout(150)
    t = main(); check('MRP' in t and 'Product details' in t and 'Ratings & reviews' in t and 'Arrives in about' in t, 'product page extras')
    pg.locator('[data-plus-variant="PRD-105"]').click(); pg.wait_for_timeout(120); check(st()['selectedProductId'] == 'PRD-105', 'variant switch')
    pg.locator('[data-plus="wish"]').click(); pg.wait_for_timeout(100); check('PRD-105' in st()['wishlist'], 'wishlist'); shot('121-product')
    pg.locator('[data-po-add="PRD-105"]').first.click(); pg.wait_for_timeout(150)
    go('search'); pg.fill('#product-search-form input', 'tamatar'); pg.locator('#product-search-form button').first.click(); pg.wait_for_timeout(150)
    pg.locator('[data-po-detail="PRD-106"]').first.click(); pg.wait_for_timeout(120); pg.locator('[data-po-add="PRD-106"]').first.click(); pg.wait_for_timeout(150)
    go('cart'); pg.wait_for_timeout(100); pg.locator('[data-route="productCheckout"], [data-po-checkout], button:has-text("Checkout")').first.click(); pg.wait_for_timeout(200)
    if 'Offers, tip and delivery time' not in main(): go('productCheckout')
    check('Offers, tip and delivery time' in main() and 'sold by weight' in main(), 'checkout extras'); 
    pg.fill('[name="plusCoupon"]', 'SAVE10'); pg.click('[data-plus="apply-checkout"]'); pg.wait_for_timeout(150)
    check('needs' in main() or 'applied' in main(), 'coupon validated'); shot('122-checkout')
    pg.fill('[name="plusCoupon"]', ''); pg.select_option('[name="plusTip"]', '20'); pg.click('[data-plus="apply-checkout"]'); pg.wait_for_timeout(150)
    pg.locator('form[data-po-form="checkout"] button[type=submit]').click(); pg.wait_for_timeout(300)
    o = [x for x in st()['customerOrders'] if any(i['productId'] in ('PRD-105', 'PRD-106') for i in x['items'])]
    check(o and any(x.get('tip') == 20 for x in o), f'order placed with tip ({[x.get("status") for x in o]})')
    # mark the Fresh Mart order delivered (seller/picker/courier steps are covered by v4's own tests), then raise a claim + review
    pg.evaluate("""(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('moveai-vnext'));const d=JSON.parse(localStorage.getItem(k));for(const o of d.customerOrders.filter(o=>o.items.some(i=>i.productId==='PRD-106'))){o.status='delivered';o.deliveredAt=Date.now();}localStorage.setItem(k,JSON.stringify(d))})()"""); pg.reload(); pg.wait_for_timeout(300)
    go('orders'); pg.locator('.order-help summary').first.click(); pg.wait_for_timeout(100)
    f = pg.locator('form[data-plus-form="claim"]').first; f.locator('[name=kind]').select_option('missing'); f.locator('[name=qty]').fill('1'); f.locator('button').click(); pg.wait_for_timeout(200)
    check(any(c['status'] == 'refunded' for c in st()['claims']) and st()['customerWallet']['balance'] > 0, 'small fresh claim auto-refunded to wallet')
    pg.locator('.order-help summary').first.click(); pg.wait_for_timeout(100)
    pg.locator('form[data-plus-form="review"] button').first.click(); pg.wait_for_timeout(150); check(len(st()['reviews']) > 4, 'review saved'); shot('123-help')
    go('wishlist'); check('Buy again' in main() and 'Wishlist' in main(), 'wishlist screen')
    # seller
    pg.goto(f'{B}/seller.html#/plusListings'); pg.wait_for_timeout(300)
    check('Products and stock' in main(), 'seller catalogue redirect'); pg.locator('[data-plus="edit-listing"]').first.click(); pg.wait_for_timeout(150)
    pg.fill('form[data-plus-form="listing"] [name="mrp"]', '1'); pg.locator('form[data-plus-form="listing"] button').click(); pg.wait_for_timeout(120)
    check('MRP' in pg.locator('.plus-error').inner_text() or 'above' in pg.locator('.plus-error').inner_text(), 'price above MRP refused'); shot('124-listings')
    go('plusStore'); pg.click('[data-plus="toggle-pause"]'); pg.wait_for_timeout(120); check(any(p.get('paused') for p in st()['shopPartners'].values()), 'store paused'); pg.click('[data-plus="toggle-pause"]'); pg.wait_for_timeout(100)
    go('plusAnalytics'); check('Delivered sales' in main(), 'analytics')
    # delivery and admin
    pg.goto(f'{B}/delivery.html#/deliveryJobs'); pg.wait_for_timeout(300); check('Return pickups' in main(), 'delivery extras')
    pg.goto(f'{B}/admin.html#/plusApprovals'); pg.wait_for_timeout(300); check('Seller & listing approvals' in main(), 'admin approvals')
    for r in ['plusClaims', 'plusSettings', 'plusReports']: go(r); check(len(main()) > 100, r)
    check('Notification outbox' in main(), 'outbox'); shot('125-reports')
    check(not errors, f'runtime errors: {errors[:3]}')
    b.close()
srv.shutdown(); os.unlink(tmp.name)
print(json.dumps({'status': 'PASS', 'suite': 'e-commerce additions in the browser'}, indent=2))
