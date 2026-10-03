.PHONY: setup test test-api test-client contracts contracts-check drift-demo

## Install both sides (PHP via Composer, TypeScript via npm).
setup:
	cd api && composer install --no-interaction --no-progress
	cd client && npm ci --no-audit --no-fund

## Run both suites. Each side fails on its own kind of drift.
test: test-api test-client

test-api:
	cd api && vendor/bin/pest

## Type-checks first (the `satisfies` lock), then runs Vitest.
test-client:
	cd client && npm test

## Re-capture contracts/*.json from the API's real responses. Review the diff.
contracts:
	cd api && UPDATE_CONTRACTS=1 vendor/bin/pest

## Fail if the committed fixtures are not exactly what the API returns now
## (catches value-format changes that keep the shape, e.g. a date format).
contracts-check: contracts
	@test -z "$$(git status --porcelain -- contracts)" || { \
	  echo "contracts/ is out of date with the API. Run make contracts and commit the result:"; \
	  git status --short -- contracts; git --no-pager diff -- contracts; exit 1; }

## Apply each deliberate drift in drift/ to a temporary copy and show which suite catches it.
drift-demo:
	scripts/drift-demo.sh
