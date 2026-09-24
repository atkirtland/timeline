```dataviewjs
const colors = JSON.parse(await dv.io.load("bin/timeline/colors.json"));

await dv.view("timeline", {
  source: "misc",
  pages: '"misc"',
  projectFolder: "misc/projects",
  showUncategorized: false,
  initialBefore: "1 month",
  initialAfter: "1 month",
  COLOR_MAP: colors
})
```
