# Privacy

WrapForge is local-first. It has **no account, no telemetry, no analytics, and no
runtime network calls** in production.

## What stays on your machine

- Project files: the folder you choose (`project.json`, assets, renders,
  thumbnails, logs).
- Recent-project index: app data directory, including names, paths, timestamps,
  and small thumbnails.
- Settings: theme, language, and Blender path, stored by the
  WebView in local storage.
- Browser preview projects: `localStorage` in your browser profile.
- In-memory diagnostics log: up to 300 entries, cleared when the app closes.
- Render logs and metadata: inside each project's `renders/` directory.

On Linux, the app data directory is typically:

```
~/.local/share/org.wrapforge.studio/
  recent-projects.json
```

The exact path is determined by the Tauri app-data resolver and your desktop
environment.

## What leaves your machine

Nothing, unless you explicitly:

- export files to a shared drive or cloud folder;
- export a diagnostic bundle and send it;
- copy diagnostics to the clipboard;
- share a project folder;
- install a future update (not implemented).

Blender runs locally. It receives the model, textures, and render configuration
for the job. It does not upload them.

## Network access

Production CSP allows only local resources and Tauri IPC. There is no HTTP
client, update check, license check, or crash upload.

Development mode (`npm run dev`, `npm run tauri dev`) connects to the local Vite
server and HMR WebSocket. That is development tooling, not a runtime feature.

## Diagnostics

**Diagnostics → Export diagnostic bundle** writes a JSON file containing:

- app version, schema version;
- platform and WebView facts;
- Blender detection path/version/compatibility;
- recent in-memory log entries;
- project path? Review before sharing.

Redaction strips common home-directory prefixes and secret-looking values, but it
is pattern-based. Project names, client names inside artwork, unusual paths, and
license text can remain. **Always open the bundle and review it before sending.**

Render logs can contain absolute paths and Blender output. Review them too.

## Recent projects and thumbnails

The recent index stores the project path, name, update time, and a small
thumbnail. It is used only for the Home screen. Removing a project from the list
does not delete the project folder. Clearing app data removes the index.

## Browser preview

`npm run dev` stores projects in your browser's `localStorage` for that origin.
Clearing site data deletes them. The browser preview has no access to native
folders or Blender.

## Third parties

- Blender is separate software with its own privacy behavior. WrapForge does not
  configure Blender to phone home; `--factory-startup` avoids user add-ons. Check
  Blender's own settings if you are concerned.
- Your OS, WebView, and desktop environment may log application launches
  independently of WrapForge.
- Dependencies do not receive data from WrapForge at runtime.

## Children and sensitive data

WrapForge is a professional design tool, not directed at children. Do not store
credentials or government identifiers in project descriptions or artwork.

## Data removal

- Delete the project folder to remove project data.
- Delete the app data directory to remove recent projects and settings.
- Clear browser site data to remove browser-preview projects.
- Uninstalling the application may leave project folders and app data behind;
  remove them manually if desired.

## Changes

If a future version adds network features (for example, opt-in update checks),
this document and the threat model must be updated before release, and the
feature must be explicit and opt-in.
