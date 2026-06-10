import { useState } from "react";

const SEMI = ["♠", "♥", "♦", "♣"];
const SEMI_COLORS = ["#2c2c2c", "#8B1A1A", "#C9A84C", "#1B4332"];
const EURO_PER_PUNTO = 0.5;

const PALETTE = {
  feltro: "#1B4332", feltroLight: "#2D6A4F",
  oro: "#C9A84C", oroLight: "#E8C96A",
  rosso: "#8B1A1A", rossoLight: "#C0392B",
  carta: "#F5EDD6", cartaScura: "#E8D9B8",
  inchiostro: "#1a1a1a",
};

function calcolaPuntiBase(cifra) {
  if (cifra >= 81 && cifra <= 90)   return { chiamante: 3,  compagno: 1, avversario: 1 };
  if (cifra >= 91 && cifra <= 100)  return { chiamante: 6,  compagno: 2, avversario: 2 };
  if (cifra >= 101 && cifra <= 117) return { chiamante: 9,  compagno: 3, avversario: 3 };
  if (cifra === 118)                return { chiamante: 12, compagno: 4, avversario: 4 };
  return { chiamante: 0, compagno: 0, avversario: 0 };
}

function calcolaDelta(players, chiamataPlayerId, compagnoId, vince, cappotto, cifra) {
  const base = calcolaPuntiBase(cifra);
  const mult = (cappotto ? 2 : 1) * (vince ? 1 : -1);
  const delta = {};
  const isSolo = cifra === 118;
  players.forEach(p => {
    if (p.id === chiamataPlayerId)
      delta[p.id] = mult * (isSolo ? base.chiamante + base.compagno : base.chiamante);
    else if (!isSolo && p.id === compagnoId)
      delta[p.id] = mult * base.compagno;
    else
      delta[p.id] = -mult * base.avversario;
  });
  return delta;
}

function calcolaStats(players, rounds) {
  const stats = {};
  players.forEach(p => {
    stats[p.id] = {
      vinte: 0, perse: 0,
      chiamate: 0, chiamateVinte: 0, chiamatePerse: 0,
      compagno: 0, compagnoVinto: 0, compagnoPerse: 0,
      puntiTotali: 0,
    };
  });
  rounds.forEach(r => {
    players.forEach(p => {
      const d = r.delta?.[p.id] ?? 0;
      stats[p.id].puntiTotali += d;
      if (d > 0) stats[p.id].vinte++;
      else if (d < 0) stats[p.id].perse++;
      if (p.id === r.chiamanteId) {
        stats[p.id].chiamate++;
        if (r.vince) stats[p.id].chiamateVinte++;
        else stats[p.id].chiamatePerse++;
      }
      if (p.id === r.compagnoId) {
        stats[p.id].compagno++;
        if (r.vince) stats[p.id].compagnoVinto++;
        else stats[p.id].compagnoPerse++;
      }
    });
  });
  return stats;
}

const initialState = {
  players: [], rounds: [], gameMode: "6",
  gameStarted: false, chiamataConfirmed: false, chiamata: null,
};

function SeedDecoration({ opacity = 0.10 }) {
  const pos = [
    { top: "8%", left: "6%", rot: 0 }, { top: "15%", left: "80%", rot: 45 },
    { top: "40%", left: "3%", rot: 90 }, { top: "55%", left: "88%", rot: 135 },
    { top: "72%", left: "12%", rot: 180 }, { top: "80%", left: "70%", rot: 225 },
    { top: "30%", left: "50%", rot: 270 }, { top: "90%", left: "40%", rot: 315 },
  ];
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
      {pos.map((p, i) => (
        <span key={i} style={{ position: "absolute", fontSize: 28 + (i % 3) * 8, opacity,
          color: SEMI_COLORS[i % 4], top: p.top, left: p.left,
          transform: `rotate(${p.rot}deg)`, userSelect: "none" }}>{SEMI[i % 4]}</span>
      ))}
    </div>
  );
}

function btn(bg, color, extra = {}) {
  return {
    background: bg, color, border: "none", borderRadius: 8,
    padding: "8px 14px", fontSize: 13, fontWeight: 700,
    cursor: "pointer", fontFamily: "Georgia, serif",
    boxShadow: "0 2px 6px rgba(0,0,0,0.18)", transition: "all 0.15s", ...extra,
  };
}

function StatPill({ label, value, color = PALETTE.inchiostro, bg = "rgba(0,0,0,0.06)" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
      background: bg, borderRadius: 8, padding: "5px 10px", minWidth: 52 }}>
      <span style={{ fontSize: 15, fontWeight: 900, color, lineHeight: 1.1 }}>{value}</span>
      <span style={{ fontSize: 9, color: "#888", letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>{label}</span>
    </div>
  );
}

function PlayerCard({ player, rank, stats, onEditName }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(player.name);
  const rankEmoji = ["👑", "🥈", "🥉"];
  const s = stats || { vinte: 0, perse: 0, chiamate: 0, compagno: 0, puntiTotali: 0 };
  const euro = (s.puntiTotali * EURO_PER_PUNTO).toFixed(2);
  const euroPos = s.puntiTotali >= 0;

  const handleNameSave = () => {
    if (name.trim()) { onEditName(name.trim()); setEditing(false); }
  };

  return (
    <div style={{
      background: `linear-gradient(135deg, ${PALETTE.carta} 0%, ${PALETTE.cartaScura} 100%)`,
      borderRadius: 14, padding: "14px 16px", position: "relative",
      boxShadow: "0 4px 16px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.6)",
      border: `2px solid ${PALETTE.oroLight}`, overflow: "hidden",
      flex: "1 1 200px", minWidth: 190, maxWidth: 260,
    }}>
      {rank < 3 && <div style={{ position: "absolute", top: 8, right: 10, fontSize: 19 }}>{rankEmoji[rank]}</div>}
      <div style={{ position: "absolute", top: 5, left: 7, opacity: 0.12, fontSize: 26, color: PALETTE.rosso }}>{SEMI[rank % 4]}</div>
      <div style={{ marginBottom: 8, paddingTop: 1 }}>
        {editing ? (
          <div style={{ display: "flex", gap: 5 }}>
            <input autoFocus value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleNameSave()}
              style={{ fontSize: 14, fontWeight: 700, padding: "3px 7px", border: `2px solid ${PALETTE.oro}`,
                borderRadius: 6, background: "rgba(255,255,255,0.7)", color: PALETTE.inchiostro, flex: 1, fontFamily: "Georgia, serif" }} />
            <button onClick={handleNameSave} style={{ background: PALETTE.feltro, color: "#fff", border: "none", borderRadius: 5, padding: "3px 9px", cursor: "pointer", fontWeight: 700 }}>✓</button>
          </div>
        ) : (
          <div onClick={() => setEditing(true)} title="Rinomina"
            style={{ fontSize: 15, fontWeight: 700, color: PALETTE.inchiostro, cursor: "pointer",
              fontFamily: "Georgia, serif", paddingLeft: 24, whiteSpace: "nowrap",
              overflow: "hidden", textOverflow: "ellipsis" }}>
            {player.name}
          </div>
        )}
      </div>
      <div style={{ fontSize: 44, fontWeight: 900, color: s.puntiTotali < 0 ? PALETTE.rosso : PALETTE.feltro,
        lineHeight: 1, textAlign: "center", marginBottom: 4,
        fontFamily: "Georgia, serif", textShadow: "1px 2px 0 rgba(0,0,0,0.08)" }}>
        {s.puntiTotali > 0 ? `+${s.puntiTotali}` : s.puntiTotali}
      </div>
      <div style={{ textAlign: "center", marginBottom: 12,
        fontSize: 15, fontWeight: 800, color: euroPos ? PALETTE.feltroLight : PALETTE.rossoLight,
        fontFamily: "monospace" }}>
        {euroPos ? "+" : ""}{euro} €
      </div>
      <div style={{ display: "flex", gap: 5, justifyContent: "center", flexWrap: "wrap" }}>
        <StatPill label="Vinte" value={s.vinte} color={PALETTE.feltro} bg={`${PALETTE.feltro}18`} />
        <StatPill label="Perse" value={s.perse} color={PALETTE.rosso} bg={`${PALETTE.rosso}18`} />
        <StatPill label="Chiam." value={s.chiamate} color="#555" />
        <StatPill label="Comp." value={s.compagno} color="#555" />
      </div>
      <div style={{ position: "absolute", bottom: 5, right: 8, fontSize: 10, color: "#bbb", fontFamily: "monospace" }}>#{rank + 1}</div>
    </div>
  );
}

