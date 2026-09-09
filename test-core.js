const assert = require("node:assert/strict");
require("./view.js");
const c = globalThis.TimelineCore;
const day = s => Date.parse(s + "T00:00:00Z");
assert.equal(c.timelineColor({"timeline-color":" #5b8cff "}), "#5b8cff");
assert.equal(c.timelineColor({}), null);

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
for (const text of ["-2.58e6 – -11.7e3 Pleistocene", "-115e3..-11.7e3 Glacial", "1066 Battle"])
  assert.ok(c.parseWikiText(text), text);
for (const text of ["1945 – Ongoing era", "1945.. Ongoing era", "1945 - Ongoing era"]) {
  const ongoing=c.parseWikiText(text);
  assert.equal(ongoing.ongoing,true,text); assert.equal(ongoing.point,false,text);
  assert.equal(c.calendarYearFromOrdinal(ongoing.end),new Date().getUTCFullYear(),text);
}
assert.equal(c.parseWikiText("0 Impossible").error.includes("zero"), true);
assert.equal(c.ordinalFromCalendarYear(-1), -1); assert.equal(c.ordinalFromCalendarYear(1), 0);
assert.equal(c.calendarYearFromOrdinal(0), 1);
assert.equal(c.formatYearOrdinal(c.ordinalFromCalendarYear(2026)), "2026 CE");
assert.equal(c.formatYearOrdinal(c.ordinalFromCalendarYear(-1150)), "1150 BCE");
assert.equal(c.parseWikiText("12 – 10 inverted").warning, "Inverted interval");
assert.equal(c.parseWikiText("ordinary prose"), null);

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
