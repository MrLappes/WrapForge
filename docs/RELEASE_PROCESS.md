# Release process

No public release has been produced from this repository yet. This document
defines the process and records what is still missing. Only the Linux **debug**
binary has been built and launched in the verified environment.

## Versioning

- `0.x.y-alpha.z` until the document format and print pipeline stabilize.
- `MAJOR.MINOR.PATCH` after 1.0.
- The project schema has its own `schemaVersion`. Do not confuse it with the app
  version.
- A release that changes the schema must include a migration and updated
  fixtures.

## Preconditions

- [ ] All CI jobs pass on the release commit.
- [ ] Frontend: typecheck, lint, unit tests, build.
- [ ] Rust: `cargo test` and `cargo clippy` (clippy not yet enforced).
- [ ] Python: pytest including Blender-marked integration.
- [ ] Browser E2E passes.
- [ ] Manual desktop checklist completed (see
      [TESTING.md](TESTING.md)).
- [ ] `CHANGELOG.md` updated.
- [ ] `PROGRESS.md` test results updated with the actual run.
- [ ] `KNOWN_LIMITATIONS.md` reviewed for new limits.
- [ ] `THIRD_PARTY_NOTICES.md` updated for dependency changes.
- [ ] No secrets, project files, `.env`, or local paths committed.
- [ ] Sample assets still licensed and attributed.

## Build

```bash
npm ci
npm run check
(cd backend && .venv/bin/pytest -q)
(cd src-tauri && cargo test)
npx playwright test
npm run tauri build
```

`npm run tauri build` produces platform bundles (deb/AppImage/rpm on Linux,
depending on tooling). Inspect the output directory and record exact artifact
names and sizes.

For a reproducible comparison, build from a clean checkout with the committed
lockfiles. Record:

- commit SHA;
- Node, npm, Rust, Cargo versions;
- Tauri CLI version;
- OS and WebKitGTK version;
- Blender version used for smoke tests;
- command lines and artifact SHA-256 sums.

## Signing and checksums

Not implemented. Before a public release:

1. Generate SHA-256 sums for every artifact.
2. Sign artifacts and the checksum file with a project key.
3. Publish the public key and verification instructions.
4. For Windows, sign the installer and executable.
5. For macOS, sign and notarize the app bundle.
6. Document how to verify signatures offline.

Do not describe an unsigned artifact as verified.

## Smoke test a bundle

Install the produced package in a clean user account (or container) and verify:

1. First launch succeeds without a dev server.
2. The sample vehicle loads (bundled resource path works when packaged).
3. Create, save, close, reopen.
4. Import artwork.
5. Detect Blender or set a path.
6. Raster render succeeds; metadata reports the actual engine.
7. Print export writes files.
8. Diagnostics bundle is created.
9. Uninstall removes the app but not user projects.

Only claim the platforms actually tested.

## Release notes

Include:

- what changed;
- known limitations and regressions;
- schema and format changes;
- upgrade notes;
- checksums and signature verification;
- the exact test matrix and results.

Do not include claims like "production-ready" unless the print pipeline and
external validation justify it.

## Distribution channels

Planned: GitHub Releases with source archive and artifacts. No auto-updater, no
package repository, and no store listing exist.

## Rollback

If a release is broken:

1. Mark the GitHub release as pre-release or remove the artifacts.
2. Publish a fixed patch release.
3. Keep the old tag; do not rewrite published history.
4. Document the failure and the fix in `CHANGELOG.md`.

Because there is no updater, users must download a replacement manually.

## Update mechanism requirements

Before adding an auto-updater:

- signed update manifests;
- pinned public keys with rotation plan;
- HTTPS-only transport;
- rollback/downgrade protection;
- staged rollout and kill switch;
- explicit user consent;
- tests for tampered manifests and offline behavior.

See [THREAT_MODEL.md](../THREAT_MODEL.md) T10.

## Post-release

- Monitor issues for install/launch failures.
- Record the WebKitGTK and Blender versions reported by users.
- Keep the previous release available for comparison.
- Update `PROGRESS.md` with the verified matrix.
