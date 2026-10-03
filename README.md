# laravel-ts-contract-tests

[![CI](https://github.com/leojeremy/laravel-ts-contract-tests/actions/workflows/ci.yml/badge.svg)](https://github.com/leojeremy/laravel-ts-contract-tests/actions/workflows/ci.yml)

Two-sided API contract tests for a Laravel API and a TypeScript client.

A Pest test captures the API's real JSON responses as fixtures. A Vitest suite, type-checked by `tsc` first, checks that the hand-written TypeScript types still describe those fixtures. Rename a field in PHP and Pest fails. Re-capture the fixtures without updating the client and `tsc` fails. Let the client expect a field the API never sends and `tsc` fails. Either way, CI goes red before the change ships.

This is an example repo and a template, not a package. The API is a deliberately tiny "tasks" resource, so the pattern is easy to see.

## The problem

When the back end and the front end ship at different times, the types on the front end are a copy of what the API returned at some point. Nothing in either codebase notices when the copy goes stale:

- PHP renames `dueOn` to `dueDate`. The PHP tests still pass, because they were updated in the same commit.
- The TypeScript still compiles, because its interface still says `dueOn`.
- In production the client reads `undefined`.

Contract fixtures put one shared, reviewable file between the two sides. Each side tests against that file, so neither can drift from it without a failing test.

## How it works

```
api/ (Laravel)                    contracts/*.json                  client/ (TypeScript)
TaskResource ── Pest captures ──▶  tasks.show.json   ◀── tsc: fixture satisfies Wire<TaskResponse>
             ◀─ Pest verifies ───  error.locked.json ◀── Vitest: exact keys, enum values, typed errors
```

### 1. The API side (Pest)

[`api/tests/Feature/ContractTest.php`](api/tests/Feature/ContractTest.php) calls every endpoint the client uses, plus the error answers the client reads (410, 422, 423). It passes each response to `Contract::check()` ([`api/tests/Support/Contract.php`](api/tests/Support/Contract.php)).

- **Verify (the default, and what CI runs).** The response must have the same shape as the committed fixture: exactly the same keys in every object, with no missing and no unexpected keys, and the same JSON type for every value. A failure names the path:

  ```
  Response drifted from contracts/tasks.index.json:
    tasks.index.data[0]: missing key [dueOn]
    tasks.index.data[0]: unexpected key [dueDate]
  ```

- **Capture.** `make contracts` (which sets `UPDATE_CONTRACTS=1`) writes each response to `contracts/<name>.json`. The tests seed fixed rows at a frozen time, so capturing twice gives byte-identical files. A changed fixture therefore means the API changed, and you review it in the diff like any other code.
- **`make contracts-check`** re-captures and fails if `git` shows any change. This catches changes that keep the shape but change a value's format, such as a date that turns into a full timestamp. CI runs it.

The comparator has its own unit tests in [`api/tests/Unit/ContractCompareTest.php`](api/tests/Unit/ContractCompareTest.php).

### 2. The client side (tsc + Vitest)

[`client/src/api.ts`](client/src/api.ts) holds hand-written interfaces (`Task`, `TaskResponse`, `ErrorBody`, `ValidationErrorBody`) and a small `fetch` client. [`client/tests/contract.test.ts`](client/tests/contract.test.ts) imports the same fixtures and checks them in two layers.

**Compile time.** Every fixture must satisfy its interface:

```ts
const fixtures = {
  show: taskShow satisfies Wire<TaskResponse>,
  // ...
};
```

`npm test` runs `tsc --noEmit` before Vitest. Without that step the `satisfies` lines would never run in CI, because Vitest strips types without checking them.

**Run time.** Two things `satisfies` cannot do on a JSON import (I checked both with TypeScript 6.0):

- **It does not report extra keys.** A JSON module is not a fresh object literal, so excess-property checks do not apply. Missing keys and changed types are reported; added keys are not. The runtime check covers this. `keyDrift(task, taskKeys)` must be `{ extra: [], missing: [] }`. The list itself is built with `keyList<Task>()([...])`, which does not compile unless it names exactly the keys of `Task`, so the list cannot drift from the interface either ([`client/tests/key-list.typecheck.ts`](client/tests/key-list.typecheck.ts) pins that).
- **It cannot check literal unions.** JSON string values are typed `string`, so `"status": "doing"` can never satisfy `'todo' | 'doing' | 'done'`. `Wire<T>` widens literal unions to their base type for the compile-time check, and the runtime test checks the actual values against `TASK_STATUSES`.

The fixtures also deliberately capture each nullable field both filled and `null`, so both halves of `string | null` are exercised. A test fails if a re-capture loses one of them.

### 3. Typed errors

[`client/tests/client.test.ts`](client/tests/client.test.ts) drives the client with stubbed `fetch` responses built from the captured bodies. That way the error handling is tested against bodies the API really sends.

| API answer | Client result |
|---|---|
| 200 / 201 | the unwrapped `Task` (or `Task[]`) |
| 404 on `getTask()` | `null` |
| 404 elsewhere | `ApiError` (`status: 404`) |
| 410 | `TaskDeletedError`, with `body.code === 'task_deleted'` |
| 422 | `ValidationError`, with `errors` keyed by field |
| 423 | `TaskLockedError`, with `body.code === 'task_locked'` |
| anything else, or a non-JSON error body | `ApiError` with the status |

All of them extend `ApiError`, so callers can catch broadly or narrowly.

## The drift demo

`drift/` holds three deliberate drifts as patches. `make drift-demo` applies each one to a temporary copy of the repo (your working tree is never touched), runs both suites, and checks that the right side fails:

| Scenario | API (Pest) | Client (tsc + Vitest) | What it shows |
|---|---|---|---|
| baseline | pass | pass | Nothing changed. |
| `api-rename` | **fail** | pass | PHP renames `dueOn` to `dueDate`; the response no longer matches the committed fixture. |
| `api-rename`, fixtures re-captured | pass | **fail** | Someone ran `make contracts` and committed, but did not update the client. `tsc` rejects every `satisfies`. |
| `api-adds-field`, fixtures re-captured | pass | **fail** | The API adds `priority`. `tsc` passes (extra keys), and the runtime key check fails with `extra: ['priority']`. |
| `client-drift` | pass | **fail** | The client's `Task` gains `priority`, which the API never sends. `tsc` fails, and `keyList` fails with `missingKeys: "priority"`. |

The script exits non-zero if any scenario does not fail the way the table says, and CI runs it on every push (the `drift-demo` job).

**To see a red build in CI**, open Actions → CI → Run workflow and pick a drift. The workflow applies that patch before the suites run, and the matching job fails. Alternatively, push a branch with a patch applied:

```bash
git switch -c demo/api-rename
git apply drift/api-rename.patch
git commit -am "Rename dueOn to dueDate"
git push -u origin demo/api-rename
```

## Running it

You need PHP 8.3+ with `pdo_sqlite`, Composer, Node 22.12+ and npm.

```bash
make setup     # composer install + npm ci
make test      # both suites
```

Other targets:

| Target | What it does |
|---|---|
| `make test-api` / `make test-client` | one side only |
| `make contracts` | re-capture `contracts/*.json` from the API |
| `make contracts-check` | fail if the fixtures differ from what the API returns now |
| `make drift-demo` | the table above |

`composer install` copies `api/.env.example` to `api/.env` if there is none. The tests need no app key and no database server (they use SQLite in memory). To run the API itself:

```bash
cd api
php artisan key:generate
touch database/database.sqlite && php artisan migrate
php artisan serve
```

## Adapting it to your app

1. Copy [`api/tests/Support/Contract.php`](api/tests/Support/Contract.php) into your Laravel test suite. Point `Contract::directory()` at a folder both sides can read; in a monorepo that is usually the repo root.
2. Write one feature test per response your client consumes. Seed fixed data, freeze time, and call `Contract::check('name', $response)`. Seed at least one row with each nullable field set and one with it `null`. Run `UPDATE_CONTRACTS=1 vendor/bin/pest` once and commit the fixtures.
3. On the client, copy [`client/tests/contract-helpers.ts`](client/tests/contract-helpers.ts). Import each fixture, add a `satisfies Wire<YourType>` line, and add a `keyDrift` check with a `keyList<YourType>()` per object type. Make sure `tsc --noEmit` runs in CI, not only in the editor.
4. Add `make contracts-check` (or its two commands) to CI.

If the client lives in another repository, publish `contracts/` from the API's CI as a versioned artifact or package, and have the client pin a version. The client then fails when it upgrades to a contract it does not match.

## Why fixtures and exact key sets rather than OpenAPI?

OpenAPI is the better tool when an API has many consumers, is public, or needs documentation and generated SDKs. It describes everything (requests, auth, every status), and its tooling can generate types and validate responses.

For a small team with one first-party client, it costs more:

- someone has to keep the spec in step with the code, or generate it from annotations;
- the spec can still be wrong about what the code actually sends unless responses are validated against it.

Fixtures captured from real responses can't be wrong about what the API returns today, take minutes to adopt, and turn every contract change into a reviewable diff. The two are not exclusive: you can generate types from an OpenAPI spec and still pin real responses with fixtures.

## Limitations

- **The TypeScript types are hand-written.** Nothing here generates them from PHP. The tests prove that the hand-written types match the captured responses, which is the point, but you still write the types.
- **Responses only.** Request payloads (`NewTask`, `TaskPatch`) are mirrored by hand from the form requests and are not contract-tested. Only the shape of the 422 answer is pinned.
- **Fixtures cover what the tests seed.** Shapes are compared, not values; `make contracts-check` catches value-format changes, but only for the cases you capture. An empty list in a fixture pins nothing about its items.
- **`null` is its own type.** A nullable field must be captured both filled and `null` (see above). Otherwise the PHP check would flag the missing case as a type change, and the TypeScript side would never see one half of the union.
- **Exact keys in both directions are deliberate.** An additive API change fails the client suite until the client models the new field. If you would rather let the API add fields freely, check that the modelled keys are a subset instead (drop the `extra` half of `keyDrift`).
- **One client, one repo.** See "Adapting it" for separate repositories.
- **The drift demo copies `api/vendor`** into a temporary directory for each scenario, because Composer's class map resolves paths relative to `vendor/`. It takes about a minute locally.

## Layout

```
api/                 Laravel 13 app: tasks resource, Pest suite, Contract helper
client/              TypeScript client, Vitest suite, contract helpers
contracts/           captured responses, read by both suites
drift/               deliberate drifts used by the demo
scripts/drift-demo.sh
Makefile
```

## Background

The pattern comes from a Laravel API and a TypeScript storefront I built in 2026 (pre-launch, not run at scale). This repo is a clean re-implementation with a neutral example domain. It also closes two gaps the original had: the `satisfies` check now actually runs in CI (`tsc --noEmit` before Vitest), and every endpoint the client uses has a fixture checked on both sides.

## License

MIT. See [LICENSE](LICENSE).
