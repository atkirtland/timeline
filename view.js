/* Native Dataview timeline view. Keep this file dependency-free: Dataview executes it as a script. */
(async function () {
  "use strict";

  const DAY = 86400000;
  const PRESENT_YEAR = new Date().getUTCFullYear();
  const NS = "http://www.w3.org/2000/svg";
  const DATE_RE = /(?:^|\s)(🛫|⏳|📅|✅|➕)\s*(\d{4}-\d{2}-\d{2})(?=\s|$)/gu;
  const YEAR_NUMBER = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?";
  const WIKI_RANGE_RE = new RegExp("^\\s*(" + YEAR_NUMBER + ")\\s*(?:–|\\.\\.)\\s*(" + YEAR_NUMBER + ")\\s+(.+?)\\s*$", "i");
  const WIKI_OPEN_RANGE_RE = new RegExp("^\\s*(" + YEAR_NUMBER + ")\\s*(?:–|\\.\\.|-)\\s+(.+?)\\s*$", "i");
  const WIKI_POINT_RE = new RegExp("^\\s*(" + YEAR_NUMBER + ")\\s+(.+?)\\s*$", "i");

  function dateMs(value) {
    if (!value) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (value.ts != null) { const n = Number(value.ts); return Number.isFinite(n) ? n : null; }
    const raw = typeof value === "string" ? value : value.toISODate?.() || String(value);
    const match = raw.match(/\d{4}-\d{2}-\d{2}/);
    if (!match) return null;
    const ms = Date.parse(match[0] + "T00:00:00Z");
    return Number.isFinite(ms) ? ms : null;
  }

  function iso(ms) { return ms == null ? null : new Date(ms).toISOString().slice(0, 10); }

  function taskDates(task) {
    const found = {};
    const text = String(task.text || "");
    for (const match of text.matchAll(DATE_RE)) {
      const key = { "🛫": "start", "⏳": "scheduled", "📅": "due", "✅": "completion", "➕": "created" }[match[1]];
      found[key] = dateMs(match[2]);
    }
    for (const key of ["start", "scheduled", "due", "completion", "created"])
      found[key] = dateMs(task[key]) ?? found[key] ?? null;
    return found;
  }

  function cleanTaskText(text) {
    return String(text || "").replace(DATE_RE, " ").replace(/\s{2,}/g, " ").trim();
  }

  function taskStatus(task) {
    const raw = String(task.status ?? "").toLowerCase();
    if (task.cancelled || raw === "-" || raw === "c" || raw.includes("cancel")) return "cancelled";
    if (task.completed || raw === "x" || raw.includes("done") || raw.includes("complete")) return "completed";
    return "open";
  }

  function normalizeTask(task, todayMs, project, index) {
    const dates = taskDates(task);
    let start = dates.start ?? dates.scheduled ?? dates.due ?? dates.completion;
    let end = dates.completion ?? dates.due;
    let point = false;
    const status = taskStatus(task);
    const explicitStart = dates.start ?? dates.scheduled;
    if (dates.start == null && dates.scheduled == null && (dates.due != null || dates.completion != null)) point = true;
    if (status === "open" && explicitStart != null && end == null) {
      if (explicitStart <= todayMs) end = todayMs;
      else point = true;
    }
    if (start == null && end != null) { start = end; point = true; }
    if (start != null && end == null) point = true;
    let warning = null;
    if (start != null && end != null && end < start) { end = start; point = true; warning = "End precedes start"; }
    const path = String(task.path || task.link?.path || task.file?.path || "");
    const line = Number(task.line ?? task.position?.start?.line ?? index ?? 0);
    return {
      id: path + ":" + line, kind: "task", label: cleanTaskText(task.text), start, end,
      point, status, project, path, line, dates, warning,
      marker: dates.scheduled != null && dates.scheduled !== start ? dates.scheduled : null,
      originalText: String(task.text || ""), raw: task
    };
  }

  function taskTimeDistance(task, todayMs) {
    const start = task.start;
    const end = task.end ?? start;
    if (start == null) return Infinity;
    if (start <= todayMs && end >= todayMs) return 0;
    return start > todayMs ? start - todayMs : todayMs - end;
  }

  function compareTasks(a, b, todayMs) {
    const distance = taskTimeDistance(a, todayMs) - taskTimeDistance(b, todayMs);
    if (distance) return distance;
    const statusRank = { open: 0, completed: 1, cancelled: 2 };
    const status = (statusRank[a.status] ?? 3) - (statusRank[b.status] ?? 3);
    if (status) return status;
    const date = (a.start ?? Infinity) - (b.start ?? Infinity);
    if (date) return date;
    const path = String(a.path || "").localeCompare(String(b.path || ""));
    return path || (Number(a.line) || 0) - (Number(b.line) || 0);
  }

  function ordinalFromCalendarYear(year) {
    if (!Number.isFinite(year) || year === 0) return null;
    return year > 0 ? year - 1 : year;
  }
  function calendarYearFromOrdinal(value) { return value >= 0 ? value + 1 : value; }
  function formatYearOrdinal(value) {
    const y = calendarYearFromOrdinal(value);
    const abs = Math.abs(y);
    let n;
    if (abs >= 1e9) n = (abs / 1e9).toPrecision(3).replace(/\.0+$/, "") + "B";
    else if (abs >= 1e6) n = (abs / 1e6).toPrecision(3).replace(/\.0+$/, "") + "M";
    else if (abs >= 1e4) n = (abs / 1e3).toPrecision(3).replace(/\.0+$/, "") + "k";
    else n = String(Number(abs.toPrecision(6)));
    return n + (y < 0 ? " BCE" : " CE");
  }

  function parseWikiText(text) {
    const raw = String(text || "").replace(/^[-*+]\s+/, "");
    let m = raw.match(WIKI_RANGE_RE), ranged = true, ongoing = false;
    if (!m) { m = raw.match(WIKI_OPEN_RANGE_RE); ongoing = Boolean(m); }
    if (!m) { m = raw.match(WIKI_POINT_RE); ranged = false; }
    if (!m) return null;
    const a = Number(m[1]), b = ongoing ? PRESENT_YEAR : ranged ? Number(m[2]) : a;
    const start = ordinalFromCalendarYear(a), end = ordinalFromCalendarYear(b);
    if (start == null || end == null) return { error: "Year zero or an invalid year", text: raw };
    const label = m[ongoing ? 2 : ranged ? 3 : 2];
    if (start > end) return { label, start, end: start, point: true, warning: "Inverted interval", rawStart: a, rawEnd: b };
    return { label, start, end, point: !ranged, ongoing, warning: null, rawStart: a, rawEnd: b };
  }

  function firstWikiTarget(text) {
    const m = String(text || "").match(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/);
    return m ? { path: m[1], label: m[2] || m[1].split("/").pop() } : null;
  }

  function linearScale(domainStart, domainEnd, rangeStart, rangeEnd) {
    const span = domainEnd - domainStart || 1, pixels = rangeEnd - rangeStart;
    return {
      map: v => rangeStart + (v - domainStart) / span * pixels,
      invert: x => domainStart + (x - rangeStart) / pixels * span
    };
  }

  function logTransform(value, present) {
    const distance = Math.max(0, present - value);
    return -Math.log1p(distance);
  }
  function logInverse(value, present) { return present - Math.expm1(-value); }
  function logScale(domainStart, domainEnd, rangeStart, rangeEnd, present) {
    const a = logTransform(domainStart, present), b = logTransform(domainEnd, present);
    const base = linearScale(a, b, rangeStart, rangeEnd);
    return { map: v => base.map(logTransform(v, present)), invert: x => logInverse(base.invert(x), present) };
  }

  function zoomDomain(domain, anchorPx, factor, width, makeScale) {
    const scale = makeScale(domain[0], domain[1], 0, width);
    return [
      scale.invert(anchorPx + (0 - anchorPx) * factor),
      scale.invert(anchorPx + (width - anchorPx) * factor)
    ];
  }

  const Core = { dateMs, taskDates, taskStatus, normalizeTask, ordinalFromCalendarYear, calendarYearFromOrdinal,
    formatYearOrdinal, parseWikiText, linearScale, logTransform, logInverse, logScale, zoomDomain,
    taskTimeDistance, compareTasks };
  if (typeof globalThis !== "undefined") globalThis.TimelineCore = Core;
  if (typeof dv === "undefined") return;

  const cfg = Object.assign({ source: "misc", pages: "", projectFolder: "misc/projects", scale: "linear",
    initialBefore: "1 month", initialAfter: "1 month", initialYearsBack: 2000 }, input || {});
  const sourcePath = dv.current()?.file?.path || "";
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  function pageArray(query) { try { return Array.from(dv.pages(query)); } catch (e) { return []; } }
  function under(path, folder) { return path === folder || path.startsWith(folder.replace(/\/$/, "") + "/"); }

  function miscModel() {
    const pages = pageArray(cfg.pages);
    const projects = new Map(), seen = new Set();
    for (const page of pages) {
      const path = String(page.file?.path || "");
      const isProject = under(path, cfg.projectFolder);
      const name = isProject ? String(page.file?.name || path.split("/").pop()) : "Uncategorized";
      if (!projects.has(name)) projects.set(name, { id: "project:" + name, kind: "project", label: name, path: isProject ? path : "", children: [], explicitStart: dateMs(page["timeline-start"]), explicitEnd: dateMs(page["timeline-end"]) });
      const project = projects.get(name);
      if (isProject) {
        project.explicitStart = dateMs(page["timeline-start"]) ?? project.explicitStart;
        project.explicitEnd = dateMs(page["timeline-end"]) ?? project.explicitEnd;
      }
      for (const [i, task] of Array.from(page.file?.tasks || []).entries()) {
        const item = normalizeTask(task, todayMs, name, i);
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        project.children.push(item);
      }
    }
    let undated = 0;
    for (const p of projects.values()) {
      const dated = p.children.filter(t => t.start != null);
      undated += p.children.length - dated.length;
      p.start = p.explicitStart ?? (dated.length ? Math.min(...dated.map(t => t.start)) : null);
      p.end = p.explicitEnd ?? (dated.length ? Math.max(...dated.map(t => t.end ?? t.start)) : null);
      p.children = dated.sort((a, b) => compareTasks(a, b, todayMs));
    }
    const roots = Array.from(projects.values()).sort((a, b) => compareTasks(a, b, todayMs));
    return { roots, diagnostics: [], undated };
  }

  function wikiModel() {
    const groups = [], diagnostics = [];
    for (const page of pageArray(cfg.pages)) {
      const path = String(page.file?.path || "");
      const roots = [], all = new Map();
      for (const [i, li] of Array.from(page.file?.lists || []).entries()) {
        if (li.task) continue;
        const parsed = parseWikiText(li.text);
        if (!parsed || parsed.error) {
          if (/^\s*[+-]?(?:\d|\.\d)/.test(String(li.text || ""))) diagnostics.push(path + ":" + (li.line ?? i) + " — " + (parsed?.error || "Malformed date bullet"));
          continue;
        }
        if (parsed.end > ordinalFromCalendarYear(PRESENT_YEAR)) { diagnostics.push(path + ":" + (li.line ?? i) + " — future event omitted"); continue; }
        const link = firstWikiTarget(parsed.label);
        const id = path + ":" + Number(li.line ?? i);
        const item = Object.assign(parsed, { id, kind: "event", path, sourcePath: path, linkPath: link?.path || null,
          line: Number(li.line ?? i), displayLabel: link?.label || parsed.label, children: [], parentRef: li.parent });
        all.set(id, item);
        const parentLine = typeof li.parent === "number" ? li.parent : li.parent?.line;
        const parent = parentLine == null ? null : all.get(path + ":" + parentLine);
        if (parent) parent.children.push(item); else roots.push(item);
      }
      if (!roots.length) continue;
      const sortEvents = items => {
        items.sort((a, b) => a.start - b.start || (a.end ?? a.start) - (b.end ?? b.start) || a.line - b.line);
        for (const item of items) sortEvents(item.children || []);
      };
      sortEvents(roots);
      const dated = [];
      const collect = items => { for (const item of items) { dated.push(item); collect(item.children || []); } };
      collect(roots);
      groups.push({
        id: "history-group:" + path, kind: "history-group",
        label: String(page.file?.name || path.split("/").pop() || "Untitled"), path,
        start: Math.min(...dated.map(item => item.start)),
        end: Math.max(...dated.map(item => item.end ?? item.start)),
        children: roots
      });
    }
    const present = ordinalFromCalendarYear(PRESENT_YEAR);
    groups.sort((a, b) => compareTasks(a, b, present));
    return { roots: groups, diagnostics, undated: 0 };
  }

  const model = cfg.source === "wiki" ? wikiModel() : miscModel();
  const state = { expanded: new Set(), statuses: new Set(["open", "completed", "cancelled"]), project: "all",
    scale: cfg.source === "wiki" && cfg.scale !== "linear" ? "log" : "linear", dragging: false,
    findQuery: "", findIndex: -1, findId: null };
  const presentOrdinal = ordinalFromCalendarYear(PRESENT_YEAR);
  function durationOffset(value, direction) {
    const m = String(value || "1 month").trim().match(/^(\d+(?:\.\d+)?)\s*(day|week|month|year)s?$/i);
    if (!m) return direction * 30 * DAY;
    const count = Number(m[1]) * direction, unit = m[2].toLowerCase();
    if (unit === "day") return count * DAY;
    if (unit === "week") return count * 7 * DAY;
    const d = new Date(todayMs);
    if (unit === "month") d.setUTCMonth(d.getUTCMonth() + count);
    else d.setUTCFullYear(d.getUTCFullYear() + count);
    return d.getTime() - todayMs;
  }
  state.domain = cfg.source === "wiki" ? [ordinalFromCalendarYear(PRESENT_YEAR - Number(cfg.initialYearsBack || 2000)), presentOrdinal]
    : [todayMs + durationOffset(cfg.initialBefore, -1), todayMs + durationOffset(cfg.initialAfter, 1)];

  const root = dv.el("div", "", { cls: "native-timeline", attr: { tabindex: "0" } });
  const toolbar = root.createDiv({ cls: "nt-toolbar" });
  const canvas = root.createDiv({ cls: "nt-canvas" });
  const tooltip = root.createDiv({ cls: "nt-tooltip" });
  const statusLine = root.createDiv({ cls: "nt-status" });

  function button(label, title, fn) { const b = toolbar.createEl("button", { text: label, attr: { title } }); b.addEventListener("click", fn); return b; }
  button("Present", "Return to the initial present-centered range", () => { state.domain = cfg.source === "wiki" ? [ordinalFromCalendarYear(PRESENT_YEAR - Number(cfg.initialYearsBack || 2000)), presentOrdinal] : [todayMs + durationOffset(cfg.initialBefore, -1), todayMs + durationOffset(cfg.initialAfter, 1)]; render(); });
  button("Fit all", "Fit all dated items", () => { const values = []; walk(model.roots, x => { if (x.start != null) values.push(x.start, x.end ?? x.start); }); if (values.length) { let a = Math.min(...values), b = Math.max(...values); const pad = (b - a || (cfg.source === "wiki" ? 10 : 7 * DAY)) * .05; state.domain = [a - pad, Math.min(b + pad, cfg.source === "wiki" ? presentOrdinal : Infinity)]; render(); } });
  if (cfg.source === "wiki") button(state.scale === "log" ? "Log" : "Linear", "Toggle axis scale", e => { state.scale = state.scale === "log" ? "linear" : "log"; e.currentTarget.textContent = state.scale === "log" ? "Log" : "Linear"; render(); });
  {
    const isWiki = cfg.source === "wiki";
    const select = toolbar.createEl("select", { attr: { "aria-label": isWiki ? "Note filter" : "Project filter" } });
    select.createEl("option", { text: isWiki ? "All notes" : "All projects", attr: { value: "all" } });
    for (const p of model.roots) select.createEl("option", { text: p.label, attr: { value: p.label } });
    select.addEventListener("change", () => { state.project = select.value; render(); });
    if (!isWiki) {
      for (const status of ["open", "completed", "cancelled"]) {
        const label = toolbar.createEl("label", { cls: "nt-check" }); const check = label.createEl("input", { attr: { type: "checkbox" } }); check.checked = true;
        label.appendText(status); check.addEventListener("change", () => { check.checked ? state.statuses.add(status) : state.statuses.delete(status); render(); });
      }
    }
  }
  if (model.diagnostics.length) {
    const details = toolbar.createEl("details", { cls: "nt-diagnostics" });
    details.createEl("summary", { text: model.diagnostics.length + " diagnostics" });
    details.createEl("div", { text: model.diagnostics.join("\n") });
  }

  const finder = toolbar.createDiv({ cls: "nt-finder" });
  const findInput = finder.createEl("input", { attr: { type: "search", placeholder: "Find…", "aria-label": "Find timeline item" } });
  const findCount = finder.createEl("span", { cls: "nt-find-count", text: "" });

  function walk(items, fn) { for (const item of items) { fn(item); walk(item.children || [], fn); } }
  function findEntries(query) {
    const needle=String(query||"").trim().toLocaleLowerCase(), found=[];
    if(!needle)return found;
    function visit(items,ancestors) {
      for(const item of items) {
        const haystack=[item.displayLabel,item.label,item.originalText,item.path].filter(Boolean).join(" ").toLocaleLowerCase();
        if(haystack.includes(needle))found.push({item,ancestors});
        visit(item.children||[],ancestors.concat(item));
      }
    }
    visit(model.roots,[]); return found;
  }
  function updateFindCount() {
    const matches=findEntries(findInput.value);
    findCount.textContent=matches.length?(state.findIndex>=0?`${state.findIndex+1}/${matches.length}`:`${matches.length}`):findInput.value.trim()?"0":"";
  }
  function revealFind(direction=1) {
    const query=findInput.value.trim(), matches=findEntries(query);
    if(!matches.length){state.findIndex=-1;state.findId=null;updateFindCount();return;}
    if(query!==state.findQuery)state.findIndex=direction<0?0:-1;
    state.findQuery=query;
    state.findIndex=(state.findIndex+direction+matches.length)%matches.length;
    const match=matches[state.findIndex]; state.findId=match.item.id;
    for(const ancestor of match.ancestors)state.expanded.add(ancestor.id);
    if(!overlaps(match.item)) {
      const itemStart=match.item.start, itemEnd=match.item.end??itemStart;
      const span=Math.max(state.domain[1]-state.domain[0],itemEnd-itemStart||1);
      const center=(itemStart+itemEnd)/2;
      state.domain=[center-span/2,center+span/2];
      if(cfg.source==="wiki"&&state.domain[1]>presentOrdinal) {
        const excess=state.domain[1]-presentOrdinal;
        state.domain=[state.domain[0]-excess,presentOrdinal];
      }
    }
    render(); updateFindCount();
    requestAnimationFrame(()=>{
      const row=Array.from(canvas.querySelectorAll(".nt-row")).find(el=>el.dataset.itemId===match.item.id);
      row?.scrollIntoView({behavior:"smooth",block:"center",inline:"nearest"});
    });
  }
  findInput.addEventListener("input",()=>{state.findQuery=findInput.value.trim();state.findIndex=-1;state.findId=null;updateFindCount();render();});
  findInput.addEventListener("keydown",event=>{
    if(event.key==="Enter"){event.preventDefault();event.stopPropagation();revealFind(event.shiftKey?-1:1);}
    if(event.key==="Escape"){findInput.value="";state.findQuery="";state.findIndex=-1;state.findId=null;updateFindCount();render();root.focus();}
  });
  root.addEventListener("pointerdown",event=>{if(!event.target.closest("input,button,select,summary"))root.focus({preventScroll:true});});
  root.addEventListener("keydown",event=>{
    if((event.ctrlKey||event.metaKey)&&event.key.toLocaleLowerCase()==="f"){
      event.preventDefault();event.stopPropagation();findInput.focus();findInput.select();
    }
  });

  function overlaps(item) { return item.start != null && item.start <= state.domain[1] && (item.end ?? item.start) >= state.domain[0]; }
  function visibleRows() {
    const rows = [];
    function add(item, depth) {
      if (!overlaps(item)) return;
      if (item.kind === "task" && !state.statuses.has(item.status)) return;
      rows.push({ item, depth });
      if (state.expanded.has(item.id)) for (const child of item.children || []) add(child, depth + 1);
    }
    for (const rootItem of model.roots) {
      if (state.project !== "all" && rootItem.label !== state.project) continue;
      add(rootItem, 0);
    }
    return rows;
  }

  function scaleFor(width) {
    return state.scale === "log" ? logScale(state.domain[0], state.domain[1], 0, width, presentOrdinal) : linearScale(state.domain[0], state.domain[1], 0, width);
  }
  function svgEl(name, attrs, parent) { const el = document.createElementNS(NS, name); for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v); (parent || canvas).appendChild(el); return el; }
  function formatCoord(v) { return cfg.source === "wiki" ? formatYearOrdinal(v) : new Date(v).toISOString().slice(0, 10); }
  function positionTip(event) {
    const rect=root.getBoundingClientRect();
    tooltip.style.left=Math.max(6,Math.min(event.clientX-rect.left+14,root.clientWidth-tooltip.offsetWidth-6))+"px";
    tooltip.style.top=Math.max(6,event.clientY-rect.top+14)+"px";
  }
  function showOriginalTaskTip(item, event) {
    tooltip.replaceChildren();
    tooltip.createEl("span", { text: item.originalText || item.label || "(untitled)" });
    tooltip.classList.add("is-visible"); positionTip(event);
  }
  function showGeometryTip(item, event, start=item.start, end=item.point ? null : item.end) {
    event.stopPropagation();
    tooltip.replaceChildren();
    tooltip.createEl("span", { text: formatCoord(start) + (end == null ? "" : " – " + formatCoord(end)) });
    tooltip.classList.add("is-visible"); positionTip(event);
  }
  function bindGeometryTip(el, item, start=item.start, end=item.point ? null : item.end) {
    el.addEventListener("mousemove", event => showGeometryTip(item, event, start, end));
    el.addEventListener("mouseleave", () => tooltip.classList.remove("is-visible"));
  }
  function showTip(item, event) {
    const ds = item.dates || {};
    const dateLines = Object.entries(ds).filter(([,v]) => v != null && !Number.isNaN(v)).map(([k,v]) => k + ": " + iso(v));
    let relative = "";
    if (ds.due != null) { const days = Math.round((ds.due - todayMs) / DAY); relative = days === 0 ? "due today" : days > 0 ? "due in " + days + "d" : "overdue by " + -days + "d"; }
    tooltip.replaceChildren();
    tooltip.createEl("strong", { text: item.displayLabel || item.label });
    tooltip.createEl("div", { text: item.kind === "task" ? item.project + " · " + item.status : (formatCoord(item.start) + (item.point ? "" : " – " + formatCoord(item.end))) });
    if (dateLines.length) tooltip.createEl("div", { text: dateLines.join(" · ") });
    if (relative) tooltip.createEl("div", { text: relative });
    if (item.warning) tooltip.createEl("div", { text: "⚠ " + item.warning });
    tooltip.classList.add("is-visible"); positionTip(event);
  }
  async function navigate(item) {
    const path = item.linkPath || item.sourcePath || item.path; if (!path) return;
    const file = app.vault.getAbstractFileByPath(path);
    if (file) { const leaf = app.workspace.getLeaf("tab"); await leaf.openFile(file); const view = leaf.view; if (!item.linkPath && view?.editor && Number.isFinite(item.line)) { view.editor.setCursor({ line: Math.max(0, item.line), ch: 0 }); view.editor.scrollIntoView({ from: { line: Math.max(0, item.line - 2), ch: 0 }, to: { line: item.line + 2, ch: 0 } }, true); } }
    else await app.workspace.openLinkText(path, sourcePath, true);
  }

  function render() {
    canvas.replaceChildren(); tooltip.classList.remove("is-visible");
    const width = Math.max(320, canvas.clientWidth || root.clientWidth || 800), labelW = Math.min(240, Math.max(120, width * .25));
    const plotW = width - labelW, rows = visibleRows(), rowH = 30, axisH = 38, height = Math.max(100, axisH + rows.length * rowH + 8);
    const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, width: "100%", height, role: "img", "aria-label": cfg.source + " timeline" });
    const defs = svgEl("defs", {}, svg), clipSuffix=Math.random().toString(36).slice(2);
    const clip = svgEl("clipPath", { id: "nt-clip-" + clipSuffix }, defs); svgEl("rect", { x: labelW, y: axisH, width: plotW, height: height-axisH }, clip);
    const labelClipId="nt-label-clip-"+clipSuffix, labelClip=svgEl("clipPath",{id:labelClipId},defs); svgEl("rect",{x:0,y:axisH,width:Math.max(0,labelW-4),height:height-axisH},labelClip);
    svgEl("rect", { x: labelW, y: 0, width: plotW, height, class: "nt-hit-area" }, svg);
    const scale = scaleFor(plotW), plotX = v => labelW + scale.map(v);
    svgEl("line", { x1: labelW, x2: width, y1: axisH-6, y2: axisH-6, class: "nt-axis" }, svg);
    for (let i=0;i<=6;i++) { const x = plotW*i/6, value=scale.invert(x); svgEl("line", { x1:labelW+x,x2:labelW+x,y1:axisH-10,y2:height,class:"nt-grid" },svg); const t=svgEl("text",{x:labelW+x,y:14,class:"nt-tick","text-anchor":i===0?"start":i===6?"end":"middle"},svg); t.textContent=formatCoord(value); }
    rows.forEach(({ item, depth }, idx) => {
      const y=axisH+idx*rowH, g=svgEl("g",{class:"nt-row nt-"+item.kind+(item.status?" nt-"+item.status:"")+(state.findId===item.id?" is-find-current":""),"data-item-id":item.id},svg);
      svgEl("rect",{x:0,y,width,height:rowH,class:"nt-row-bg"},g);
      const hasChildren=(item.children||[]).length>0;
      const toggle=()=>{if(hasChildren){state.expanded.has(item.id)?state.expanded.delete(item.id):state.expanded.add(item.id);render();}else navigate(item);};
      const labelHit=svgEl("rect",{x:0,y,width:labelW,height:rowH,class:"nt-label-hit"},g);
      labelHit.addEventListener("pointerdown",e=>e.stopPropagation()); labelHit.addEventListener("click",toggle);
      const labelX=8+depth*14+(item.kind==="task"?18:0);
      if(item.kind==="task") { const checkbox=svgEl("text",{x:8+depth*14,y:y+20,class:"nt-task-checkbox","clip-path":`url(#${labelClipId})`},g); checkbox.textContent=item.status==="completed"?"☑":item.status==="cancelled"?"☒":"☐"; }
      const label=svgEl("text",{x:labelX,y:y+20,class:"nt-label","clip-path":`url(#${labelClipId})`},g);
      label.textContent=(hasChildren?(state.expanded.has(item.id)?"▾ ":"▸ "):"")+(item.displayLabel||item.label||"(untitled)");
      label.addEventListener("pointerdown",e=>e.stopPropagation()); label.addEventListener("click",toggle);
      if(item.kind==="task") { label.addEventListener("mousemove",e=>showOriginalTaskTip(item,e)); label.addEventListener("mouseleave",()=>tooltip.classList.remove("is-visible")); }
      const rawA=plotX(item.start), rawB=plotX(item.end??item.start), a=Math.max(labelW,rawA), b=Math.min(width,rawB), clippedL=rawA<labelW, clippedR=rawB>width;
      const isGroup=item.kind==="project"||item.kind==="history-group";
      if(item.point || Math.abs(b-a)<3) {
        const mark=svgEl("circle",{cx:Math.max(labelW,Math.min(width,rawA)),cy:y+rowH/2,r:isGroup?5:4,class:"nt-mark"},g);
        bindGeometryTip(mark,item,item.start,null);
      } else if(b>=labelW&&a<=width) {
        const band=svgEl("rect",{x:a,y:y+8,width:Math.max(3,b-a),height:isGroup?14:10,rx:4,class:"nt-band"},g);
        bindGeometryTip(band,item);
        if(clippedL) svgEl("path",{d:`M${labelW+6},${y+8} L${labelW},${y+15} L${labelW+6},${y+22}`,class:"nt-cont"},g);
        if(clippedR) svgEl("path",{d:`M${width-6},${y+8} L${width},${y+15} L${width-6},${y+22}`,class:"nt-cont"},g);
      }
      if(item.marker!=null&&item.marker>=state.domain[0]&&item.marker<=state.domain[1]) {
        const marker=svgEl("path",{d:`M${plotX(item.marker)},${y+5} v20`,class:"nt-scheduled"},g);
        bindGeometryTip(marker,item,item.marker,null);
      }
      if(isGroup&&!state.expanded.has(item.id)) {
        const compactItems=[];
        walk(item.children||[], child=>compactItems.push(child));
        for(const child of compactItems) {
          if((child.kind==="task"&&!state.statuses.has(child.status))||!overlaps(child)) continue;
          const tx=Math.max(labelW,Math.min(width,plotX(child.start)));
          const compact=svgEl("circle",{cx:tx,cy:y+rowH/2,r:2.5,class:"nt-compact"+(child.status?" nt-"+child.status:"")},g);
          bindGeometryTip(compact,child,child.start,child.point?null:child.end);
        }
      }
      g.addEventListener("mouseleave",()=>tooltip.classList.remove("is-visible")); g.addEventListener("dblclick",()=>navigate(item));
    });
    const cursor = svgEl("g", { class: "nt-cursor", visibility: "hidden", "aria-hidden": "true" }, svg);
    svgEl("line", { x1: labelW, x2: labelW, y1: axisH-6, y2: height, class: "nt-cursor-line" }, cursor);
    svgEl("text", { x: labelW+6, y: axisH+11, class: "nt-cursor-label" }, cursor);
    statusLine.textContent = rows.length + " visible item" + (rows.length===1?"":"s") + (model.undated ? " · " + model.undated + " undated item" + (model.undated===1?"":"s") : "") + " · Ctrl + wheel to zoom, drag to pan";
  }

  function updateTimelineCursor(event) {
    const svg=canvas.querySelector("svg"), cursor=svg?.querySelector(".nt-cursor"); if(!svg||!cursor)return;
    const rect=svg.getBoundingClientRect(), width=Number(svg.viewBox.baseVal.width), labelW=Math.min(240,Math.max(120,width*.25));
    const x=(event.clientX-rect.left)*(width/rect.width);
    if(x<labelW||x>width){cursor.setAttribute("visibility","hidden");return;}
    const value=scaleFor(width-labelW).invert(x-labelW), line=cursor.querySelector(".nt-cursor-line"), label=cursor.querySelector(".nt-cursor-label");
    line.setAttribute("x1",x); line.setAttribute("x2",x);
    label.setAttribute("x",x>width-90?x-6:x+6); label.setAttribute("text-anchor",x>width-90?"end":"start"); label.textContent=formatCoord(value);
    cursor.setAttribute("visibility","visible");
  }

  canvas.addEventListener("wheel", e => { if(!e.ctrlKey)return; e.preventDefault(); const rect=canvas.getBoundingClientRect(), labelW=Math.min(240,Math.max(120,rect.width*.25)), px=Math.max(0,Math.min(rect.width-labelW,e.clientX-rect.left-labelW)); const factor=e.deltaY>0?1.2:1/1.2; const maker=(a,b,x,y)=>state.scale==="log"?logScale(a,b,x,y,presentOrdinal):linearScale(a,b,x,y); state.domain=zoomDomain(state.domain,px,factor,rect.width-labelW,maker); if(cfg.source==="wiki") state.domain[1]=Math.min(state.domain[1],presentOrdinal); render(); },{passive:false});
  canvas.addEventListener("pointerdown",e=>{if(e.button!==0)return;state.dragging=true;state.dragX=e.clientX;state.dragDomain=state.domain.slice();canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener("pointermove",e=>{if(state.dragging){const rect=canvas.getBoundingClientRect(),w=rect.width-Math.min(240,Math.max(120,rect.width*.25)),maker=(a,b,x,y)=>state.scale==="log"?logScale(a,b,x,y,presentOrdinal):linearScale(a,b,x,y),s=maker(state.dragDomain[0],state.dragDomain[1],0,w),dx=e.clientX-state.dragX;state.domain=[s.invert(-dx),s.invert(w-dx)];if(cfg.source==="wiki"&&state.domain[1]>presentOrdinal){const d=state.domain[1]-presentOrdinal;state.domain=[state.domain[0]-d,presentOrdinal];}render();}updateTimelineCursor(e);});
  canvas.addEventListener("pointerleave",()=>{if(!state.dragging)canvas.querySelector(".nt-cursor")?.setAttribute("visibility","hidden");});
  canvas.addEventListener("pointerup",()=>state.dragging=false); canvas.addEventListener("pointercancel",()=>state.dragging=false);
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(render) : null; observer?.observe(root);
  render();
})();
