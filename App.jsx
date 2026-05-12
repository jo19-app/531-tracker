import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";

// ── 5/3/1 Program Logic ──────────────────────────────────────────────────────

const DEFAULT_LIFTS = ["Squat", "Bench Press", "Deadlift", "Overhead Press"];

const PRESET_ACCESSORIES = [
  "Dumbbell Row", "Lat Pulldown", "Pull-ups", "Chin-ups",
  "Leg Press", "Romanian Deadlift", "Incline Bench", "Dips",
  "Barbell Curl", "Tricep Pushdown", "Face Pulls", "Cable Row",
  "Leg Curl", "Leg Extension", "Calf Raise", "Lateral Raise"
];

const WEEKS = [
  { label: "Week 1", sets: [{ pct: 0.65, reps: 5 }, { pct: 0.75, reps: 5 }, { pct: 0.85, reps: "5+" }] },
  { label: "Week 2", sets: [{ pct: 0.70, reps: 3 }, { pct: 0.80, reps: 3 }, { pct: 0.90, reps: "3+" }] },
  { label: "Week 3", sets: [{ pct: 0.75, reps: 5 }, { pct: 0.85, reps: 3 }, { pct: 0.95, reps: "1+" }] },
  { label: "Deload", sets: [{ pct: 0.40, reps: 5 }, { pct: 0.50, reps: 5 }, { pct: 0.60, reps: 5 }] },
];

function round5(n) { return Math.round(n / 2.5) * 2.5; }
function calcSets(trainingMax, weekIdx) {
  return WEEKS[weekIdx].sets.map(s => ({
    pct: s.pct, weight: round5(trainingMax * s.pct),
    reps: s.reps, isAmrap: typeof s.reps === "string",
  }));
}

const seedHistory = [
  { id: "h1", date: "2026-04-14", lift: "Squat", weekIdx: 0, cycle: 1, sets: [{ weight: 90, reps: 5, isAmrap: false }, { weight: 105, reps: 5, isAmrap: false }, { weight: 117.5, reps: 8, isAmrap: true }], accessories: [], duration: 2820 },
  { id: "h2", date: "2026-04-17", lift: "Bench Press", weekIdx: 0, cycle: 1, sets: [{ weight: 67.5, reps: 5, isAmrap: false }, { weight: 77.5, reps: 5, isAmrap: false }, { weight: 87.5, reps: 7, isAmrap: true }], accessories: [], duration: 2400 },
  { id: "h3", date: "2026-04-21", lift: "Squat", weekIdx: 1, cycle: 1, sets: [{ weight: 95, reps: 3, isAmrap: false }, { weight: 110, reps: 3, isAmrap: false }, { weight: 122.5, reps: 5, isAmrap: true }], accessories: [], duration: 3000 },
  { id: "h4", date: "2026-04-28", lift: "Squat", weekIdx: 2, cycle: 1, sets: [{ weight: 102.5, reps: 5, isAmrap: false }, { weight: 115, reps: 3, isAmrap: false }, { weight: 130, reps: 3, isAmrap: true }], accessories: [], duration: 3300 },
  { id: "h5", date: "2026-05-05", lift: "Squat", weekIdx: 0, cycle: 2, sets: [{ weight: 92.5, reps: 5, isAmrap: false }, { weight: 107.5, reps: 5, isAmrap: false }, { weight: 120, reps: 9, isAmrap: true }], accessories: [], duration: 2700 },
  { id: "h6", date: "2026-05-08", lift: "Bench Press", weekIdx: 1, cycle: 2, sets: [{ weight: 73.5, reps: 3, isAmrap: false }, { weight: 84, reps: 3, isAmrap: false }, { weight: 94.5, reps: 6, isAmrap: true }], accessories: [{ name: "Dips", sets: [{ reps: 10, weight: 0 }, { reps: 10, weight: 0 }] }], duration: 2640 },
];

const defaultLiftsData = {
  "Squat": { trainingMax: 140 }, "Bench Press": { trainingMax: 105 },
  "Deadlift": { trainingMax: 170 }, "Overhead Press": { trainingMax: 72.5 },
};

