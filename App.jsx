import { useState, useEffect, useRef, useCallback } from "react";
import * as XLSX from "xlsx";

// ── Constants ─────────────────────────────────────────────────────────────────

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

const DEFAULT_LIFTS_DATA = {
  "Squat": { trainingMax: 140 }, "Bench Press": { trainingMax: 105 },
  "Deadlift": { trainingMax: 170 }, "Overhead Press": { trainingMax: 72.5 },
};

const SEED_HISTORY = [
  { id: "h1", date: "2026-04-14", lift: "Squat", weekIdx: 0, cycle: 1, sets: [{ weight: 90, reps: 5, isAmrap: false }, { weight: 105, reps: 5, isAmrap: false }, { weight: 117.5, reps: 8, isAmrap: true }], accessories: [], duration: 2820 },
  { id: "h2", date: "2026-04-17", lift: "Bench Press", weekIdx: 0, cycle: 1, sets: [{ weight: 67.5, reps: 5, isAmrap: false }, { weight: 77.5, reps: 5, isAmrap: false }, { weight: 87.5, reps: 7, isAmrap: true }], accessories: [], duration: 2400 },
  { id: "h3", date: "2026-04-21", lift: "Squat", weekIdx: 1, cycle: 1, sets: [{ weight: 95, reps: 3, isAmrap: false }, { weight: 110, reps: 3, isAmrap: false }, { weight: 122.5, reps: 5, isAmrap: true }], accessories: [], duration: 3000 },
  { id: "h4", date: "2026-04-28", lift: "Squat", weekIdx: 2, cycle: 1, sets: [{ weight: 102.5, reps: 5, isAmrap: false }, { weight: 115, reps: 3, isAmrap: false }, { weight: 130, reps: 3, isAmrap: true }], accessories: [], duration: 3300 },
  { id: "h5", date: "2026-05-05", lift: "Squat", weekIdx: 0, cycle: 2, sets: [{ weight: 92.5, reps: 5, isAmrap: false }, { weight: 107.5, reps: 5, isAmrap: false }, { weight: 120, reps: 9, isAmrap: true }], accessories: [], duration: 2700 },
  { id: "h6", date: "2026-05-08", lift: "Bench Press", weekIdx: 1, cycle: 2, sets: [{ weight: 73.5, reps: 3, isAmrap: false }, { weight: 84, reps: 3, isAmrap: false }, { weight: 94.5, reps: 6, isAmrap: true }], accessories: [{ name: "Dips", sets: [{ reps: 10, weight: 0 }, { reps: 10, weight: 0 }] }], duration: 2640 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function round5(n) { return Math.round(n / 2.5) * 2.5; }
function calcSets(trainingMax, weekIdx) {
  return WEEKS[weekIdx].sets.map(s => ({
    pct: s.pct, weight: round5(trainingMax * s.pct),
    reps: s.reps, isAmrap: typeof s.reps === "string",
  }));
}
function fmt(sec) { const m = Math.floor(sec / 60), s = sec % 60; return `${m}:${String(s).padStart(2, "0")}`; }
function fmtDate(d) { return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
function weekLabel(idx) { return WEEKS[idx]?.label ?? ""; }

// ── localStorage helpers ──────────────────────────────────────────────────────

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// ── usePersist hook — state that auto-saves to localStorage ───────────────────

function usePersist(key, fallback) {
  const [val, setVal] = useState(() => load(key, fallback));
  const set = useCallback((updater) => {
    setVal(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      save(key, next);
      return next;
    });
  }, [key]);
  return [val, set];
}

// ── Standalone input components (prevent keyboard dismissal) ──────────────────

// A stable number input that doesn't re-mount when parent re-renders
const StableNumberInput = ({ value, onChange, style, placeholder, min, step }) => {
  const ref = useRef(null);
  // Use uncontrolled approach with ref to prevent re-mount focus loss
  useEffect(() => {
    if (ref.current && ref.current !== document.activeElement) {
      ref.current.value = value ?? "";
    }
  }, [value]);
  return (
    <input
      ref={ref}
      type="number"
      defaultValue={value}
      onChange={e => onChange(e.target.value)}
      style={style}
      placeholder={placeholder}
      min={min}
      step={step}
    />
  );
};

const StableTextInput = ({ value, onChange, style, placeholder, onKeyDown }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current !== document.activeElement) {
      ref.current.value = value ?? "";
    }
  }, [value]);
  return (
    <input
      ref={ref}
      type="text"
      defaultValue={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      style={style}
      placeholder={placeholder}
    />
  );
};

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

