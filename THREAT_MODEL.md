# Threat model

Scope: the WrapForge desktop application, its local project files, imported
artwork and vehicle assets, the Tauri IPC boundary, and the Blender subprocess.
This is a design-level model, not a penetration test. **No external security
review has been performed.**

## Assets to protect

| Asset | Why it matters |
|---|---|
| User project files and artwork | Confidential unreleased designs; loss is expensive |
| Vehicle assets | Licensed third-party data with redistribution restrictions |
| Local filesystem | The app runs with the user's privileges |
| Credentials/keys | Not stored by WrapForge; system keychain may hold unrelated secrets |
| Integrity of exports | A tampered print file could waste material or mislead an installer |
| User privacy | Project names, paths, and recent files reveal business relationships |

## Trust boundaries

```
[ Untrusted files ] --import--> [ React WebView ]
                                      |
                                Tauri IPC (validated)
                                      |
                              [ Rust shell / filesystem ]
                                      |
                                argv (no shell)
                                      |
                              [ Blender subprocess ]
                                      |
                              [ Project + temp dirs ]
```

1. **Filesystem → WebView.** Project JSON, SVG, raster images, and glTF are
   untrusted, even when they look local.
2. **WebView → Rust.** The WebView is trusted code but its inputs are not. Every
   command validates arguments; path arguments are not trusted.
3. **Rust → Blender.** Blender is a separate process with a generated config
   file. Its stdout is parsed, not executed.
4. **Project → diagnostic bundle.** Bundles leave the machine by user action and
   may contain paths and environment details.

## Adversaries considered

- A user opening a malicious project or artwork received from someone else.
- A malicious or compromised vehicle asset.
- A local unprivileged process racing file operations.
- A supply-chain compromise in npm, Cargo, Blender, or the Flatpak runtime.
- Accidental disclosure through screenshots, diagnostics, or logs.

Not considered: a compromised operating system, a malicious Blender binary
installed by the user, physical access with the user's session unlocked, kernel
or WebKit memory-corruption exploits, and side-channel attacks.

## Threats and mitigations

### T1. Script execution through imported SVG

**Threat.** An SVG containing `<script>`, event handlers, `javascript:` URLs, or
embedded HTML executes in the WebView and reads projects or invokes IPC.

**Mitigations.**
- SVG is rendered through `<img>`/canvas, which does not execute scripts.
- `sanitizeSvg` removes `script`, `foreignObject`, `iframe`, `object`, `embed`,
  any tag ending in `script`, all `on*` attributes, and URL attributes that are
  not fragment or `data:image/`.
- Inline `style` with `url(http:`, `url(file:`, or `url(javascript:` is stripped.
- CSP: `script-src 'self'`, `object-src 'none'`, `frame-src 'none'`.
- Production build has no `unsafe-eval`.

**Residual risk (medium-low).** The sanitizer is allowlist-oriented but not a
complete SVG security model. Nested `data:image/svg+xml` payloads and `<style>`
rules are not recursively inspected. They are inert inside `<img>` but could
become active if an exported SVG is opened directly. Future work: parse with a
strict allowlist library and normalize CSS.

### T2. Code execution through project JSON

**Threat.** A crafted `project.json` contains JavaScript, prototype-pollution
keys, or enormous strings that execute or crash the app.

**Mitigations.**
- JSON is parsed with `JSON.parse` and validated by Zod; no `eval`, no function
  construction.
- Unknown fields are ignored or preserved as data, never executed.
- Size limits: 50 MB project, 200 MB assets, 20 MB text, 8 MB thumbnail.
- Rendering escapes text through canvas APIs rather than HTML injection.

**Residual risk (low).** Zod validation can still be CPU-heavy on pathological
documents. There is no dedicated fuzzer.

### T3. Path traversal and symlink escape

**Threat.** A project references `../../.ssh/id_rsa`, an absolute path, or a
symlink that escapes the project root, causing read or write outside the project.

**Mitigations.**
- All project paths are relative and rejected if absolute, if they contain `..`,
  backslashes, null bytes, or invalid file names (`safe_relative`,
  `validate_file_name`).
- Reads canonicalize the full path and require it to start with the canonical
  project root (`safe_read_path`).
- Writes canonicalize the parent and any existing target and apply the same
  containment check (`safe_write_path`).
- Save-time asset writes are further restricted to `assets/`.
- Project roots must be absolute and existing.
- Tests cover traversal and invalid names.

**Residual risk (low).** A time-of-check/time-of-use race between canonicalization
and open is theoretically possible for a local attacker with write access to the
project tree. The app is single-user and does not claim to defend against a
hostile local process.

### T4. Command injection into Blender

**Threat.** A filename, panel name, or configured path injects shell syntax and
executes arbitrary commands.

