# Obsidian timeline

An interactive DataviewJS timeline for Obsidian, with project/task timelines and historical timelines. Supports expandable groups, category colors, search, filtering, panning, and linear or logarithmic scales.

## Setup

1. Install and enable the Obsidian Dataview community plugin, then enable **JavaScript Queries** in its settings.
2. Place this repository in your vault, for example at `bin/timeline`. Keep `view.js` and `view.css` together.
3. Copy `modes.example.json` to `modes.json`, or to another location in the vault such as `settings/modes.json`. Customize its patterns and colors.
4. Copy the DataviewJS block from `misc-timeline.md` or `wiki-timeline.md` into a note. Adjust the view path, page query, project folder, and JSON path for your vault.

Use `await dv.view("bin/timeline", { ... })` when installed at the example location. Dataview loads the accompanying CSS when the view path points to the folder containing `view.js` and `view.css`. See the [Dataview API reference](https://blacksmithgu.github.io/obsidian-dataview/api/code-reference/).

## Project and task timeline

````markdown
```dataviewjs
const modesPath = "settings/modes.json";
const modes = JSON.parse(await dv.io.load(modesPath));

await dv.view("bin/timeline", {
  source: "misc",
  pages: '"misc"',
  projectFolder: "misc/projects",
  scale: "linear",
  showUncategorized: false,
  initialBefore: "1 month",
  initialAfter: "1 month",
  COLOR_MAP: modes
});
```
````

The `pages` value is a Dataview source query. Notes under `projectFolder` become projects; tasks from other selected notes appear under Uncategorized when enabled. Both paths refer to your vault, independently of where you install this view.

Tasks can use start (`🛫`), scheduled (`⏳`), due (`📅`), and completion (`✅`) dates in `YYYY-MM-DD` format. Creation dates (`➕`) do not determine the displayed span. For example:

```markdown
- [ ] Draft an outline 🛫 2026-01-05 📅 2026-01-12
```

Project notes can define these properties:

```yaml
---
timeline-category: planning
timeline-start: 2026-01-01
timeline-end: 2026-02-01
child:
  - "[[Example subproject]]"
---
```

Dates are optional; without explicit dates, project spans are calculated from their dated contents. `child` links nest other selected project notes. An optional `timeline-color` property overrides the category color.

## Historical timeline

````markdown
```dataviewjs
await dv.view("bin/timeline", {
  source: "wiki",
  pages: '"wiki"',
  scale: "log",
  initialYearsBack: 2000
});
```
````

Selected notes contain dated list items. Nest list items to group events:

```markdown
- 1900 – 1950 Example period
  - 1925e0 Example event
- 2000 – An ongoing period
- 2026-01-05e0 A dated event
```

Use an en dash (`–`) for ranges and the suffix `e0` for individual points. Negative years represent BCE; there is no year zero. Ranges also support scientific notation and month/day dates. Historical events ending after the current year are omitted.

To use category colors here too, load the JSON as in the project example and pass `COLOR_MAP: modes` to `dv.view`.

## Modes configuration

`modes.example.json` contains generic categories. Each named entry has a regular expression `pattern` and a CSS `color`. The first matching pattern wins; `default.color` handles unmatched categories. Patterns match the note's `timeline-category` property. Use anchors such as `^planning$` for an exact match. JSON regular expressions require doubled backslashes.

The JSON can live anywhere in the vault. Set its path in the note's `dv.io.load(...)` call; the renderer receives the parsed `COLOR_MAP` object and does not look for a particular filename. Omit both the load and `COLOR_MAP` if you do not need category colors. Explicit `timeline-color` values still work.

Personal `modes.json` files are ignored anywhere inside this repository; `modes.example.json` is intended for publication. Keep your vault-specific configuration outside the repository if preferred.

## Controls

- **Ctrl + wheel:** zoom around the pointer.
- **Drag:** pan the date range.
- **Present / Fit all:** reset the range or fit dated items.
- **Click a group label:** expand or collapse its children.
- **Double-click a row:** open its source note.
- **Find / Ctrl+F / Cmd+F:** search; Enter advances and Shift+Enter goes back.

## Development

The view has no build step or runtime package dependencies beyond Obsidian and Dataview. With Node.js installed, run the core tests using:

```sh
node test-core.js
```
