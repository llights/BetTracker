window.addEventListener('DOMContentLoaded', function() {
const {
  useState,
  useCallback,
  useRef
} = React;

// ── CONFIG ─────────────────────────────────────────────────────────────────
const WORKER_URL = "https://bettracker.llianglengg.workers.dev/";
// ──────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "sgpools-bets-v2";
const RATE_KEY = "sgpools-rate-v1";
const RATE_LIMIT_PER_MIN = 30; // Groq free tier: 30 req/min
const RATE_LIMIT_PER_DAY = 500; // llama-4-scout: 500 req/day

const loadBets = () => {
  try {
    const r = localStorage.getItem(STORAGE_KEY);
    return r ? JSON.parse(r) : [];
  } catch {
    return [];
  }
};
const saveBets = b => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
  } catch {}
};

// Rate limit tracker — stores timestamps of each scan request
const loadRate = () => {
  try {
    const r = localStorage.getItem(RATE_KEY);
    return r ? JSON.parse(r) : [];
  } catch {
    return [];
  }
};
const saveRate = ts => {
  try {
    localStorage.setItem(RATE_KEY, JSON.stringify(ts));
  } catch {}
};
const getRateState = () => {
  const now = Date.now();
  const all = loadRate().filter(t => now - t < 24 * 60 * 60 * 1000); // keep last 24h
  const lastMin = all.filter(t => now - t < 60 * 1000);
  const usedToday = all.length;
  const usedMin = lastMin.length;
  const minLimited = usedMin >= RATE_LIMIT_PER_MIN;
  const dayLimited = usedToday >= RATE_LIMIT_PER_DAY;
  // When will minute window reset?
  const oldestInMin = lastMin.length > 0 ? Math.min(...lastMin) : null;
  const minResetsIn = oldestInMin ? Math.max(0, 60 - Math.floor((now - oldestInMin) / 1000)) : 0;
  // When will day reset? (midnight-ish: 24h from oldest today)
  const oldestToday = all.length > 0 ? Math.min(...all) : null;
  const dayResetsIn = oldestToday ? Math.max(0, Math.ceil((oldestToday + 24 * 60 * 60 * 1000 - now) / 1000)) : 0;
  return {
    usedToday,
    usedMin,
    minLimited,
    dayLimited,
    minResetsIn,
    dayResetsIn,
    remaining: Math.max(0, RATE_LIMIT_PER_DAY - usedToday)
  };
};
const recordScan = (count = 1) => {
  const now = Date.now();
  const all = loadRate().filter(t => now - t < 24 * 60 * 60 * 1000);
  const updated = [...all, ...Array(count).fill(now)];
  saveRate(updated);
};
const fmtCountdown = secs => {
  if (secs <= 0) return "now";
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60),
    s = secs % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60),
    rm = m % 60;
  return `${h}h ${rm}m`;
};

