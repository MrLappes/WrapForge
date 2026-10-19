# Contributing to WrapForge

Thanks for helping. WrapForge is an alpha project; correctness and honesty about
what works matter more than feature count.

## Ground rules

- Be respectful. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- Never claim a feature works, or a test passes, without running it.
- Document limitations and user-visible trade-offs.
- Keep changes focused. Separate refactors from behavior changes.
- Do not add telemetry, accounts, or hidden network calls.
- Do not commit third-party assets without a compatible license and attribution.

## Development setup

```bash
# system packages (Ubuntu/Kubuntu)
sudo apt-get install build-essential pkg-config libssl-dev libgtk-3-dev \
  libwebkit2gtk-4.1-dev libjavascriptcoregtk-4.1-dev libsoup-3.0-dev \
  libayatana-appindicator3-dev librsvg2-dev patchelf

npm install
python3 -m venv backend/.venv
backend/.venv/bin/pip install -e "backend[dev]"
npx playwright install chromium
npm run tauri dev
```

Blender is optional for UI work and required for render tests. Install Blender
4.2+ (5.2 LTS is tested) or let the Blender-marked tests skip.

## Before opening a pull request

Run the smallest relevant checks, then the full set for cross-cutting changes:

```bash
npm run typecheck
npm run lint
npm test
npm run build
(cd src-tauri && cargo test)
(cd backend && .venv/bin/pytest -q)
npx playwright test          # if UI workflow changed
npm run tauri build -- --debug --no-bundle   # if Rust/Tauri changed
```

If a check cannot run in your environment, say so in the PR. Do not mark it as
passing.

## What to include in a PR

- What changed and why.
- How it was verified, with commands and results.
- User-visible limitations or follow-up work.
- Screenshots for UI changes.
- A migration and fixture if the project schema changed.
- Updated docs when behavior or limitations change.

## Code style

- TypeScript strict mode; no `any` unless unavoidable and justified.
- Prefer the project schema and Zod validation at boundaries.
- Keep filesystem and process work in Rust. The WebView is not a security
  boundary.
- Never build shell command strings. Use argv arrays.
- Treat imported files as untrusted. Sanitize SVG and validate paths.
- Add tests for new domain logic. Prefer small pure functions.
- Use the existing design tokens and UI primitives.
- German strings belong in `src/lib/i18n/de.ts`; do not hard-code user-facing
  text in views.
- Comments should explain *why*, not restate the code.

Formatting:

```bash
npm run format
```

## Commit messages

Use an imperative subject, optionally with a scope:

```
feat(print): validate bleed against panel size
fix(render): handle Flatpak path outside home
docs: record verified Blender version
```

Sign-off is not required, but by submitting a contribution you agree that it is
licensed under Apache-2.0 and that you have the right to submit it. Do not paste
code from projects with incompatible licenses.

## Schema changes

1. Increment `SCHEMA_VERSION` in `src/lib/project/schema.ts`.
2. Add a migration step in `migrations.ts`.
3. Add a fixture for the old version and a migration test.
4. Update [docs/PROJECT_FORMAT.md](docs/PROJECT_FORMAT.md).
5. Verify open/save round-trips in both browser and desktop modes.

Never silently reinterpret an existing field. Prefer a new field plus a
migration.

## Adding vehicle assets

Follow [docs/VEHICLE_ASSETS.md](docs/VEHICLE_ASSETS.md). Required:

- a manifest with license, source, dimensions, panels, and UV bounds;
- planar outer-face wrap panels with stable IDs;
- preview images;
- no manufacturer trademarks or unlicensed CAD;
- validation passing (or documented warnings).

## Reporting bugs

Use the issue templates. Include:

- WrapForge version or commit;
- OS, WebView/WebKit version, Blender version and installation type;
- steps to reproduce;
- expected vs actual;
- relevant logs from Diagnostics, with secrets reviewed/removed.

Security issues go through [SECURITY.md](SECURITY.md), not public issues.

## Review expectations

Maintainers check:

1. Does it actually work? Was it run?
2. Does it preserve existing behavior and data?
3. Is untrusted input handled safely?
4. Are limitations documented?
5. Are tests meaningful (not just coverage)?

A smaller, verified change is preferred over a large, unverified one.
