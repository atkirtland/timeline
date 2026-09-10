const assert = require("node:assert/strict");
require("./view.js");
const c = globalThis.TimelineCore;
const day = s => Date.parse(s + "T00:00:00Z");
assert.equal(c.dateMs(2100), day("2100-01-01"));
assert.equal(c.dateMs(2100), c.dateMs("2100-01-01"));
assert.equal(c.dateMs(4102444800000), day("2100-01-01"));
assert.equal(c.timelineColor({"timeline-color":" #5b8cff "}), "#5b8cff");
assert.equal(c.timelineColor({}), null);
assert.deepEqual(c.childFieldValues(null), []);
assert.deepEqual(c.childFieldValues("[[One]]"), ["[[One]]"]);
assert.deepEqual(c.childFieldValues(["[[One]]", "Two"]), ["[[One]]", "Two"]);
assert.equal(c.childLinkPath("[[folder/Child|Label]]"), "folder/Child");
assert.equal(c.childLinkPath({path:"folder/Child.md"}), "folder/Child.md");

// Parent-owned child lists form a strict tree and reject ambiguous or cyclic edges.
const project = (path, childPaths=[]) => ({path, label:path, childPaths});
let hp=project("parent.md",["child.md"]), hc=project("child.md",["grandchild.md"]), hg=project("grandchild.md");
let hierarchy=c.buildProjectHierarchy([hp,hc,hg]);
assert.deepEqual(hierarchy.roots.map(x=>x.path),["parent.md"]);
assert.deepEqual(hp.subprojects.map(x=>x.path),["child.md"]);
assert.deepEqual(hc.subprojects.map(x=>x.path),["grandchild.md"]);
let p1=project("p1.md",["shared.md"]), p2=project("p2.md",["shared.md"]), shared=project("shared.md");
hierarchy=c.buildProjectHierarchy([p1,p2,shared]);
assert.equal(hierarchy.roots.includes(shared),true);
assert.equal(hierarchy.diagnostics.some(x=>x.includes("multiple project parents")),true);
let ca=project("a.md",["b.md"]), cb=project("b.md",["a.md"]);
hierarchy=c.buildProjectHierarchy([ca,cb]);
assert.deepEqual(new Set(hierarchy.roots.map(x=>x.path)),new Set(["a.md","b.md"]));
assert.equal(hierarchy.diagnostics.some(x=>x.includes("cycle")),true);
let self=project("self.md",["self.md"]);
hierarchy=c.buildProjectHierarchy([self]);
assert.deepEqual(hierarchy.roots,[self]);
assert.equal(hierarchy.diagnostics.some(x=>x.includes("own child")),true);
const nestedTask={label:"Nested",start:day("2026-01-02"),end:day("2026-01-08"),status:"open",path:"task.md",line:1};
const nested={path:"nested.md",label:"Nested",color:null,explicitStart:null,explicitEnd:null,tasks:[nestedTask],subprojects:[]};
const rootProject={path:"root.md",label:"Root",color:"#123456",explicitStart:day("2026-01-01"),explicitEnd:null,tasks:[],subprojects:[nested]};
c.finalizeProjectTree(rootProject);
assert.equal(rootProject.start,day("2026-01-01"));
assert.equal(rootProject.end,day("2026-01-08"));
assert.equal(nested.color,"#123456");
assert.equal(nestedTask.color,"#123456");
assert.deepEqual(rootProject.children,[nested]);
const nestedEvent={kind:"event",start:day("2027-01-01"),end:day("2027-01-01"),children:[]};
const eventRoot={kind:"event",start:day("2025-01-01"),end:day("2025-01-01"),children:[nestedEvent]};
const eventProject={path:"events.md",label:"Events",color:"#654321",explicitStart:null,explicitEnd:null,tasks:[],events:[eventRoot],subprojects:[]};
c.finalizeProjectTree(eventProject);
assert.equal(eventProject.start,day("2025-01-01")); assert.equal(eventProject.end,day("2027-01-01"));
assert.equal(nestedEvent.color,"#654321"); assert.deepEqual(eventProject.children,[eventRoot]);

// Expanded descendants remain visible even when only their root overlaps the date domain.
const outside={id:"outside",kind:"project",children:[]};
const inside={id:"inside",kind:"project",children:[outside]};
assert.deepEqual(c.expandedRows([inside],new Set(["inside"]),item=>item===inside).map(row=>[row.item.id,row.depth]),
  [["inside",0],["outside",1]]);
assert.deepEqual(c.expandedRows([outside],new Set(),()=>false),[]);