function RoundModal({ players, chiamata, roundNumber, onSave, onCancel }) {
  const [vince, setVince] = useState(null);
  const [compagnoId, setCompagnoId] = useState(null);
  const [cappotto, setCappotto] = useState(false);

  const caller = players.find(p => p.id === chiamata.playerId);
  const compagnoPlayers = chiamata.cifra === 118 ? players : players.filter(p => p.id !== chiamata.playerId);
  const puntiBase = calcolaPuntiBase(chiamata.cifra);
  const canConfirm = vince !== null && compagnoId !== null;

  const handleConfirm = () => {
    if (!canConfirm) return;
    const delta = calcolaDelta(players, chiamata.playerId, compagnoId, vince, cappotto, chiamata.cifra);
    onSave({ vince, compagnoId, cappotto, delta });
  };

  const lbl = { fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "#888",
    textTransform: "uppercase", display: "block", marginBottom: 10 };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.65)",
      backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end",
      justifyContent: "center", padding: "0" }}>
      <div style={{ background: `linear-gradient(160deg,${PALETTE.carta},${PALETTE.cartaScura})`,
        borderRadius: "18px 18px 0 0", padding: "22px 20px 32px", width: "100%", maxWidth: 520,
        boxShadow: "0 -8px 40px rgba(0,0,0,0.45)", border: `2px solid ${PALETTE.oroLight}44`,
        maxHeight: "92vh", overflowY: "auto", boxSizing: "border-box" }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "#ccc", margin: "0 auto 18px" }} />
        <div style={{ marginBottom: 18, borderBottom: `1px solid ${PALETTE.oroLight}55`, paddingBottom: 12 }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: "#999", textTransform: "uppercase" }}>Mano {roundNumber}</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: PALETTE.inchiostro, fontFamily: "Georgia, serif" }}>
            {caller?.name} ha chiamato <span style={{ color: PALETTE.rosso }}>{chiamata.cifra}</span>
            <span style={{ fontSize: 11, fontWeight: 400, color: "#999", marginLeft: 6 }}>
              (chiam. +{puntiBase.chiamante} · comp. +{puntiBase.compagno} · avv. −{puntiBase.avversario})
            </span>
          </div>
          {chiamata.cifra === 118 && (
            <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8,
              background: `${PALETTE.oro}22`, border: `1px solid ${PALETTE.oro}55`,
              fontSize: 12, color: "#666" }}>
              🃏 <strong>118</strong> — il chiamante può scegliere sé stesso come compagno (gioca solo).
            </div>
          )}
        </div>
        <div style={{ marginBottom: 18 }}>
          <span style={lbl}>1 · Esito</span>
          <div style={{ display: "flex", gap: 10 }}>
            {[{ val: true, label: "✓ Vince", bg: PALETTE.feltro }, { val: false, label: "✕ Perde", bg: PALETTE.rosso }].map(opt => (
              <button key={String(opt.val)} onClick={() => setVince(opt.val)}
                style={{ flex: 1, padding: "13px 0", borderRadius: 10,
                  border: `2px solid ${vince === opt.val ? PALETTE.oro : "#ccc"}`,
                  background: vince === opt.val ? opt.bg : "rgba(255,255,255,0.4)",
                  color: vince === opt.val ? PALETTE.carta : PALETTE.inchiostro,
                  fontFamily: "Georgia, serif", fontSize: 16, fontWeight: 700, cursor: "pointer",
                  transition: "all 0.15s" }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 18 }}>
          <span style={lbl}>2 · Compagno{chiamata.cifra === 118 ? " (anche sé stesso)" : ""}</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {compagnoPlayers.map((p) => {
              const idx = players.indexOf(p);
              const sel = compagnoId === p.id;
              const isSelf = p.id === chiamata.playerId;
              return (
                <button key={p.id} onClick={() => setCompagnoId(p.id)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                    borderRadius: 9, cursor: "pointer",
                    border: `2px solid ${sel ? PALETTE.oro : isSelf ? PALETTE.oro + "66" : "#ccc"}`,
                    background: sel ? `linear-gradient(135deg,${PALETTE.feltro},${PALETTE.feltroLight})` : "rgba(255,255,255,0.4)",
                    color: sel ? PALETTE.carta : PALETTE.inchiostro,
                    fontFamily: "Georgia, serif", fontSize: 15, fontWeight: sel ? 700 : 500,
                    transition: "all 0.15s" }}>
                  <span style={{ fontSize: 17, color: sel ? PALETTE.oroLight : SEMI_COLORS[idx % 4] }}>{SEMI[idx % 4]}</span>
                  <span style={{ flex: 1 }}>{p.name}{isSelf ? " (solo)" : ""}</span>
                  {sel && <span>✓</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <span style={lbl}>3 · Cappotto? <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: "none", color: "#bbb" }}>(punti ×2)</span></span>
          <div style={{ display: "flex", gap: 10 }}>
            {[{ val: false, label: "No" }, { val: true, label: "🃏 Sì, cappotto!" }].map(opt => (
              <button key={String(opt.val)} onClick={() => setCappotto(opt.val)}
                style={{ flex: opt.val ? 2 : 1, padding: "11px 0", borderRadius: 9,
                  border: `2px solid ${cappotto === opt.val ? PALETTE.oro : "#ccc"}`,
                  background: cappotto === opt.val
                    ? (opt.val ? `linear-gradient(135deg,${PALETTE.oro},${PALETTE.oroLight})` : "rgba(255,255,255,0.65)")
                    : "rgba(255,255,255,0.35)",
                  fontFamily: "Georgia, serif", fontSize: 15,
                  fontWeight: cappotto === opt.val ? 800 : 500,
                  cursor: "pointer", color: PALETTE.inchiostro, transition: "all 0.15s" }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {canConfirm && (
          <div style={{ background: "rgba(0,0,0,0.05)", borderRadius: 10, padding: "11px 13px",
            marginBottom: 16, border: `1px solid ${PALETTE.oroLight}44` }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: "#999", textTransform: "uppercase", marginBottom: 7 }}>Riepilogo</div>
            {(() => {
              const delta = calcolaDelta(players, chiamata.playerId, compagnoId, vince, cappotto, chiamata.cifra);
              return players.map((p, i) => {
                const d = delta[p.id];
                const euros = (d * EURO_PER_PUNTO).toFixed(2);
                return (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "4px 0", borderBottom: i < players.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none" }}>
                    <span style={{ fontSize: 13, fontFamily: "Georgia, serif", color: PALETTE.inchiostro }}>
                      <span style={{ color: SEMI_COLORS[i % 4], marginRight: 5 }}>{SEMI[i % 4]}</span>
                      {p.name}
                      {p.id === chiamata.playerId && <span style={{ fontSize: 10, color: "#aaa", marginLeft: 4 }}>(chiam.)</span>}
                      {p.id === compagnoId && <span style={{ fontSize: 10, color: "#aaa", marginLeft: 4 }}>(comp.)</span>}
                    </span>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 900, fontSize: 14,
                        color: d > 0 ? PALETTE.feltro : PALETTE.rosso }}>
                        {d > 0 ? `+${d}` : d}
                      </span>
                      <span style={{ fontFamily: "monospace", fontSize: 12,
                        color: d > 0 ? PALETTE.feltroLight : PALETTE.rossoLight }}>
                        {d >= 0 ? "+" : ""}{euros}€
                      </span>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}
        <div style={{ display: "flex", gap: 9 }}>
          <button onClick={onCancel} style={btn("#999", "#fff", { padding: "13px 16px" })}>Annulla</button>
          <button onClick={handleConfirm} disabled={!canConfirm}
            style={{
              background: canConfirm ? `linear-gradient(135deg,${PALETTE.oro},${PALETTE.oroLight})` : "#ccc",
              color: canConfirm ? PALETTE.inchiostro : "#999",
              border: "none", borderRadius: 10, flex: 1, padding: "13px 0", fontSize: 15,
              cursor: canConfirm ? "pointer" : "not-allowed", fontFamily: "Georgia, serif",
              letterSpacing: 1, textTransform: "uppercase", fontWeight: 700,
              boxShadow: canConfirm ? "0 4px 16px rgba(201,168,76,0.4)" : "none",
            }}>
            Conferma mano
          </button>
        </div>
      </div>
    </div>
  );
}

function calcolaStatsCumulative(sessioni) {
  const cum = {};
  sessioni.forEach(s => {
    s.giocatori.forEach(g => {
      if (!cum[g.name]) cum[g.name] = { punti: 0, euro: 0, vinte: 0, perse: 0, sessioni: 0 };
      cum[g.name].punti  += g.punti;
      cum[g.name].euro   += parseFloat(g.euro);
      cum[g.name].vinte  += g.vinte || 0;
      cum[g.name].perse  += g.perse || 0;
      cum[g.name].sessioni += 1;
    });
  });
  return Object.entries(cum)
    .map(([name, d]) => ({ name, ...d, euroStr: (d.euro >= 0 ? "+" : "") + d.euro.toFixed(2) }))
    .sort((a, b) => b.punti - a.punti);
}

function calcolaCompagniCumulativi(sessioni) {
  const cum = {};
  sessioni.forEach(s => {
    s.giocatori.forEach(g => {
      if (!cum[g.name]) cum[g.name] = { compagnoVinto: 0, compagnoPerse: 0, compagnoTot: 0 };
      cum[g.name].compagnoVinto += g.compagnoVinto || 0;
      cum[g.name].compagnoPerse += g.compagnoPerse || 0;
      cum[g.name].compagnoTot   += g.compagnoTot   || 0;
    });
  });
  return Object.entries(cum)
    .map(([name, d]) => ({
      name, ...d,
      pct: d.compagnoTot > 0 ? Math.round(d.compagnoVinto / d.compagnoTot * 100) : 0,
    }))
    .filter(p => p.compagnoTot > 0)
    .sort((a, b) => b.compagnoVinto - a.compagnoVinto || b.pct - a.pct);
}

function calcolaChiamantiCumulativi(sessioni) {
  const cum = {};
  sessioni.forEach(s => {
    s.giocatori.forEach(g => {
      if (!cum[g.name]) cum[g.name] = { chiamateVinte: 0, chiamatePerse: 0, chiamateTot: 0 };
      cum[g.name].chiamateVinte += g.chiamateVinte || 0;
      cum[g.name].chiamatePerse += g.chiamatePerse || 0;
      cum[g.name].chiamateTot   += g.chiamateTot   || 0;
    });
  });
  return Object.entries(cum)
    .map(([name, d]) => ({
      name, ...d,
      pct: d.chiamateTot > 0 ? Math.round(d.chiamateVinte / d.chiamateTot * 100) : 0,
    }))
    .filter(p => p.chiamateTot > 0)
    .sort((a, b) => b.chiamateVinte - a.chiamateVinte || b.pct - a.pct);
}

const thStyle = { padding: "6px 8px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#888",
  borderBottom: "2px solid rgba(0,0,0,0.08)", whiteSpace: "nowrap" };
const tdStyle = { padding: "5px 8px", fontSize: 12, fontFamily: "Georgia, serif", whiteSpace: "nowrap" };

function ClassificaTab({ players, rounds, stats, sessioni }) {
  const [subTab, setSubTab] = useState("generale");
  const sorted = [...players].sort((a, b) => (stats[b.id]?.puntiTotali ?? 0) - (stats[a.id]?.puntiTotali ?? 0));
  const compagniSorted = [...players].sort((a, b) => (stats[b.id]?.compagnoVinto ?? 0) - (stats[a.id]?.compagnoVinto ?? 0));
  const cumulative = calcolaStatsCumulative(sessioni);
  const rankEmoji = ["👑", "🥈", "🥉"];

  const tabBtn = (key, label) => (
    <button onClick={() => setSubTab(key)} style={{
      padding: "7px 14px", borderRadius: 20, border: "none", cursor: "pointer",
      background: subTab === key ? PALETTE.feltro : "rgba(255,255,255,0.15)",
      color: subTab === key ? PALETTE.carta : "rgba(255,255,255,0.7)",
      fontFamily: "Georgia, serif", fontSize: 12, fontWeight: 700, transition: "all 0.15s",
    }}>{label}</button>
  );

  const sectionStyle = {
    background: `linear-gradient(160deg,${PALETTE.carta},${PALETTE.cartaScura})`,
    borderRadius: 14, padding: 20,
    border: `1px solid ${PALETTE.oroLight}44`,
    boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 7, marginBottom: 18, flexWrap: "wrap" }}>
        {tabBtn("generale", "🃏 Sessione")}
        {tabBtn("cumulativa", "📊 Totale")}
        {tabBtn("compagni", "🤝 Compagni")}
        {tabBtn("chiamate", "📣 Chiamate")}
        {tabBtn("storico", "📋 Mani")}
      </div>

      {subTab === "generale" && (
        <div style={sectionStyle}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: "#888", textTransform: "uppercase", marginBottom: 14 }}>Classifica Sessione Corrente</div>
          {sorted.map((p, rank) => {
            const s = stats[p.id] || {};
            const euro = (s.puntiTotali * EURO_PER_PUNTO).toFixed(2);
            const pos = s.puntiTotali >= 0;
            return (
              <div key={p.id} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "11px 14px",
                borderRadius: 10, marginBottom: 8,
                background: rank === 0 ? `${PALETTE.oro}22` : "rgba(255,255,255,0.35)",
                border: `1px solid ${rank === 0 ? PALETTE.oro + "55" : "transparent"}`,
              }}>
                <span style={{ fontSize: 18, minWidth: 24 }}>{rank < 3 ? rankEmoji[rank] : `#${rank + 1}`}</span>
                <span style={{ fontSize: 16, color: SEMI_COLORS[rank % 4] }}>{SEMI[rank % 4]}</span>
                <span style={{ flex: 1, fontWeight: 700, fontSize: 15, fontFamily: "Georgia, serif" }}>{p.name}</span>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <span style={{ fontSize: 11, color: PALETTE.feltro, background: `${PALETTE.feltro}18`, borderRadius: 6, padding: "2px 7px", fontWeight: 700 }}>{s.vinte}V</span>
                  <span style={{ fontSize: 11, color: PALETTE.rosso, background: `${PALETTE.rosso}18`, borderRadius: 6, padding: "2px 7px", fontWeight: 700 }}>{s.perse}P</span>
                  <span style={{ fontFamily: "monospace", fontWeight: 900, fontSize: 16, color: pos ? PALETTE.feltro : PALETTE.rosso, minWidth: 36, textAlign: "right" }}>
                    {s.puntiTotali > 0 ? `+${s.puntiTotali}` : s.puntiTotali}
                  </span>
                  <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 14, color: pos ? PALETTE.feltroLight : PALETTE.rossoLight, minWidth: 60, textAlign: "right" }}>
                    {pos ? "+" : ""}{euro}€
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {subTab === "cumulativa" && (
        <div style={sectionStyle}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: "#888", textTransform: "uppercase", marginBottom: 4 }}>Classifica Totale — Tutte le Sessioni</div>
          {sessioni.length === 0 ? (
            <div style={{ textAlign: "center", color: "#bbb", fontSize: 13, marginTop: 16 }}>
              Nessuna sessione completata ancora.<br/>
              <span style={{ fontSize: 12 }}>Termina la prima sessione con 🏁 per vederla qui.</span>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, color: "#aaa", marginBottom: 14 }}>{sessioni.length} {sessioni.length === 1 ? "sessione" : "sessioni"} completate</div>
              {cumulative.map((p, rank) => {
                const pos = p.euro >= 0;
                return (
                  <div key={p.name} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                    borderRadius: 10, marginBottom: 8,
                    background: rank === 0 ? `${PALETTE.oro}22` : "rgba(255,255,255,0.35)",
                    border: `1px solid ${rank === 0 ? PALETTE.oro + "55" : "transparent"}`,
                  }}>
                    <span style={{ fontSize: 18, minWidth: 24 }}>{rank < 3 ? rankEmoji[rank] : `#${rank + 1}`}</span>
                    <span style={{ fontSize: 16, color: SEMI_COLORS[rank % 4] }}>{SEMI[rank % 4]}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "Georgia, serif" }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: "#888", marginTop: 1 }}>{p.sessioni} sess. · {p.vinte}V {p.perse}P</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 900, fontSize: 18, color: pos ? PALETTE.feltro : PALETTE.rosso }}>{p.euroStr} €</span>
                      <span style={{ fontFamily: "monospace", fontSize: 12, color: "#888" }}>{p.punti > 0 ? "+" : ""}{p.punti} pt</span>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {subTab === "compagni" && (
        <div style={sectionStyle}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: "#888", textTransform: "uppercase", marginBottom: 14 }}>Classifica Compagni</div>
          {compagniSorted.map((p, rank) => {
            const s = stats[p.id] || {};
            const pct = s.compagno > 0 ? Math.round(s.compagnoVinto / s.compagno * 100) : 0;
            return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px",
                borderRadius: 10, marginBottom: 8, background: "rgba(255,255,255,0.35)" }}>
                <span style={{ fontSize: 16, minWidth: 22, fontWeight: 700, color: "#aaa" }}>#{rank + 1}</span>
                <span style={{ fontSize: 15, color: SEMI_COLORS[rank % 4] }}>{SEMI[rank % 4]}</span>
                <span style={{ flex: 1, fontWeight: 700, fontSize: 15, fontFamily: "Georgia, serif" }}>{p.name}</span>
                <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: PALETTE.feltro, background: `${PALETTE.feltro}18`, borderRadius: 6, padding: "2px 7px", fontWeight: 700 }}>{s.compagnoVinto}W</span>
                  <span style={{ fontSize: 11, color: PALETTE.rosso, background: `${PALETTE.rosso}18`, borderRadius: 6, padding: "2px 7px", fontWeight: 700 }}>{s.compagnoPerse}L</span>
                  <span style={{ fontSize: 11, color: "#666", background: "rgba(0,0,0,0.07)", borderRadius: 6, padding: "2px 7px", fontWeight: 700 }}>{s.compagno} tot</span>
                  <span style={{ fontFamily: "monospace", fontWeight: 900, fontSize: 14, color: pct >= 50 ? PALETTE.feltro : PALETTE.rosso }}>{pct}%</span>
                </div>
              </div>
            );
          })}
          {rounds.length === 0 && <div style={{ textAlign: "center", color: "#bbb", fontSize: 13 }}>Nessuna mano registrata</div>}
        </div>
      )}

      {subTab === "chiamate" && (
        <div style={sectionStyle}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: "#888", textTransform: "uppercase", marginBottom: 14 }}>Statistiche Chiamate</div>
          {[...players].sort((a, b) => (stats[b.id]?.chiamate ?? 0) - (stats[a.id]?.chiamate ?? 0)).map((p, rank) => {
            const s = stats[p.id] || {};
            const pct = s.chiamate > 0 ? Math.round(s.chiamateVinte / s.chiamate * 100) : 0;
            return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px",
                borderRadius: 10, marginBottom: 8, background: "rgba(255,255,255,0.35)" }}>
                <span style={{ fontSize: 15, color: SEMI_COLORS[rank % 4] }}>{SEMI[rank % 4]}</span>
                <span style={{ flex: 1, fontWeight: 700, fontSize: 15, fontFamily: "Georgia, serif" }}>{p.name}</span>
                <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                  <span style={{ fontSize: 11, background: "rgba(0,0,0,0.07)", borderRadius: 6, padding: "2px 7px", fontWeight: 700, color: "#555" }}>{s.chiamate} chiam.</span>
                  <span style={{ fontSize: 11, color: PALETTE.feltro, background: `${PALETTE.feltro}18`, borderRadius: 6, padding: "2px 7px", fontWeight: 700 }}>{s.chiamateVinte}W</span>
                  <span style={{ fontSize: 11, color: PALETTE.rosso, background: `${PALETTE.rosso}18`, borderRadius: 6, padding: "2px 7px", fontWeight: 700 }}>{s.chiamatePerse}L</span>
                  <span style={{ fontFamily: "monospace", fontWeight: 900, fontSize: 14, color: pct >= 50 ? PALETTE.feltro : PALETTE.rosso }}>{pct}%</span>
                </div>
              </div>
            );
          })}
          {rounds.length === 0 && <div style={{ textAlign: "center", color: "#bbb", fontSize: 13 }}>Nessuna mano registrata</div>}
        </div>
      )}

      {subTab === "storico" && (
        <div style={sectionStyle}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: "#888", textTransform: "uppercase", marginBottom: 14 }}>Storico Mani</div>
          {rounds.length === 0 ? (
            <div style={{ textAlign: "center", color: "#bbb", fontSize: 13 }}>Nessuna mano registrata</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>Cifra</th>
                    <th style={thStyle}>Esito</th>
                    <th style={thStyle}>Comp.</th>
                    {players.map((p, i) => (
                      <th key={p.id} style={thStyle}>
                        <span style={{ color: SEMI_COLORS[i % 4], marginRight: 2 }}>{SEMI[i % 4]}</span>{p.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rounds.map((r, ri) => {
                    const comp = players.find(p => p.id === r.compagnoId);
                    return (
                      <tr key={r.id} style={{ background: ri % 2 === 0 ? "rgba(255,255,255,0.3)" : "transparent" }}>
                        <td style={tdStyle}>{r.round}</td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{r.cifra}</td>
                        <td style={{ ...tdStyle, color: r.vince ? PALETTE.feltro : PALETTE.rosso, fontWeight: 700 }}>
                          {r.vince ? "✓" : "✕"}{r.cappotto ? "🃏" : ""}
                        </td>
                        <td style={{ ...tdStyle, fontSize: 11 }}>{comp?.name ?? "—"}</td>
                        {players.map(p => {
                          const d = r.delta?.[p.id] ?? 0;
                          const e = (d * EURO_PER_PUNTO).toFixed(2);
                          return (
                            <td key={p.id} style={{ ...tdStyle, fontWeight: d !== 0 ? 700 : 400,
                              color: d > 0 ? PALETTE.feltro : d < 0 ? PALETTE.rosso : "#bbb" }}>
                              {d > 0 ? `+${d}` : d === 0 ? "—" : d}
                              {d !== 0 && <span style={{ fontSize: 10, marginLeft: 3, opacity: 0.7 }}>({d >= 0 ? "+" : ""}{e}€)</span>}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function loadRubrica() {
  try { return JSON.parse(localStorage.getItem("briscola_rubrica") || "[]"); } catch { return []; }
}
function saveRubrica(rubrica) {
  localStorage.setItem("briscola_rubrica", JSON.stringify(rubrica));
}
function loadSavedNames() {
  return loadRubrica().map(g => g.nome);
}
function saveName(name) {
  const rubrica = loadRubrica();
  if (!rubrica.some(g => g.nome === name)) {
    rubrica.push({ id: Date.now(), nome: name, soprannome: "" });
    saveRubrica(rubrica);
  }
}
function loadSessioni() {
  try { return JSON.parse(localStorage.getItem("briscola_sessioni") || "[]"); } catch { return []; }
}
function saveSessione(sessione) {
  const sessioni = loadSessioni();
  sessioni.unshift(sessione);
  localStorage.setItem("briscola_sessioni", JSON.stringify(sessioni.slice(0, 30)));
}

function Rubrica({ onClose }) {
  const [rubrica, setRubrica] = useState(() => loadRubrica());
  const [newNome, setNewNome] = useState("");
  const [newSopr, setNewSopr] = useState("");
  const [editId, setEditId] = useState(null);
  const [editNome, setEditNome] = useState("");
  const [editSopr, setEditSopr] = useState("");
  const [search, setSearch] = useState("");

  const filtered = rubrica.filter(g =>
    g.nome.toLowerCase().includes(search.toLowerCase()) ||
    (g.soprannome || "").toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => a.nome.localeCompare(b.nome));

  const aggiungi = () => {
    const nome = newNome.trim();
    if (!nome || rubrica.some(g => g.nome.toLowerCase() === nome.toLowerCase())) return;
    const updated = [...rubrica, { id: Date.now(), nome, soprannome: newSopr.trim() }];
    setRubrica(updated); saveRubrica(updated); setNewNome(""); setNewSopr("");
  };

  const elimina = (id) => {
    const updated = rubrica.filter(g => g.id !== id);
    setRubrica(updated); saveRubrica(updated);
  };

  const salvaModifica = () => {
    const updated = rubrica.map(g => g.id === editId
      ? { ...g, nome: editNome.trim() || g.nome, soprannome: editSopr.trim() } : g);
    setRubrica(updated); saveRubrica(updated); setEditId(null);
  };

  const lbl = { fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "#888", textTransform: "uppercase", display: "block", marginBottom: 6 };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.7)",
      backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: `linear-gradient(160deg,${PALETTE.carta},${PALETTE.cartaScura})`,
        borderRadius: "18px 18px 0 0", padding: "20px 18px 36px", width: "100%", maxWidth: 520,
        boxShadow: "0 -8px 40px rgba(0,0,0,0.45)", maxHeight: "90vh", overflowY: "auto", boxSizing: "border-box" }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "#ccc", margin: "0 auto 16px" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontFamily: "Georgia, serif", fontWeight: 900, color: PALETTE.inchiostro }}>📒 Rubrica Giocatori</h2>
            <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{rubrica.length} giocatori salvati</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#aaa" }}>✕</button>
        </div>
        {rubrica.length > 4 && (
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca giocatore..."
            style={{ width: "100%", padding: "9px 13px", fontSize: 14, borderRadius: 10,
              border: `1px solid ${PALETTE.oro}66`, background: "rgba(255,255,255,0.7)",
              color: PALETTE.inchiostro, fontFamily: "Georgia, serif", outline: "none",
              boxSizing: "border-box", marginBottom: 14 }} />
        )}
        <div style={{ marginBottom: 20 }}>
          {filtered.length === 0 && (
            <div style={{ textAlign: "center", color: "#bbb", fontSize: 13, padding: "20px 0" }}>
              {search ? "Nessun risultato" : "Rubrica vuota — aggiungi il primo giocatore"}
            </div>
          )}
          {filtered.map((g) => (
            <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
              background: "rgba(255,255,255,0.45)", borderRadius: 10, marginBottom: 7,
              border: `1px solid ${PALETTE.oroLight}44` }}>
              {editId === g.id ? (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  <input value={editNome} onChange={e => setEditNome(e.target.value)} placeholder="Nome"
                    style={{ padding: "6px 10px", fontSize: 14, borderRadius: 7, border: `2px solid ${PALETTE.oro}`,
                      fontFamily: "Georgia, serif", background: "rgba(255,255,255,0.8)", outline: "none" }} />
                  <input value={editSopr} onChange={e => setEditSopr(e.target.value)} placeholder="Soprannome (opzionale)"
                    style={{ padding: "6px 10px", fontSize: 13, borderRadius: 7, border: "1px solid #ccc",
                      fontFamily: "Georgia, serif", background: "rgba(255,255,255,0.8)", outline: "none" }} />
                  <div style={{ display: "flex", gap: 7 }}>
                    <button onClick={salvaModifica} style={{ background: PALETTE.feltro, color: "#fff", border: "none", borderRadius: 6, padding: "5px 14px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>✓ Salva</button>
                    <button onClick={() => setEditId(null)} style={{ background: "#ccc", color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 13 }}>Annulla</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: `linear-gradient(135deg,${PALETTE.feltro},${PALETTE.feltroLight})`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: PALETTE.carta, fontWeight: 900, fontSize: 16, fontFamily: "Georgia, serif", flexShrink: 0 }}>
                    {g.nome[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "Georgia, serif", color: PALETTE.inchiostro }}>{g.nome}</div>
                    {g.soprannome && <div style={{ fontSize: 12, color: "#888" }}>"{g.soprannome}"</div>}
                  </div>
                  <button onClick={() => { setEditId(g.id); setEditNome(g.nome); setEditSopr(g.soprannome || ""); }}
                    style={{ background: "none", border: "none", color: "#bbb", cursor: "pointer", fontSize: 17, padding: "2px 6px" }}>✎</button>
                  <button onClick={() => elimina(g.id)}
                    style={{ background: "none", border: "none", color: "#daa", cursor: "pointer", fontSize: 17, padding: "2px 6px" }}>🗑</button>
                </>
              )}
            </div>
          ))}
        </div>
        <div style={{ borderTop: `1px solid ${PALETTE.oroLight}44`, paddingTop: 16 }}>
          <span style={lbl}>Aggiungi giocatore</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input value={newNome} onChange={e => setNewNome(e.target.value)} onKeyDown={e => e.key === "Enter" && aggiungi()}
              placeholder="Nome *"
              style={{ padding: "10px 13px", fontSize: 14, borderRadius: 10, border: `2px solid ${PALETTE.oro}77`,
                background: "rgba(255,255,255,0.7)", color: PALETTE.inchiostro, fontFamily: "Georgia, serif", outline: "none" }} />
            <input value={newSopr} onChange={e => setNewSopr(e.target.value)} onKeyDown={e => e.key === "Enter" && aggiungi()}
              placeholder="Soprannome (opzionale)"
              style={{ padding: "9px 13px", fontSize: 13, borderRadius: 10, border: "1px solid #ccc",
                background: "rgba(255,255,255,0.7)", color: PALETTE.inchiostro, fontFamily: "Georgia, serif", outline: "none" }} />
            <button onClick={aggiungi} disabled={!newNome.trim()}
              style={{ padding: "11px 0", borderRadius: 10, border: "none",
                background: newNome.trim() ? `linear-gradient(135deg,${PALETTE.oro},${PALETTE.oroLight})` : "#ccc",
                color: newNome.trim() ? PALETTE.inchiostro : "#999",
                fontFamily: "Georgia, serif", fontSize: 15, fontWeight: 900,
                cursor: newNome.trim() ? "pointer" : "not-allowed", letterSpacing: 1, textTransform: "uppercase" }}>
              + Aggiungi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HomeClassifica({ sessioniAll, cumulative, rankEmoji }) {
  const [tab, setTab] = useState("generale");
  const compagniCum = calcolaCompagniCumulativi(sessioniAll);
  const chiamantiCum = calcolaChiamantiCumulativi(sessioniAll);

  const tabBtn = (key, label) => (
    <button onClick={() => setTab(key)} style={{
      padding: "6px 12px", borderRadius: 20, border: "none", cursor: "pointer",
      background: tab === key ? PALETTE.feltro : "rgba(255,255,255,0.15)",
      color: tab === key ? PALETTE.carta : "rgba(255,255,255,0.7)",
      fontFamily: "Georgia, serif", fontSize: 11, fontWeight: 700,
      transition: "all 0.15s", whiteSpace: "nowrap",
    }}>{label}</button>
  );

  const card = {
    background: `linear-gradient(160deg,${PALETTE.carta},${PALETTE.cartaScura})`,
    borderRadius: 16, padding: 20, boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
    border: `1px solid ${PALETTE.oroLight}44`,
  };

  const Avatar = ({ name, size = 32 }) => (
    <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: `linear-gradient(135deg,${PALETTE.feltro},${PALETTE.feltroLight})`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: PALETTE.carta, fontWeight: 900, fontSize: size * 0.44 }}>
      {name[0].toUpperCase()}
    </div>
  );

  const RateoBar = ({ pct }) => (
    <div style={{ background: "rgba(0,0,0,0.08)", borderRadius: 4, height: 5, overflow: "hidden", marginTop: 5 }}>
      <div style={{
        height: "100%", borderRadius: 4, width: `${Math.max(2, pct)}%`,
        background: pct >= 50 ? `linear-gradient(90deg,${PALETTE.feltro},${PALETTE.feltroLight})`
          : `linear-gradient(90deg,${PALETTE.rosso},${PALETTE.rossoLight})`,
        transition: "width 0.4s ease",
      }} />
    </div>
  );

  const Pill = ({ label, value, color, bg }) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
      background: bg || "rgba(0,0,0,0.06)", borderRadius: 8, padding: "4px 9px", minWidth: 44 }}>
      <span style={{ fontSize: 14, fontWeight: 900, color: color || PALETTE.inchiostro, lineHeight: 1.1 }}>{value}</span>
      <span style={{ fontSize: 9, color: "#999", letterSpacing: 1, textTransform: "uppercase", marginTop: 1 }}>{label}</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {tabBtn("generale", "🏆 Totale")}
        {tabBtn("chiamanti", "📣 Chiamanti")}
        {tabBtn("compagni", "🤝 Compagni")}
        {tabBtn("sessioni", "📋 Sessioni")}
      </div>

      {tab === "generale" && (
        <div style={card}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: "#888", textTransform: "uppercase", marginBottom: 4 }}>Classifica Totale</div>
          <div style={{ fontSize: 11, color: "#aaa", marginBottom: 14 }}>{sessioniAll.length} sessioni · ordinata per euro</div>
          {cumulative.map((p, rank) => {
            const pos = p.euro >= 0;
            const rateo = (p.vinte + p.perse) > 0 ? Math.round(p.vinte / (p.vinte + p.perse) * 100) : 0;
            return (
              <div key={p.name} style={{
                padding: "12px 12px", borderRadius: 10, marginBottom: 8,
                background: rank === 0 ? `${PALETTE.oro}22` : "rgba(255,255,255,0.4)",
                border: `1px solid ${rank === 0 ? PALETTE.oro + "55" : "rgba(0,0,0,0.05)"}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 18, minWidth: 26 }}>{rank < 3 ? rankEmoji[rank] : `#${rank + 1}`}</span>
                  <Avatar name={p.name} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "Georgia, serif", color: PALETTE.inchiostro,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "#999" }}>{p.sessioni} sess.</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "monospace", fontWeight: 900, fontSize: 17, color: pos ? PALETTE.feltro : PALETTE.rosso }}>{p.euroStr} €</div>
                    <div style={{ fontFamily: "monospace", fontSize: 11, color: "#aaa" }}>{p.punti > 0 ? "+" : ""}{p.punti} pt</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <Pill label="Vinte" value={p.vinte} color={PALETTE.feltro} bg={`${PALETTE.feltro}18`} />
                  <Pill label="Perse" value={p.perse} color={PALETTE.rosso} bg={`${PALETTE.rosso}18`} />
                  <Pill label="Rateo" value={`${rateo}%`} color={rateo >= 50 ? PALETTE.feltro : PALETTE.rosso} />
                </div>
                <RateoBar pct={rateo} />
              </div>
            );
          })}
        </div>
      )}

      {tab === "chiamanti" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {chiamantiCum.length > 0 && (() => {
            const piuVittorie = [...chiamantiCum].sort((a,b) => b.chiamateVinte - a.chiamateVinte)[0];
            const migliorRateo = [...chiamantiCum].filter(p => p.chiamateTot >= 2).sort((a,b) => b.pct - a.pct)[0];
            const piuChiama = [...chiamantiCum].sort((a,b) => b.chiamateTot - a.chiamateTot)[0];
            const piuSconfitte = [...chiamantiCum].sort((a,b) => b.chiamatePerse - a.chiamatePerse)[0];
            const records = [
              { icon: "🏆", label: "Più vittorie", name: piuVittorie?.name, val: `${piuVittorie?.chiamateVinte}V` },
              { icon: "💪", label: "Miglior rateo", name: migliorRateo?.name, val: `${migliorRateo?.pct}%` },
              { icon: "🎯", label: "Più chiamate", name: piuChiama?.name, val: `${piuChiama?.chiamateTot}×` },
              { icon: "💀", label: "Più sconfitte", name: piuSconfitte?.name, val: `${piuSconfitte?.chiamatePerse}S` },
            ];
            return (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {records.map((r, i) => r.name && (
                  <div key={i} style={{ background: `linear-gradient(160deg,${PALETTE.carta},${PALETTE.cartaScura})`,
                    borderRadius: 12, padding: "12px 14px", border: `1px solid ${PALETTE.oroLight}44`,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
                    <div style={{ fontSize: 18, marginBottom: 4 }}>{r.icon}</div>
                    <div style={{ fontSize: 9, letterSpacing: 2, color: "#aaa", textTransform: "uppercase", marginBottom: 3 }}>{r.label}</div>
                    <div style={{ fontWeight: 800, fontSize: 13, fontFamily: "Georgia, serif", color: PALETTE.inchiostro,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                    <div style={{ fontFamily: "monospace", fontWeight: 900, fontSize: 15, color: PALETTE.feltro }}>{r.val}</div>
                  </div>
                ))}
              </div>
            );
          })()}
          <div style={card}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: "#888", textTransform: "uppercase", marginBottom: 14 }}>Classifica Chiamanti</div>
            {chiamantiCum.length === 0 ? (
              <div style={{ textAlign: "center", color: "#bbb", fontSize: 13 }}>Nessun dato disponibile</div>
            ) : [...chiamantiCum].sort((a, b) => b.pct - a.pct || b.chiamateVinte - a.chiamateVinte).map((p, rank) => (
              <div key={p.name} style={{ padding: "12px 12px", borderRadius: 10, marginBottom: 8,
                background: rank === 0 ? `${PALETTE.feltro}18` : "rgba(255,255,255,0.4)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 16, minWidth: 24 }}>{rank < 3 ? rankEmoji[rank] : `#${rank+1}`}</span>
                  <Avatar name={p.name} size={28} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, fontFamily: "Georgia, serif" }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "#888" }}>{p.chiamateTot} chiamate</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "monospace", fontWeight: 900, fontSize: 18, color: p.pct >= 50 ? PALETTE.feltro : PALETTE.rosso }}>{p.pct}%</div>
                    <div style={{ fontSize: 11, color: "#888" }}>{p.chiamateVinte}V · {p.chiamatePerse}L</div>
                  </div>
                </div>
                <RateoBar pct={p.pct} />
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "compagni" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {compagniCum.length > 0 && (() => {
            const piuVittorie = [...compagniCum].sort((a,b) => b.compagnoVinto - a.compagnoVinto)[0];
            const migliorRateo = [...compagniCum].filter(p => p.compagnoTot >= 2).sort((a,b) => b.pct - a.pct)[0];
            const piuRichiesto = [...compagniCum].sort((a,b) => b.compagnoTot - a.compagnoTot)[0];
            const piuSconfitte = [...compagniCum].sort((a,b) => b.compagnoPerse - a.compagnoPerse)[0];
            const records = [
              { icon: "🤝", label: "Più vittorie", name: piuVittorie?.name, val: `${piuVittorie?.compagnoVinto}V` },
              { icon: "⭐", label: "Miglior rateo", name: migliorRateo?.name, val: `${migliorRateo?.pct}%` },
              { icon: "🔥", label: "Più richiesto", name: piuRichiesto?.name, val: `${piuRichiesto?.compagnoTot}×` },
              { icon: "😬", label: "Più sconfitte", name: piuSconfitte?.name, val: `${piuSconfitte?.compagnoPerse}S` },
            ];
            return (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {records.map((r, i) => r.name && (
                  <div key={i} style={{ background: `linear-gradient(160deg,${PALETTE.carta},${PALETTE.cartaScura})`,
                    borderRadius: 12, padding: "12px 14px", border: `1px solid ${PALETTE.oroLight}44`,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
                    <div style={{ fontSize: 18, marginBottom: 4 }}>{r.icon}</div>
                    <div style={{ fontSize: 9, letterSpacing: 2, color: "#aaa", textTransform: "uppercase", marginBottom: 3 }}>{r.label}</div>
                    <div style={{ fontWeight: 800, fontSize: 13, fontFamily: "Georgia, serif", color: PALETTE.inchiostro,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                    <div style={{ fontFamily: "monospace", fontWeight: 900, fontSize: 15, color: PALETTE.feltroLight }}>{r.val}</div>
                  </div>
                ))}
              </div>
            );
          })()}
          <div style={card}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: "#888", textTransform: "uppercase", marginBottom: 14 }}>Classifica Compagni</div>
            {compagniCum.length === 0 ? (
              <div style={{ textAlign: "center", color: "#bbb", fontSize: 13 }}>Nessun dato disponibile</div>
            ) : [...compagniCum].sort((a, b) => b.pct - a.pct || b.compagnoVinto - a.compagnoVinto).map((p, rank) => (
              <div key={p.name} style={{ padding: "12px 12px", borderRadius: 10, marginBottom: 8,
                background: rank === 0 ? `${PALETTE.feltro}18` : "rgba(255,255,255,0.4)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 16, minWidth: 24 }}>{rank < 3 ? rankEmoji[rank] : `#${rank+1}`}</span>
                  <Avatar name={p.name} size={28} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, fontFamily: "Georgia, serif" }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "#888" }}>{p.compagnoTot} volte compagno</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "monospace", fontWeight: 900, fontSize: 18, color: p.pct >= 50 ? PALETTE.feltro : PALETTE.rosso }}>{p.pct}%</div>
                    <div style={{ fontSize: 11, color: "#888" }}>{p.compagnoVinto}V · {p.compagnoPerse}L</div>
                  </div>
                </div>
                <RateoBar pct={p.pct} />
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "sessioni" && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: "#888", textTransform: "uppercase" }}>Storico Sessioni</div>
            <span style={{ fontSize: 11, color: "#aaa", background: "rgba(0,0,0,0.06)", borderRadius: 6, padding: "2px 8px" }}>{sessioniAll.length} totali</span>
          </div>
          {sessioniAll.map((s, si) => (
            <div key={s.id} style={{ padding: "12px 0", borderBottom: si < sessioniAll.length - 1 ? "1px solid rgba(0,0,0,0.07)" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#555", fontFamily: "Georgia, serif" }}>{s.data}</span>
                <div style={{ display: "flex", gap: 5 }}>
                  <span style={{ fontSize: 10, color: "#aaa", background: "rgba(0,0,0,0.06)", borderRadius: 5, padding: "2px 6px" }}>{s.mani} mani</span>
                  <span style={{ fontSize: 10, color: "#aaa", background: "rgba(0,0,0,0.06)", borderRadius: 5, padding: "2px 6px" }}>#{sessioniAll.length - si}</span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {s.giocatori.map((p, pi) => {
                  const pos = parseFloat(p.euro) >= 0;
                  return (
                    <div key={pi} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "3px 6px", borderRadius: 6, background: pi === 0 ? `${PALETTE.oro}15` : "transparent" }}>
                      <span style={{ fontSize: 13, fontFamily: "Georgia, serif", color: PALETTE.inchiostro, display: "flex", alignItems: "center", gap: 5 }}>
                        <span>{pi < 3 ? ["👑","🥈","🥉"][pi] : "  "}</span>
                        <span>{p.name}</span>
                      </span>
                      <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13, color: pos ? PALETTE.feltro : PALETTE.rosso }}>
                        {pos ? "+" : ""}{p.euro} €
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BriscolaApp() {
  const [state, setState] = useState(initialState);
  const [showRoundModal, setShowRoundModal] = useState(false);
  const [chiamataPlayer, setChiamataPlayer] = useState(null);
  const [chiamataCifra, setChiamataCifra] = useState("");
  const [activeTab, setActiveTab] = useState("partita");
  const [savedNames, setSavedNames] = useState(() => loadSavedNames());
  const [fineSessione, setFineSessione] = useState(false);
  const [showConfirmFine, setShowConfirmFine] = useState(false);
  const [showRubrica, setShowRubrica] = useState(false);
  const [setupTab, setSetupTab] = useState("gioca");

  const rubrica = loadRubrica();
  const { players, rounds, gameMode, gameStarted, chiamataConfirmed, chiamata } = state;
  const stats = calcolaStats(players, rounds);
  const sortedPlayers = [...players].sort((a, b) => (stats[b.id]?.puntiTotali ?? 0) - (stats[a.id]?.puntiTotali ?? 0));
  const rankEmoji = ["👑", "🥈", "🥉"];

  const startGame = () => {
    if (players.length < parseInt(gameMode)) return;
    players.forEach(p => saveName(p.name));
    setSavedNames(loadSavedNames());
    setState(s => ({ ...s, gameStarted: true }));
  };

  const buildSessione = () => {
    const s = calcolaStats(players, rounds);
    return {
      id: Date.now(),
      data: new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
      mani: rounds.length,
      giocatori: players.map(p => ({
        name: p.name,
        punti: s[p.id]?.puntiTotali ?? 0,
        euro: ((s[p.id]?.puntiTotali ?? 0) * EURO_PER_PUNTO).toFixed(2),
        vinte: s[p.id]?.vinte ?? 0,
        perse: s[p.id]?.perse ?? 0,
        compagnoVinto: s[p.id]?.compagnoVinto ?? 0,
        compagnoPerse: s[p.id]?.compagnoPerse ?? 0,
        compagnoTot: s[p.id]?.compagno ?? 0,
        chiamateVinte: s[p.id]?.chiamateVinte ?? 0,
        chiamatePerse: s[p.id]?.chiamatePerse ?? 0,
        chiamateTot: s[p.id]?.chiamate ?? 0,
      })).sort((a, b) => b.punti - a.punti),
    };
  };

  const terminaSessione = () => {
    saveSessione(buildSessione());
    setFineSessione(true);
    setShowConfirmFine(false);
  };

  const confirmChiamata = () => {
    const cifra = parseInt(chiamataCifra);
    if (!chiamataPlayer || isNaN(cifra) || cifra < 81 || cifra > 118) return;
    setState(s => ({ ...s, chiamataConfirmed: true, chiamata: { playerId: chiamataPlayer, cifra } }));
  };

  const saveRound = ({ vince, compagnoId, cappotto, delta }) => {
    setState(s => ({
      ...s,
      rounds: [...s.rounds, {
        id: Date.now(), round: s.rounds.length + 1,
        vince, compagnoId, cappotto, cifra: s.chiamata.cifra,
        chiamanteId: s.chiamata.playerId, delta,
      }],
      players: s.players.map(p => ({ ...p, score: p.score + (delta[p.id] || 0) })),
      chiamataConfirmed: false, chiamata: null,
    }));
    setShowRoundModal(false);
    setChiamataPlayer(null);
    setChiamataCifra("");
  };

  const resetGame = () => {
    if (rounds.length > 0) saveSessione(buildSessione());
    setState(s => ({ ...s, players: s.players.map(p => ({ ...p, score: 0 })), rounds: [], chiamataConfirmed: false, chiamata: null }));
    setChiamataPlayer(null); setChiamataCifra("");
  };

  const newGame = () => {
    if (rounds.length > 0) saveSessione(buildSessione());
    setState(initialState); setChiamataPlayer(null); setChiamataCifra("");
  };

  const renamePlayer = (id, name) => setState(s => ({ ...s, players: s.players.map(p => p.id === id ? { ...p, name } : p) }));

  if (fineSessione) {
    const sessioni = loadSessioni();
    const ultimaSessione = sessioni[0];
    const cumulative = calcolaStatsCumulative(sessioni);
    return (
      <div style={{ minHeight: "100vh",
        background: `radial-gradient(ellipse at 50% 20%,${PALETTE.feltroLight},${PALETTE.feltro} 70%)`,
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: "32px 16px 48px", position: "relative", fontFamily: "Georgia, serif" }}>
        <SeedDecoration />
        <div style={{ textAlign: "center", marginBottom: 28, position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🏁</div>
          <h1 style={{ margin: 0, fontSize: 36, color: PALETTE.carta, fontWeight: 900, letterSpacing: 1 }}>Fine Sessione</h1>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 6 }}>
            {ultimaSessione?.data} · {rounds.length} mani giocate
          </div>
        </div>
        <div style={{ width: "100%", maxWidth: 500, position: "relative", zIndex: 1, marginBottom: 20 }}>
          <div style={{ background: `linear-gradient(160deg,${PALETTE.carta},${PALETTE.cartaScura})`,
            borderRadius: 18, padding: 24, boxShadow: "0 12px 48px rgba(0,0,0,0.4)",
            border: `2px solid ${PALETTE.oroLight}44` }}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: "#888", textTransform: "uppercase", marginBottom: 16 }}>Classifica finale</div>
            {ultimaSessione?.giocatori.map((p, i) => {
              const pos = parseFloat(p.euro) >= 0;
              return (
                <div key={p.name + i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                  borderRadius: 10, marginBottom: 8,
                  background: i === 0 ? `${PALETTE.oro}22` : "rgba(255,255,255,0.35)",
                  border: `1px solid ${i === 0 ? PALETTE.oro + "55" : "transparent"}` }}>
                  <span style={{ fontSize: 20, minWidth: 28 }}>{i < 3 ? rankEmoji[i] : `#${i+1}`}</span>
                  <span style={{ flex: 1, fontWeight: 700, fontSize: 16, fontFamily: "Georgia, serif" }}>{p.name}</span>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                    <span style={{ fontFamily: "monospace", fontWeight: 900, fontSize: 18, color: pos ? PALETTE.feltro : PALETTE.rosso }}>
                      {pos ? "+" : ""}{p.euro} €
                    </span>
                    <span style={{ fontSize: 11, color: "#888" }}>{p.punti > 0 ? "+" : ""}{p.punti} pt · {p.vinte}V {p.perse}P</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ width: "100%", maxWidth: 500, position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={() => {
            const stessiGiocatori = players.map(p => ({ ...p, score: 0 }));
            setState({ ...initialState, players: stessiGiocatori, gameMode });
            setFineSessione(false); setChiamataPlayer(null); setChiamataCifra(""); setActiveTab("partita");
          }} style={{ width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
            background: `linear-gradient(135deg,${PALETTE.oro},${PALETTE.oroLight})`,
            color: PALETTE.inchiostro, fontFamily: "Georgia, serif", fontSize: 16, fontWeight: 900,
            cursor: "pointer", letterSpacing: 1, textTransform: "uppercase" }}>
            🔄 Nuova sessione (stessi giocatori)
          </button>
          <button onClick={() => { setState(initialState); setFineSessione(false); setChiamataPlayer(null); setChiamataCifra(""); }}
            style={{ width: "100%", padding: "13px 0", borderRadius: 12, border: "2px solid rgba(255,255,255,0.25)",
              background: "rgba(255,255,255,0.1)", color: PALETTE.carta,
              fontFamily: "Georgia, serif", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
            👥 Nuova sessione (cambia giocatori)
          </button>
        </div>
        {sessioni.length > 0 && (
          <div style={{ width: "100%", maxWidth: 500, position: "relative", zIndex: 1, marginTop: 20 }}>
            <div style={{ background: `linear-gradient(160deg,${PALETTE.carta},${PALETTE.cartaScura})`,
              borderRadius: 14, padding: 20, boxShadow: "0 6px 24px rgba(0,0,0,0.25)" }}>
              <div style={{ fontSize: 10, letterSpacing: 3, color: "#888", textTransform: "uppercase", marginBottom: 12 }}>
                📊 Classifica Totale — {sessioni.length} sessioni
              </div>
              {cumulative.map((p, rank) => {
                const pos = p.euro >= 0;
                return (
                  <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                    borderRadius: 9, marginBottom: 6,
                    background: rank === 0 ? `${PALETTE.oro}22` : "rgba(255,255,255,0.35)" }}>
                    <span style={{ fontSize: 17, minWidth: 22 }}>{rank < 3 ? rankEmoji[rank] : `#${rank + 1}`}</span>
                    <span style={{ fontSize: 15, color: SEMI_COLORS[rank % 4] }}>{SEMI[rank % 4]}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, fontFamily: "Georgia, serif" }}>{p.name}</div>
                      <div style={{ fontSize: 10, color: "#999" }}>{p.sessioni} sess. · {p.vinte}V {p.perse}P</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "monospace", fontWeight: 900, fontSize: 16, color: pos ? PALETTE.feltro : PALETTE.rosso }}>{p.euroStr} €</div>
                      <div style={{ fontFamily: "monospace", fontSize: 11, color: "#aaa" }}>{p.punti > 0 ? "+" : ""}{p.punti} pt</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!gameStarted) {
    const sessioniAll = loadSessioni();
    const cumulative = calcolaStatsCumulative(sessioniAll);
    return (
      <div style={{ minHeight: "100vh",
        background: `radial-gradient(ellipse at 50% 30%,${PALETTE.feltroLight},${PALETTE.feltro} 70%)`,
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: "32px 16px 48px", position: "relative", fontFamily: "Georgia, serif" }}>
        <SeedDecoration />
        {showRubrica && <Rubrica onClose={() => { setShowRubrica(false); setSavedNames(loadSavedNames()); }} />}
        <div style={{ textAlign: "center", marginBottom: 24, position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 11, letterSpacing: 6, color: PALETTE.oroLight, textTransform: "uppercase", marginBottom: 6 }}>Segnapunti</div>
          <h1 style={{ fontSize: 50, margin: 0, color: PALETTE.carta, letterSpacing: 2,
            textShadow: `0 2px 12px rgba(0,0,0,0.4),0 0 40px ${PALETTE.oro}44`, fontWeight: 900 }}>Briscola</h1>
          <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 8 }}>
            {SEMI.map((s, i) => <span key={i} style={{ fontSize: 21, color: SEMI_COLORS[i], opacity: 0.85 }}>{s}</span>)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, background: "rgba(0,0,0,0.22)", borderRadius: 14,
          padding: 4, marginBottom: 20, position: "relative", zIndex: 1 }}>
          {[["gioca", "🃏 Gioca"], ["classifica", "📊 Classifica"]].map(([key, label]) => (
            <button key={key} onClick={() => setSetupTab(key)}
              style={{ padding: "9px 22px", borderRadius: 10, border: "none", cursor: "pointer",
                background: setupTab === key ? PALETTE.carta : "transparent",
                color: setupTab === key ? PALETTE.inchiostro : "rgba(255,255,255,0.65)",
                fontFamily: "Georgia, serif", fontSize: 14, fontWeight: setupTab === key ? 800 : 500,
                transition: "all 0.15s", boxShadow: setupTab === key ? "0 2px 8px rgba(0,0,0,0.2)" : "none" }}>
              {label}
            </button>
          ))}
        </div>

        {setupTab === "gioca" && (
          <div style={{ background: `linear-gradient(160deg,${PALETTE.carta},${PALETTE.cartaScura})`,
            borderRadius: 18, padding: 28, width: "100%", maxWidth: 460,
            boxShadow: "0 12px 48px rgba(0,0,0,0.4)", border: `2px solid ${PALETTE.oroLight}44`,
            position: "relative", zIndex: 1 }}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "#888",
                textTransform: "uppercase", display: "block", marginBottom: 10 }}>Giocatori</label>
              <div style={{ display: "flex", gap: 10 }}>
                {["5", "6"].map(n => (
                  <button key={n} onClick={() => setState(s => ({ ...s, gameMode: n, players: [] }))}
                    style={{ flex: 1, padding: "10px 0", borderRadius: 10,
                      border: `2px solid ${gameMode === n ? PALETTE.oro : "#ccc"}`,
                      background: gameMode === n ? PALETTE.feltro : "transparent",
                      color: gameMode === n ? PALETTE.carta : PALETTE.inchiostro,
                      fontWeight: 700, fontSize: 15, cursor: "pointer",
                      fontFamily: "Georgia, serif", transition: "all 0.2s" }}>{n} giocatori</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "#888", textTransform: "uppercase" }}>
                  Giocatori ({players.length}/{gameMode})
                </label>
                <button onClick={() => setShowRubrica(true)}
                  style={{ background: "none", border: `1px solid ${PALETTE.oro}88`, borderRadius: 20,
                    padding: "4px 12px", fontSize: 12, color: PALETTE.feltro, cursor: "pointer",
                    fontFamily: "Georgia, serif", fontWeight: 700 }}>
                  📒 Rubrica
                </button>
              </div>
              <div style={{ marginBottom: 10 }}>
                {players.map((p, i) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                    background: `linear-gradient(135deg,${PALETTE.feltro}18,${PALETTE.feltroLight}18)`,
                    borderRadius: 9, marginBottom: 6, border: `2px solid ${PALETTE.oro}55` }}>
                    <div style={{ width: 30, height: 30, borderRadius: "50%",
                      background: `linear-gradient(135deg,${PALETTE.feltro},${PALETTE.feltroLight})`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: PALETTE.carta, fontWeight: 900, fontSize: 14, fontFamily: "Georgia, serif" }}>
                      {p.name[0].toUpperCase()}
                    </div>
                    <span style={{ flex: 1, fontWeight: 700, color: PALETTE.inchiostro, fontFamily: "Georgia, serif", fontSize: 14 }}>{p.name}</span>
                    <span style={{ fontSize: 16, color: SEMI_COLORS[i % 4] }}>{SEMI[i % 4]}</span>
                    <button onClick={() => setState(s => ({ ...s, players: s.players.filter(pl => pl.id !== p.id) }))}
                      style={{ background: "none", border: "none", color: "#bbb", cursor: "pointer", fontSize: 15 }}>✕</button>
                  </div>
                ))}
              </div>
              {players.length < parseInt(gameMode) && (
                rubrica.length === 0 ? (
                  <button onClick={() => setShowRubrica(true)}
                    style={{ width: "100%", padding: "12px 0", borderRadius: 10,
                      border: `2px dashed ${PALETTE.oro}66`, background: "transparent",
                      color: "#888", fontFamily: "Georgia, serif", fontSize: 14, cursor: "pointer" }}>
                    📒 Apri rubrica per aggiungere giocatori
                  </button>
                ) : (
                  <div>
                    <div style={{ fontSize: 10, color: "#aaa", letterSpacing: 1, marginBottom: 7 }}>
                      SELEZIONA DALLA RUBRICA ({parseInt(gameMode) - players.length} posti rimasti)
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
                      {rubrica
                        .filter(g => !players.some(p => p.name === g.nome))
                        .sort((a, b) => a.nome.localeCompare(b.nome))
                        .map(g => (
                          <button key={g.id}
                            onClick={() => {
                              if (players.length >= parseInt(gameMode)) return;
                              setState(s => ({ ...s, players: [...s.players, { id: Date.now(), name: g.nome, score: 0 }] }));
                            }}
                            style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                              borderRadius: 9, border: `1px solid ${PALETTE.oroLight}55`,
                              background: "rgba(255,255,255,0.5)", cursor: "pointer",
                              fontFamily: "Georgia, serif", textAlign: "left", transition: "all 0.15s" }}>
                            <div style={{ width: 30, height: 30, borderRadius: "50%",
                              background: `linear-gradient(135deg,${PALETTE.oro}88,${PALETTE.oroLight}88)`,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontWeight: 900, fontSize: 13, color: PALETTE.inchiostro, flexShrink: 0 }}>
                              {g.nome[0].toUpperCase()}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: 14, color: PALETTE.inchiostro }}>{g.nome}</div>
                              {g.soprannome && <div style={{ fontSize: 11, color: "#888" }}>"{g.soprannome}"</div>}
                            </div>
                            <span style={{ fontSize: 18, color: PALETTE.feltroLight }}>+</span>
                          </button>
                        ))}
                    </div>
                  </div>
                )
              )}
            </div>
            <button onClick={startGame} disabled={players.length < parseInt(gameMode)}
              style={{ width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
                background: players.length >= parseInt(gameMode) ? `linear-gradient(135deg,${PALETTE.oro},${PALETTE.oroLight})` : "#ccc",
                color: players.length >= parseInt(gameMode) ? PALETTE.inchiostro : "#888",
                fontFamily: "Georgia, serif", fontSize: 17, fontWeight: 900,
                cursor: players.length >= parseInt(gameMode) ? "pointer" : "not-allowed",
                letterSpacing: 2, textTransform: "uppercase", transition: "all 0.2s" }}>
              Inizia la partita
            </button>
          </div>
        )}

        {setupTab === "classifica" && (
          <div style={{ width: "100%", maxWidth: 460, position: "relative", zIndex: 1 }}>
            {sessioniAll.length === 0 ? (
              <div style={{ background: `linear-gradient(160deg,${PALETTE.carta},${PALETTE.cartaScura})`,
                borderRadius: 18, padding: 32, textAlign: "center", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "Georgia, serif", color: PALETTE.inchiostro, marginBottom: 8 }}>
                  Nessuna sessione ancora
                </div>
                <div style={{ fontSize: 13, color: "#888", lineHeight: 1.5 }}>
                  Gioca la prima sessione e concludila con 🏁 per vedere la classifica qui.
                </div>
              </div>
            ) : (
              <HomeClassifica sessioniAll={sessioniAll} cumulative={cumulative} rankEmoji={rankEmoji} />
            )}
          </div>
        )}
      </div>
    );
  }

  if (gameStarted && !chiamataConfirmed) {
    const cifraVal = parseInt(chiamataCifra);
    const cifraValid = !isNaN(cifraVal) && cifraVal >= 81 && cifraVal <= 118;
    const canConfirm = chiamataPlayer && cifraValid;
    const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;
    const lastCaller = lastRound ? players.find(p => p.id === lastRound.chiamanteId) : null;
    const lastCompagno = lastRound ? players.find(p => p.id === lastRound.compagnoId) : null;

    return (
      <div style={{ minHeight: "100vh",
        background: `radial-gradient(ellipse at 50% 30%,${PALETTE.feltroLight},${PALETTE.feltro} 70%)`,
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: "24px 16px", position: "relative", fontFamily: "Georgia, serif" }}>
        <SeedDecoration />
        {showConfirmFine && (
          <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div style={{ background: `linear-gradient(160deg,${PALETTE.carta},${PALETTE.cartaScura})`,
              borderRadius: 18, padding: 28, width: "100%", maxWidth: 380,
              boxShadow: "0 12px 48px rgba(0,0,0,0.5)", textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🏁</div>
              <h3 style={{ margin: "0 0 8px", fontSize: 20, fontFamily: "Georgia, serif", color: PALETTE.inchiostro }}>Termina la sessione?</h3>
              <p style={{ margin: "0 0 20px", fontSize: 14, color: "#666", lineHeight: 1.5 }}>
                Verranno salvati i risultati di {rounds.length} {rounds.length === 1 ? "mano" : "mani"}.
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setShowConfirmFine(false)}
                  style={{ background: "#999", color: "#fff", border: "none", borderRadius: 8, flex: 1, padding: "12px 0", cursor: "pointer", fontFamily: "Georgia, serif", fontSize: 13, fontWeight: 700 }}>Annulla</button>
                <button onClick={terminaSessione}
                  style={{ background: "#B7410E", color: "#fff", border: "none", borderRadius: 8, flex: 2, padding: "12px 0", fontSize: 15, cursor: "pointer", fontFamily: "Georgia, serif", fontWeight: 900, textTransform: "uppercase" }}>
                  🏁 Termina
                </button>
              </div>
            </div>
          </div>
        )}
        {lastRound && (
          <div style={{ width: "100%", maxWidth: 460, marginBottom: 16, position: "relative", zIndex: 1 }}>
            <div style={{
              background: lastRound.vince
                ? `linear-gradient(135deg,${PALETTE.feltro}cc,${PALETTE.feltroLight}cc)`
                : `linear-gradient(135deg,${PALETTE.rosso}cc,#a93226cc)`,
              borderRadius: 12, padding: "14px 18px", boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            }}>
              <div style={{ fontSize: 10, letterSpacing: 3, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", marginBottom: 6 }}>
                Mano {lastRound.round} · risultato
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 24 }}>{lastRound.vince ? "✓" : "✕"}{lastRound.cappotto ? "🃏" : ""}</span>
                <div>
                  <span style={{ fontWeight: 900, fontSize: 16, color: "#fff" }}>
                    {lastRound.vince ? "Vittoria" : "Sconfitta"}{lastRound.cappotto ? " con cappotto!" : ""}
                  </span>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>
                    {lastCaller?.name} ({lastRound.cifra}) + {lastCompagno?.name}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {players.map((p, i) => {
                  const d = lastRound.delta?.[p.id] ?? 0;
                  return (
                    <div key={p.id} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 7, padding: "4px 10px", display: "flex", gap: 5, alignItems: "center" }}>
                      <span style={{ fontSize: 13, color: SEMI_COLORS[i % 4] }}>{SEMI[i % 4]}</span>
                      <span style={{ fontSize: 12, color: "#fff", fontWeight: 600 }}>{p.name}</span>
                      <span style={{ fontFamily: "monospace", fontWeight: 900, fontSize: 13, color: d > 0 ? PALETTE.oroLight : "#ff8a80" }}>
                        {d > 0 ? `+${d}` : d}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        <div style={{ textAlign: "center", marginBottom: 20, position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 10, letterSpacing: 6, color: PALETTE.oroLight, textTransform: "uppercase", marginBottom: 6 }}>
            {rounds.length > 0 ? `Mano ${rounds.length + 1}` : "Briscola"}
          </div>
          <h2 style={{ margin: 0, fontSize: 28, color: PALETTE.carta, fontWeight: 900 }}>Chi ha chiamato?</h2>
        </div>
        <div style={{ background: `linear-gradient(160deg,${PALETTE.carta},${PALETTE.cartaScura})`,
          borderRadius: 18, padding: 26, width: "100%", maxWidth: 460,
          boxShadow: "0 12px 48px rgba(0,0,0,0.4)", border: `2px solid ${PALETTE.oroLight}44`,
          position: "relative", zIndex: 1 }}>
          <div style={{ marginBottom: 22 }}>
            <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "#888", textTransform: "uppercase", display: "block", marginBottom: 11 }}>Chiamante</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {players.map((p, i) => {
                const sel = chiamataPlayer === p.id;
                return (
                  <button key={p.id} onClick={() => setChiamataPlayer(p.id)}
                    style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 13px",
                      borderRadius: 9, cursor: "pointer",
                      border: `2px solid ${sel ? PALETTE.oro : "#ccc"}`,
                      background: sel ? `linear-gradient(135deg,${PALETTE.feltro},${PALETTE.feltroLight})` : "rgba(255,255,255,0.4)",
                      color: sel ? PALETTE.carta : PALETTE.inchiostro,
                      fontFamily: "Georgia, serif", fontSize: 15, fontWeight: sel ? 700 : 500, transition: "all 0.15s" }}>
                    <span style={{ fontSize: 18, color: sel ? PALETTE.oroLight : SEMI_COLORS[i % 4] }}>{SEMI[i % 4]}</span>
                    <span style={{ flex: 1 }}>{p.name}</span>
                    {sel && <span>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "#888", textTransform: "uppercase", display: "block", marginBottom: 11 }}>
              Cifra <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: "none", color: "#bbb" }}>(81–118)</span>
            </label>
            <input type="number" min={81} max={118} placeholder="es. 95"
              value={chiamataCifra} onChange={e => setChiamataCifra(e.target.value)}
              style={{ width: "100%", padding: "13px", fontSize: 34, borderRadius: 10,
                border: `2px solid ${cifraValid ? PALETTE.oro : "#ccc"}`,
                background: "rgba(255,255,255,0.7)", color: PALETTE.inchiostro,
                fontFamily: "monospace", fontWeight: 900, outline: "none",
                boxSizing: "border-box", textAlign: "center" }} />
            {cifraValid && (
              <div style={{ textAlign: "center", marginTop: 7, fontSize: 12, color: "#888", fontFamily: "Georgia, serif" }}>
                {(() => { const b = calcolaPuntiBase(parseInt(chiamataCifra)); return <>Chiamante <strong>+{b.chiamante}</strong> · Compagno <strong>+{b.compagno}</strong> · Avversari <strong>−{b.avversario}</strong></>; })()}
              </div>
            )}
          </div>
          <button onClick={confirmChiamata} disabled={!canConfirm}
            style={{ width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
              background: canConfirm ? `linear-gradient(135deg,${PALETTE.oro},${PALETTE.oroLight})` : "#ccc",
              color: canConfirm ? PALETTE.inchiostro : "#888",
              fontFamily: "Georgia, serif", fontSize: 17, fontWeight: 900,
              cursor: canConfirm ? "pointer" : "not-allowed", letterSpacing: 2, textTransform: "uppercase",
              boxShadow: canConfirm ? "0 4px 16px rgba(201,168,76,0.4)" : "none", transition: "all 0.2s" }}>
            {rounds.length > 0 ? `▶ Mano ${rounds.length + 1}` : "Conferma chiamata"}
          </button>
          {rounds.length > 0 && (
            <button onClick={() => setShowConfirmFine(true)}
              style={{ width: "100%", marginTop: 8, padding: "12px 0", borderRadius: 10,
                border: "none", background: "#B7410E", color: "#fff",
                fontFamily: "Georgia, serif", fontSize: 15, fontWeight: 800,
                cursor: "pointer", letterSpacing: 1, textTransform: "uppercase" }}>
              🏁 Termina sessione
            </button>
          )}
          {rounds.length === 0 && (
            <button onClick={() => setState(s => ({ ...s, gameStarted: false }))}
              style={{ width: "100%", marginTop: 9, padding: "9px 0", borderRadius: 10,
                border: "none", background: "transparent", color: "#999",
                fontFamily: "Georgia, serif", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}>
              ← Torna alla configurazione
            </button>
          )}
        </div>
      </div>
    );
  }

  const isClassificaView = chiamata?.playerId === "__classifica__";
  if (isClassificaView && activeTab !== "classifica") setActiveTab("classifica");

  return (
    <div style={{ minHeight: "100vh",
      background: `radial-gradient(ellipse at 50% 0%,${PALETTE.feltroLight},${PALETTE.feltro} 60%)`,
      padding: "16px 14px 48px", fontFamily: "Georgia, serif", position: "relative" }}>
      <SeedDecoration opacity={0.07} />
      {showRubrica && <Rubrica onClose={() => { setShowRubrica(false); setSavedNames(loadSavedNames()); }} />}
      {showRoundModal && (
        <RoundModal players={players} chiamata={chiamata}
          roundNumber={rounds.length + 1}
          onSave={saveRound} onCancel={() => setShowRoundModal(false)} />
      )}
      {showConfirmFine && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: `linear-gradient(160deg,${PALETTE.carta},${PALETTE.cartaScura})`,
            borderRadius: 18, padding: 28, width: "100%", maxWidth: 380,
            boxShadow: "0 12px 48px rgba(0,0,0,0.5)", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏁</div>
            <h3 style={{ margin: "0 0 8px", fontSize: 20, fontFamily: "Georgia, serif", color: PALETTE.inchiostro }}>Termina la sessione?</h3>
            <p style={{ margin: "0 0 20px", fontSize: 14, color: "#666", lineHeight: 1.5 }}>
              Verranno salvati i risultati di {rounds.length} {rounds.length === 1 ? "mano" : "mani"}.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowConfirmFine(false)}
                style={{ background: "#999", color: "#fff", border: "none", borderRadius: 8, flex: 1, padding: "12px 0", cursor: "pointer", fontFamily: "Georgia, serif", fontSize: 13, fontWeight: 700 }}>Annulla</button>
              <button onClick={terminaSessione}
                style={{ background: "#B7410E", color: "#fff", border: "none", borderRadius: 8, flex: 2, padding: "12px 0", fontSize: 15, cursor: "pointer", fontFamily: "Georgia, serif", fontWeight: 900, textTransform: "uppercase" }}>
                🏁 Termina
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        maxWidth: 960, margin: "0 auto 16px", position: "relative", zIndex: 1 }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: 5, color: PALETTE.oroLight, textTransform: "uppercase" }}>Segnapunti</div>
          <h1 style={{ margin: 0, fontSize: 28, color: PALETTE.carta, letterSpacing: 1, fontWeight: 900 }}>Briscola</h1>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {isClassificaView && (
            <button onClick={() => setState(s => ({ ...s, chiamataConfirmed: false, chiamata: null }))}
              style={btn(PALETTE.oro, PALETTE.inchiostro, { fontWeight: 800 })}>← Nuova mano</button>
          )}
          <button onClick={resetGame} style={btn("rgba(255,255,255,0.15)", PALETTE.carta)}>↺ Reset</button>
          <button onClick={() => setShowRubrica(true)} style={btn("rgba(255,255,255,0.15)", PALETTE.carta)}>📒</button>
          <button onClick={() => setShowConfirmFine(true)} style={btn("#B7410E", "#fff", { fontWeight: 800 })}>🏁 Fine</button>
          <button onClick={newGame} style={btn(PALETTE.rosso, "#fff")}>✕ Esci</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, background: "rgba(0,0,0,0.2)", borderRadius: 12,
        padding: 4, maxWidth: 960, margin: "0 auto 18px", position: "relative", zIndex: 1 }}>
        {[["partita", "🃏 Partita"], ["classifica", "🏆 Classifica"]].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer",
              background: activeTab === key ? PALETTE.carta : "transparent",
              color: activeTab === key ? PALETTE.inchiostro : "rgba(255,255,255,0.65)",
              fontFamily: "Georgia, serif", fontSize: 14, fontWeight: activeTab === key ? 800 : 500,
              transition: "all 0.15s" }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", position: "relative", zIndex: 1 }}>
        {activeTab === "partita" && (
          <div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center", marginBottom: 20 }}>
              {sortedPlayers.map((p, rank) => (
                <PlayerCard key={p.id} player={p} rank={rank} stats={stats[p.id]}
                  onEditName={(name) => renamePlayer(p.id, name)} />
              ))}
            </div>
            {!isClassificaView && (
              <div style={{ display: "flex", justifyContent: "center" }}>
                <button onClick={() => setShowRoundModal(true)}
                  style={{ padding: "16px 40px", borderRadius: 14, border: "none",
                    background: `linear-gradient(135deg,${PALETTE.oro},${PALETTE.oroLight})`,
                    color: PALETTE.inchiostro, fontFamily: "Georgia, serif", fontSize: 18, fontWeight: 900,
                    cursor: "pointer", letterSpacing: 2, textTransform: "uppercase",
                    boxShadow: "0 6px 24px rgba(201,168,76,0.45)" }}>
                  ▶ {rounds.length > 0 ? `Mano ${rounds.length + 1}` : "Prima mano"}
                </button>
              </div>
            )}
            {rounds.length === 0 && (
              <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "rgba(255,255,255,0.45)", fontFamily: "Georgia, serif" }}>
                Nessuna mano ancora — premi il pulsante per iniziare
              </div>
            )}
          </div>
        )}
        {activeTab === "classifica" && (
          <ClassificaTab players={players} rounds={rounds} stats={stats} sessioni={loadSessioni()} />
        )}
      </div>
    </div>
  );
}
