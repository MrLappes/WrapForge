# MCP server

WrapForge ships a [Model Context Protocol](https://modelcontextprotocol.io) server
so an AI client can read and change a wrap without the GUI. It works directly on
`project.json` files in `.wrapforge` folders, validates them with the same schema
the app uses, and writes the result back.

The server is stdio-based: the client spawns it, it never listens on a port.

## Running it

```bash
npm run mcp
```

Or point a client at it directly:

```json
{
  "mcpServers": {
    "wrapforge": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/WrapForge/mcp/server.ts"]
    }
  }
}
```

The server needs Node 20+ and the repository's dependencies (`npm install`).

## Tools

| Tool | What it does |
|---|---|
| `project_create` | Creates a project folder with the bundled CC0 sample vehicle. |
| `project_open` | Returns the vehicle, panels, livery layers and artwork of a project. |
| `project_validate` | Parses `project.json` against the schema and reports problems. |
| `panels_list` | Lists panels with category, side, area and whether the panel is glass. |
| `panel_rename` | Renames a panel. |
| `panel_merge` | Moves one panel's triangles onto another and drops the source. |
| `panel_remove` | Returns a panel's triangles to the unpainted body. |
| `livery_presets` | Lists the built-in presets. |
| `livery_apply_preset` | Replaces the shape layers with a preset. |
| `livery_add_layer` | Adds a stripe, rectangle, ellipse, triangle, chevron, text or image layer. |
| `livery_update_layer` | Changes colour, box, rotation, opacity, blend, visibility or mapping. |
| `livery_delete_layer` | Removes a layer. |
| `livery_set_options` | Finish mode and colour, resolution, wrap-over-glass, livery on/off. |
| `layers_export_manifest` | Writes `livery-layers/layers.json` describing every layer. |

Panel merging and removal rewrite the triangle panel map only when the project
has one (models imported through the studio). Bundled assets keep their panels in
the manifest, so those tools return a clear message instead.

## What it deliberately does not do

Rendering, texture composition and PSD export need a canvas. The MCP server does
not fake them: use the studio for those, or export the layer manifest and let the
client edit the files. Geometry import (glTF analysis) also stays in the app,
because it needs WebGL-free but browser-grade mesh processing.

## Example session

A client can create a project, fix a panel name, apply a preset and add a stripe:

```
project_create      { "root": "/home/me/wraps/demo", "name": "Demo" }
panels_list         { "root": "/home/me/wraps/demo" }
panel_rename        { "root": "...", "panelId": "hatch", "name": "Tailgate" }
livery_apply_preset { "root": "...", "presetId": "kaido-rising" }
livery_add_layer    { "root": "...", "kind": "stripe", "mapping": "top",
                      "color": "#f4f1e8", "u": 0.5, "v": 0.5, "w": 0.96, "h": 0.04 }
```

Every mutation is written to disk immediately, so the studio picks up the change
when the project is reopened.