// ── Backup / Export / Import ────────────────────────────────────────────
const exportBets = bets => {
  const payload = {
    app: "SG Pools Tracker",
    exportedAt: new Date().toISOString(),
    version: 1,
    bets
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const dateStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `sgpools-backup-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
const validateImportedBets = data => {
  // Accept either { bets: [...] } wrapper or a raw array
  const arr = Array.isArray(data) ? data : data && Array.isArray(data.bets) ? data.bets : null;
  if (!arr) return null;
  // Basic shape check on first few entries
  const valid = arr.every(b => b && typeof b === "object" && "id" in b && "status" in b && "betCategory" in b);
  return valid ? arr : null;
};

// Duplicate detection — match on match name + betType + date (fuzzy)
const findDuplicates = (newBets, existingBets) => {
  const normalize = s => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
  return newBets.map(nb => {
    const nbMatch = normalize(nb.betCategory === "Parlay" ? nb.parlayLabel || "parlay" : nb.match);
    const nbBetType = normalize(nb.betType || "");
    const nbDate = normalize(nb.date || "");
    const dup = existingBets.find(eb => {
      const ebMatch = normalize(eb.betCategory === "Parlay" ? eb.parlayLabel || "parlay" : eb.match);
      const ebBetType = normalize(eb.betType || "");
      const ebDate = normalize(eb.date || "");
      return ebMatch === nbMatch && ebBetType === nbBetType && (ebDate === nbDate || !nbDate || !ebDate);
    });
    return dup ? nb.id || JSON.stringify(nb) : null;
  }).filter(Boolean);
};
const STATUS_COLORS = {
  Win: {
    bg: "#d1fae5",
    text: "#065f46",
    dot: "#10b981"
  },
  Loss: {
    bg: "#fee2e2",
    text: "#991b1b",
    dot: "#ef4444"
  },
  Void: {
    bg: "#f3f4f6",
    text: "#374151",
    dot: "#9ca3af"
  },
  Pending: {
    bg: "#fef3c7",
    text: "#92400e",
    dot: "#f59e0b"
  }
};
const BET_TYPES = [
// Full-Time
"1X2", "Pick the Score", "Halftime-Fulltime", "Team to Score 1st Goal", "Team to Score Xth Goal", "Team to Score Last Goal", "Total Goals", "Total Goals Over/Under", "Total Goals Odd/Even", "1/2 Goal", "Asian Handicap", "Handicap 1X2", "1st Goal Scorer", "Last Goal Scorer", "Which Half More Goals", "Team to Win 2nd Half", "Both Teams to Score",
// Half-Time
"Halftime 1X2", "Halftime Pick the Score", "Halftime Total Goals Over/Under", "Halftime Asian Handicap", "Halftime Total Goals Odd/Even", "Halftime 1/2 Goal", "Halftime Total Goals", "Halftime Team to Score 1st Goal", "Halftime Team to Score Xth Goal", "Halftime Both Teams to Score",
// Extra Time
"Extra Time 1X2", "Extra Time Total Goals Over/Under", "Extra Time Pick the Score", "Extra Time Asian Handicap", "Extra Time Total Goals Odd/Even", "Extra Time 1/2 Goal", "Extra Time Total Goals", "Extra Time Team to Score 1st Goal", "Extra Time Team to Score Xth Goal", "Extra Time Both Teams to Score",
// Specials / Outright
"Championship Winner", "How Will Match Be Decided", "Who Will Qualify", "Top Goal Scorer", "Group Winner", "Group Qualifier", "Stage of Elimination", "Tournament Winning Continent", "Tournament Finalists", "Tournament Team Semi-Finalist", "Tournament Who Progress Further", "Tournament Will Hat-trick Be Scored", "Tournament Total Goals",
// Fallback
"Other"];
const EMPTY_FORM = {
  match: "",
  date: "",
  betType: "1X2",
  selection: "",
  odds: "",
  stake: "",
  payout: "",
  status: "Pending",
  betCategory: "Single",
  parlayLabel: "",
  parlayLegs: [{
    match: "",
    selection: "",
    betType: "1X2",
    odds: ""
  }]
};
const todayStr = () => new Date().toLocaleDateString("en-SG", {
  day: "2-digit",
  month: "short",
  year: "numeric"
});

// ── Shared UI ──────────────────────────────────────────────────────────────

function StatusBadge({
  status
}) {
  const sc = STATUS_COLORS[status] || STATUS_COLORS.Pending;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      background: sc.bg,
      color: sc.text,
      borderRadius: 20,
      padding: "3px 10px",
      fontSize: 11,
      fontWeight: 600,
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      whiteSpace: "nowrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: "50%",
      background: sc.dot,
      display: "inline-block",
      flexShrink: 0
    }
  }), status);
}
function StatCard({
  label,
  value,
  sub,
  accent
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      padding: "14px 18px",
      flex: 1,
      minWidth: 130
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: "#9ca3af",
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      marginBottom: 4
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 700,
      color: accent || "#111827",
      fontVariantNumeric: "tabular-nums"
    }
  }, value), sub && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "#6b7280",
      marginTop: 2
    }
  }, sub));
}
function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      display: "block",
      fontSize: 12,
      fontWeight: 600,
      color: "#374151",
      marginBottom: 5
    }
  }, label, required && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "#ef4444"
    }
  }, " *")), /*#__PURE__*/React.createElement("input", {
    type: type,
    value: value,
    onChange: e => onChange(e.target.value),
    placeholder: placeholder,
    style: {
      width: "100%",
      padding: "10px 12px",
      border: "1px solid #d1d5db",
      borderRadius: 8,
      fontSize: 14,
      background: "#fff",
      color: "#111827"
    }
  }));
}
function DropDown({
  label,
  value,
  onChange,
  options
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      display: "block",
      fontSize: 12,
      fontWeight: 600,
      color: "#374151",
      marginBottom: 5
    }
  }, label), /*#__PURE__*/React.createElement("select", {
    value: value,
    onChange: e => onChange(e.target.value),
    style: {
      width: "100%",
      padding: "10px 12px",
      border: "1px solid #d1d5db",
      borderRadius: 8,
      fontSize: 14,
      background: "#fff",
      color: "#111827"
    }
  }, options.map(o => /*#__PURE__*/React.createElement("option", {
    key: o,
    value: o
  }, o))));
}

// ── helpers ────────────────────────────────────────────────────────────────

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve({
      dataUrl: e.target.result,
      base64: e.target.result.split(",")[1],
      mediaType: file.type || "image/jpeg",
      name: file.name
    });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Compress and resize image before sending to reduce token usage
// qwen3.6-27b has 8000 TPM limit on free tier — keep images small
function compressImage(file, maxWidth = 800, quality = 0.6) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxWidth / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      // Start at quality 0.6, reduce further if still too big
      let q = quality;
      let dataUrl = canvas.toDataURL("image/jpeg", q);
      // Target ~400KB base64 (~300KB image) to stay under token limit
      while (dataUrl.length > 400000 && q > 0.2) {
        q -= 0.1;
        dataUrl = canvas.toDataURL("image/jpeg", q);
      }
      resolve({
        dataUrl,
        base64: dataUrl.split(",")[1],
        mediaType: "image/jpeg",
        name: file.name
      });
    };
    img.onerror = async () => {
      URL.revokeObjectURL(url);
      resolve(await readFileAsBase64(file));
    };
    img.src = url;
  });
}
async function scanSingleImage(img) {
  const res = await fetch(WORKER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      imageBase64: img.base64,
      mediaType: img.mediaType
    })
  });
  const data = await res.json();
  if (!res.ok) {
    const detail = data.detail ? typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail) : "";
    throw new Error(`${data.error || "Worker error " + res.status}${detail ? ": " + detail.slice(0, 200) : ""}`);
  }
  return {
    bets: data.bets || [],
    rateLimit: data.rateLimit || null
  };
}

// ── Scan Tab ───────────────────────────────────────────────────────────────

function ScanTab({
  onBetsScanned,
  setTab,
  existingBets
}) {
  // image queue items: { dataUrl, base64, mediaType, name, status, bets, error }
  const [images, setImages] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [allResults, setAllResults] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [dupWarning, setDupWarning] = useState([]);
  const [rateState, setRateState] = useState(() => getRateState());
  const [groqRate, setGroqRate] = useState(null);
  const imgInputRef = useRef();
  const applyGroqRateLimit = rl => {
    if (!rl) return;
    setGroqRate(rl);
    setRateState(getRateState());
  };
  React.useEffect(() => {
    const isLimited = groqRate ? groqRate.remainingReqMin === 0 || groqRate.remainingReqDay === 0 : rateState.minLimited || rateState.dayLimited;
    if (!isLimited) return;
    const timer = setInterval(() => {
      setRateState(getRateState());
      setGroqRate(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          resetReqMinSecs: prev.resetReqMinSecs > 0 ? prev.resetReqMinSecs - 1 : 0,
          resetReqDaySecs: prev.resetReqDaySecs > 0 ? prev.resetReqDaySecs - 1 : 0
        };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [groqRate, rateState.minLimited, rateState.dayLimited]);
  const reset = () => {
    setImages([]);
    setAllResults(null);
    setConfirmed(false);
  };
  const retryFailed = async () => {
    const failedIdxs = images.map((img, i) => img.status === "error" ? i : null).filter(i => i !== null);
    if (!failedIdxs.length) return;
    const rs = getRateState();
    if (rs.minLimited || rs.dayLimited) {
      setRateState(rs);
      return;
    }
    setScanning(true);
    recordScan(failedIdxs.length);
    setRateState(getRateState());
    const retryResults = await Promise.all(failedIdxs.map(async idx => {
      setImages(prev => prev.map((m, i) => i === idx ? {
        ...m,
        status: "scanning",
        error: ""
      } : m));
      try {
        const bets = await scanSingleImage(images[idx]);
        setImages(prev => prev.map((m, i) => i === idx ? {
          ...m,
          status: "done",
          bets
        } : m));
        return bets;
      } catch (err) {
        setImages(prev => prev.map((m, i) => i === idx ? {
          ...m,
          status: "error",
          error: err.message
        } : m));
        return [];
      }
    }));
    // Merge new results into existing allResults
    const newBets = retryResults.flat().map(b => ({
      ...b,
      status: b.status || "Pending"
    }));
    setAllResults(prev => prev ? [...prev, ...newBets] : newBets);
    setScanning(false);
  };

  // ── Image handlers ──
  const addImageFiles = async files => {
    const imgFiles = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (!imgFiles.length) return;
    const loaded = await Promise.all(imgFiles.map(f => compressImage(f)));
    setImages(prev => [...prev, ...loaded.map(img => ({
      ...img,
      status: "idle",
      bets: [],
      error: ""
    }))]);
    setAllResults(null);
    setConfirmed(false);
  };
  const handleDrop = e => {
    e.preventDefault();
    addImageFiles(Array.from(e.dataTransfer.files));
  };

  // ── Scan all ──
  const scanAll = async () => {
    const rs = getRateState();
    if (rs.dayLimited) {
      setRateState(rs);
      return;
    }
    if (rs.minLimited) {
      setRateState(rs);
      return;
    }
    setScanning(true);
    setAllResults(null);
    const allBets = [];
    recordScan(images.length);
    setRateState(getRateState());

    // Scan images in parallel
    const imgResults = await Promise.all(images.map(async (img, idx) => {
      setImages(prev => prev.map((m, i) => i === idx ? {
        ...m,
        status: "scanning"
      } : m));
      try {
        const {
          bets,
          rateLimit
        } = await scanSingleImage(img);
        setImages(prev => prev.map((m, i) => i === idx ? {
          ...m,
          status: "done",
          bets
        } : m));
        if (rateLimit) applyGroqRateLimit(rateLimit);
        return bets;
      } catch (err) {
        setImages(prev => prev.map((m, i) => i === idx ? {
          ...m,
          status: "error",
          error: err.message
        } : m));
        return [];
      }
    }));
    allBets.push(...imgResults.flat());

    // Auto-calculate combined odds for parlays from leg odds
    const enriched = allBets.map(b => {
      if (b.betCategory === "Parlay" && !b.combinedOdds && (b.legs || []).length > 0) {
        const legOdds = (b.legs || []).map(l => Number(l.odds)).filter(o => o > 0);
        if (legOdds.length === b.legs.length) {
          const combined = legOdds.reduce((acc, o) => acc * o, 1);
          return {
            ...b,
            combinedOdds: Math.round(combined * 100) / 100
          };
        }
      }
      return b;
    });
    const succeeded = images.filter(m => m.status === "done").length;

    // Only show results panel if at least one image scanned successfully
    if (succeeded > 0) {
      setAllResults(enriched.map(b => ({
        ...b,
        status: b.status || "Pending"
      })));
    }
    setScanning(false);
  };
  const updateResult = (i, field, value) => {
    setAllResults(prev => prev.map((b, idx) => idx === i ? {
      ...b,
      [field]: value
    } : b));
  };
  const confirmBets = (force = false) => {
    if (!allResults) return;
    const newBets = allResults.map(b => {
      if (b.betCategory === "Parlay") {
        return {
          id: Date.now() + Math.random(),
          betCategory: "Parlay",
          parlayLabel: b.parlayLabel || "",
          date: b.date || todayStr(),
          combinedOdds: b.combinedOdds ? Number(b.combinedOdds) : null,
          stake: Number(b.stake) || 0,
          payout: Number(b.payout) || 0,
          status: b.status || "Pending",
          legs: (b.legs || []).map(l => ({
            match: l.match || "",
            date: l.date || "",
            betType: BET_TYPES.includes(l.betType) ? l.betType : "Other",
            selection: l.selection || "",
            odds: l.odds ? Number(l.odds) : null,
            legStatus: l.legStatus === "Loss" ? "Settled" : l.legStatus || "Pending"
          }))
        };
      }
      return {
        id: Date.now() + Math.random(),
        betCategory: "Single",
        parlayLabel: "",
        match: b.match || "Unknown Match",
        date: b.date || todayStr(),
        betType: BET_TYPES.includes(b.betType) ? b.betType : "Other",
        selection: b.selection || "",
        odds: b.odds ? Number(b.odds) : null,
        stake: Number(b.stake) || 0,
        payout: Number(b.payout) || 0,
        status: b.status || "Pending"
      };
    });

    // Duplicate check
    if (!force) {
      const normalize = s => (s || "").toLowerCase().trim();
      const dups = newBets.filter(nb => {
        const nbKey = normalize(nb.betCategory === "Parlay" ? nb.parlayLabel || "parlay" : nb.match);
        const nbType = normalize(nb.betType || "");
        const nbDate = normalize(nb.date || "");
        return (existingBets || []).some(eb => {
          const ebKey = normalize(eb.betCategory === "Parlay" ? eb.parlayLabel || "parlay" : eb.match);
          return ebKey === nbKey && normalize(eb.betType || "") === nbType && (!nbDate || !normalize(eb.date || "") || normalize(eb.date || "") === nbDate);
        });
      });
      if (dups.length > 0) {
        setDupWarning(dups.map(d => d.betCategory === "Parlay" ? d.parlayLabel || "Parlay" : d.match));
        return;
      }
    }
    setDupWarning([]);
    onBetsScanned(newBets);
    setConfirmed(true);
    setTimeout(() => setTab("history"), 1500);
  };
  const totalFound = allResults ? allResults.length : 0;
  const totalQueued = images.length;
  const errorCount = images.filter(m => m.status === "error").length;
  function Spinner() {
    return /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-block",
        width: 12,
        height: 12,
        border: "2px solid #c7d2fe",
        borderTopColor: "#6366f1",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
        flexShrink: 0
      }
    });
  }
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 700,
      marginBottom: 4
    }
  }, "Scan Slips"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "#6b7280",
      marginBottom: 16
    }
  }, "Upload one or more bet slip photos — AI will extract all bets automatically."), (() => {
    // Prefer Groq real data, fall back to local estimates
    const remainMin = groqRate?.remainingReqMin ?? RATE_LIMIT_PER_MIN - rateState.usedMin;
    const limitMin = groqRate?.limitReqMin ?? RATE_LIMIT_PER_MIN;
    const remainDay = groqRate?.remainingReqDay ?? rateState.remaining;
    const limitDay = groqRate?.limitReqDay ?? RATE_LIMIT_PER_DAY;
    const resetMinS = groqRate?.resetReqMinSecs ?? rateState.minResetsIn;
    const resetDayS = groqRate?.resetReqDaySecs ?? rateState.dayResetsIn;
    const isFromGroq = !!groqRate;
    const minLimited = remainMin <= 0;
    const dayLimited = remainDay <= 0;
    if (minLimited || dayLimited) {
      return /*#__PURE__*/React.createElement("div", {
        style: {
          background: "#fee2e2",
          border: "1px solid #fca5a5",
          borderRadius: 10,
          padding: "12px 14px",
          marginBottom: 16
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 13,
          fontWeight: 700,
          color: "#991b1b",
          marginBottom: 4
        }
      }, "🚫 ", dayLimited ? "Daily scan limit reached" : "Minute scan limit reached"), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 12,
          color: "#991b1b",
          marginBottom: 8
        }
      }, dayLimited ? `${limitDay} daily scans used. Resets in ${fmtCountdown(resetDayS)}.` : `Too many scans in the last minute (${limitMin}/min). Available again in ${fmtCountdown(resetMinS)}.`, isFromGroq && /*#__PURE__*/React.createElement("span", {
        style: {
          marginLeft: 6,
          fontSize: 10,
          opacity: 0.7
        }
      }, "· Live from Groq")), /*#__PURE__*/React.createElement("div", {
        style: {
          background: "#fecaca",
          borderRadius: 6,
          height: 6,
          overflow: "hidden"
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          height: "100%",
          background: "#ef4444",
          width: "100%"
        }
      })));
    }
    if (rateState.usedToday > 0 || groqRate) {
      const usedDay = limitDay - remainDay;
      const usedMin = limitMin - remainMin;
      const pctDay = Math.min(usedDay / limitDay * 100, 100);
      return /*#__PURE__*/React.createElement("div", {
        style: {
          background: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: "10px 14px",
          marginBottom: 16
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          fontWeight: 600,
          color: "#6b7280",
          marginBottom: 6
        }
      }, /*#__PURE__*/React.createElement("span", null, "📊 Daily scans ", isFromGroq && /*#__PURE__*/React.createElement("span", {
        style: {
          fontWeight: 400,
          color: "#a3a3a3"
        }
      }, "· Live")), /*#__PURE__*/React.createElement("span", {
        style: {
          color: pctDay > 80 ? "#f59e0b" : "#6b7280"
        }
      }, usedDay, " / ", limitDay, " used · ", remainDay, " left")), /*#__PURE__*/React.createElement("div", {
        style: {
          background: "#e5e7eb",
          borderRadius: 6,
          height: 6,
          overflow: "hidden"
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          height: "100%",
          background: pctDay > 80 ? "#f59e0b" : "#6366f1",
          width: `${pctDay}%`,
          transition: "width 0.3s"
        }
      })), usedMin > 0 && /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 10,
          color: "#9ca3af",
          marginTop: 5
        }
      }, "This minute: ", usedMin, " / ", limitMin, " · resets in ", fmtCountdown(resetMinS)), groqRate?.remainingTokMin != null && /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 10,
          color: "#9ca3af",
          marginTop: 2
        }
      }, "Tokens this minute: ", groqRate.limitTokMin - groqRate.remainingTokMin, " / ", groqRate.limitTokMin));
    }
    return null;
  })(), !allResults && !confirmed && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    onDrop: handleDrop,
    onDragOver: e => e.preventDefault(),
    onClick: () => imgInputRef.current.click(),
    style: {
      border: "2px dashed #d1d5db",
      borderRadius: 14,
      background: "#fff",
      padding: "28px 20px",
      textAlign: "center",
      cursor: "pointer",
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 32,
      marginBottom: 8
    }
  }, "📷"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600,
      fontSize: 14,
      marginBottom: 4
    }
  }, "Tap to add slip photos"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "#9ca3af",
      fontSize: 12
    }
  }, "Multiple images OK · JPG, PNG, HEIC"), /*#__PURE__*/React.createElement("input", {
    ref: imgInputRef,
    type: "file",
    accept: "image/*",
    multiple: true,
    style: {
      display: "none"
    },
    onChange: e => addImageFiles(e.target.files)
  })), images.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
      marginBottom: 14
    }
  }, images.map((img, idx) => /*#__PURE__*/React.createElement("div", {
    key: idx,
    style: {
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: 10,
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: img.dataUrl,
    alt: "",
    style: {
      width: 56,
      height: 56,
      objectFit: "cover",
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      fontSize: 12,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 500,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      marginBottom: 2
    }
  }, img.name), img.status === "idle" && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "#9ca3af"
    }
  }, "Ready"), img.status === "scanning" && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "#6366f1",
      display: "flex",
      alignItems: "center",
      gap: 5
    }
  }, /*#__PURE__*/React.createElement(Spinner, null), " Scanning..."), img.status === "done" && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "#10b981"
    }
  }, "✓ ", img.bets.length, " bet", img.bets.length !== 1 ? "s" : "", " found"), img.status === "error" && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "#ef4444"
    }
  }, "⚠ ", img.error)), !scanning && /*#__PURE__*/React.createElement("button", {
    onClick: () => setImages(prev => prev.filter((_, i) => i !== idx)),
    style: {
      padding: "6px 10px",
      marginRight: 8,
      background: "none",
      border: "none",
      color: "#9ca3af",
      cursor: "pointer",
      fontSize: 16
    }
  }, "✕"))), !scanning && /*#__PURE__*/React.createElement("button", {
    onClick: () => imgInputRef.current.click(),
    style: {
      border: "1px dashed #d1d5db",
      borderRadius: 8,
      background: "#fff",
      color: "#6b7280",
      padding: "9px",
      fontSize: 13,
      cursor: "pointer"
    }
  }, "+ Add more images"))), totalQueued > 0 && !allResults && !confirmed && (() => {
    const remainMin = groqRate?.remainingReqMin ?? RATE_LIMIT_PER_MIN - rateState.usedMin;
    const remainDay = groqRate?.remainingReqDay ?? rateState.remaining;
    const resetMinS = groqRate?.resetReqMinSecs ?? rateState.minResetsIn;
    const resetDayS = groqRate?.resetReqDaySecs ?? rateState.dayResetsIn;
    const minLimited = remainMin <= 0;
    const dayLimited = remainDay <= 0;
    const isLimited = minLimited || dayLimited;
    return /*#__PURE__*/React.createElement("button", {
      onClick: scanAll,
      disabled: scanning || isLimited,
      style: {
        width: "100%",
        background: isLimited ? "#d1d5db" : scanning ? "#818cf8" : "#6366f1",
        color: isLimited ? "#6b7280" : "#fff",
        border: "none",
        borderRadius: 8,
        padding: "12px",
        fontSize: 14,
        fontWeight: 600,
        cursor: scanning || isLimited ? "not-allowed" : "pointer",
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8
      }
    }, scanning ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-block",
        width: 14,
        height: 14,
        border: "2px solid rgba(255,255,255,0.4)",
        borderTopColor: "#fff",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite"
      }
    }), " Scanning...") : minLimited ? `⏳ Available in ${fmtCountdown(resetMinS)}` : dayLimited ? `⏳ Daily limit hit · resets in ${fmtCountdown(resetDayS)}` : `🔍 Scan ${totalQueued} file${totalQueued !== 1 ? "s" : ""}`);
  })(), images.some(m => m.status === "error") && !scanning && /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#fff7ed",
      border: "1px solid #fed7aa",
      borderRadius: 8,
      padding: "10px 14px",
      fontSize: 13,
      color: "#c2410c",
      marginBottom: 12,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", null, "⚠️ ", errorCount, " image", errorCount !== 1 ? "s" : "", " failed to scan."), /*#__PURE__*/React.createElement("button", {
    onClick: retryFailed,
    disabled: scanning,
    style: {
      background: "#fff7ed",
      border: "1px solid #fed7aa",
      color: "#c2410c",
      borderRadius: 6,
      padding: "4px 10px",
      fontSize: 12,
      fontWeight: 600,
      cursor: "pointer"
    }
  }, "🔄 Retry")), dupWarning.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#fff7ed",
      border: "1px solid #fbbf24",
      borderRadius: 10,
      padding: "12px 14px",
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: "#92400e",
      marginBottom: 6
    }
  }, "⚠️ Possible duplicates detected"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#92400e",
      marginBottom: 10
    }
  }, "These bets may already exist in your history:", /*#__PURE__*/React.createElement("ul", {
    style: {
      marginTop: 6,
      paddingLeft: 16
    }
  }, dupWarning.map((name, i) => /*#__PURE__*/React.createElement("li", {
    key: i
  }, name)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setDupWarning([]),
    style: {
      flex: 1,
      background: "#fff",
      border: "1px solid #d1d5db",
      borderRadius: 7,
      padding: "8px",
      fontSize: 13,
      cursor: "pointer",
      color: "#374151"
    }
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    onClick: () => confirmBets(true),
    style: {
      flex: 1,
      background: "#92400e",
      color: "#fff",
      border: "none",
      borderRadius: 7,
      padding: "8px",
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer"
    }
  }, "Save Anyway"))), allResults && !confirmed && /*#__PURE__*/React.createElement("div", null, totalFound === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#fee2e2",
      color: "#991b1b",
      borderRadius: 8,
      padding: "10px 14px",
      fontSize: 13,
      marginBottom: 14
    }
  }, "⚠️ No bets detected. Try a clearer, well-lit photo of your bet slip.") : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: "#374151",
      marginBottom: 4
    }
  }, "✅ Found ", totalFound, " bet", totalFound !== 1 ? "s" : "", " — review then save"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#6b7280",
      marginBottom: 12
    }
  }, "Tap status or fields to edit before saving."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10,
      marginBottom: 16
    }
  }, allResults.map((b, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      background: "#fff",
      border: b.betCategory === "Parlay" ? "1px solid #c4b5fd" : "1px solid #e5e7eb",
      borderRadius: 10,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "12px 14px",
      borderBottom: "1px solid #f3f4f6"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      marginBottom: 6
    }
  }, b.betCategory === "Parlay" ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      background: "#ede9fe",
      color: "#7c3aed",
      borderRadius: 4,
      padding: "2px 7px"
    }
  }, "🔗 PARLAY · ", (b.legs || []).length, " LEGS") : /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      background: "#f0fdf4",
      color: "#166534",
      borderRadius: 4,
      padding: "2px 7px"
    }
  }, "⚽ SINGLE")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600,
      fontSize: 13
    }
  }, b.betCategory === "Parlay" ? b.parlayLabel || (b.legs || []).map(l => l.match).join(" + ") || "Parlay Bet" : b.match || "Unknown Match"), b.date && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "#9ca3af",
      marginTop: 2
    }
  }, "📅 ", b.date)), b.betCategory === "Parlay" && (b.legs || []).length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#faf5ff",
      borderBottom: "1px solid #f3f4f6"
    }
  }, (b.legs || []).map((leg, li) => /*#__PURE__*/React.createElement("div", {
    key: li,
    style: {
      padding: "8px 14px",
      borderBottom: li < b.legs.length - 1 ? "1px solid #ede9fe" : "none",
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600,
      color: "#111827"
    }
  }, leg.match), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "#6b7280",
      marginTop: 2,
      display: "flex",
      gap: 10,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("span", null, "☑️ ", leg.selection), /*#__PURE__*/React.createElement("span", null, "🎯 ", leg.betType), leg.odds && /*#__PURE__*/React.createElement("span", null, "@ ", leg.odds))))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "12px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: "#6b7280",
      marginBottom: 5
    }
  }, "RESULT"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap"
    }
  }, ["Pending", "Win", "Loss", "Void"].map(s => {
    const sc = STATUS_COLORS[s];
    const active = (b.status || "Pending") === s;
    return /*#__PURE__*/React.createElement("button", {
      key: s,
      onClick: () => updateResult(i, "status", s),
      style: {
        padding: "5px 12px",
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        border: active ? "2px solid " + sc.dot : "2px solid #e5e7eb",
        background: active ? sc.bg : "#fff",
        color: active ? sc.text : "#6b7280"
      }
    }, s);
  }))), b.betCategory !== "Parlay" && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: "#6b7280",
      marginBottom: 4
    }
  }, "BET TYPE"), /*#__PURE__*/React.createElement("select", {
    value: b.betType || "Other",
    onChange: e => updateResult(i, "betType", e.target.value),
    style: {
      width: "100%",
      padding: "7px 10px",
      border: "1px solid #d1d5db",
      borderRadius: 7,
      fontSize: 12,
      background: "#fff",
      color: "#111827"
    }
  }, BET_TYPES.map(t => /*#__PURE__*/React.createElement("option", {
    key: t,
    value: t
  }, t)))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: "#6b7280",
      marginBottom: 4
    }
  }, "SELECTION"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: b.selection || "",
    onChange: e => updateResult(i, "selection", e.target.value),
    placeholder: "e.g. Belgium, Over 2.5",
    style: {
      width: "100%",
      padding: "7px 10px",
      border: "1px solid #d1d5db",
      borderRadius: 7,
      fontSize: 13,
      background: "#fff"
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: "#6b7280",
      marginBottom: 4
    }
  }, "STAKE ($)"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: b.stake || "",
    onChange: e => updateResult(i, "stake", e.target.value),
    placeholder: "0.00",
    style: {
      width: "100%",
      padding: "7px 10px",
      border: "1px solid #d1d5db",
      borderRadius: 7,
      fontSize: 13,
      background: "#fff"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: "#6b7280",
      marginBottom: 4
    }
  }, b.betCategory === "Parlay" ? "COMBINED ODDS" : "ODDS"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: (b.betCategory === "Parlay" ? b.combinedOdds : b.odds) || "",
    placeholder: "e.g. 1.85",
    onChange: e => updateResult(i, b.betCategory === "Parlay" ? "combinedOdds" : "odds", e.target.value),
    style: {
      width: "100%",
      padding: "7px 10px",
      border: "1px solid #d1d5db",
      borderRadius: 7,
      fontSize: 13,
      background: "#fff"
    }
  }))), (b.status || "Pending") === "Win" && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: "#6b7280",
      marginBottom: 4
    }
  }, "PAYOUT ($)"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: b.payout || "",
    onChange: e => updateResult(i, "payout", e.target.value),
    placeholder: "e.g. 18.50",
    style: {
      width: "100%",
      padding: "7px 10px",
      border: "1px solid #d1d5db",
      borderRadius: 7,
      fontSize: 13,
      background: "#fff"
    }
  }))))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: reset,
    style: {
      flex: 1,
      background: "#fff",
      color: "#374151",
      border: "1px solid #d1d5db",
      borderRadius: 8,
      padding: "11px",
      fontSize: 13,
      fontWeight: 500,
      cursor: "pointer"
    }
  }, "Start Over"), totalFound > 0 && /*#__PURE__*/React.createElement("button", {
    onClick: confirmBets,
    style: {
      flex: 2,
      background: "#0f172a",
      color: "#fff",
      border: "none",
      borderRadius: 8,
      padding: "11px",
      fontSize: 14,
      fontWeight: 600,
      cursor: "pointer"
    }
  }, "Save ", totalFound, " Bet", totalFound !== 1 ? "s" : ""))), confirmed && /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#d1fae5",
      color: "#065f46",
      borderRadius: 10,
      padding: "14px 16px",
      fontSize: 14,
      fontWeight: 500,
      textAlign: "center"
    }
  }, "✅ Bets saved! Redirecting to History…"));
}

// ── Main App ───────────────────────────────────────────────────────────────

function App() {
  const [bets, setBets] = useState(() => loadBets());
  const [tab, setTab] = useState("dashboard");
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saved, setSaved] = useState(false);
  const [filterStatus, setFilterStatus] = useState("All");
  const [expandedId, setExpandedId] = useState(null);
  const [historyView, setHistoryView] = useState("Singles"); // "Singles" | "Parlays"
  const [importMsg, setImportMsg] = useState(null); // { type: "success"|"error", text }
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const importInputRef = useRef();
  // local edits for expanded bet in history: { [id]: { payout, stake, odds } }
  const [histEdits, setHistEdits] = useState({});
  const setField = k => v => setForm(f => ({
    ...f,
    [k]: v
  }));
  const submitBet = useCallback(() => {
    if (form.betCategory === "Parlay") {
      const legs = form.parlayLegs || [];
      if (legs.length === 0) {
        setFormError("Add at least one leg");
        return;
      }
      if (legs.some(l => !l.match.trim())) {
        setFormError("All legs must have a match");
        return;
      }
    } else {
      if (!form.match.trim()) {
        setFormError("Match is required");
        return;
      }
    }
    if (!form.stake || isNaN(Number(form.stake))) {
      setFormError("Enter a valid stake amount");
      return;
    }
    setFormError("");
    const newBet = {
      id: Date.now() + Math.random(),
      betCategory: form.betCategory || "Single",
      ...(form.betCategory === "Parlay" ? {
        parlayLabel: form.parlayLabel.trim(),
        date: form.date.trim() || todayStr(),
        combinedOdds: form.odds ? Number(form.odds) : null,
        stake: Number(form.stake),
        payout: form.payout ? Number(form.payout) : 0,
        status: form.status,
        legs: (form.parlayLegs || []).map(l => ({
          match: l.match.trim(),
          date: "",
          betType: BET_TYPES.includes(l.betType) ? l.betType : "Other",
          selection: l.selection.trim(),
          odds: l.odds ? Number(l.odds) : null,
          legStatus: "Pending"
        }))
      } : {
        parlayLabel: "",
        match: form.match.trim(),
        date: form.date.trim() || todayStr(),
        betType: form.betType,
        selection: form.selection.trim(),
        odds: form.odds ? Number(form.odds) : null,
        stake: Number(form.stake),
        payout: form.payout ? Number(form.payout) : form.status === "Win" && form.odds ? Math.round(Number(form.stake) * Number(form.odds) * 100) / 100 : 0,
        status: form.status
      })
    };
    setBets(prev => {
      const next = [newBet, ...prev];
      saveBets(next);
      return next;
    });
    setForm(EMPTY_FORM);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    setTab("history");
  }, [form]);
  const deleteBet = useCallback(id => {
    setBets(prev => {
      const next = prev.filter(b => b.id !== id);
      saveBets(next);
      return next;
    });
    setHistEdits(e => {
      const n = {
        ...e
      };
      delete n[id];
      return n;
    });
  }, []);

  // Update any fields on a saved bet
  const updateBet = useCallback((id, fields) => {
    setBets(prev => {
      const next = prev.map(b => b.id === id ? {
        ...b,
        ...fields
      } : b);
      saveBets(next);
      return next;
    });
  }, []);
  const handleBetsScanned = useCallback(newBets => {
    setBets(prev => {
      const next = [...newBets, ...prev];
      saveBets(next);
      return next;
    });
  }, []);
  const handleImportFile = file => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        const imported = validateImportedBets(data);
        if (!imported) {
          setImportMsg({
            type: "error",
            text: "This file doesn't look like a valid SG Pools Tracker backup."
          });
          return;
        }
        const merge = window.confirm(`Found ${imported.length} bet${imported.length !== 1 ? "s" : ""} in this backup.\n\nTap OK to MERGE with your current bets, or Cancel to REPLACE all current bets with this backup.`);
        setBets(prev => {
          const next = merge ? [...imported, ...prev] : imported;
          saveBets(next);
          return next;
        });
        setImportMsg({
          type: "success",
          text: `Imported ${imported.length} bet${imported.length !== 1 ? "s" : ""} (${merge ? "merged" : "replaced"}).`
        });
      } catch {
        setImportMsg({
          type: "error",
          text: "Couldn't read this file — make sure it's a valid JSON backup."
        });
      }
    };
    reader.readAsText(file);
  };

  // helpers for history edit state
  const getEdit = (id, field, fallback) => histEdits[id]?.[field] !== undefined ? histEdits[id][field] : fallback;
  const setEdit = (id, field, value) => setHistEdits(e => ({
    ...e,
    [id]: {
      ...e[id],
      [field]: value
    }
  }));
  const clearEdits = id => setHistEdits(e => {
    const n = {
      ...e
    };
    delete n[id];
    return n;
  });
  const settled = bets.filter(b => b.status === "Win" || b.status === "Loss");
  const wins = bets.filter(b => b.status === "Win");
  const losses = bets.filter(b => b.status === "Loss");
  const pending = bets.filter(b => b.status === "Pending");
  const totalStaked = settled.reduce((s, b) => s + b.stake, 0);
  const totalReturns = wins.reduce((s, b) => s + b.payout, 0);
  const netPnL = totalReturns - totalStaked;
  const roi = totalStaked > 0 ? (netPnL / totalStaked * 100).toFixed(1) : "0.0";
  const winRate = settled.length > 0 ? (wins.length / settled.length * 100).toFixed(0) : "—";
  const pnlColor = netPnL >= 0 ? "#10b981" : "#ef4444";
  const filteredBets = filterStatus === "All" ? bets : bets.filter(b => (b.status || "").trim().toLowerCase() === filterStatus.toLowerCase());
  const NAV = [{
    id: "dashboard",
    label: "Dashboard"
  }, {
    id: "scan",
    label: "📷 Scan"
  }, {
    id: "add",
    label: "+ Add"
  }, {
    id: "history",
    label: "History"
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: "100vh",
      background: "#f9fafb",
      color: "#111827"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#0f172a",
      padding: "0 16px",
      position: "sticky",
      top: 0,
      zIndex: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 600,
      margin: "0 auto",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      height: 52
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 18
    }
  }, "⚽"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700,
      fontSize: 14,
      color: "#f1f5f9"
    }
  }, "SG Pools Tracker")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 2
    }
  }, NAV.map(t => /*#__PURE__*/React.createElement("button", {
    key: t.id,
    onClick: () => setTab(t.id),
    style: {
      background: tab === t.id ? "#1e293b" : "none",
      border: "none",
      borderRadius: 6,
      cursor: "pointer",
      color: tab === t.id ? "#f1f5f9" : "#64748b",
      padding: "5px 10px",
      fontSize: 12,
      fontWeight: 500
    }
  }, t.label))))), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 600,
      margin: "0 auto",
      padding: "20px 16px"
    }
  }, saved && /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 12,
      padding: "10px 14px",
      borderRadius: 8,
      background: "#d1fae5",
      color: "#065f46",
      fontSize: 13,
      fontWeight: 500
    }
  }, "✅ Bet saved!"), tab === "dashboard" && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      flexWrap: "wrap",
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    label: "Total Staked",
    value: `$${bets.reduce((s, b) => s + b.stake, 0).toFixed(2)}`,
    sub: `${bets.length} bet${bets.length !== 1 ? "s" : ""} placed`
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "Net P&L",
    value: `${netPnL >= 0 ? "+" : ""}$${Math.abs(netPnL).toFixed(2)}`,
    sub: `${settled.length} settled`,
    accent: settled.length ? pnlColor : "#9ca3af"
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "Win Rate",
    value: winRate === "—" ? "—" : `${winRate}%`,
    sub: `${wins.length}W · ${losses.length}L`
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "ROI",
    value: `${roi}%`,
    sub: "on settled bets",
    accent: Number(roi) >= 0 ? "#10b981" : "#ef4444"
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "Pending",
    value: pending.length,
    sub: `$${pending.reduce((s, b) => s + b.stake, 0).toFixed(2)} at risk`,
    accent: "#f59e0b"
  })), bets.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#fff",
      border: "2px dashed #e5e7eb",
      borderRadius: 14,
      padding: "40px 20px",
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 36,
      marginBottom: 10
    }
  }, "⚽"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600,
      marginBottom: 6
    }
  }, "No bets yet"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "#6b7280",
      fontSize: 13,
      marginBottom: 16
    }
  }, "Scan a slip or tap \"+ Add\" to get started"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setTab("scan"),
    style: {
      background: "#6366f1",
      color: "#fff",
      border: "none",
      borderRadius: 8,
      padding: "9px 18px",
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer"
    }
  }, "📷 Scan Slip"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setTab("add"),
    style: {
      background: "#0f172a",
      color: "#fff",
      border: "none",
      borderRadius: 8,
      padding: "9px 18px",
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer"
    }
  }, "+ Add Manually"))) : /*#__PURE__*/React.createElement("div", null, pending.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: "#374151",
      marginBottom: 10
    }
  }, "⏳ Pending Bets"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, pending.map(b => {
    const isParlay = b.betCategory === "Parlay";
    const label = isParlay ? b.parlayLabel || `${(b.legs || []).length}-leg Parlay` : b.match;
    const sublabel = isParlay ? (b.legs || []).map(l => l.match).join(" · ") : `${b.betType}${b.selection ? " · " + b.selection : ""}`;
    return /*#__PURE__*/React.createElement("div", {
      key: b.id,
      style: {
        background: "#fff",
        border: "1px solid #fde68a",
        borderRadius: 10,
        padding: "10px 14px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginBottom: 2
      }
    }, isParlay && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10,
        fontWeight: 700,
        background: "#ede9fe",
        color: "#7c3aed",
        borderRadius: 4,
        padding: "1px 5px",
        flexShrink: 0
      }
    }, "PARLAY"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 600,
        fontSize: 13,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      }
    }, label)), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: "#9ca3af",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      }
    }, b.date, sublabel ? " · " + sublabel : "")), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "right",
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        fontWeight: 600,
        color: "#111827"
      }
    }, "$", b.stake.toFixed(2)), (isParlay ? b.combinedOdds : b.odds) && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: "#6b7280"
      }
    }, "@ ", isParlay ? b.combinedOdds : b.odds), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: "#10b981",
        marginTop: 1
      }
    }, "pot. $", ((isParlay ? b.combinedOdds : b.odds) ? Math.round(b.stake * (isParlay ? b.combinedOdds : b.odds) * 100) / 100 : b.payout || 0).toFixed(2))));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      borderTop: "1px solid #e5e7eb",
      paddingTop: 8,
      display: "flex",
      justifyContent: "space-between",
      fontSize: 12,
      color: "#6b7280"
    }
  }, /*#__PURE__*/React.createElement("span", null, pending.length, " bet", pending.length !== 1 ? "s" : "", " pending"), /*#__PURE__*/React.createElement("span", null, "Total at risk: ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: "#111827"
    }
  }, "$", pending.reduce((s, b) => s + b.stake, 0).toFixed(2))))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: "#374151",
      marginBottom: 10
    }
  }, "Recent Bets"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, bets.slice(0, 5).map(b => {
    const pnl = b.status === "Win" ? b.payout - b.stake : b.status === "Loss" ? -b.stake : null;
    return /*#__PURE__*/React.createElement("div", {
      key: b.id,
      style: {
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        padding: "12px 14px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 600,
        fontSize: 13,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      }
    }, b.match), /*#__PURE__*/React.createElement("div", {
      style: {
        color: "#9ca3af",
        fontSize: 11,
        marginTop: 2
      }
    }, b.date, " · ", b.betType, b.selection ? ` · ${b.selection}` : "")), /*#__PURE__*/React.createElement(StatusBadge, {
      status: b.status
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 16,
        marginTop: 8,
        fontSize: 12
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "#6b7280"
      }
    }, "Stake ", /*#__PURE__*/React.createElement("strong", {
      style: {
        color: "#111827"
      }
    }, "$", b.stake.toFixed(2))), b.odds && /*#__PURE__*/React.createElement("span", {
      style: {
        color: "#6b7280"
      }
    }, "Odds ", /*#__PURE__*/React.createElement("strong", {
      style: {
        color: "#111827"
      }
    }, b.odds)), pnl !== null && /*#__PURE__*/React.createElement("span", {
      style: {
        color: pnl >= 0 ? "#10b981" : "#ef4444",
        fontWeight: 700
      }
    }, pnl >= 0 ? "+" : "", "$", pnl.toFixed(2))));
  })), bets.length > 5 && /*#__PURE__*/React.createElement("button", {
    onClick: () => setTab("history"),
    style: {
      marginTop: 10,
      background: "none",
      border: "none",
      color: "#6366f1",
      fontSize: 13,
      cursor: "pointer",
      fontWeight: 500
    }
  }, "View all ", bets.length, " bets →"))), tab === "scan" && /*#__PURE__*/React.createElement(ScanTab, {
    onBetsScanned: handleBetsScanned,
    setTab: setTab,
    existingBets: bets
  }), tab === "add" && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 700,
      marginBottom: 4
    }
  }, "Log a Bet"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "#6b7280",
      marginBottom: 20
    }
  }, "Fill in your bet details from your Singapore Pools slip."), /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      padding: "18px 16px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      display: "block",
      fontSize: 12,
      fontWeight: 600,
      color: "#374151",
      marginBottom: 6
    }
  }, "BET TYPE"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      background: "#f3f4f6",
      borderRadius: 8,
      padding: 3,
      gap: 3
    }
  }, ["Single", "Parlay"].map(cat => /*#__PURE__*/React.createElement("button", {
    key: cat,
    onClick: () => setForm(f => ({
      ...f,
      betCategory: cat,
      parlayLegs: cat === "Parlay" ? f.parlayLegs || [{
        match: "",
        selection: "",
        betType: "1X2",
        odds: ""
      }] : f.parlayLegs
    })),
    style: {
      flex: 1,
      padding: "7px",
      borderRadius: 6,
      border: "none",
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer",
      background: form.betCategory === cat ? "#fff" : "transparent",
      color: form.betCategory === cat ? "#111827" : "#6b7280",
      boxShadow: form.betCategory === cat ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
      transition: "all 0.15s"
    }
  }, cat === "Single" ? "⚽ Single" : "🔗 Parlay")))), form.betCategory === "Single" ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Field, {
    label: "Match",
    value: form.match,
    onChange: setField("match"),
    placeholder: "e.g. Man Utd vs Liverpool",
    required: true
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Date",
    value: form.date,
    onChange: setField("date"),
    placeholder: todayStr()
  }), /*#__PURE__*/React.createElement(DropDown, {
    label: "Bet Type",
    value: form.betType,
    onChange: setField("betType"),
    options: BET_TYPES
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Selection",
    value: form.selection,
    onChange: setField("selection"),
    placeholder: "e.g. Man Utd, Over 2.5, Home Win"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Odds",
    value: form.odds,
    onChange: setField("odds"),
    type: "number",
    placeholder: "e.g. 1.85"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Stake ($)",
    value: form.stake,
    onChange: setField("stake"),
    type: "number",
    placeholder: "e.g. 10.00",
    required: true
  })))) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Field, {
    label: "Parlay Name (optional)",
    value: form.parlayLabel,
    onChange: setField("parlayLabel"),
    placeholder: "e.g. Weekend Combo"
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Date",
    value: form.date,
    onChange: setField("date"),
    placeholder: todayStr()
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      display: "block",
      fontSize: 12,
      fontWeight: 600,
      color: "#374151",
      marginBottom: 8
    }
  }, "LEGS ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "#ef4444"
    }
  }, "*")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, (form.parlayLegs || [{
    match: "",
    selection: "",
    betType: "1X2",
    odds: ""
  }]).map((leg, li) => /*#__PURE__*/React.createElement("div", {
    key: li,
    style: {
      background: "#faf5ff",
      border: "1px solid #e9d5ff",
      borderRadius: 9,
      padding: "10px 12px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      color: "#7c3aed"
    }
  }, "LEG ", li + 1), (form.parlayLegs || []).length > 1 && /*#__PURE__*/React.createElement("button", {
    onClick: () => setForm(f => ({
      ...f,
      parlayLegs: f.parlayLegs.filter((_, i) => i !== li)
    })),
    style: {
      background: "none",
      border: "none",
      color: "#9ca3af",
      cursor: "pointer",
      fontSize: 14
    }
  }, "✕")), /*#__PURE__*/React.createElement(Field, {
    label: "Match",
    value: leg.match,
    onChange: v => setForm(f => ({
      ...f,
      parlayLegs: f.parlayLegs.map((l, i) => i === li ? {
        ...l,
        match: v
      } : l)
    })),
    placeholder: "e.g. Man Utd vs Liverpool"
  }), /*#__PURE__*/React.createElement(DropDown, {
    label: "Bet Type",
    value: leg.betType,
    onChange: v => setForm(f => ({
      ...f,
      parlayLegs: f.parlayLegs.map((l, i) => i === li ? {
        ...l,
        betType: v
      } : l)
    })),
    options: BET_TYPES
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Selection",
    value: leg.selection,
    onChange: v => setForm(f => ({
      ...f,
      parlayLegs: f.parlayLegs.map((l, i) => i === li ? {
        ...l,
        selection: v
      } : l)
    })),
    placeholder: "e.g. Home Win"
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Odds",
    value: leg.odds,
    onChange: v => setForm(f => ({
      ...f,
      parlayLegs: f.parlayLegs.map((l, i) => i === li ? {
        ...l,
        odds: v
      } : l)
    })),
    type: "number",
    placeholder: "e.g. 1.85"
  })))), /*#__PURE__*/React.createElement("button", {
    onClick: () => setForm(f => ({
      ...f,
      parlayLegs: [...(f.parlayLegs || []), {
        match: "",
        selection: "",
        betType: "1X2",
        odds: ""
      }]
    })),
    style: {
      marginTop: 8,
      width: "100%",
      background: "#fff",
      border: "1px dashed #c4b5fd",
      color: "#7c3aed",
      borderRadius: 8,
      padding: "8px",
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer"
    }
  }, "+ Add Leg")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Combined Odds",
    value: form.odds,
    onChange: setField("odds"),
    type: "number",
    placeholder: "e.g. 5.40"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Stake ($)",
    value: form.stake,
    onChange: setField("stake"),
    type: "number",
    placeholder: "e.g. 10.00",
    required: true
  })))), /*#__PURE__*/React.createElement(DropDown, {
    label: "Status",
    value: form.status,
    onChange: setField("status"),
    options: ["Pending", "Win", "Loss", "Void"]
  }), form.status === "Win" && /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 5
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      color: "#374151"
    }
  }, "Payout ($)"), Number(form.stake) > 0 && Number(form.odds) > 0 && !form.payout && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "#6366f1",
      fontWeight: 500
    }
  }, "Auto-calculated")), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: form.payout || (Number(form.stake) > 0 && Number(form.odds) > 0 ? Math.round(Number(form.stake) * Number(form.odds) * 100) / 100 : ""),
    onChange: e => setField("payout")(e.target.value),
    placeholder: "e.g. 18.50",
    style: {
      width: "100%",
      padding: "10px 12px",
      border: "1px solid " + (!form.payout && Number(form.stake) > 0 && Number(form.odds) > 0 ? "#a5b4fc" : "#d1d5db"),
      borderRadius: 8,
      fontSize: 14,
      background: !form.payout && Number(form.stake) > 0 && Number(form.odds) > 0 ? "#eef2ff" : "#fff",
      color: "#111827"
    }
  }), (form.payout || Number(form.stake) > 0 && Number(form.odds) > 0) && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "#10b981",
      marginTop: 4,
      fontWeight: 600
    }
  }, "Net profit: +$", (Number(form.payout || Math.round(Number(form.stake) * Number(form.odds) * 100) / 100) - Number(form.stake)).toFixed(2))), formError && /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#fee2e2",
      color: "#991b1b",
      borderRadius: 8,
      padding: "9px 12px",
      fontSize: 13,
      marginBottom: 14
    }
  }, "⚠️ ", formError), /*#__PURE__*/React.createElement("button", {
    onClick: submitBet,
    style: {
      width: "100%",
      background: "#0f172a",
      color: "#fff",
      border: "none",
      borderRadius: 8,
      padding: "12px",
      fontSize: 14,
      fontWeight: 600,
      cursor: "pointer",
      marginTop: 4
    }
  }, "Save Bet"))), tab === "history" && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 700
    }
  }, "History"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => exportBets(bets),
    disabled: bets.length === 0,
    style: {
      background: "#fff",
      border: "1px solid #d1d5db",
      color: bets.length === 0 ? "#d1d5db" : "#374151",
      borderRadius: 7,
      padding: "6px 10px",
      fontSize: 12,
      fontWeight: 500,
      cursor: bets.length === 0 ? "not-allowed" : "pointer",
      display: "flex",
      alignItems: "center",
      gap: 4
    }
  }, "⬇️ Export"), /*#__PURE__*/React.createElement("button", {
    onClick: () => importInputRef.current.click(),
    style: {
      background: "#fff",
      border: "1px solid #d1d5db",
      color: "#374151",
      borderRadius: 7,
      padding: "6px 10px",
      fontSize: 12,
      fontWeight: 500,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: 4
    }
  }, "⬆️ Import"), /*#__PURE__*/React.createElement("input", {
    ref: importInputRef,
    type: "file",
    accept: "application/json,.json",
    style: {
      display: "none"
    },
    onChange: e => {
      handleImportFile(e.target.files[0]);
      e.target.value = "";
    }
  }))), importMsg && /*#__PURE__*/React.createElement("div", {
    style: {
      background: importMsg.type === "success" ? "#d1fae5" : "#fee2e2",
      color: importMsg.type === "success" ? "#065f46" : "#991b1b",
      borderRadius: 8,
      padding: "10px 14px",
      fontSize: 13,
      marginBottom: 12,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", null, importMsg.type === "success" ? "✅" : "⚠️", " ", importMsg.text), /*#__PURE__*/React.createElement("button", {
    onClick: () => setImportMsg(null),
    style: {
      background: "none",
      border: "none",
      color: "inherit",
      cursor: "pointer",
      fontSize: 14,
      opacity: 0.7
    }
  }, "✕")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      background: "#f3f4f6",
      borderRadius: 10,
      padding: 3,
      gap: 3,
      marginBottom: 12
    }
  }, [["Singles", "⚽"], ["Parlays", "🔗"]].map(([view, icon]) => {
    const count = view === "Singles" ? bets.filter(b => !b.betCategory || b.betCategory === "Single").length : bets.filter(b => b.betCategory === "Parlay").length;
    return /*#__PURE__*/React.createElement("button", {
      key: view,
      onClick: () => setHistoryView(view),
      style: {
        flex: 1,
        padding: "8px",
        borderRadius: 7,
        border: "none",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        background: historyView === view ? "#fff" : "transparent",
        color: historyView === view ? "#111827" : "#6b7280",
        boxShadow: historyView === view ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
        transition: "all 0.15s"
      }
    }, icon, " ", view, " ", /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        fontWeight: 400,
        color: historyView === view ? "#6b7280" : "#9ca3af"
      }
    }, "(", count, ")"));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 4,
      flexWrap: "wrap",
      marginBottom: 14
    }
  }, ["All", "Win", "Loss", "Pending", "Void"].map(s => /*#__PURE__*/React.createElement("button", {
    key: s,
    onClick: () => setFilterStatus(s),
    style: {
      background: filterStatus === s ? "#0f172a" : "#fff",
      color: filterStatus === s ? "#fff" : "#374151",
      border: "1px solid #e5e7eb",
      borderRadius: 20,
      padding: "4px 10px",
      fontSize: 11,
      fontWeight: 500,
      cursor: "pointer"
    }
  }, s))), (() => {
    const allForView = historyView === "Singles" ? filteredBets.filter(b => !b.betCategory || b.betCategory === "Single") : filteredBets.filter(b => b.betCategory === "Parlay");
    const BetCard = b => {
      const isParlay = b.betCategory === "Parlay";
      const pnl = b.status === "Win" ? b.payout - b.stake : b.status === "Loss" ? -b.stake : null;
      const isOpen = expandedId === b.id;
      const draftStake = getEdit(b.id, "stake", String(b.stake));
      const draftOdds = getEdit(b.id, "odds", (isParlay ? b.combinedOdds : b.odds) != null ? String(isParlay ? b.combinedOdds : b.odds) : "");
      const draftPayout = getEdit(b.id, "payout", b.payout > 0 ? String(b.payout) : "");

      // Auto-calculate payout when stake and odds are both filled
      const autoPayout = Number(draftStake) > 0 && Number(draftOdds) > 0 ? Math.round(Number(draftStake) * Number(draftOdds) * 100) / 100 : null;
      const displayPayout = draftPayout !== "" ? draftPayout : autoPayout !== null ? String(autoPayout) : "";
      const netProfit = Number(displayPayout) > 0 ? Number(displayPayout) - Number(draftStake) : null;
      const saveEdits = newStatus => {
        const oddsField = isParlay ? "combinedOdds" : "odds";
        const resolvedStatus = newStatus ?? b.status;

        // When parlay is settled, update leg statuses too
        let updatedLegs = b.legs;
        if (isParlay && b.legs && resolvedStatus !== "Pending") {
          updatedLegs = b.legs.map(l => ({
            ...l,
            legStatus: resolvedStatus === "Win" ? "Win" : resolvedStatus === "Void" ? "Void" : "Settled" // Loss or any other settled state → grey Settled
          }));
        }
        // If switching back to Pending, reset all legs to Pending too
        if (isParlay && b.legs && resolvedStatus === "Pending") {
          updatedLegs = b.legs.map(l => ({
            ...l,
            legStatus: "Pending"
          }));
        }
        updateBet(b.id, {
          status: resolvedStatus,
          stake: Number(draftStake) || b.stake,
          [oddsField]: draftOdds ? Number(draftOdds) : null,
          payout: Number(displayPayout) || 0,
          ...(!isParlay && {
            match: getEdit(b.id, "match", b.match)
          }),
          ...(isParlay && {
            legs: updatedLegs
          })
        });
        clearEdits(b.id);
      };
      const legStatusColor = {
        Win: "#10b981",
        Loss: "#ef4444",
        Void: "#9ca3af",
        Pending: "#f59e0b",
        Settled: "#9ca3af"
      };
      return /*#__PURE__*/React.createElement("div", {
        key: b.id,
        style: {
          background: "#fff",
          border: isParlay ? "1px solid #c4b5fd" : "1px solid #e5e7eb",
          borderRadius: 10,
          overflow: "hidden"
        }
      }, /*#__PURE__*/React.createElement("div", {
        onClick: () => {
          setExpandedId(isOpen ? null : b.id);
          if (isOpen) {
            clearEdits(b.id);
            setDeleteConfirmId(null);
          }
        },
        style: {
          padding: "12px 14px",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1,
          minWidth: 0
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 2
        }
      }, isParlay && /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 10,
          fontWeight: 700,
          background: "#ede9fe",
          color: "#7c3aed",
          borderRadius: 4,
          padding: "1px 6px",
          flexShrink: 0
        }
      }, "🔗 PARLAY"), /*#__PURE__*/React.createElement("div", {
        style: {
          fontWeight: 600,
          fontSize: 13,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }
      }, isParlay ? b.parlayLabel || `${(b.legs || []).length}-leg Parlay` : b.match)), /*#__PURE__*/React.createElement("div", {
        style: {
          color: "#9ca3af",
          fontSize: 11,
          marginTop: 1
        }
      }, b.date, !isParlay ? ` · ${b.betType}` : "")), /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 0
        }
      }, pnl !== null && /*#__PURE__*/React.createElement("span", {
        style: {
          fontWeight: 700,
          fontSize: 13,
          color: pnl >= 0 ? "#10b981" : "#ef4444"
        }
      }, pnl >= 0 ? "+" : "", "$", pnl.toFixed(2)), /*#__PURE__*/React.createElement(StatusBadge, {
        status: b.status
      }))), isParlay && (b.legs || []).length > 0 && /*#__PURE__*/React.createElement("div", {
        style: {
          background: "#faf5ff",
          borderTop: "1px solid #ede9fe",
          borderBottom: isOpen ? "1px solid #ede9fe" : "none"
        }
      }, (b.legs || []).map((leg, li) => /*#__PURE__*/React.createElement("div", {
        key: li,
        style: {
          padding: "8px 14px",
          borderBottom: li < b.legs.length - 1 ? "1px solid #ede9fe" : "none",
          fontSize: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1,
          minWidth: 0
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontWeight: 600,
          color: "#111827",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }
      }, leg.match), /*#__PURE__*/React.createElement("div", {
        style: {
          color: "#6b7280",
          marginTop: 2,
          display: "flex",
          gap: 10,
          flexWrap: "wrap"
        }
      }, /*#__PURE__*/React.createElement("span", null, "☑️ ", leg.selection), /*#__PURE__*/React.createElement("span", null, "🎯 ", leg.betType), leg.odds && /*#__PURE__*/React.createElement("span", null, "@ ", leg.odds))), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 11,
          fontWeight: 700,
          color: legStatusColor[leg.legStatus || "Pending"],
          flexShrink: 0
        }
      }, leg.legStatus || "Pending")))), isOpen && /*#__PURE__*/React.createElement("div", {
        style: {
          borderTop: "1px solid #f3f4f6",
          padding: "12px 14px",
          background: "#f9fafb",
          display: "flex",
          flexDirection: "column",
          gap: 10
        }
      }, !isParlay && b.selection && /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 12,
          color: "#6b7280"
        }
      }, "☑️ ", b.selection), !isParlay && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 11,
          fontWeight: 600,
          color: "#6b7280",
          marginBottom: 4
        }
      }, "MATCH NAME"), /*#__PURE__*/React.createElement("input", {
        type: "text",
        value: getEdit(b.id, "match", b.match || ""),
        onChange: e => setEdit(b.id, "match", e.target.value),
        onBlur: () => saveEdits(),
        style: {
          width: "100%",
          padding: "7px 10px",
          border: "1px solid #d1d5db",
          borderRadius: 7,
          fontSize: 13,
          background: "#fff"
        }
      })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 11,
          fontWeight: 600,
          color: "#6b7280",
          marginBottom: 5
        }
      }, "RESULT"), /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          gap: 6,
          flexWrap: "wrap"
        }
      }, ["Pending", "Win", "Loss", "Void"].map(s => {
        const sc = STATUS_COLORS[s];
        const active = b.status === s;
        return /*#__PURE__*/React.createElement("button", {
          key: s,
          onClick: () => saveEdits(s),
          style: {
            padding: "5px 12px",
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            border: active ? "2px solid " + sc.dot : "2px solid #e5e7eb",
            background: active ? sc.bg : "#fff",
            color: active ? sc.text : "#6b7280",
            transition: "all 0.15s"
          }
        }, s);
      }))), /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          gap: 8
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 11,
          fontWeight: 600,
          color: "#6b7280",
          marginBottom: 4
        }
      }, "STAKE ($)"), /*#__PURE__*/React.createElement("input", {
        type: "number",
        value: draftStake,
        onChange: e => setEdit(b.id, "stake", e.target.value),
        onBlur: () => saveEdits(),
        style: {
          width: "100%",
          padding: "7px 10px",
          border: "1px solid #d1d5db",
          borderRadius: 7,
          fontSize: 13,
          background: "#fff"
        }
      })), /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 11,
          fontWeight: 600,
          color: "#6b7280",
          marginBottom: 4
        }
      }, isParlay ? "COMBINED ODDS" : "ODDS"), /*#__PURE__*/React.createElement("input", {
        type: "number",
        value: draftOdds,
        placeholder: "—",
        onChange: e => setEdit(b.id, "odds", e.target.value),
        onBlur: () => saveEdits(),
        style: {
          width: "100%",
          padding: "7px 10px",
          border: "1px solid #d1d5db",
          borderRadius: 7,
          fontSize: 13,
          background: "#fff"
        }
      }))), b.status === "Win" && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 4
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 11,
          fontWeight: 600,
          color: "#6b7280"
        }
      }, "PAYOUT ($)"), autoPayout !== null && draftPayout === "" && /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 10,
          color: "#6366f1",
          fontWeight: 500
        }
      }, "Auto-calculated")), /*#__PURE__*/React.createElement("input", {
        type: "number",
        value: displayPayout,
        onChange: e => setEdit(b.id, "payout", e.target.value),
        onBlur: () => saveEdits(),
        placeholder: "e.g. 18.50",
        style: {
          width: "100%",
          padding: "7px 10px",
          border: autoPayout !== null && draftPayout === "" ? "1px solid #a5b4fc" : "1px solid #d1d5db",
          borderRadius: 7,
          fontSize: 13,
          background: autoPayout !== null && draftPayout === "" ? "#eef2ff" : "#fff"
        }
      }), netProfit !== null && /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 11,
          color: "#10b981",
          marginTop: 4,
          fontWeight: 600
        }
      }, "Net profit: +$", netProfit.toFixed(2))), /*#__PURE__*/React.createElement("div", {
        style: {
          marginTop: 2
        }
      }, deleteConfirmId === b.id ? /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          gap: 8,
          alignItems: "center",
          background: "#fef2f2",
          border: "1px solid #fca5a5",
          borderRadius: 7,
          padding: "8px 10px"
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 12,
          color: "#991b1b",
          flex: 1
        }
      }, "Delete this bet permanently?"), /*#__PURE__*/React.createElement("button", {
        onClick: () => setDeleteConfirmId(null),
        style: {
          background: "#fff",
          border: "1px solid #d1d5db",
          color: "#374151",
          borderRadius: 6,
          padding: "5px 10px",
          fontSize: 12,
          cursor: "pointer"
        }
      }, "Cancel"), /*#__PURE__*/React.createElement("button", {
        onClick: () => {
          deleteBet(b.id);
          setDeleteConfirmId(null);
        },
        style: {
          background: "#dc2626",
          border: "none",
          color: "#fff",
          borderRadius: 6,
          padding: "5px 10px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer"
        }
      }, "Delete")) : /*#__PURE__*/React.createElement("button", {
        onClick: () => setDeleteConfirmId(b.id),
        style: {
          background: "none",
          border: "1px solid #fca5a5",
          color: "#dc2626",
          borderRadius: 7,
          padding: "8px 14px",
          fontSize: 12,
          cursor: "pointer",
          fontWeight: 500
        }
      }, "Delete"))));
    };
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 8
      }
    }, allForView.length === 0 ? /*#__PURE__*/React.createElement("div", {
      style: {
        background: "#fff",
        border: "1px dashed #e5e7eb",
        borderRadius: 10,
        padding: "24px",
        textAlign: "center",
        color: "#9ca3af",
        fontSize: 13
      }
    }, "No ", historyView.toLowerCase(), " ", filterStatus !== "All" ? `with status "${filterStatus}"` : "yet") : allForView.map(b => BetCard(b)), bets.length > 0 && /*#__PURE__*/React.createElement("button", {
      onClick: () => {
        if (window.confirm("Clear all bets? This cannot be undone.")) {
          setBets([]);
          saveBets([]);
        }
      },
      style: {
        marginTop: 8,
        background: "none",
        border: "1px solid #fca5a5",
        color: "#dc2626",
        borderRadius: 8,
        padding: "7px 14px",
        fontSize: 12,
        cursor: "pointer",
        fontWeight: 500,
        alignSelf: "flex-start"
      }
    }, "Clear all"));
  })())));
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(App, null));
});