// ── Confirm Delete Modal ───────────────────────────────────────────────────────

function ConfirmModal({ message, onConfirm, onCancel, C, s }) {
  return (
    <div style={s.modal} onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={s.modalBox}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Delete Entry?</div>
        <div style={{ fontSize: 14, color: C.muted, marginBottom: 24, lineHeight: 1.6 }}>{message}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={{ ...s.btnOutline, flex: 1 }} onClick={onCancel}>Cancel</button>
          <button style={{ ...s.btn, flex: 1, background: C.danger, color: "#fff" }} onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState("home");

  // ── Persisted state (survives reload) ─────────────────────────────────────
  const [liftNames, setLiftNames] = usePersist("531_liftNames", [...DEFAULT_LIFTS]);
  const [lifts, setLifts] = usePersist("531_lifts", DEFAULT_LIFTS_DATA);
  const [currentWeek, setCurrentWeek] = usePersist("531_currentWeek", 0);
  const [currentCycle, setCurrentCycle] = usePersist("531_currentCycle", 1);
  const [history, setHistory] = usePersist("531_history", SEED_HISTORY);
  const [customExercises, setCustomExercises] = usePersist("531_customEx", []);
  const [removedPresets, setRemovedPresets] = usePersist("531_removedPresets", []);

  // ── Session state ─────────────────────────────────────────────────────────
  const [sessionLift, setSessionLift] = useState(null);
  const [sessionSets, setSessionSets] = useState([]);
  const [accessories, setAccessories] = useState([]);
  const [sessionStart, setSessionStart] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);

  // Accessory form
  const [addingAccessory, setAddingAccessory] = useState(false);
  const [accName, setAccName] = useState("");
  const [accSets, setAccSets] = useState([{ reps: 10, weight: 40 }]);

  // UI state
  const [progressLift, setProgressLift] = useState(liftNames[0] ?? "Squat");
  const [editingLift, setEditingLift] = useState(null);
  const [tmInput, setTmInput] = useState("");
  const [newExInput, setNewExInput] = useState("");
  const [editingExIdx, setEditingExIdx] = useState(null);
  const [editingExValue, setEditingExValue] = useState("");
  const [showAddLift, setShowAddLift] = useState(false);
  const [newLiftName, setNewLiftName] = useState("");
  const [newLiftTM, setNewLiftTM] = useState("");
  const [exportMsg, setExportMsg] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importSelected, setImportSelected] = useState(new Set());
  const [importMsg, setImportMsg] = useState("");
  const importFileRef = useRef(null);

  // ── Timer ─────────────────────────────────────────────────────────────────

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
    setAddingAccessory(false); setAccName(""); setAccSets([{ reps: 10, weight: 40 }]);
    setSessionStart(Date.now()); setScreen("session");
  }

  function markSet(idx) {
    setSessionSets(prev => prev.map((s, i) => i === idx ? { ...s, done: !s.done } : s));
  }

  function updateActualReps(idx, val) {
    setSessionSets(prev => prev.map((s, i) => i === idx ? { ...s, actualReps: val } : s));
  }

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

  function saveTM(lift) {
    if (tmInput) setLifts(prev => ({ ...prev, [lift]: { trainingMax: parseFloat(tmInput) } }));
    setEditingLift(null);
  }

  // ── History management ────────────────────────────────────────────────────

  function requestDeleteHistory(h) {
    setConfirmDelete({ id: h.id, label: `${h.lift} — ${fmtDate(h.date)} (${weekLabel(h.weekIdx)}, Cycle ${h.cycle})` });
  }

  function confirmDeleteHistory() {
    setHistory(prev => prev.filter(h => h.id !== confirmDelete.id));
    setConfirmDelete(null);
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

  // Converts internal date "1 May 2026" back to "YYYY-MM-DD" for import round-trip
  function parseImportDate(str) {
    if (!str) return null;
    // Try ISO first
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    // Try "1 May 2026" or "01 May 2026"
    const months = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
    const m = str.toLowerCase().match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
    if (m) {
      const mo = months[m[2].slice(0,3)];
      if (mo) return `${m[3]}-${String(mo).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    }
    return null;
  }

  function exportExcel() {
    try {
      const wb = XLSX.utils.book_new();

      // ── Sessions sheet (importable format) ──
      const sessionRows = [...history].sort((a, b) => a.date.localeCompare(b.date)).map(h => {
        const amrap = h.sets.find(s => s.isAmrap);
        return {
          "Date (DD Mon YYYY)": fmtDate(h.date),
          "Lift": h.lift,
          "Week (1-4)": h.weekIdx + 1,
          "Cycle": h.cycle,
          "Set1_Weight_kg": h.sets[0]?.weight ?? "",
          "Set1_Reps": h.sets[0]?.reps ?? "",
          "Set2_Weight_kg": h.sets[1]?.weight ?? "",
          "Set2_Reps": h.sets[1]?.reps ?? "",
          "AMRAP_Weight_kg": amrap?.weight ?? "",
          "AMRAP_Reps": amrap?.reps ?? "",
          "Accessories": h.accessories.map(a => `${a.name}: ${a.sets.map(s => `${s.reps}×${s.weight}kg`).join(", ")}`).join(" | "),
          "Duration_seconds": h.duration ?? "",
        };
      });
      const ws1 = XLSX.utils.json_to_sheet(sessionRows);
      ws1["!cols"] = [{ wch: 16 }, { wch: 18 }, { wch: 10 }, { wch: 7 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 12 }, { wch: 40 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, ws1, "Sessions");

      // ── Custom Exercises sheet ──
      const exRows = customExercises.map(e => ({ "Custom Exercise Name": e }));
      const ws2 = XLSX.utils.json_to_sheet(exRows.length ? exRows : [{ "Custom Exercise Name": "" }]);
      ws2["!cols"] = [{ wch: 28 }];
      XLSX.utils.book_append_sheet(wb, ws2, "Custom Exercises");

      // ── Instructions sheet ──
      const instructions = [
        { "HOW TO USE THIS FILE AS IMPORT TEMPLATE": "" },
        { "HOW TO USE THIS FILE AS IMPORT TEMPLATE": "SESSIONS sheet:" },
        { "HOW TO USE THIS FILE AS IMPORT TEMPLATE": "  - Date: use format '1 May 2026' or 'YYYY-MM-DD'" },
        { "HOW TO USE THIS FILE AS IMPORT TEMPLATE": "  - Lift: must match a lift name in the app" },
        { "HOW TO USE THIS FILE AS IMPORT TEMPLATE": "  - Week: 1, 2, 3, or 4 (4 = Deload)" },
        { "HOW TO USE THIS FILE AS IMPORT TEMPLATE": "  - Cycle: any number" },
        { "HOW TO USE THIS FILE AS IMPORT TEMPLATE": "  - AMRAP_Reps: reps actually completed on the last set" },
        { "HOW TO USE THIS FILE AS IMPORT TEMPLATE": "  - Accessories: format 'Exercise: RepsxWeightkg' (optional)" },
        { "HOW TO USE THIS FILE AS IMPORT TEMPLATE": "" },
        { "HOW TO USE THIS FILE AS IMPORT TEMPLATE": "CUSTOM EXERCISES sheet:" },
        { "HOW TO USE THIS FILE AS IMPORT TEMPLATE": "  - Add one exercise name per row" },
        { "HOW TO USE THIS FILE AS IMPORT TEMPLATE": "  - These will be added to your accessory dropdown" },
      ];
      const ws3 = XLSX.utils.json_to_sheet(instructions);
      ws3["!cols"] = [{ wch: 60 }];
      XLSX.utils.book_append_sheet(wb, ws3, "Instructions");

      XLSX.writeFile(wb, "531-tracker-export.xlsx");
      setExportMsg("Excel downloaded — use same file to import!");
      setTimeout(() => setExportMsg(""), 4000);
    } catch (e) { setExportMsg("Export failed: " + e.message); }
  }

  // ── Import ────────────────────────────────────────────────────────────────

  function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array" });

        // Parse Sessions sheet
        const ws = wb.Sheets["Sessions"];
        if (!ws) { setImportMsg("No 'Sessions' sheet found."); return; }
        const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

        const parsed = rows.map((r, i) => {
          const date = parseImportDate(String(r["Date (DD Mon YYYY)"] || r["Date"] || ""));
          const lift = String(r["Lift"] || "").trim();
          const weekNum = parseInt(r["Week (1-4)"] || r["Week"] || 1);
          const weekIdx = Math.min(Math.max((weekNum || 1) - 1, 0), 3);
          const cycle = parseInt(r["Cycle"] || 1) || 1;
          const s1w = parseFloat(r["Set1_Weight_kg"]) || 0;
          const s1r = parseInt(r["Set1_Reps"]) || 0;
          const s2w = parseFloat(r["Set2_Weight_kg"]) || 0;
          const s2r = parseInt(r["Set2_Reps"]) || 0;
          const aw  = parseFloat(r["AMRAP_Weight_kg"]) || 0;
          const ar  = parseInt(r["AMRAP_Reps"]) || 0;
          const dur = parseInt(r["Duration_seconds"]) || 0;
          if (!date || !lift) return null;
          return {
            id: "imp_" + Date.now() + "_" + i,
            date, lift, weekIdx, cycle, duration: dur,
            sets: [
              { weight: s1w, reps: s1r, isAmrap: false },
              { weight: s2w, reps: s2r, isAmrap: false },
              { weight: aw,  reps: ar,  isAmrap: true  },
            ].filter(s => s.weight > 0 || s.reps > 0),
            accessories: [],
          };
        }).filter(Boolean);

        // Parse Custom Exercises sheet
        const wsEx = wb.Sheets["Custom Exercises"];
        const importedExercises = wsEx
          ? XLSX.utils.sheet_to_json(wsEx, { defval: "" })
              .map(r => String(r["Custom Exercise Name"] || "").trim())
              .filter(Boolean)
          : [];

        // Classify: new vs duplicate
        const existingKeys = new Set(history.map(h => `${h.date}__${h.lift}`));
        const newSessions = parsed.filter(s => !existingKeys.has(`${s.date}__${s.lift}`));
        const dupSessions = parsed.filter(s => existingKeys.has(`${s.date}__${s.lift}`));

        setImportPreview({ newSessions, dupSessions, importedExercises });
        setImportSelected(new Set(newSessions.map(s => s.id)));
      } catch (err) {
        setImportMsg("Could not read file: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  }

  function confirmImport() {
    const toAdd = importPreview.newSessions.filter(s => importSelected.has(s.id));
    const toOverwrite = importPreview.dupSessions.filter(s => importSelected.has(s.id));
    setHistory(prev => {
      let updated = [...prev];
      // Remove overwritten duplicates
      const overwriteKeys = new Set(toOverwrite.map(s => `${s.date}__${s.lift}`));
      updated = updated.filter(h => !overwriteKeys.has(`${h.date}__${h.lift}`));
      return [...updated, ...toAdd, ...toOverwrite];
    });
    // Merge custom exercises
    if (importPreview.importedExercises.length > 0) {
      setCustomExercises(prev => {
        const existing = new Set(prev);
        const toAddEx = importPreview.importedExercises.filter(e => !existing.has(e));
        return [...prev, ...toAddEx];
      });
    }
    const total = toAdd.length + toOverwrite.length;
    setImportMsg(`✓ Imported ${total} session${total !== 1 ? "s" : ""}${importPreview.importedExercises.length ? ` + ${importPreview.importedExercises.length} exercises` : ""}`);
    setImportPreview(null);
    setImportSelected(new Set());
    setTimeout(() => setImportMsg(""), 4000);
  }

  function exportPDF() {
    const { sessions, tms } = buildExportData();
    const now = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const liftPRRows = tms.map(t => `<tr><td>${t.Lift}</td><td>${t["Training Max (kg)"]} kg</td><td class="gold">${t["PR — Best AMRAP Weight (kg)"]}${typeof t["PR — Best AMRAP Weight (kg)"] === "number" ? " kg" : ""}</td></tr>`).join("");
    const sessionRows = sessions.slice(-30).reverse().map(s =>
      `<tr><td>${s.Date}</td><td><strong>${s.Lift}</strong></td><td>${s.Week}/C${s.Cycle}</td><td>${s["Set 1 (kg)"]}kg×${s["Set 1 Reps"]}</td><td>${s["Set 2 (kg)"]}kg×${s["Set 2 Reps"]}</td><td class="gold"><strong>${s["AMRAP (kg)"]}kg×${s["AMRAP Reps"]}★</strong></td><td>${s.Duration}</td></tr>`
    ).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>5/3/1 Export</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Helvetica Neue',sans-serif;color:#1a1a1a;padding:32px}h1{font-size:28px;font-weight:800;margin-bottom:4px}.sub{font-size:12px;color:#888;margin-bottom:28px}h2{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#444;margin:28px 0 10px;border-bottom:2px solid #f0c040;padding-bottom:6px;display:inline-block}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#1a1a1a;color:#f0c040;padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase}td{padding:7px 10px;border-bottom:1px solid #eee}.gold{color:#b8860b;font-weight:700}.footer{margin-top:32px;font-size:10px;color:#bbb;text-align:center}</style>
</head><body><h1>5/3/1 Training Log</h1><div class="sub">Exported ${now} · Cycle ${currentCycle} · ${weekLabel(currentWeek)}</div>
<h2>Training Maxes &amp; PRs</h2><table><thead><tr><th>Lift</th><th>Training Max</th><th>Best AMRAP Weight</th></tr></thead><tbody>${liftPRRows}</tbody></table>
<h2>Session History (last 30)</h2><table><thead><tr><th>Date</th><th>Lift</th><th>Week/Cycle</th><th>Set 1</th><th>Set 2</th><th>AMRAP</th><th>Duration</th></tr></thead><tbody>${sessionRows}</tbody></table>
<div class="footer">Generated by 5/3/1 Tracker · ${now}</div></body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) { win.onload = () => win.print(); setExportMsg("PDF ready — Print → Save as PDF"); }
    else { const a = document.createElement("a"); a.href = url; a.download = "531-tracker.html"; a.click(); setExportMsg("Downloaded — open and print to PDF"); }
    setTimeout(() => setExportMsg(""), 5000);
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  const C = {
    bg: "#111014", surface: "#19181f", border: "#2a2830",
    accent: "#f0c040", accentDim: "#8a6d1a",
    text: "#e8e2d4", muted: "#6b6578", danger: "#e05555", green: "#4caf7a",
  };

  const s = {
    app: { background: C.bg, minHeight: "100vh", maxWidth: 430, margin: "0 auto", fontFamily: "'Barlow Condensed', 'Impact', sans-serif", color: C.text, paddingBottom: 88, paddingTop: 12 },
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

  const allAccessoryExercises = [...PRESET_ACCESSORIES.filter(e => !removedPresets.includes(e)), ...customExercises];
  const sessionAllDone = sessionSets.every(s => s.done);

  // ── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div style={s.app}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800&display=swap" rel="stylesheet" />

      {/* ── HOME ── */}
      {screen === "home" && (
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
      )}

      {/* ── SESSION ── */}
      {screen === "session" && (
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
              <div key={`set-${i}`} style={set.done ? s.setRowDone : s.setRow}>
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
                    {/* StableNumberInput prevents keyboard dismiss on re-render */}
                    <StableNumberInput
                      value={set.actualReps}
                      onChange={val => updateActualReps(i, val)}
                      style={s.inputSm}
                      placeholder="0"
                      min={0}
                    />
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
                  {allAccessoryExercises.map(ex => <option key={ex} value={ex}>{ex}</option>)}
                </select>
                <label style={s.label}>Sets</label>
                {accSets.map((set, i) => (
                  <div key={`accset-${i}`} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: C.muted, width: 20 }}>{i + 1}</span>
                    <div>
                      <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>Reps</div>
                      <StableNumberInput value={set.reps} onChange={v => updateAccSet(i, "reps", v)} style={s.inputSm} min={1} />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>kg</div>
                      <StableNumberInput value={set.weight} onChange={v => updateAccSet(i, "weight", v)} style={s.inputSm} min={0} step={2.5} />
                    </div>
                  </div>
                ))}
                <button style={{ ...s.btnGhost, fontSize: 12, marginBottom: 12 }}
                  onClick={() => setAccSets(prev => [...prev, { reps: 10, weight: 40 }])}>+ Add Set</button>
                <div style={{ display: "flex", gap: 10 }}>
                  <button style={{ ...s.btnOutline, flex: 1 }}
                    onClick={() => { setAddingAccessory(false); setAccName(""); setAccSets([{ reps: 10, weight: 40 }]); }}>Cancel</button>
                  <button style={{ ...s.btn, flex: 1 }} onClick={addAccessory}>Add</button>
                </div>
              </div>
            ) : (
              <button style={{ ...s.btnOutline, width: "100%", marginBottom: 16 }}
                onClick={() => setAddingAccessory(true)}>+ Add Accessory</button>
            )}

            <button style={{ ...s.btn, background: sessionAllDone ? C.accent : C.accentDim }} onClick={finishSession}>Finish Session</button>
            <button style={{ ...s.btnGhost, width: "100%", marginTop: 10, textAlign: "center" }}
              onClick={() => { setSessionStart(null); setScreen("home"); }}>Discard</button>
          </div>
        </>
      )}

      {/* ── HISTORY ── */}
      {screen === "history" && (
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
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ fontSize: 12, color: C.muted }}>{h.duration ? fmt(h.duration) : "—"}</div>
                  <button style={{ ...s.btnDanger, padding: "4px 8px", fontSize: 12, borderRadius: 6 }}
                    onClick={() => requestDeleteHistory(h)}>✕</button>
                </div>
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
      )}

      {/* ── PROGRESS ── */}
      {screen === "progress" && (
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
              <div style={{ fontSize: 32, fontWeight: 700, color: C.accent }}>{getPR(progressLift) ?? "—"}</div>
              <div style={{ fontSize: 12, color: C.muted }}>{getPR(progressLift) ? "kg" : "no data"}</div>
            </div>
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.2em", marginBottom: 12 }}>AMRAP WEIGHT OVER TIME</div>
            <LineChart points={getProgressPoints(progressLift)} color={C.accent} height={90} />
          </div>
          <div style={s.sectionTitle}>Session Log — {progressLift}</div>
          {history.filter(h => h.lift === progressLift).length === 0 && <div style={{ color: C.muted, fontSize: 14 }}>No sessions yet.</div>}
          {[...history].filter(h => h.lift === progressLift).sort((a, b) => b.date.localeCompare(a.date)).map(h => {
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
      )}

      {/* ── SETTINGS ── */}
      {screen === "settings" && (
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
                      <StableNumberInput
                        value={tmInput}
                        onChange={v => setTmInput(v)}
                        style={{ ...s.inputSm, width: 80 }}
                        min={0}
                        step={2.5}
                      />
                      <button style={{ ...s.btn, width: "auto", padding: "8px 14px", fontSize: 13 }}
                        onClick={() => saveTM(lift)}>Save</button>
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
          <div style={s.sectionTitle}>Accessory Exercise List</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, lineHeight: 1.5 }}>
            These appear in the dropdown during sessions.
          </div>
          {PRESET_ACCESSORIES.filter(ex => !removedPresets.includes(ex)).map(ex => (
            <div key={ex} style={{ ...s.histCard, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, padding: "10px 14px" }}>
              <span style={{ fontSize: 14, color: C.muted }}>{ex}</span>
              <button style={{ ...s.btnDanger, padding: "4px 8px", fontSize: 12, borderRadius: 6 }}
                onClick={() => setRemovedPresets(prev => [...prev, ex])}>✕</button>
            </div>
          ))}
          {customExercises.map((ex, i) => (
            <div key={`cex-${i}`} style={{ ...s.histCard, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, padding: "10px 14px" }}>
              {editingExIdx === i ? (
                <>
                  <StableTextInput
                    value={editingExValue}
                    onChange={v => setEditingExValue(v)}
                    style={{ ...s.input, flex: 1, marginRight: 8 }}
                  />
                  <button style={{ ...s.btn, width: "auto", padding: "8px 12px", fontSize: 13 }}
                    onClick={() => {
                      if (editingExValue.trim()) setCustomExercises(prev => prev.map((e, j) => j === i ? editingExValue.trim() : e));
                      setEditingExIdx(null);
                    }}>Save</button>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 14 }}>{ex}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={s.btnGhost} onClick={() => { setEditingExIdx(i); setEditingExValue(ex); }}>Edit</button>
                    <button style={s.btnDanger} onClick={() => setCustomExercises(prev => prev.filter((_, j) => j !== i))}>✕</button>
                  </div>
                </>
              )}
            </div>
          ))}
          <div style={{ display: "flex", gap: 10, marginTop: 8, marginBottom: 12 }}>
            <StableTextInput
              value={newExInput}
              onChange={v => setNewExInput(v)}
              style={{ ...s.input, flex: 1 }}
              placeholder="Add custom exercise…"
              onKeyDown={e => {
                if (e.key === "Enter" && newExInput.trim()) {
                  setCustomExercises(prev => [...prev, newExInput.trim()]);
                  setNewExInput("");
                }
              }}
            />
            <button style={{ ...s.btn, width: "auto", padding: "10px 16px" }}
              onClick={() => { if (newExInput.trim()) { setCustomExercises(prev => [...prev, newExInput.trim()]); setNewExInput(""); } }}>Add</button>
          </div>

          <div style={s.divider} />
          <div style={s.sectionTitle}>Export Data</div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 1.6 }}>
              Excel export doubles as an import template — add rows and import them back.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...s.btn, flex: 1, background: "#162516", color: "#4caf7a", border: "1px solid #2a4a2a" }} onClick={exportExcel}>📊 Excel</button>
              <button style={{ ...s.btn, flex: 1, background: "#251616", color: "#e07070", border: "1px solid #4a2a2a" }} onClick={exportPDF}>📄 PDF</button>
            </div>
            {exportMsg && <div style={{ marginTop: 12, fontSize: 13, color: C.accent, textAlign: "center" }}>✓ {exportMsg}</div>}
          </div>

          <div style={s.sectionTitle}>Import from Excel</div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 24 }}>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 1.6 }}>
              Import sessions and custom exercises from a previously exported Excel file.
            </div>
            <input
              ref={importFileRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: "none" }}
              onChange={handleImportFile}
            />
            <button style={{ ...s.btn, background: "#161825", color: "#7090e0", border: "1px solid #2a3060" }}
              onClick={() => importFileRef.current?.click()}>
              📂 Choose Excel File
            </button>
            {importMsg && <div style={{ marginTop: 12, fontSize: 13, color: C.accent, textAlign: "center" }}>{importMsg}</div>}
          </div>
        </div>
      )}

      {/* ── Import Preview Modal ── */}
      {importPreview && (
        <div style={s.modal}>
          <div style={{ ...s.modalBox, maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Import Preview</div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 1.6 }}>
              Select which sessions to import. Tap to toggle.
            </div>

            {importPreview.newSessions.length > 0 && (
              <>
                <div style={{ fontSize: 10, color: C.green, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 8 }}>
                  New Sessions ({importPreview.newSessions.length})
                </div>
                {importPreview.newSessions.map(s => {
                  const selected = importSelected.has(s.id);
                  return (
                    <div key={s.id} style={{ background: selected ? "#162516" : C.surface, border: `1px solid ${selected ? "#2a4a2a" : C.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 8, cursor: "pointer" }}
                      onClick={() => setImportSelected(prev => { const n = new Set(prev); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 700 }}>{s.lift}</div>
                          <div style={{ fontSize: 12, color: C.muted }}>{fmtDate(s.date)} · {weekLabel(s.weekIdx)} · C{s.cycle}</div>
                        </div>
                        <div style={{ fontSize: 18, color: selected ? C.green : C.border }}>{selected ? "✓" : "○"}</div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {importPreview.dupSessions.length > 0 && (
              <>
                <div style={{ fontSize: 10, color: C.accent, letterSpacing: "0.2em", textTransform: "uppercase", margin: "14px 0 8px" }}>
                  Already Exists — Overwrite? ({importPreview.dupSessions.length})
                </div>
                {importPreview.dupSessions.map(s => {
                  const selected = importSelected.has(s.id);
                  return (
                    <div key={s.id} style={{ background: selected ? "#2a2210" : C.surface, border: `1px solid ${selected ? C.accentDim : C.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 8, cursor: "pointer" }}
                      onClick={() => setImportSelected(prev => { const n = new Set(prev); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 700 }}>{s.lift}</div>
                          <div style={{ fontSize: 12, color: C.muted }}>{fmtDate(s.date)} · {weekLabel(s.weekIdx)} · C{s.cycle}</div>
                        </div>
                        <div style={{ fontSize: 18, color: selected ? C.accent : C.border }}>{selected ? "✓" : "○"}</div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {importPreview.importedExercises.length > 0 && (
              <div style={{ background: "#161825", border: `1px solid #2a3060`, borderRadius: 10, padding: "10px 14px", marginTop: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: "#7090e0", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 6 }}>Custom Exercises to Add</div>
                {importPreview.importedExercises.map((ex, i) => (
                  <div key={i} style={{ fontSize: 13, color: C.muted, marginBottom: 2 }}>+ {ex}</div>
                ))}
              </div>
            )}

            {importPreview.newSessions.length === 0 && importPreview.dupSessions.length === 0 && (
              <div style={{ color: C.muted, fontSize: 14, marginBottom: 16 }}>No valid sessions found in the file.</div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button style={{ ...s.btnOutline, flex: 1 }} onClick={() => { setImportPreview(null); setImportSelected(new Set()); }}>Cancel</button>
              <button style={{ ...s.btn, flex: 1, opacity: importSelected.size === 0 ? 0.4 : 1 }}
                disabled={importSelected.size === 0} onClick={confirmImport}>
                Import {importSelected.size} Session{importSelected.size !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Lift Modal ── */}
      {showAddLift && (
        <div style={s.modal} onClick={e => { if (e.target === e.currentTarget) setShowAddLift(false); }}>
          <div style={s.modalBox}>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Add Main Lift</div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 20, lineHeight: 1.6 }}>
              Uses the same 5/3/1 percentages. Training Max = ~90% of your 1RM.
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>Lift Name</label>
              <input style={s.input} placeholder="e.g. Close-Grip Bench…"
                value={newLiftName} onChange={e => setNewLiftName(e.target.value)} />
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
      )}

      {/* ── Confirm Delete ── */}
      {confirmDelete && (
        <ConfirmModal
          message={`Are you sure you want to delete this entry?\n\n${confirmDelete.label}`}
          onConfirm={confirmDeleteHistory}
          onCancel={() => setConfirmDelete(null)}
          C={C} s={s}
        />
      )}

      {/* ── Bottom Nav ── */}
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
