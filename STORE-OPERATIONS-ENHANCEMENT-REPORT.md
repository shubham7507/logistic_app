# Seller operations enhancement report

Date: 4 October 2026 (Singapore)

## Added to the GitHub Pages demo

- `demo-guide.html` is a six-step, clickable checklist from customer shopping through seller, store staff, Ravi, and customer/admin verification. A link appears on customer, seller, store staff, and delivery home screens. Progress is saved in this browser only and can be cleared independently of orders.
- Seller owners and managers now see **Needs attention** in navigation. The queue is scoped to their own store and shows unavailable-item review, no worker assigned, expired worker offer, completed picking awaiting packing for more than 15 minutes, no courier, expired courier offer, or an accepted courier still awaiting pickup. Each flagged order is rendered with its existing action buttons.
- The pick checklist now asks for model/wattage and condition for electrical products, size/colour and condition for fashion products, and freshness/expiry and condition for fresh vegetables, fruit, dairy, or bakery. Both boxes must be confirmed before an item can be marked checked. The selections are saved with that order, cleared on uncheck or reassignment, and validated again before completing preparation. Other grocery or household items retain the quantity checklist.
- Staff, schedule, offboarding, payment, delivery and admin headings use store-wide wording where the UI covers multiple seller types.

## Try it

Open `demo-guide.html` after pushing the ZIP contents to your GitHub Pages repository. In one normal browser profile, follow its links and check off each step. To inspect an exception, accept an electrical order while no store worker has started a shift: Seller → Needs attention shows **No staff assigned or available**. If you prepare it yourself, confirm both model and condition checks before completing it.

## Verification

- `npm run test:commerce`: passed all suites, including electrical/fashion and grocery cross-role journeys, payment and COD tests, plus the new exception/quality/guide test.
- `npm run test:unit`: passed.
- JavaScript syntax checks and eight screen/static integration scripts: passed.
- Full browser click-through was not executable in this workspace. The installed Playwright package has no Chromium binary, and Python Playwright is absent. The new guide should be used for a final manual click-through on the published URL.

## Demo limits

GitHub Pages uses localStorage here. Different devices, browser profiles, and incognito sessions cannot share a real order. Category checks record mock confirmation; they do not scan a barcode or verify expiry, serial number, or product condition with external systems. The exception queue computes its status from saved order timestamps; there is no background scheduler. The UI does not charge money or send actual push/SMS notifications.

## Team layout correction

The City Fashion screenshot showed Pooja's name stacked in a narrow column beside a stretched Plan exit button. The shared row used a grid intended for rows with a leading icon, but the Team row has no icon. Team worker and manager rows now use a two-column person/action layout on desktop and a one-column layout on narrow screens. The item checklist gets its own responsive grid. Commerce and unit suites passed after this correction. A visual check of the published page is still needed after pushing this ZIP.