// Task date precedence and geometry.
let t = c.normalizeTask({ path:"a.md", line:1, text:"Work 🛫 2026-01-01 ⏳ 2026-01-02 📅 2026-01-10 ➕ 2025-01-01" }, day("2026-01-05"), "A", 0);
assert.equal(t.start, day("2026-01-01")); assert.equal(t.end, day("2026-01-10")); assert.equal(t.marker, day("2026-01-02"));
t = c.normalizeTask({ path:"a.md", line:2, text:"Ongoing ⏳ 2026-01-01" }, day("2026-01-05"), "A", 0);
assert.equal(t.end, day("2026-01-05"));
t = c.normalizeTask({ path:"a.md", line:3, text:"Future 🛫 2027-01-01" }, day("2026-01-05"), "A", 0);
assert.equal(t.point, true); assert.equal(t.end, null);
t = c.normalizeTask({ path:"a.md", line:4, text:"Due 📅 2026-02-01" }, day("2026-01-05"), "A", 0);
assert.equal(t.point, true); assert.equal(t.start, t.end);
t = c.normalizeTask({ path:"a.md", line:5, text:"Done ✅ 2026-01-03", completed:true }, day("2026-01-05"), "A", 0);
assert.equal(t.status, "completed"); assert.equal(t.point, true);
assert.equal(c.normalizeTask({path:"a",line:6,text:"No date"},day("2026-01-05"),"A",0).start,null);
assert.equal(c.taskStatus({status:"-"}), "cancelled");
// All date-presence combinations remain deterministic; creation never supplies geometry.
for (let mask=0; mask<16; mask++) {
  const marks=[];
  if(mask&1) marks.push("🛫 2026-01-01");
  if(mask&2) marks.push("⏳ 2026-01-02");
  if(mask&4) marks.push("📅 2026-01-10");
  if(mask&8) marks.push("✅ 2026-01-08");
  const item=c.normalizeTask({path:"combo.md",line:mask,text:"T "+marks.join(" ")},day("2026-01-05"),"P",mask);
  assert.equal(item.id,"combo.md:"+mask);
  assert.equal(item.start==null,mask===0);
}
assert.equal(c.normalizeTask({path:"a",line:7,text:"Made ➕ 2025-01-01"},day("2026-01-05"),"A",0).start,null);
assert.equal(c.normalizeTask({path:"a",line:8,text:"Bad 🛫 2026-02-01 📅 2026-01-01"},day("2026-01-05"),"A",0).warning,"End precedes start");

// Status sorts first, then latest endpoint, earlier start, and alphabetic label.
const sortable=[
  {label:"Old open",start:day("2026-01-08"),end:day("2026-01-08"),status:"open",path:"a",line:1},
  {label:"New completed",start:day("2026-01-12"),end:day("2026-01-12"),status:"completed",path:"a",line:2},
  {label:"New open",start:day("2026-01-12"),end:day("2026-01-12"),status:"open",path:"a",line:3},
  {label:"Cancelled",start:day("2026-01-09"),end:day("2026-01-11"),status:"cancelled",path:"a",line:4}
].sort(c.compareTasks);
assert.deepEqual(sortable.map(x=>x.line),[3,1,2,4]);

// Projects are ranked from their own displayed span, independently of child order.
const groups=[
  {label:"Later",path:"later.md",start:day("2026-01-12"),end:day("2026-01-14"),children:[sortable[0]]},
  {label:"Current",path:"current.md",start:day("2026-01-01"),end:day("2026-01-11"),children:[sortable[2]]},
  {label:"Empty",path:"empty.md",start:null,end:null,children:[sortable[0]]},
  {label:"Earlier",path:"earlier.md",start:day("2026-01-08"),end:day("2026-01-08"),children:[sortable[2]]}
].sort(c.compareTasks);
assert.deepEqual(groups.map(x=>x.label),["Later","Current","Earlier","Empty"]);

// Wiki notes use their own aggregate historical span and the present-year coordinate.
const present=c.ordinalFromCalendarYear(new Date().getUTCFullYear());
const notes=[
  {path:"ancient.md",start:c.ordinalFromCalendarYear(-500),end:c.ordinalFromCalendarYear(-400)},
  {path:"recent.md",start:c.ordinalFromCalendarYear(2000),end:c.ordinalFromCalendarYear(2010)},
  {path:"ongoing.md",start:c.ordinalFromCalendarYear(1900),end:present}
].sort(c.compareTasks);
assert.deepEqual(notes.map(x=>x.path),["ongoing.md","recent.md","ancient.md"]);
const tied=[
  {label:"Zulu",start:100,end:200,path:"z.md"},
  {label:"Beta",start:90,end:200,path:"b.md"},
  {label:"Alpha",start:90,end:200,path:"a.md"}
].sort(c.compareTasks);
assert.deepEqual(tied.map(x=>x.label),["Alpha","Beta","Zulu"]);

