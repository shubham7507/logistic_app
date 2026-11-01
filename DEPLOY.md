# Publishing MoveAI on GitHub Pages

Your site is `https://shubham7507.github.io/logistic_app/`. After this update:

| Link | Who it is for |
|---|---|
| `…/logistic_app/guide.html` | **Start here.** Plain-language guide: every role, flows, 6 videos, "Show me in the app" |
| `…/logistic_app/index.html` | Live demo with the **▶ Tours & testing** button |
| `…/logistic_app/index.html?demo=off` | Clean demo for presentations (no testing buttons) |
| `…/logistic_app/index.html?tour=seller-up` | Opens the demo and plays a journey straight away (`seller-up`, `seller-bihar`, `picker`, `customer`, `logistics`, `admin`) |

## Option A — upload with git (recommended)
```bash
git clone https://github.com/shubham7507/logistic_app.git
cd logistic_app
git checkout -b guide-and-tours
# unzip MoveAI-guide-tours-2026-11-02.zip somewhere, then copy its MoveAI/ folder over this one:
rsync -a --exclude .git /path/to/MoveAI/ ./
git add -A
git commit -m "Product guide, guided tours, testing panel, CI"
git push -u origin guide-and-tours
```
Open a pull request on GitHub, look at the changes, then **Merge**. GitHub Pages republishes in about a minute.

> If you made changes on GitHub after you sent me the zip, check the pull request's file list. Anything you changed there and I didn't would be replaced.

## Option B — upload in the browser
GitHub's web upload takes 100 files at a time, and this project has about 280. Use git if you can. Otherwise upload the folders one at a time: `js/`, `css/`, `tests/`, `docs/guide/` (it has a `shots/` subfolder), `scripts/`, `.github/workflows/`, then the files at the top level.

## Turn on the automatic checks
The file `.github/workflows/ci.yml` runs the passing tests in a real browser on every push and pull request (about 15–25 minutes). You'll see a ✓ or ✗ next to each commit and a badge in the README. Nothing else needs setting up. GitHub Pages keeps serving the site from your branch as it does now.

## Keeping the guide up to date
After changing a flow:
```bash
python3 -m http.server 4177 &
npm install --no-save playwright && npx playwright install chromium
npm run test:tours        # plays every journey and checks the result
npm run guide:record      # re-records docs/guide/*.mp4 and the step screenshots
```
The journeys are in `js/tour-journeys.js`. Edit the steps and captions there; the in-app tour, the videos and the guide all use the same file.

## Let Claude push for you next time
Link your GitHub account in Claude (Settings → Connectors → GitHub). I can then create the branch and pull request directly.
