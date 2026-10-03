#!/usr/bin/env bash
# Drift demo: apply each deliberate drift in drift/ to a throwaway copy of the
# repo, run both suites, and check that the side that should notice does.
#
#   scripts/drift-demo.sh            all scenarios
#   scripts/drift-demo.sh api-rename one scenario
#
# Your working tree is never touched. Exits non-zero if any scenario does not
# fail the way it is supposed to (or if the clean baseline does not pass).
# Needs: composer and npm dependencies installed (make setup).
set -uo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# name | patch ("-" for none) | re-capture fixtures first? | expected API suite | expected client suite | what it shows
scenarios=(
  "baseline|-|no|pass|pass|Nothing changed: both suites pass."
  "api-rename|api-rename|no|fail|pass|The API renames dueOn to dueDate. Pest fails against the committed fixtures."
  "api-rename-recaptured|api-rename|yes|pass|fail|Same rename, fixtures re-captured, client not updated. tsc and Vitest fail."
  "api-adds-field|api-adds-field|yes|pass|fail|The API adds a field and fixtures are re-captured. tsc passes (satisfies ignores extra keys); the runtime key check fails."
  "client-drift|client-drift|no|pass|fail|The client expects a field the API never sends. tsc fails."
)

only="${1:-}"
failures=0

run_suite() { # dir, command... -> prints pass|fail, keeps the log
  local dir="$1" log="$2"; shift 2
  if (cd "$dir" && "$@") >"$log" 2>&1; then echo pass; else echo fail; fi
}

printf '\n%-24s %-10s %-10s %s\n' scenario API client result
printf '%-24s %-10s %-10s %s\n' -------- --- ------ ------

for line in "${scenarios[@]}"; do
  IFS='|' read -r name patch recapture want_api want_client story <<<"$line"
  [[ -n "$only" && "$only" != "$name" ]] && continue

  copy="$work/$name"
  mkdir -p "$copy"
  # Copy vendor/ rather than symlinking it: Composer's class map resolves
  # paths relative to vendor/, so a symlink would load the unpatched classes.
  (cd "$root" && tar --exclude=.git --exclude=client/node_modules -cf - .) | (cd "$copy" && tar -xf -)
  ln -s "$root/client/node_modules" "$copy/client/node_modules"

  if [[ "$patch" != "-" ]] && ! (cd "$copy" && git apply "$root/drift/$patch.patch"); then
    echo "$name: drift/$patch.patch no longer applies; regenerate it" >&2
    failures=$((failures + 1))
    continue
  fi

  if [[ "$recapture" == yes ]]; then
    (cd "$copy/api" && UPDATE_CONTRACTS=1 vendor/bin/pest --colors=never) >"$work/$name.capture.log" 2>&1
  fi

  got_api="$(run_suite "$copy/api" "$work/$name.api.log" vendor/bin/pest --colors=never)"
  got_client="$(run_suite "$copy/client" "$work/$name.client.log" npm test --silent)"

  if [[ "$got_api" == "$want_api" && "$got_client" == "$want_client" ]]; then
    verdict="as expected"
  else
    verdict="UNEXPECTED (wanted API $want_api, client $want_client)"
    failures=$((failures + 1))
  fi

  printf '%-24s %-10s %-10s %s\n' "$name" "$got_api" "$got_client" "$verdict"
  printf '    %s\n' "$story"

  # Show the first lines of whichever suite caught the drift.
  for side in api client; do
    if [[ "$side" == api && "$got_api" == fail ]] || [[ "$side" == client && "$got_client" == fail ]]; then
      grep -E 'drifted|missing key|unexpected key|error TS|AssertionError' "$work/$name.$side.log" \
        | grep -v '✓' | sed -e 's/^[[:space:]]*/      /' | cut -c1-150 | head -6
    fi
  done
done

echo
if ((failures > 0)); then
  echo "$failures scenario(s) did not behave as expected." >&2
  exit 1
fi
echo "Every drift was caught by the suite that should catch it."
