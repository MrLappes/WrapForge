## Summary

<!-- What changed and why, in a few sentences. -->

## Related issues

<!-- Fixes #123, refs #456. Remove if none. -->

## Verification

List the commands you actually ran and their results. Do not mark a check as
passing if it was skipped or not run.

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `cd src-tauri && cargo test`
- [ ] `cd backend && .venv/bin/pytest -q`
- [ ] `npx playwright test` (UI workflow changed)
- [ ] `npm run tauri build -- --debug --no-bundle` (Rust/Tauri changed)
- [ ] Manual desktop check (describe below)

Commands/results:

```
paste exact output or summary
```

## Screenshots

<!-- For UI changes. Review for confidential data before uploading. -->

## Checklist

- [ ] I ran the relevant checks and reported the real results.
- [ ] I added or updated tests for new logic.
- [ ] I updated documentation for behavior or limitations.
- [ ] I did not add telemetry, accounts, or hidden network calls.
- [ ] Untrusted input (JSON, SVG, paths, subprocess args) is validated.
- [ ] Schema changes include a migration, fixture, and `docs/PROJECT_FORMAT.md` update.
- [ ] New assets have a compatible license and attribution.
- [ ] I did not include secrets, confidential artwork, or local absolute paths.

## Known limitations / follow-up

<!-- What is still partial, unverified, or deliberately out of scope? -->
