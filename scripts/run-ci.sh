#!/usr/bin/env bash
# Runs every test in tests/ci-list.txt against a local server on port 4177.
# Used by .github/workflows/ci.yml and `npm run test:ci`.
set -u
cd "$(dirname "$0")/.."
python3 -m http.server 4177 >/dev/null 2>&1 & SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
for i in $(seq 1 30); do curl -s -o /dev/null http://127.0.0.1:4177/ && break; sleep 0.5; done
pass=0; fail=0; failed=()
while read -r t; do
  [[ -z "$t" || "$t" == \#* ]] && continue
  if node "$t" >/tmp/ci-out.txt 2>&1; then pass=$((pass+1)); echo "PASS $t"; else fail=$((fail+1)); failed+=("$t"); echo "FAIL $t"; tail -20 /tmp/ci-out.txt; fi
done < tests/ci-list.txt
echo "----"; echo "$pass passed, $fail failed"
[[ $fail -eq 0 ]] || { printf 'Failed: %s\n' "${failed[@]}"; exit 1; }
