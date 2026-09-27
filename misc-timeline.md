```dataviewjs
const modes = JSON.parse(await dv.io.load("bin/timeline/modes.json"));

await dv.view("timeline", {
  source: "misc",
  pages: '"misc"',
  projectFolder: "misc/projects",
  scale: "linear",
  showUncategorized: false,
  initialBefore: "1 month",
  initialAfter: "1 month",
  COLOR_MAP: modes
})
```