function fmt(sec) { const m = Math.floor(sec / 60), s = sec % 60; return `${m}:${String(s).padStart(2, "0")}`; }
function fmtDate(d) { return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
function weekLabel(idx) { return WEEKS[idx]?.label ?? ""; }

// ── Line Chart ────────────────────────────────────────────────────────────────

function LineChart({ points, color = "#f0c040", height = 90 }) {
  if (points.length < 2) return (
    <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "#444", fontSize: 12 }}>
      Not enough data yet
    </div>
  );
  const W = 300, H = height;
  const ys = points.map(p => p.y);
  const minY = Math.min(...ys), maxY = Math.max(...ys), rangeY = maxY - minY || 1;
  const toX = i => (i / (points.length - 1)) * (W - 24) + 12;
  const toY = v => H - 14 - ((v - minY) / rangeY) * (H - 28);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${toX(i)},${toY(p.y)}`).join(" ");
  const area = `${path} L${toX(points.length - 1)},${H} L${toX(0)},${H} Z`;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#cg)" />
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => <circle key={i} cx={toX(i)} cy={toY(p.y)} r="3.5" fill={color} />)}
      <text x={toX(0)} y={H} fill="#666" fontSize="9" textAnchor="middle">{points[0].label}</text>
      <text x={toX(points.length - 1)} y={H} fill="#666" fontSize="9" textAnchor="middle">{points[points.length - 1].label}</text>
    </svg>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState("home");
  const [liftNames, setLiftNames] = useState([...DEFAULT_LIFTS]);
  const [lifts, setLifts] = useState(defaultLiftsData);
  const [currentWeek, setCurrentWeek] = useState(0);
  const [currentCycle, setCurrentCycle] = useState(2);
  const [history, setHistory] = useState(seedHistory);
  const [customExercises, setCustomExercises] = useState([]);

  // Session
  const [sessionLift, setSessionLift] = useState(null);
  const [sessionSets, setSessionSets] = useState([]);
  const [accessories, setAccessories] = useState([]);
  const [sessionStart, setSessionStart] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);

  // UI state
  const [progressLift, setProgressLift] = useState("Squat");
  const [editingLift, setEditingLift] = useState(null);
  const [tmInput, setTmInput] = useState("");
  const [newExInput, setNewExInput] = useState("");
  const [showAddLift, setShowAddLift] = useState(false);
  const [newLiftName, setNewLiftName] = useState("");
  const [newLiftTM, setNewLiftTM] = useState("");
  const [addingAccessory, setAddingAccessory] = useState(false);
  const [accName, setAccName] = useState("");
  const [accSets, setAccSets] = useState([{ reps: 10, weight: 40 }]);
  const [exportMsg, setExportMsg] = useState("");

  useEffect(() => {
    if (sessionStart) {
      timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - sessionStart) / 1000)), 1000);
    } else { clearInterval(timerRef.current); setElapsed(0); }
    return () => clearInterval(timerRef.current);
  }, [sessionStart]);

  // ── Session logic ─────────────────────────────────────────────────────────

  function startSession(lift) {
    const sets = calcSets(lifts[lift].trainingMax, currentWeek).map(s => ({ ...s, actualReps: "", done: false }));
    setSessionLift(lift); setSessionSets(sets); setAccessories([]);
    setSessionStart(Date.now()); setScreen("session");
  }

  function markSet(idx) { setSessionSets(prev => prev.map((s, i) => i === idx ? { ...s, done: !s.done } : s)); }
  function updateActualReps(idx, val) { setSessionSets(prev => prev.map((s, i) => i === idx ? { ...s, actualReps: val } : s)); }

  function finishSession() {
    const duration = Math.floor((Date.now() - sessionStart) / 1000);
    const entry = {
      id: "h" + Date.now(), date: new Date().toISOString().split("T")[0],
      lift: sessionLift, weekIdx: currentWeek, cycle: currentCycle,
      sets: sessionSets.map(s => ({
        weight: s.weight,
        reps: s.isAmrap ? (parseInt(s.actualReps) || 0) : (typeof s.reps === "number" ? s.reps : parseInt(s.reps)),
        isAmrap: s.isAmrap,
      })),
      accessories, duration,
    };
    setHistory(prev => [entry, ...prev]);
    setSessionStart(null);
    const nextWeek = (currentWeek + 1) % 4;
    if (nextWeek === 0) setCurrentCycle(c => c + 1);
    setCurrentWeek(nextWeek);
    setScreen("home");
  }

  function addAccessory() {
    if (!accName) return;
    setAccessories(prev => [...prev, { name: accName, sets: accSets }]);
    setAccName(""); setAccSets([{ reps: 10, weight: 40 }]); setAddingAccessory(false);
  }

  function updateAccSet(i, field, val) {
    setAccSets(prev => prev.map((s, j) => j !== i ? s : { ...s, [field]: Number(val) }));
  }

  // ── Lift management ───────────────────────────────────────────────────────

  function addMainLift() {
    const name = newLiftName.trim();
    const tm = parseFloat(newLiftTM);
    if (!name || !tm) return;
    setLiftNames(prev => [...prev, name]);
    setLifts(prev => ({ ...prev, [name]: { trainingMax: tm } }));
    setNewLiftName(""); setNewLiftTM(""); setShowAddLift(false);
  }

  function removeMainLift(lift) {
    setLiftNames(prev => prev.filter(l => l !== lift));
    setLifts(prev => { const n = { ...prev }; delete n[lift]; return n; });
  }

  // ── Progress helpers ──────────────────────────────────────────────────────

  function getProgressPoints(lift) {
    return [...history]
      .filter(h => h.lift === lift)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(h => { const amrap = h.sets.find(s => s.isAmrap); return amrap ? { y: amrap.weight, label: h.date.slice(5) } : null; })
      .filter(Boolean);
  }

  function getPR(lift) {
    const pts = getProgressPoints(lift);
    return pts.length ? Math.max(...pts.map(p => p.y)) : null;
  }

  // ── Export ────────────────────────────────────────────────────────────────

  function buildExportData() {
    const sessions = [...history].sort((a, b) => a.date.localeCompare(b.date)).map(h => {
      const amrap = h.sets.find(s => s.isAmrap);
      return {
        Date: fmtDate(h.date),
        Lift: h.lift,
        Week: weekLabel(h.weekIdx),
        Cycle: h.cycle,
        "Set 1 (kg)": h.sets[0]?.weight ?? "",
        "Set 1 Reps": h.sets[0]?.reps ?? "",
        "Set 2 (kg)": h.sets[1]?.weight ?? "",
        "Set 2 Reps": h.sets[1]?.reps ?? "",
        "AMRAP (kg)": amrap?.weight ?? "",
        "AMRAP Reps": amrap?.reps ?? "",
        "Accessories": h.accessories.map(a => `${a.name}: ${a.sets.map(s => `${s.reps}×${s.weight}kg`).join(", ")}`).join(" | "),
        "Duration": h.duration ? fmt(h.duration) : "",
      };
    });

    const tms = liftNames.map(l => ({
      Lift: l,
      "Training Max (kg)": lifts[l]?.trainingMax ?? "",
      "PR — Best AMRAP Weight (kg)": getPR(l) ?? "No data",
    }));

    const progressSheets = {};
    liftNames.forEach(lift => {
      progressSheets[lift.slice(0, 28)] = [...history]
        .filter(h => h.lift === lift)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(h => {
          const amrap = h.sets.find(s => s.isAmrap);
          return {
            Date: fmtDate(h.date), Week: weekLabel(h.weekIdx), Cycle: h.cycle,
            "AMRAP Weight (kg)": amrap?.weight ?? "",
            "AMRAP Reps": amrap?.reps ?? "",
          };
        });
    });

    return { sessions, tms, progressSheets };
  }

  function exportExcel() {
    try {
      const { sessions, tms, progressSheets } = buildExportData();
      const wb = XLSX.utils.book_new();
      const ws1 = XLSX.utils.json_to_sheet(sessions);
      ws1["!cols"] = [{ wch: 14 }, { wch: 18 }, { wch: 10 }, { wch: 7 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 40 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, ws1, "Sessions");
      const ws2 = XLSX.utils.json_to_sheet(tms);
      ws2["!cols"] = [{ wch: 20 }, { wch: 20 }, { wch: 28 }];
      XLSX.utils.book_append_sheet(wb, ws2, "Training Maxes & PRs");
      Object.entries(progressSheets).forEach(([name, rows]) => {
        if (!rows.length) return;
        const ws = XLSX.utils.json_to_sheet(rows);
        ws["!cols"] = [{ wch: 14 }, { wch: 10 }, { wch: 7 }, { wch: 18 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, ws, name);
      });
      XLSX.writeFile(wb, "531-tracker-export.xlsx");
      setExportMsg("Excel file downloaded!");
      setTimeout(() => setExportMsg(""), 3000);
    } catch (e) {
      setExportMsg("Export failed: " + e.message);
    }
  }

  function exportPDF() {
    const { sessions, tms } = buildExportData();
    const now = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

    const liftPRRows = tms.map(t =>
      `<tr><td>${t.Lift}</td><td>${t["Training Max (kg)"]} kg</td><td class="gold">${t["PR — Best AMRAP Weight (kg)"]}${typeof t["PR — Best AMRAP Weight (kg)"] === "number" ? " kg" : ""}</td></tr>`
    ).join("");

    const sessionRows = sessions.slice(-30).reverse().map(s =>
      `<tr>
        <td>${s.Date}</td><td><strong>${s.Lift}</strong></td><td>${s.Week} / C${s.Cycle}</td>
        <td>${s["Set 1 (kg)"]} kg × ${s["Set 1 Reps"]}</td>
        <td>${s["Set 2 (kg)"]} kg × ${s["Set 2 Reps"]}</td>
        <td class="gold"><strong>${s["AMRAP (kg)"]} kg × ${s["AMRAP Reps"]} ★</strong></td>
        <td>${s.Duration}</td>
      </tr>`
    ).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>5/3/1 Tracker Export</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;background:#fff;padding:32px}
  h1{font-size:28px;font-weight:800;letter-spacing:-0.5px;margin-bottom:4px}
  .sub{font-size:12px;color:#888;margin-bottom:28px}
  h2{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#444;margin:28px 0 10px;border-bottom:2px solid #f0c040;padding-bottom:6px;display:inline-block}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:6px}
  th{background:#1a1a1a;color:#f0c040;padding:8px 10px;text-align:left;font-size:10px;letter-spacing:0.1em;text-transform:uppercase}
  td{padding:7px 10px;border-bottom:1px solid #eee;vertical-align:top}
  tr:nth-child(even) td{background:#f9f9f9}
  .gold{color:#b8860b;font-weight:700}
  .footer{margin-top:32px;font-size:10px;color:#bbb;text-align:center}
  @media print{body{padding:16px}}
</style></head><body>
<h1>5/3/1 Training Log</h1>
<div class="sub">Exported ${now} · Cycle ${currentCycle} · ${weekLabel(currentWeek)}</div>
<h2>Training Maxes &amp; PRs</h2>
<table><thead><tr><th>Lift</th><th>Training Max</th><th>Best AMRAP Weight</th></tr></thead>
<tbody>${liftPRRows}</tbody></table>
<h2>Session History (last 30)</h2>
<table><thead><tr><th>Date</th><th>Lift</th><th>Week/Cycle</th><th>Set 1</th><th>Set 2</th><th>AMRAP</th><th>Duration</th></tr></thead>
<tbody>${sessionRows}</tbody></table>
<div class="footer">Generated by 5/3/1 Tracker · ${now}</div>
</body></html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      win.onload = () => win.print();
      setExportMsg("PDF ready — use Print → Save as PDF");
    } else {
      const a = document.createElement("a");
      a.href = url; a.download = "531-tracker.html"; a.click();
      setExportMsg("Downloaded HTML — open and print to PDF");
    }
    setTimeout(() => setExportMsg(""), 5000);
  }

  // ── Colors & Styles ───────────────────────────────────────────────────────

  const C = {
    bg: "#111014", surface: "#19181f", border: "#2a2830",
    accent: "#f0c040", accentDim: "#8a6d1a",
    text: "#e8e2d4", muted: "#6b6578", danger: "#e05555", green: "#4caf7a",
  };

  const s = {
    app: { background: C.bg, minHeight: "100vh", maxWidth: 430, margin: "0 auto", fontFamily: "'Barlow Condensed', 'Impact', sans-serif", color: C.text, paddingBottom: 72 },
    topBar: { padding: "20px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
    appTitle: { fontSize: 11, letterSpacing: "0.3em", color: C.muted, textTransform: "uppercase" },
    cycleTag: { fontSize: 10, letterSpacing: "0.2em", color: C.accent, background: "#2a2210", border: `1px solid ${C.accentDim}`, borderRadius: 4, padding: "3px 8px" },
    weekBadge: (active) => ({ flex: 1, padding: "8px 4px", textAlign: "center", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", background: active ? C.accent : "none", color: active ? C.bg : C.muted, border: "none", fontFamily: "inherit", fontWeight: 700, borderBottom: active ? "none" : `2px solid ${C.border}`, transition: "all 0.15s" }),
    liftCard: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 18px 14px", marginBottom: 12, cursor: "pointer" },
    setPill: (isAmrap) => ({ flex: 1, background: isAmrap ? "#2a2210" : "#1e1c26", border: `1px solid ${isAmrap ? C.accentDim : C.border}`, borderRadius: 8, padding: "8px 4px", textAlign: "center" }),
    btn: { background: C.accent, color: C.bg, border: "none", borderRadius: 10, padding: "14px 20px", fontFamily: "inherit", fontSize: 16, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", width: "100%" },
    btnOutline: { background: "none", color: C.accent, border: `1px solid ${C.accentDim}`, borderRadius: 10, padding: "11px 20px", fontFamily: "inherit", fontSize: 14, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" },
    btnGhost: { background: "none", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 14px", fontFamily: "inherit", fontSize: 13, cursor: "pointer" },
    btnDanger: { background: "none", color: C.danger, border: `1px solid #4a2020`, borderRadius: 8, padding: "8px 12px", fontFamily: "inherit", fontSize: 13, cursor: "pointer" },
    input: { background: "#0e0d13", border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontFamily: "inherit", fontSize: 16, padding: "10px 12px", outline: "none", width: "100%", boxSizing: "border-box" },
    inputSm: { background: "#0e0d13", border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontFamily: "inherit", fontSize: 16, padding: "8px 10px", outline: "none", width: 72, textAlign: "center" },
    label: { fontSize: 10, letterSpacing: "0.2em", color: C.muted, textTransform: "uppercase", marginBottom: 6, display: "block" },
    section: { padding: "20px 20px 0" },
    sectionTitle: { fontSize: 10, letterSpacing: "0.25em", color: C.muted, textTransform: "uppercase", marginBottom: 14 },
    divider: { height: 1, background: C.border, margin: "18px 0" },
    histCard: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 10 },
    sessionHeader: { background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" },
    timerBadge: { background: "#1e1c26", border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 14px", fontSize: 22, fontWeight: 700, color: C.accent },
    setRow: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 10, display: "flex", alignItems: "center", gap: 12 },
    setRowDone: { background: "#161a18", border: `1px solid #2a3830`, borderRadius: 12, padding: "14px 16px", marginBottom: 10, display: "flex", alignItems: "center", gap: 12, opacity: 0.6 },
    checkBtn: (done) => ({ width: 32, height: 32, borderRadius: "50%", border: `2px solid ${done ? C.green : C.border}`, background: done ? C.green : "none", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: C.bg, fontSize: 16 }),
    bottomNav: { position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: "#19181fee", backdropFilter: "blur(12px)", borderTop: `1px solid ${C.border}`, display: "flex", zIndex: 100 },
    navItem: (active) => ({ flex: 1, padding: "12px 4px 10px", textAlign: "center", cursor: "pointer", background: "none", border: "none", fontFamily: "inherit", color: active ? C.accent : C.muted, fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }),
    modal: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" },
    modalBox: { background: "#1e1d26", border: `1px solid ${C.border}`, borderRadius: "20px 20px 0 0", padding: "24px 20px 36px", width: "100%", maxWidth: 430 },
  };

  const Icon = ({ name, size = 20 }) => {
    const icons = {
      home: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>,
      chart: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg>,
      history: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>,
      settings: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
    };
    return icons[name] || null;
  };

  // ── SCREENS ───────────────────────────────────────────────────────────────

  const HomeScreen = () => (
    <>
      <div style={s.topBar}>
        <div>
          <div style={s.appTitle}>531 Tracker</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
            {WEEKS[currentWeek].label}
            <span style={{ fontSize: 13, color: C.muted, fontWeight: 400, marginLeft: 10 }}>Cycle {currentCycle}</span>
          </div>
        </div>
        <div style={s.cycleTag}>C{currentCycle} · W{currentWeek + 1}</div>
      </div>

      <div style={{ display: "flex", margin: "16px 20px 0", background: C.surface, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.border}` }}>
        {WEEKS.map((w, i) => <button key={i} style={s.weekBadge(i === currentWeek)} onClick={() => setCurrentWeek(i)}>{w.label.replace("Week ", "W")}</button>)}
      </div>

      <div style={s.section}>
        <div style={{ ...s.sectionTitle, marginTop: 20 }}>Choose Your Lift</div>
        {liftNames.map(lift => {
          const sets = calcSets(lifts[lift]?.trainingMax ?? 100, currentWeek);
          const isCustom = !DEFAULT_LIFTS.includes(lift);
          return (
            <div key={lift} style={{ ...s.liftCard, borderColor: isCustom ? C.accentDim : C.border }} onClick={() => startSession(lift)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>
                    {lift}
                    {isCustom && <span style={{ fontSize: 9, color: C.accent, background: "#2a2210", border: `1px solid ${C.accentDim}`, borderRadius: 4, padding: "2px 6px", marginLeft: 8, letterSpacing: "0.12em", verticalAlign: "middle" }}>CUSTOM</span>}
                  </div>
                  <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>TM: {lifts[lift]?.trainingMax} kg</div>
                </div>
                <div style={{ fontSize: 11, color: C.accent, letterSpacing: "0.1em", paddingTop: 4 }}>START ›</div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                {sets.map((set, i) => (
                  <div key={i} style={s.setPill(set.isAmrap)}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: set.isAmrap ? C.accent : C.text }}>{set.weight}</div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{set.reps} reps</div>
                    <div style={{ fontSize: 9, color: C.muted, marginTop: 1 }}>{Math.round(set.pct * 100)}%</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );

  const SessionScreen = () => {
    const allMainDone = sessionSets.every(s => s.done);
    return (
      <>
        <div style={s.sessionHeader}>
          <div>
            <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.2em", textTransform: "uppercase" }}>{WEEKS[currentWeek].label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>{sessionLift}</div>
          </div>
          <div style={s.timerBadge}>{fmt(elapsed)}</div>
        </div>

        <div style={s.section}>
          <div style={s.sectionTitle}>Working Sets</div>
          {sessionSets.map((set, i) => (
            <div key={i} style={set.done ? s.setRowDone : s.setRow}>
              <button style={s.checkBtn(set.done)} onClick={() => markSet(i)}>{set.done && "✓"}</button>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 26, fontWeight: 700, color: set.isAmrap ? C.accent : C.text }}>{set.weight}</span>
                  <span style={{ fontSize: 13, color: C.muted }}>kg</span>
                  <span style={{ fontSize: 13, color: C.muted, marginLeft: 4 }}>{Math.round(set.pct * 100)}%</span>
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{set.isAmrap ? "AMRAP — go all out!" : `${set.reps} reps`}</div>
              </div>
              {set.isAmrap && (
                <div style={{ textAlign: "center" }}>
                  <div style={{ ...s.label, marginBottom: 4 }}>Reps done</div>
                  <input type="number" min={0} style={{ ...s.inputSm, width: 60 }} value={set.actualReps}
                    onChange={e => updateActualReps(i, e.target.value)} placeholder="0" />
                </div>
              )}
            </div>
          ))}

          <div style={s.divider} />
          <div style={s.sectionTitle}>Accessories</div>

          {accessories.map((acc, i) => (
            <div key={i} style={s.histCard}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{acc.name}</div>
              {acc.sets.map((set, j) => (
                <div key={j} style={{ fontSize: 13, color: C.muted, marginBottom: 3 }}>
                  Set {j + 1}: <span style={{ color: C.text }}>{set.reps} reps</span> @ <span style={{ color: C.accent }}>{set.weight} kg</span>
                </div>
              ))}
            </div>
          ))}

          {addingAccessory ? (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
              <label style={s.label}>Exercise</label>
              <select style={{ ...s.input, marginBottom: 12 }} value={accName} onChange={e => setAccName(e.target.value)}>
                <option value="">Select exercise…</option>
                {[...PRESET_ACCESSORIES, ...customExercises].map(ex => <option key={ex}>{ex}</option>)}
              </select>
              <label style={s.label}>Sets</label>
              {accSets.map((set, i) => (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: C.muted, width: 20 }}>{i + 1}</span>
                  <div><div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>Reps</div>
                    <input type="number" style={s.inputSm} value={set.reps} min={1} onChange={e => updateAccSet(i, "reps", e.target.value)} /></div>
                  <div><div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>kg</div>
                    <input type="number" style={s.inputSm} value={set.weight} min={0} step={2.5} onChange={e => updateAccSet(i, "weight", e.target.value)} /></div>
                </div>
              ))}
              <button style={{ ...s.btnGhost, fontSize: 12, marginBottom: 12 }} onClick={() => setAccSets(prev => [...prev, { reps: 10, weight: 40 }])}>+ Add Set</button>
              <div style={{ display: "flex", gap: 10 }}>
                <button style={{ ...s.btnOutline, flex: 1 }} onClick={() => { setAddingAccessory(false); setAccName(""); setAccSets([{ reps: 10, weight: 40 }]); }}>Cancel</button>
                <button style={{ ...s.btn, flex: 1 }} onClick={addAccessory}>Add</button>
              </div>
            </div>
          ) : (
            <button style={{ ...s.btnOutline, width: "100%", marginBottom: 16 }} onClick={() => setAddingAccessory(true)}>+ Add Accessory</button>
          )}

          <button style={{ ...s.btn, background: allMainDone ? C.accent : C.accentDim }} onClick={finishSession}>Finish Session</button>
          <button style={{ ...s.btnGhost, width: "100%", marginTop: 10, textAlign: "center" }} onClick={() => { setSessionStart(null); setScreen("home"); }}>Discard</button>
        </div>
      </>
    );
  };

  const HistoryScreen = () => (
    <div style={s.section}>
      <div style={{ ...s.sectionTitle, marginTop: 8 }}>Session History</div>
      {history.length === 0 && <div style={{ color: C.muted, fontSize: 14 }}>No sessions yet.</div>}
      {[...history].sort((a, b) => b.date.localeCompare(a.date)).map(h => (
        <div key={h.id} style={s.histCard}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{h.lift}</div>
              <div style={{ fontSize: 12, color: C.muted }}>{fmtDate(h.date)} · {weekLabel(h.weekIdx)} · C{h.cycle}</div>
            </div>
            <div style={{ fontSize: 12, color: C.muted }}>{h.duration ? fmt(h.duration) : "—"}</div>
          </div>
          {h.sets.map((set, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4, fontSize: 14 }}>
              <span style={{ color: C.muted, width: 50 }}>Set {i + 1}</span>
              <span style={{ fontWeight: 600 }}>{set.weight} kg</span>
              <span style={{ color: set.isAmrap ? C.accent : C.muted }}>{set.reps} reps {set.isAmrap ? "★" : ""}</span>
            </div>
          ))}
          {h.accessories.length > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.15em", marginBottom: 4 }}>ACCESSORIES</div>
              {h.accessories.map((acc, i) => (
                <div key={i} style={{ fontSize: 13, color: C.muted, marginBottom: 2 }}>
                  {acc.name}: {acc.sets.map(s => `${s.reps}×${s.weight}kg`).join(", ")}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const ProgressScreen = () => {
    const pts = getProgressPoints(progressLift);
    const pr = getPR(progressLift);
    const liftHistory = history.filter(h => h.lift === progressLift);
    return (
      <div style={s.section}>
        <div style={{ ...s.sectionTitle, marginTop: 8 }}>Progress</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {liftNames.map(l => (
            <button key={l} style={{ background: l === progressLift ? C.accent : C.surface, color: l === progressLift ? C.bg : C.muted, border: `1px solid ${l === progressLift ? C.accent : C.border}`, borderRadius: 8, padding: "7px 14px", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              onClick={() => setProgressLift(l)}>{l}</button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.2em", marginBottom: 6 }}>TRAINING MAX</div>
            <div style={{ fontSize: 32, fontWeight: 700 }}>{lifts[progressLift]?.trainingMax ?? "—"}</div>
            <div style={{ fontSize: 12, color: C.muted }}>kg</div>
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.2em", marginBottom: 6 }}>BEST AMRAP WT</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: C.accent }}>{pr ?? "—"}</div>
            <div style={{ fontSize: 12, color: C.muted }}>{pr ? "kg" : "no data"}</div>
          </div>
        </div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.2em", marginBottom: 12 }}>AMRAP WEIGHT OVER TIME</div>
          <LineChart points={pts} color={C.accent} height={90} />
        </div>
        <div style={s.sectionTitle}>Session Log — {progressLift}</div>
        {liftHistory.length === 0 && <div style={{ color: C.muted, fontSize: 14 }}>No sessions yet.</div>}
        {[...liftHistory].sort((a, b) => b.date.localeCompare(a.date)).map(h => {
          const amrap = h.sets.find(s => s.isAmrap);
          return (
            <div key={h.id} style={{ ...s.histCard, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{weekLabel(h.weekIdx)} · C{h.cycle}</div>
                <div style={{ fontSize: 12, color: C.muted }}>{fmtDate(h.date)}</div>
              </div>
              {amrap && <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.accent }}>{amrap.weight} kg</div>
                <div style={{ fontSize: 12, color: C.muted }}>{amrap.reps} reps AMRAP</div>
              </div>}
            </div>
          );
        })}
      </div>
    );
  };

  const SettingsScreen = () => (
    <div style={s.section}>
      <div style={{ ...s.sectionTitle, marginTop: 8 }}>Main Lifts & Training Maxes</div>
      {liftNames.map(lift => (
        <div key={lift} style={s.histCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                {lift}
                {!DEFAULT_LIFTS.includes(lift) && <span style={{ fontSize: 9, color: C.accent, background: "#2a2210", border: `1px solid ${C.accentDim}`, borderRadius: 4, padding: "2px 6px", marginLeft: 8, letterSpacing: "0.12em" }}>CUSTOM</span>}
              </div>
              <div style={{ fontSize: 13, color: C.muted }}>TM: {lifts[lift]?.trainingMax ?? "—"} kg</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {editingLift === lift ? (
                <>
                  <input type="number" style={{ ...s.inputSm, width: 80 }} value={tmInput} step={2.5} min={0}
                    onChange={e => setTmInput(e.target.value)} autoFocus />
                  <button style={{ ...s.btn, width: "auto", padding: "8px 14px", fontSize: 13 }}
                    onClick={() => { if (tmInput) setLifts(prev => ({ ...prev, [lift]: { trainingMax: parseFloat(tmInput) } })); setEditingLift(null); }}>Save</button>
                </>
              ) : (
                <>
                  <button style={s.btnGhost} onClick={() => { setEditingLift(lift); setTmInput(lifts[lift]?.trainingMax ?? ""); }}>Edit</button>
                  {!DEFAULT_LIFTS.includes(lift) && <button style={s.btnDanger} onClick={() => removeMainLift(lift)}>✕</button>}
                </>
              )}
            </div>
          </div>
        </div>
      ))}
      <button style={{ ...s.btnOutline, width: "100%", marginTop: 4 }} onClick={() => setShowAddLift(true)}>+ Add Main Lift</button>

      <div style={s.divider} />
      <div style={s.sectionTitle}>Cycle & Week</div>
      <div style={{ ...s.histCard, marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 16 }}>Current Week</div>
          <div style={{ display: "flex", gap: 6 }}>
            {WEEKS.map((w, i) => <button key={i} style={{ background: i === currentWeek ? C.accent : C.surface, color: i === currentWeek ? C.bg : C.muted, border: `1px solid ${i === currentWeek ? C.accent : C.border}`, borderRadius: 6, padding: "6px 8px", fontFamily: "inherit", fontSize: 11, cursor: "pointer" }} onClick={() => setCurrentWeek(i)}>{w.label.replace("Week ", "W")}</button>)}
          </div>
        </div>
      </div>
      <div style={{ ...s.histCard, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 16 }}>Cycle</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button style={s.btnGhost} onClick={() => setCurrentCycle(c => Math.max(1, c - 1))}>−</button>
          <span style={{ fontSize: 22, fontWeight: 700 }}>{currentCycle}</span>
          <button style={s.btnGhost} onClick={() => setCurrentCycle(c => c + 1)}>+</button>
        </div>
      </div>

      <div style={s.divider} />
      <div style={s.sectionTitle}>Custom Accessory Exercises</div>
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <input style={{ ...s.input, flex: 1 }} placeholder="Exercise name…" value={newExInput} onChange={e => setNewExInput(e.target.value)} />
        <button style={{ ...s.btn, width: "auto", padding: "10px 16px" }} onClick={() => { if (newExInput.trim()) { setCustomExercises(prev => [...prev, newExInput.trim()]); setNewExInput(""); } }}>Add</button>
      </div>
      {customExercises.map((ex, i) => (
        <div key={i} style={{ ...s.histCard, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 15 }}>{ex}</span>
          <button style={s.btnGhost} onClick={() => setCustomExercises(prev => prev.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}

      <div style={s.divider} />
      <div style={s.sectionTitle}>Export Data</div>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 24 }}>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 1.6 }}>
          Includes all sessions, training maxes, PRs, and per-lift progress. Excel has separate tabs per lift.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={{ ...s.btn, flex: 1, background: "#162516", color: "#4caf7a", border: "1px solid #2a4a2a" }} onClick={exportExcel}>📊 Excel</button>
          <button style={{ ...s.btn, flex: 1, background: "#251616", color: "#e07070", border: "1px solid #4a2a2a" }} onClick={exportPDF}>📄 PDF</button>
        </div>
        {exportMsg && <div style={{ marginTop: 12, fontSize: 13, color: C.accent, textAlign: "center", lineHeight: 1.5 }}>✓ {exportMsg}</div>}
      </div>
    </div>
  );

  const AddLiftModal = () => (
    <div style={s.modal} onClick={e => { if (e.target === e.currentTarget) setShowAddLift(false); }}>
      <div style={s.modalBox}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Add Main Lift</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 20, lineHeight: 1.6 }}>
          Uses the same 5/3/1 percentages. Training Max = ~90% of your 1RM.
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={s.label}>Lift Name</label>
          <input style={s.input} placeholder="e.g. Close-Grip Bench, Pause Squat…"
            value={newLiftName} onChange={e => setNewLiftName(e.target.value)} autoFocus />
        </div>
        <div style={{ marginBottom: 22 }}>
          <label style={s.label}>Training Max (kg)</label>
          <input type="number" style={s.input} placeholder="e.g. 100"
            value={newLiftTM} onChange={e => setNewLiftTM(e.target.value)} min={0} step={2.5} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={{ ...s.btnOutline, flex: 1 }} onClick={() => { setShowAddLift(false); setNewLiftName(""); setNewLiftTM(""); }}>Cancel</button>
          <button style={{ ...s.btn, flex: 1, opacity: (!newLiftName.trim() || !newLiftTM) ? 0.4 : 1 }}
            disabled={!newLiftName.trim() || !newLiftTM} onClick={addMainLift}>Add Lift</button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={s.app}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800&display=swap" rel="stylesheet" />
      {screen === "home" && <HomeScreen />}
      {screen === "session" && <SessionScreen />}
      {screen === "history" && <HistoryScreen />}
      {screen === "progress" && <ProgressScreen />}
      {screen === "settings" && <SettingsScreen />}
      {showAddLift && <AddLiftModal />}
      {screen !== "session" && (
        <nav style={s.bottomNav}>
          {[{ id: "home", label: "Home", icon: "home" }, { id: "progress", label: "Progress", icon: "chart" }, { id: "history", label: "History", icon: "history" }, { id: "settings", label: "Settings", icon: "settings" }].map(item => (
            <button key={item.id} style={s.navItem(screen === item.id)} onClick={() => setScreen(item.id)}>
              <Icon name={item.icon} size={18} />
              {item.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
