import { useState, useCallback } from "react";

const STORAGE_KEY = "sgpools-bets-v2";

const loadBets = async () => {
  try {
    const r = await window.storage.get(STORAGE_KEY);
    return r ? JSON.parse(r.value) : [];
  } catch { return []; }
};
const saveBets = async (bets) => {
  try { await window.storage.set(STORAGE_KEY, JSON.stringify(bets)); } catch {}
};

const STATUS_COLORS = {
  Win:     { bg: "#d1fae5", text: "#065f46", dot: "#10b981" },
  Loss:    { bg: "#fee2e2", text: "#991b1b", dot: "#ef4444" },
  Void:    { bg: "#f3f4f6", text: "#374151", dot: "#9ca3af" },
  Pending: { bg: "#fef3c7", text: "#92400e", dot: "#f59e0b" },
};

const BET_TYPES = [
  "1X2",
  "Halftime 1X2",
  "Halftime-Fulltime",
  "Asian Handicap",
  "Halftime Asian Handicap",
  "1/2 Goal",
  "Over/Under 2.5",
  "Total Goals",
  "Total Goals Odd/Even",
  "Halftime Total Goals",
  "Halftime Total Goals Odd/Even",
  "Both Teams to Score",
  "Halftime Both Teams to Score",
  "Pick the Score",
  "Team to Score First Goal",
  "Halftime Team to Score First Goal",
  "1st Goal Scorer",
  "Which Half Has More Goals",
  "Halftime Points",
  "Double Chance",
  "Outright",
  "Other",
];

const EMPTY_FORM = { match: "", date: "", betType: "1X2", selection: "", odds: "", stake: "", payout: "", status: "Pending" };

function StatusBadge({ status }) {
  const sc = STATUS_COLORS[status] || STATUS_COLORS.Pending;
  return (
    <span style={{ background: sc.bg, color: sc.text, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: sc.dot, display: "inline-block" }} />
      {status}
    </span>
  );
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "14px 18px", flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: accent || "#111827", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Input({ label, value, onChange, type = "text", placeholder, required }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 5 }}>
        {label}{required && <span style={{ color: "#ef4444" }}> *</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", boxSizing: "border-box", padding: "10px 12px",
          border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14,
          outline: "none", background: "#fff", color: "#111827",
        }}
      />
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 5 }}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, background: "#fff", color: "#111827", outline: "none" }}
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

