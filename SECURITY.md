# Security policy

## Supported versions

WrapForge is pre-1.0. Only the latest alpha is supported. Older alphas do not
receive security fixes.

| Version | Supported |
|---|---|
| 0.1.x alpha | Yes (latest patch) |
| < 0.1 | No |

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Use GitHub's private vulnerability reporting on the repository
(**Security → Report a vulnerability**). If that is unavailable, open a minimal
public issue asking a maintainer for a private channel; do not include exploit
details, project files, or credentials in that issue.

Include:

- affected version or commit;
- operating system, WebKitGTK/WebView version, and Blender version/install type;
- a description of the impact;
- minimal reproduction steps or a proof of concept;
- relevant logs or files with secrets and personal data removed;
- whether the issue is already public.

## What is in scope

- Script execution or sandbox escape through imported SVG, project JSON, raster
  images, or glTF.
- Path traversal, symlink escape, or writes outside the project root.
- Command injection into Blender or other subprocesses.
- Bypass of the Tauri capability/CSP boundary.
- Disclosure of local files or project data through diagnostics, logs, or
  exports.
- Tampering that makes a draft export appear print-ready.
- Supply-chain weaknesses in how dependencies or Blender are invoked.

## Out of scope

- A compromised operating system, kernel, WebKit, or Blender binary.
- An attacker who already has the user's session and can read their files.
- Denial of service caused by intentionally opening enormous files, unless it
  bypasses a documented limit in a surprising way.
- Missing hardening that has no demonstrated impact (for example, a missing
  header with no exploitable path).
- Social engineering of maintainers or users.
- Issues in third-party dependencies that are already public and unfixed
  upstream; report those upstream and tell us so we can track them.

## Response

This is a volunteer alpha project. We aim to:

- acknowledge a report within 7 days;
- provide an initial assessment within 14 days;
- coordinate a fix and disclosure date based on severity and complexity.

We cannot promise a bug bounty. We will credit reporters who want credit.

## Disclosure

Please give us a reasonable window to fix the issue before publishing details.
If the issue is being actively exploited, say so in the report so we can
prioritize.

## Security design

Read [THREAT_MODEL.md](THREAT_MODEL.md) for the trust boundaries, mitigations,
and known residual risks. That document is part of the security contract: if you
find a gap between it and the code, that is a valid report.

## Verifying releases

Until signed installers and checksums are published, treat any binary as
unverified. Build from source and compare the commit. No auto-updater exists.