// Historical syntax, hierarchy coordinates, and no year zero.
for (const text of ["-2.58e6 – -11.7e3 Pleistocene", "-115e3 – -11.7e3 Glacial", "1066e0 Battle"])
  assert.ok(c.parseWikiText(text), text);
for (const text of ["1945 – Ongoing era"]) {
  const ongoing=c.parseWikiText(text);
  assert.equal(ongoing.ongoing,true,text); assert.equal(ongoing.point,false,text);
  assert.equal(c.calendarYearFromOrdinal(ongoing.end),new Date().getUTCFullYear(),text);
}
assert.equal(c.parseWikiText("0e0 Impossible").error.includes("zero"), true);
assert.equal(c.ordinalFromCalendarYear(-1), -1); assert.equal(c.ordinalFromCalendarYear(1), 0);
assert.equal(c.calendarYearFromOrdinal(0), 1);
assert.equal(c.formatYearOrdinal(c.ordinalFromCalendarYear(2026)), "2026 CE");
assert.equal(c.formatYearOrdinal(c.ordinalFromCalendarYear(-1150)), "1150 BCE");
assert.equal(c.parseWikiText("12 – 10 inverted").warning, "Inverted interval");
assert.equal(c.parseWikiText("ordinary prose"), null);
assert.equal(c.parseWikiText("1066 Battle"),null);
assert.equal(c.parseWikiText("1066E0 Battle"),null);
assert.equal(c.parseWikiText("1066e+0 Battle"),null);
assert.equal(c.looksLikeWikiEvent("1066 Battle"),false);
assert.equal(c.looksLikeWikiEvent("1066E0 Battle"),true);
for (const text of ["2026-08e0 Monthly point", "2026-08-17e0 Daily point", "2026-08–2026-09 fish", "2026-08-17–2026-09-02 trip"])
  assert.ok(c.parseWikiText(text), text);
assert.equal(c.parseWikiText("2026-02-29e0 Invalid date").error.includes("Invalid date"),true);
assert.equal(c.parseWikiText("2026-08 Monthly point"),null);
assert.equal(c.parseWikiText("2026-08-17 Daily point"),null);
assert.equal(c.parseWikiText("1945.. Ongoing era"),null);
assert.equal(c.parseWikiText("1945 - Ongoing era"),null);
const miscPoint=c.parseMiscEvent("2026e0 Example",day("2026-09-10"));
assert.equal(miscPoint.start,day("2026-01-01")); assert.equal(miscPoint.end,day("2026-01-01"));
const miscRange=c.parseMiscEvent("2024 – 2026 Example",day("2026-09-10"));
assert.equal(miscRange.start,day("2024-01-01")); assert.equal(miscRange.end,day("2026-01-01"));
const miscOngoing=c.parseMiscEvent("2024 – Still happening",day("2026-09-10"));
assert.equal(miscOngoing.end,day("2026-09-10"));
const miscMonths=c.parseMiscEvent("2026-08–2026-09 fish",day("2026-09-10"));
assert.equal(miscMonths.start,day("2026-08-01")); assert.equal(miscMonths.end,day("2026-09-01"));
const miscDays=c.parseMiscEvent("2026-08-17–2026-09-02 trip",day("2026-09-10"));
assert.equal(miscDays.start,day("2026-08-17")); assert.equal(miscDays.end,day("2026-09-02"));
assert.equal(c.parseMiscEvent("2024.5 – 2026 Invalid",day("2026-09-10")).error.includes("whole-number"),true);

// Linear/log transforms are monotonic, invertible, and finite at present.
const lin=c.linearScale(-100,100,0,500), log=c.logScale(-2000,2025,0,500,2025);
for(const x of [-100,-20,0,30,100]) assert.ok(Math.abs(lin.invert(lin.map(x))-x)<1e-9);
for(const x of [-2000,-1000,0,1000,2025]) assert.ok(Math.abs(log.invert(log.map(x))-x)<1e-7);
assert.equal(c.logTransform(2025,2025), -0); assert.ok(log.map(-1000)<log.map(1000));
const zoom=c.zoomDomain([0,100],250,.5,500,c.linearScale); assert.deepEqual(zoom,[25,75]);
const logMaker=(a,b,x,y)=>c.logScale(a,b,x,y,2025), before=logMaker(-2000,2025,0,500), anchor=before.invert(375);
const logZoom=c.zoomDomain([-2000,2025],375,.7,500,logMaker), after=logMaker(logZoom[0],logZoom[1],0,500);
assert.ok(Math.abs(after.map(anchor)-375)<1e-7, "log zoom stays under pointer");

console.log("timeline core tests passed");