export default function App() {
  const [bets, setBets] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saved, setSaved] = useState(false);
  const [filterStatus, setFilterStatus] = useState("All");
  const [expandedId, setExpandedId] = useState(null);

  useState(() => {
    loadBets().then(b => { setBets(b); setLoaded(true); });
  });

  const setField = (k) => (v) => setForm(f => ({ ...f, [k]: v }));

  const todayStr = () => {
    const d = new Date();
    return d.toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" });
  };

  const submitBet = useCallback(() => {
    if (!form.match.trim()) { setFormError("Match is required"); return; }
    if (!form.stake || isNaN(Number(form.stake))) { setFormError("Enter a valid stake amount"); return; }
    setFormError("");

    const newBet = {
      id: Date.now() + Math.random(),
      match: form.match.trim(),
      date: form.date.trim() || todayStr(),
      betType: form.betType,
      selection: form.selection.trim(),
      odds: form.odds ? Number(form.odds) : null,
      stake: Number(form.stake),
      payout: form.payout ? Number(form.payout) : 0,
      status: form.status,
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

  const deleteBet = useCallback((id) => {
    setBets(prev => {
      const next = prev.filter(b => b.id !== id);
      saveBets(next);
      return next;
    });
  }, []);

  // Stats
  const settled = bets.filter(b => b.status === "Win" || b.status === "Loss");
  const wins = bets.filter(b => b.status === "Win");
  const losses = bets.filter(b => b.status === "Loss");
  const pending = bets.filter(b => b.status === "Pending");
  const totalStaked = settled.reduce((s, b) => s + b.stake, 0);
  const totalReturns = wins.reduce((s, b) => s + b.payout, 0);
  const netPnL = totalReturns - totalStaked;
  const roi = totalStaked > 0 ? ((netPnL / totalStaked) * 100).toFixed(1) : "0.0";
  const winRate = settled.length > 0 ? ((wins.length / settled.length) * 100).toFixed(0) : "—";
  const pnlColor = netPnL >= 0 ? "#10b981" : "#ef4444";

  const filteredBets = filterStatus === "All" ? bets : bets.filter(b => b.status === filterStatus);

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", minHeight: "100vh", background: "#f9fafb", color: "#111827" }}>
      {/* Header */}
      <div style={{ background: "#0f172a", padding: "0 16px", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 600, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 52 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>⚽</span>
            <span style={{ fontWeight: 700, fontSize: 14, color: "#f1f5f9" }}>SG Pools Tracker</span>
          </div>
          <div style={{ display: "flex", gap: 2 }}>
            {["dashboard", "add", "history"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? "#1e293b" : "none", border: "none", borderRadius: 6,
                cursor: "pointer", color: tab === t ? "#f1f5f9" : "#64748b",
                padding: "5px 11px", fontSize: 12, fontWeight: 500,
                textTransform: t === "add" ? "none" : "capitalize",
              }}>{t === "add" ? "+ Add" : t}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 16px" }}>

        {saved && (
          <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: "#d1fae5", color: "#065f46", fontSize: 13, fontWeight: 500 }}>
            ✅ Bet saved!
          </div>
        )}

        {/* DASHBOARD */}
        {tab === "dashboard" && (
          <div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
              <StatCard label="Net P&L" value={`${netPnL >= 0 ? "+" : ""}$${Math.abs(netPnL).toFixed(2)}`} sub={`${settled.length} settled`} accent={settled.length ? pnlColor : "#9ca3af"} />
              <StatCard label="Win Rate" value={winRate === "—" ? "—" : `${winRate}%`} sub={`${wins.length}W · ${losses.length}L`} />
              <StatCard label="ROI" value={`${roi}%`} sub="on settled bets" accent={Number(roi) >= 0 ? "#10b981" : "#ef4444"} />
              <StatCard label="Pending" value={pending.length} sub={`$${pending.reduce((s,b)=>s+b.stake,0).toFixed(2)} at risk`} accent="#f59e0b" />
            </div>

            {bets.length === 0 ? (
              <div style={{ background: "#fff", border: "2px dashed #e5e7eb", borderRadius: 14, padding: "40px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>⚽</div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>No bets yet</div>
                <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 16 }}>Tap "+ Add" to log your first bet</div>
                <button onClick={() => setTab("add")} style={{ background: "#0f172a", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  + Add Bet
                </button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 10 }}>Recent Bets</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {bets.slice(0, 5).map(b => {
                    const sc = STATUS_COLORS[b.status] || STATUS_COLORS.Pending;
                    const pnl = b.status === "Win" ? b.payout - b.stake : b.status === "Loss" ? -b.stake : null;
                    return (
                      <div key={b.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{b.match}</div>
                            <div style={{ color: "#9ca3af", fontSize: 11, marginTop: 2 }}>{b.date} · {b.betType}{b.selection ? ` · ${b.selection}` : ""}</div>
                          </div>
                          <StatusBadge status={b.status} />
                        </div>
                        <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12 }}>
                          <span style={{ color: "#6b7280" }}>Stake <strong style={{ color: "#111827" }}>${b.stake.toFixed(2)}</strong></span>
                          {b.odds && <span style={{ color: "#6b7280" }}>Odds <strong style={{ color: "#111827" }}>{b.odds}</strong></span>}
                          {pnl !== null && <span style={{ color: pnl >= 0 ? "#10b981" : "#ef4444", fontWeight: 700 }}>{pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {bets.length > 5 && (
                  <button onClick={() => setTab("history")} style={{ marginTop: 10, background: "none", border: "none", color: "#6366f1", fontSize: 13, cursor: "pointer", fontWeight: 500 }}>
                    View all {bets.length} bets →
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ADD BET */}
        {tab === "add" && (
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Log a Bet</div>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>Fill in your bet details from your Singapore Pools slip.</div>

            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "18px 16px" }}>
              <Input label="Match" value={form.match} onChange={setField("match")} placeholder="e.g. Man Utd vs Liverpool" required />
              <Input label="Date" value={form.date} onChange={setField("date")} placeholder={todayStr()} />
              <Select label="Bet Type" value={form.betType} onChange={setField("betType")} options={BET_TYPES} />
              <Input label="Selection" value={form.selection} onChange={setField("selection")} placeholder="e.g. Man Utd, Over 2.5, Home Win" />

              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <Input label="Odds" value={form.odds} onChange={setField("odds")} type="number" placeholder="e.g. 1.85" />
                </div>
                <div style={{ flex: 1 }}>
                  <Input label="Stake ($)" value={form.stake} onChange={setField("stake")} type="number" placeholder="e.g. 10.00" required />
                </div>
              </div>

              <Select label="Status" value={form.status} onChange={setField("status")} options={["Pending", "Win", "Loss", "Void"]} />

              {form.status === "Win" && (
                <Input label="Payout ($)" value={form.payout} onChange={setField("payout")} type="number" placeholder="Total payout received" />
              )}

              {formError && (
                <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "9px 12px", fontSize: 13, marginBottom: 14 }}>
                  ⚠️ {formError}
                </div>
              )}

              <button
                onClick={submitBet}
                style={{ width: "100%", background: "#0f172a", color: "#fff", border: "none", borderRadius: 8, padding: "12px", fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 4 }}
              >
                Save Bet
              </button>
            </div>
          </div>
        )}

        {/* HISTORY */}
        {tab === "history" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>History</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {["All", "Win", "Loss", "Pending", "Void"].map(s => (
                  <button key={s} onClick={() => setFilterStatus(s)} style={{
                    background: filterStatus === s ? "#0f172a" : "#fff",
                    color: filterStatus === s ? "#fff" : "#374151",
                    border: "1px solid #e5e7eb", borderRadius: 20,
                    padding: "4px 10px", fontSize: 11, fontWeight: 500, cursor: "pointer",
                  }}>{s}</button>
                ))}
              </div>
            </div>

            {filteredBets.length === 0 ? (
              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "32px 16px", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
                No {filterStatus !== "All" ? filterStatus.toLowerCase() + " " : ""}bets yet
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {filteredBets.map(b => {
                  const pnl = b.status === "Win" ? b.payout - b.stake : b.status === "Loss" ? -b.stake : null;
                  const isOpen = expandedId === b.id;
                  return (
                    <div key={b.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                      <div
                        onClick={() => setExpandedId(isOpen ? null : b.id)}
                        style={{ padding: "12px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{b.match}</div>
                          <div style={{ color: "#9ca3af", fontSize: 11, marginTop: 2 }}>{b.date} · {b.betType}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {pnl !== null && (
                            <span style={{ fontWeight: 700, fontSize: 13, color: pnl >= 0 ? "#10b981" : "#ef4444" }}>
                              {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                            </span>
                          )}
                          <StatusBadge status={b.status} />
                        </div>
                      </div>
                      {isOpen && (
                        <div style={{ borderTop: "1px solid #f3f4f6", padding: "10px 14px", background: "#f9fafb", fontSize: 12, display: "flex", flexDirection: "column", gap: 5 }}>
                          {b.selection && <div><span style={{ color: "#6b7280" }}>Selection: </span>{b.selection}</div>}
                          <div><span style={{ color: "#6b7280" }}>Stake: </span>${b.stake.toFixed(2)}{b.odds ? ` @ ${b.odds}` : ""}</div>
                          {b.status === "Win" && <div><span style={{ color: "#6b7280" }}>Payout: </span>${b.payout.toFixed(2)}</div>}
                          <button
                            onClick={() => deleteBet(b.id)}
                            style={{ marginTop: 6, background: "none", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer", alignSelf: "flex-start" }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {bets.length > 0 && (
              <button
                onClick={() => { if (window.confirm("Clear all bets?")) { setBets([]); saveBets([]); } }}
                style={{ marginTop: 16, background: "none", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: 8, padding: "7px 14px", fontSize: 12, cursor: "pointer", fontWeight: 500 }}
              >
                Clear all
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