**Mitigations.**
- No shell is used. `Command::new(program).args([...])` passes an argv array.
- The render script reads a JSON config; values are treated as data.
- The script contains no `eval`, `exec`, `os.system`, or subprocess calls.
- Blender stdout is parsed as progress JSON, never executed.
- Cancellation uses a numeric PID (`libc::kill`, `taskkill /PID`).

**Residual risk (low).** A malicious Blender executable could do anything the
user can. That is outside the model.

### T5. Malicious glTF asset

**Threat.** A glTF causes unbounded memory use, references remote resources, or
exploits the loader.

**Mitigations.**
- The desktop app reads the model into a base64 blob and loads it from a
  `blob:` URL. Relative external references do not resolve; CSP blocks network
  fetches (`connect-src 'self' ipc: http://ipc.localhost blob: data:`).
- Import size is capped at 50 MB.
- Blender imports the model in a separate process; a crash does not take down
  the shell.
- The sample asset is generated locally and bundled.

**Residual risk (medium).** A huge but valid glTF can still exhaust memory in
the WebView or Blender. There is no mesh/triangle budget or decompression-bomb
guard.

### T6. Resource exhaustion through render jobs

**Threat.** A compromised WebView or a stuck UI starts many Blender processes,
exhausting CPU and memory.

**Mitigations.**
- The UI disables starting a second render while one is active.
- Jobs are tracked and killed on app exit.
- Cancellation terminates the process tree on Windows and the process on Unix.

**Residual risk (medium).** The IPC command itself does not enforce a global
concurrency limit. A malicious WebView (which would already imply T1/T2) could
spawn multiple jobs. Add a semaphore before exposing plugins or remote content.

### T7. Local data disclosure

**Threat.** Diagnostics, logs, recent-project thumbnails, or screenshots reveal
confidential paths or designs.

**Mitigations.**
- No telemetry and no network calls at runtime.
- Diagnostics redact home-directory patterns and common secret-looking values.
- Logs stay in the project or app-data directory.
- Bundles are created only on explicit user action.
- The threat model and privacy doc tell users to review bundles before sharing.

**Residual risk (medium-low).** Redaction is pattern-based. Project names, client
names inside artwork, and unusual paths can survive. Recent-project thumbnails
are stored locally in app data.

### T8. Supply-chain compromise

**Threat.** A malicious npm package, Rust crate, Blender build, or Flatpak
runtime executes code or exfiltrates data.

**Mitigations.**
- Dependencies are pinned in `package-lock.json` and `Cargo.lock`.
- The runtime has no network access requirement and a restrictive CSP.
- Blender is external, not vendored, and runs with `--factory-startup` to avoid
  user add-ons.
- CI runs audit/license checks (see `.github/workflows`).
- Frontend and Rust dependencies are ordinary, widely used packages.

**Residual risk (medium).** Lockfiles do not prevent a compromised maintainer
publishing a malicious update before review. No reproducible-build attestation
exists. Blender and WebKitGTK are large native attack surfaces.

### T9. Tampered exports

**Threat.** A draft export is presented as print-ready, or files are modified
after export.

**Mitigations.**
- Filenames and the JSON manifest record `productionReady`.
- Draft exports are prefixed `wrapforge-draft-`.
- The UI requires explicit acknowledgment of warnings.
- Validation rules are deterministic and visible.

**Residual risk (low-medium).** There is no cryptographic signature on exports.
Anyone can rename a file. Print providers should verify the manifest and their
own preflight.

### T10. Update-channel compromise

**Threat.** A future auto-updater downloads a malicious build.

**Status.** No updater exists, so the threat is currently absent.

**Requirements before adding one:** signed manifests, pinned public keys,
HTTPS-only, rollback protection, staged rollout, and a documented key-rotation
procedure. Until then, releases are manual and users must verify checksums.

### T11. Diagnostics/self-test command injection

**Threat.** The Blender self-test builds a command from user-controlled paths.

**Mitigations.** Same argv-array rule as T4. The configured Blender path is
validated as absolute and executable; it is never interpolated into a shell
string. The probe script is a bundled resource.

**Residual risk (low).** A user can intentionally point WrapForge at any
executable; this is equivalent to running it themselves.

## Privacy summary

- No account, telemetry, analytics, or crash upload.
- No network requests at runtime in production.
- Project data stays in the project folder; app data holds recent-project paths,
  settings, and thumbnails.
- Blender runs locally and receives only the job's model, textures, and config.
- Diagnostics are opt-in exports and must be reviewed before sharing.

## Verification status

| Control | Verified how |
|---|---|
| Path traversal rejection | Rust unit tests |
| Atomic save and backup | Rust unit tests and code review |
| SVG sanitization | Vitest unit tests |
| CSP present in production config | `tauri.conf.json` review |
| No shell invocation | Code review of `render.rs`, `blender.rs` |
| Blender `--factory-startup` | Render command and integration test |
| Redaction | Unit-level review; no adversarial corpus |
| No telemetry | Dependency and source review; no network code path found |

## Reporting

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
Do not open a public issue with exploit details.
