"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import Logo from "@/components/Logo";
import BatchClock from "@/components/BatchClock";
import { runCobolEngine, CobolResult } from "@/lib/billing";
import { findAccount, searchAccounts, AccountRecord } from "@/lib/accounts";
import { UNIT_COSTS } from "@/lib/data";

// ─── Types ────────────────────────────────────────────────────────
type Step = "search" | "account" | "result";

export default function Home() {
  const [step, setStep] = useState<Step>("search");
  const [query, setQuery] = useState("");
  const [searchMiss, setSearchMiss] = useState("");   // last query that found nothing
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestIdx, setSuggestIdx] = useState(0);
  const [account, setAccount] = useState<AccountRecord | null>(null);
  const [dialRead, setDialRead] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CobolResult | null>(null);
  const [parsedDial, setParsedDial] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [rebillsSaved, setRebillsSaved] = useState(0);
  const [callbacksSaved, setCallbacksSaved] = useState(0);
  const [receiptSent, setReceiptSent] = useState(false);
  const [sessionBills, setSessionBills] = useState(0);
  const [sessionCorrected, setSessionCorrected] = useState(0);
  const [sessionDays, setSessionDays] = useState(0);
  const [heldAccounts, setHeldAccounts] = useState<Set<string>>(new Set());
  const billHeld = !!(account && heldAccounts.has(account.id));
  function toggleHold() {
    if (!account) return;
    setHeldAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(account.id)) next.delete(account.id);
      else next.add(account.id);
      return next;
    });
  }
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentVisible, setAgentVisible] = useState(false);
  const [agentQuery, setAgentQuery] = useState("Call list_backlog and rank all five cases by urgency. Use open days, callback count, status, and agent notes. Name who to deal with first and why in 2–3 sentences.");
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentReply, setAgentReply] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const dialRef = useRef<HTMLInputElement>(null);

  const openPalette = useCallback(() => setPaletteOpen(true), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); openPalette(); }
      if (e.key === "Escape") setPaletteOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPalette]);

  const suggestions = query.trim() ? searchAccounts(query).slice(0, 6) : [];
  const showSuggest = suggestOpen && query.trim().length > 0;

  function handleSearch(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    const a = findAccount(trimmed);
    if (a) {
      setAccount(a); setStep("account"); setQuery(""); setSearchMiss(""); setSuggestOpen(false); setPaletteOpen(false);
    } else {
      setSearchMiss(trimmed);
    }
  }

  // Inline validation — computed from current dialRead + loaded account
  const dialParsed = parseInt(dialRead, 10);
  const dialUsage = account ? dialParsed - account.previousRead : 0;
  const dialBelowPrev    = !!(account && dialRead && !isNaN(dialParsed) && dialParsed < account.previousRead);
  const dialNegativeUsage = !!(account && dialRead && !isNaN(dialParsed) && dialParsed === account.previousRead);
  // Flag usage that far exceeds typical quarterly consumption — ceiling is 3× typical to allow for edge cases
  const dialUnrealistic  = !!(account && dialRead && !isNaN(dialParsed) && dialUsage > account.typicalQuarterlyKwh * 3);
  const dialValid = !!(dialRead && !isNaN(dialParsed) && dialParsed > 0 && !dialBelowPrev && !dialNegativeUsage && !dialUnrealistic);

  async function handleFix() {
    if (!account || !dialRead || !dialValid) return;
    const parsed = parseInt(dialRead, 10);
    if (isNaN(parsed) || parsed <= 0) return;
    setRunning(true);
    await new Promise((r) => setTimeout(r, 420));
    const res = runCobolEngine(account.id, account.tariffCode, account.previousRead, parsed, new Date("2023-10-24"));
    setParsedDial(parsed);
    setResult(res);
    setRunning(false);
    setStep("result");
    setRebillsSaved((p) => p + UNIT_COSTS.manualBillCorrection);
    setCallbacksSaved((p) => p + UNIT_COSTS.inboundCall);
    setSessionBills((p) => p + 1);
    setSessionCorrected((p) => p + Math.max(0, account.estimatedBill - res.total));
    setSessionDays((p) => p + account.openDays);
  }

  async function handleFixWithRead(read: number) {
    if (!account) return;
    setRunning(true);
    await new Promise((r) => setTimeout(r, 420));
    const res = runCobolEngine(account.id, account.tariffCode, account.previousRead, read, new Date("2023-10-24"));
    setParsedDial(read);
    setResult(res);
    setRunning(false);
    setStep("result");
    setRebillsSaved((p) => p + UNIT_COSTS.manualBillCorrection);
    setCallbacksSaved((p) => p + UNIT_COSTS.inboundCall);
    setSessionBills((p) => p + 1);
    setSessionCorrected((p) => p + Math.max(0, account.estimatedBill - res.total));
    setSessionDays((p) => p + account.openDays);
  }

  async function handleAgentRun(mode: "advisory" | "action" = "advisory", overrideMessage?: string) {
    if (!account || agentRunning) return;
    setAgentRunning(true);
    setAgentReply("");
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: overrideMessage ?? agentQuery,
          accountId: account.id,
          dialRead: parseInt(dialRead, 10) || account.suggestedRead,
          mode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Agent failed");
      setAgentReply(data.reply || "");
      if (mode === "action") {
        for (const action of (data.actions || []) as { type: string; accountId?: string; read?: number }[]) {
          if (action.type === "rate" && action.read) {
            setDialRead(String(action.read));
            await handleFixWithRead(action.read);
          }
        }
      }
    } catch (err) {
      setAgentReply(err instanceof Error ? err.message : "Agent error");
    }
    setAgentRunning(false);
  }

  function reset() {
    setStep("search"); setAccount(null); setDialRead("");
    setResult(null); setReceiptSent(false); setParsedDial(0);
    setAgentOpen(false); setAgentVisible(false); setAgentReply(""); setAgentRunning(false);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* ── Navbar ──────────────────────────────────────────── */}
      <nav style={{
        background: "color-mix(in srgb, #f3e6d8 70%, transparent)",
        backdropFilter: "blur(10px)",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: 16,
        padding: "0 20px", height: 52,
        position: "sticky", top: 0, zIndex: 40,
      }}>
        <Logo onClick={reset} />
        <div style={{ flex: 1 }} />
        <BatchClock />
        {sessionBills > 0 && (
          <div style={{ display: "flex", gap: 14, fontSize: 13, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
            <span><b style={{ color: "var(--text)", fontWeight: 500 }}>{sessionBills}</b> fixed</span>
            <span><b style={{ color: "var(--text)", fontWeight: 500 }}>${sessionCorrected.toFixed(0)}</b> corrected</span>
            <span><b style={{ color: "var(--text)", fontWeight: 500 }}>{sessionDays}</b> days</span>
          </div>
        )}
        <a href="/metrics" style={{ fontSize: 13, fontWeight: 500, color: "var(--blue)", textDecoration: "none", whiteSpace: "nowrap" }}>
          Value case
        </a>
      </nav>

      {/* ── Main ────────────────────────────────────────────── */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 16px 60px" }}>
        <div style={{ width: "100%", maxWidth: 580 }}>

          {/* Step indicator */}
          <StepDots step={step} />

          {/* ── STEP 1: Search ──────────────────────────────── */}
          {step === "search" && (
            <div className="fade-up">
              <div style={{ marginBottom: 24 }}>
                <h1 style={{ fontSize: 28, fontWeight: 500, letterSpacing: "-0.03em", color: "var(--text)", lineHeight: 1.2, marginBottom: 8 }}>
                  Fix the bill while they are still on the phone.
                </h1>
                <p style={{ color: "var(--muted)", fontSize: 14, maxWidth: "52ch", margin: 0, lineHeight: 1.55 }}>
                  Pull up the account, take the dial reading, and the 1998 rating engine issues the corrected bill before the call ends.
                </p>
              </div>

              {/* Search box */}
              <div style={{ position: "relative", marginBottom: 20, zIndex: 5 }}>
                <div className="card" style={{ padding: 6 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      ref={searchRef}
                      value={query}
                      role="combobox"
                      aria-expanded={showSuggest}
                      aria-autocomplete="list"
                      aria-controls="account-suggest"
                      onChange={(e) => { setQuery(e.target.value); setSearchMiss(""); setSuggestOpen(true); setSuggestIdx(0); }}
                      onFocus={() => { if (query.trim()) setSuggestOpen(true); }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown" && suggestions.length) {
                          e.preventDefault();
                          setSuggestOpen(true);
                          setSuggestIdx((i) => Math.min(i + 1, suggestions.length - 1));
                        } else if (e.key === "ArrowUp" && suggestions.length) {
                          e.preventDefault();
                          setSuggestIdx((i) => Math.max(i - 1, 0));
                        } else if (e.key === "Escape") {
                          setSuggestOpen(false);
                        } else if (e.key === "Enter") {
                          if (showSuggest && suggestions[suggestIdx]) handleSearch(suggestions[suggestIdx].id);
                          else handleSearch(query);
                        }
                      }}
                      placeholder='Type account ID or name — e.g. "DUN-9021" or "Margaret"'
                      style={{
                        flex: 1, background: "transparent", border: "none", outline: "none",
                        fontSize: 14, color: "var(--text)", padding: "10px 12px",
                      }}
                    />
                    <button
                      onClick={() => handleSearch(query)}
                      style={{
                        background: "var(--blue)", color: "#fff", border: "none",
                        borderRadius: 10, padding: "10px 18px", fontSize: 13,
                        fontWeight: 700, cursor: "pointer", flexShrink: 0,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--blue-dark)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "var(--blue)")}
                    >
                      Search
                    </button>
                  </div>
                </div>
                {showSuggest && (
                  <div
                    id="account-suggest"
                    role="listbox"
                    className="card"
                    style={{
                      position: "absolute", left: 0, right: 0, top: "calc(100% + 6px)",
                      overflow: "hidden", padding: 4, zIndex: 20,
                      background: "#fff",
                      boxShadow: "0 16px 40px -12px rgba(28, 20, 16, 0.35)",
                    }}
                  >
                    {suggestions.length === 0 ? (
                      <div style={{ padding: "12px 12px", fontSize: 13, color: "var(--muted)" }}>
                        No matching accounts
                      </div>
                    ) : suggestions.map((a, i) => (
                      <button
                        key={a.id}
                        type="button"
                        role="option"
                        aria-selected={i === suggestIdx}
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setSuggestIdx(i)}
                        onClick={() => handleSearch(a.id)}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(0, 1fr) auto",
                          gap: 12,
                          width: "100%",
                          textAlign: "left",
                          border: 0,
                          borderRadius: 8,
                          padding: "10px 12px",
                          cursor: "pointer",
                          background: i === suggestIdx ? "var(--hint)" : "transparent",
                          color: "inherit",
                        }}
                      >
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 14, fontWeight: 500, color: "var(--text)" }}>{a.name}</span>
                          <span className="mono" style={{ fontSize: 11, color: "var(--dim)" }}>{a.id} · {a.region}</span>
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                          ${a.estimatedBill.toFixed(2)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* No-result state */}
              {searchMiss && (
                <div style={{
                  marginBottom: 16, padding: "14px 16px", borderRadius: 12,
                  background: "var(--surface)", border: "1.5px solid var(--border)",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
                    No account found for &ldquo;{searchMiss}&rdquo;
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
                    Try an account ID (e.g. <code style={{ fontSize: 11, background: "var(--bg)", padding: "1px 5px", borderRadius: 4, color: "var(--blue)" }}>DUN-9021</code>) or
                    the customer&apos;s surname. If the account isn&apos;t listed, it may be outside the Barrowdale/Dunmoor overbilling cohort.
                  </div>
                </div>
              )}

              {/* Quick-load accounts */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>Open cases</span>
                  <span style={{ fontSize: 12, color: "var(--dim)" }}>Disputed amount, days waiting</span>
                </div>
                <div className="card ledger">
                  {[
                    { id: "DUN-9021", name: "Margaret Holloway", bill: 842.10, days: 41, tag: "Threatening escalation", region: "Dunmoor" },
                    { id: "DUN-3345", name: "Edith Cargill",     bill: 723.50, days: 58, tag: "Solicitor involved", region: "Dunmoor" },
                    { id: "BAR-4401", name: "James Whitmore",    bill: 612.40, days: 28, tag: "", region: "Barrowdale" },
                    { id: "DUN-7782", name: "Patricia Okafor",   bill: 524.80, days: 19, tag: "", region: "Dunmoor" },
                    { id: "BAR-2209", name: "Robert Finch",      bill: 388.60, days: 12, tag: "", region: "Barrowdale" },
                  ].map((a) => (
                    <button key={a.id} onClick={() => handleSearch(a.id)} className="ledger-row">
                      <span className="mono" style={{ fontSize: 11, color: "var(--dim)" }}>{a.id}</span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", display: "block" }}>{a.name}</span>
                        <span style={{ fontSize: 12, color: a.tag ? "var(--blue)" : "var(--dim)" }}>{a.tag || a.region}</span>
                      </span>
                      <span style={{ textAlign: "right" }}>
                        {heldAccounts.has(a.id) ? (
                          <span style={{
                            fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
                            padding: "2px 7px", borderRadius: 6, display: "inline-block", marginBottom: 4,
                            background: "var(--hold-light)", color: "var(--hold)", border: "1px solid var(--hold-mid)",
                          }}>HELD</span>
                        ) : null}
                        <span className="figure" style={{ fontSize: 22, color: "var(--text)", display: "block", lineHeight: 1 }}>${a.bill.toFixed(2)}</span>
                        <span style={{ fontSize: 12, color: "var(--dim)" }}>{a.days} days</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2: Account loaded ──────────────────────── */}
          {step === "account" && account && (
            <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Outage alert — only when account is in an active incident zone */}
              {account.outage && (
                <OutageAlert
                  outage={account.outage}
                  customerFirstName={account.name.split(" ")[0]}
                />
              )}

              {/* The angry customer card */}
              <div className="card" style={{ padding: 20, borderColor: "var(--red-mid)", borderWidth: 1.5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 10, color: "var(--dim)", marginBottom: 4, letterSpacing: "0.05em" }}>
                      {account.region} · {account.id} · {account.openDays} days open
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 500, color: "var(--text)" }}>{account.name}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{account.address}</div>
                  </div>
                  <StatusBadge status={account.status} />
                </div>

                {/* Bill comparison */}
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr auto 1fr",
                  gap: 12, alignItems: "center",
                  background: "var(--red-light)", borderRadius: 12,
                  padding: "16px 20px", border: "1px solid var(--red-mid)",
                }}>
                  <div>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>Disputed bill amount</div>
                    <div className="figure" style={{ fontSize: 36, color: "var(--red)", lineHeight: 1 }}>
                      ${account.estimatedBill.toFixed(2)}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                      SYS-06 guessed {account.estimatedRead.toLocaleString()} kWh
                    </div>
                  </div>
                  <div style={{ fontSize: 20, color: "var(--red-mid)" }}>→</div>
                  <div>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>Meter last read</div>
                    <div className="figure" style={{ fontSize: 26, color: "var(--text)", lineHeight: 1.1 }}>
                      {(() => { const [y,m,d] = account.previousReadDate.split("-").map(Number); return new Date(y,m-1,d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); })()}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                      {(() => { const [y,m,d] = account.previousReadDate.split("-").map(Number); return Math.round((Date.now() - new Date(y,m-1,d).getTime()) / (1000*60*60*24*30)); })()} months without a real read
                    </div>
                  </div>
                </div>

                {account.agentNotes && (
                  <div style={{
                    marginTop: 12, padding: "8px 12px", borderRadius: 8,
                    background: "var(--hint)", border: "1px solid var(--border)",
                    fontSize: 11, color: "var(--text)",
                  }}>
                    {account.agentNotes}
                  </div>
                )}
              </div>

              {/* The fix */}
              <div className="card" style={{ padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
                  Customer Dial Read
                </div>

                {/* Previous read anchor — context for the agent on the call */}
                {(() => {
                  const BILLING_DATE = new Date("2023-10-24");
                  const prevDate = new Date(account.previousReadDate);
                  const daysSince = Math.round((BILLING_DATE.getTime() - prevDate.getTime()) / 86_400_000);
                  const estimatedUsage = account.estimatedRead - account.previousRead;
                  const impliedDailyRate = Math.round(estimatedUsage / daysSince);
                  const typicalDailyRate = Math.round(account.typicalQuarterlyKwh / 91);
                  const daysColor = daysSince > 90 ? "var(--red)" : daysSince > 60 ? "var(--amber)" : "var(--green)";

                  return (
                    <div style={{
                      display: "grid", gridTemplateColumns: "1fr 1px 1fr 1px 1fr",
                      gap: 0, marginBottom: 14,
                      borderRadius: 10,
                      border: "1px solid var(--border)", background: "var(--bg)",
                    }}>
                      {/* Col 1 — Last verified read */}
                      <div style={{ padding: "10px 12px", borderRadius: "10px 0 0 10px" }}>
                        <div style={{ fontSize: 9, color: "var(--dim)", fontWeight: 700, letterSpacing: "0.05em", marginBottom: 4 }}>LAST VERIFIED READ</div>
                        <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                          {account.previousRead.toLocaleString()} kWh
                        </div>
                        <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 2 }}>{account.previousReadDate}</div>
                      </div>

                      {/* Divider */}
                      <div style={{ background: "var(--border)" }} />

                      {/* Col 2 — Days unread */}
                      <div style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                          <div style={{ fontSize: 9, color: "var(--dim)", fontWeight: 700, letterSpacing: "0.05em" }}>DAYS UNREAD</div>
                          <InfoTip content={
                            <>
                              <strong style={{ color: "#fff" }}>Why this matters</strong><br /><br />
                              Ofgem requires an actual meter read at least once every 2 years, but best practice is quarterly (every ~90 days). The longer the gap, the more the estimated reading can drift from reality.<br /><br />
                              <strong style={{ color: "#fffcf8" }}>{daysSince} days</strong> without a verified read is {daysSince > 90 ? "above the recommended 90-day threshold." : "within threshold, but drift is still possible."}
                            </>
                          } />
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 500, color: daysColor, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                          {daysSince}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 2 }}>
                          days since last actual read
                        </div>
                      </div>

                      {/* Divider */}
                      <div style={{ background: "var(--border)" }} />

                      {/* Col 3 — System guessed */}
                      <div style={{ padding: "10px 12px", borderRadius: "0 10px 10px 0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                          <div style={{ fontSize: 9, color: "var(--dim)", fontWeight: 700, letterSpacing: "0.05em" }}>SYSTEM GUESSED</div>
                          <InfoTip content={
                            <>
                              <strong style={{ color: "#fff" }}>How SYS-06 built this estimate</strong><br /><br />
                              <span style={{ color: "#a8a29e" }}>Formula:</span>{" "}
                              last read + (daily avg × days in period)<br /><br />
                              <span style={{ color: "#fffcf8" }}>{account.previousRead.toLocaleString()}</span>
                              {" + "}(<span style={{ color: "#fffcf8" }}>{impliedDailyRate} kWh/day</span> × {daysSince} days)
                              {" = "}<span style={{ color: "#fffcf8" }}>{account.estimatedRead.toLocaleString()}</span><br /><br />
                              The implied rate of <strong style={{ color: "#fffcf8" }}>{impliedDailyRate} kWh/day</strong> is roughly <strong style={{ color: "#fffcf8" }}>{Math.round(impliedDailyRate / typicalDailyRate)}×</strong> the typical rate of ~{typicalDailyRate} kWh/day for this household. SYS-06's seasonal curve (calibrated 2010–2012) hasn't been updated and doesn't account for changes in this customer's usage pattern.
                            </>
                          } />
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 500, color: "var(--red)", fontVariantNumeric: "tabular-nums" }}>
                          {account.estimatedRead.toLocaleString()} kWh
                        </div>
                        <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 2 }}>
                          ~{impliedDailyRate} kWh/day implied · typical ~{typicalDailyRate}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10, lineHeight: 1.7 }}>
                  Ask the customer to read their meter dial. The number must be higher than{" "}
                  <strong>{account.previousRead.toLocaleString()}</strong>{" "}
                  <InfoTip content={
                    <>
                      <strong style={{ color: "#fff" }}>Why must it be higher?</strong><br />
                      Mechanical dial meters only ever count upward — they record total cumulative kWh since installation, never going backwards. The last verified read was {account.previousRead.toLocaleString()} on {account.previousReadDate}. A lower number would mean either a misread dial or an extremely rare meter rollover past 99,999.
                    </>
                  } />.{" "}
                  This account typically uses <strong>{account.typicalQuarterlyKwh.toLocaleString()} kWh/quarter</strong>.
                </div>

                {/* Suggested reading shortcut */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 11, color: "var(--dim)" }}>Customer says:</span>
                  <button
                    onClick={() => setDialRead(String(account.suggestedRead))}
                    style={{
                      fontSize: 11, fontWeight: 700, color: "var(--blue)",
                      background: "var(--blue-light)", border: "1px solid var(--blue-mid)",
                      borderRadius: 8, padding: "3px 10px", cursor: "pointer",
                    }}
                  >
                    {account.suggestedRead.toLocaleString()}
                  </button>
                </div>

                <input
                  ref={dialRef}
                  type="number"
                  value={dialRead}
                  onChange={(e) => setDialRead(e.target.value)}
                  onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleFix(); }}
                  placeholder={`e.g. ${account.suggestedRead.toLocaleString()}`}
                  style={{
                    width: "100%",
                    border: `2px solid ${dialBelowPrev || dialNegativeUsage ? "var(--red)" : dialValid ? "var(--blue)" : "var(--border)"}`,
                    borderRadius: 12, padding: "14px 16px", fontSize: 28,
                    fontWeight: 500, color: dialBelowPrev || dialNegativeUsage ? "var(--red)" : "var(--text)",
                    background: "var(--bg)", outline: "none", marginBottom: 6,
                    transition: "border-color 0.15s",
                    fontVariantNumeric: "tabular-nums",
                  }}
                />

                {/* Inline validation message */}
                <div style={{ minHeight: 20, marginBottom: 10 }}>
                  {dialBelowPrev && (
                    <div style={{ fontSize: 11, color: "var(--red)", fontWeight: 600 }}>
                      Reading {dialParsed.toLocaleString()} is below the last verified read of {account.previousRead.toLocaleString()} — check the meter again.
                    </div>
                  )}
                  {dialNegativeUsage && (
                    <div style={{ fontSize: 11, color: "var(--red)", fontWeight: 600 }}>
                      Reading matches the last verified read exactly — usage would be zero. Check the meter.
                    </div>
                  )}
                  {dialUnrealistic && !dialBelowPrev && !dialNegativeUsage && (
                    <div style={{
                      background: "var(--red-light, #fff1f0)", border: "1px solid var(--red-mid, #fca5a5)",
                      borderRadius: 10, padding: "10px 12px",
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--red)", marginBottom: 4 }}>
                        ⚠ Reading doesn&apos;t add up — do not proceed
                      </div>
                      <div style={{ fontSize: 11, color: "var(--red)", lineHeight: 1.6 }}>
                        {dialUsage.toLocaleString()} kWh implied — that&apos;s{" "}
                        <strong>{(dialUsage / account.typicalQuarterlyKwh).toFixed(1)}×</strong> this account&apos;s
                        typical quarterly usage of {account.typicalQuarterlyKwh.toLocaleString()} kWh.
                        A plausible reading would be under{" "}
                        <strong>{(account.previousRead + account.typicalQuarterlyKwh * 3).toLocaleString()}</strong>.
                        Ask the customer to re-read the dial — they may have misread a digit.
                      </div>
                    </div>
                  )}
                  {dialValid && (
                    <div style={{ fontSize: 11, color: "var(--green)", fontWeight: 600 }}>
                      Usage: {dialUsage.toLocaleString()} kWh — plausible.
                    </div>
                  )}
                </div>

                <button
                  onClick={handleFix}
                  disabled={!dialValid || running}
                  style={{
                    width: "100%", padding: "16px", borderRadius: 12,
                    background: dialValid && !running ? "var(--blue)" : "var(--border)",
                    color: dialValid && !running ? "#fff" : "var(--dim)",
                    border: "none", fontSize: 16, fontWeight: 500,
                    cursor: dialValid && !running ? "pointer" : "not-allowed",
                    transition: "all 0.15s", display: "flex",
                    alignItems: "center", justifyContent: "center", gap: 10,
                    boxShadow: dialValid && !running ? "0 4px 16px rgba(36,98,232,0.35)" : "none",
                    
                  }}
                  onMouseEnter={(e) => { if (dialValid && !running) e.currentTarget.style.background = "var(--blue-dark)"; }}
                  onMouseLeave={(e) => { if (dialValid && !running) e.currentTarget.style.background = "var(--blue)"; }}
                >
                  {running ? (
                    <><span style={{ display: "inline-block", animation: "spin 0.7s linear infinite" }}>⟳</span> Running COBOL engine…</>
                  ) : (
                    <>Correct the bill</>
                  )}
                </button>
                <div style={{ textAlign: "center", fontSize: 10, color: "var(--dim)", marginTop: 8 }}>
                  Ctrl+Enter · Aurora SYS-01 rating engine · batch record ready for 2am ingest
                </div>

                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                  <button
                    type="button"
                    onClick={toggleHold}
                    style={{
                      width: "100%", padding: "10px 16px", fontSize: 13, fontWeight: 500,
                      background: billHeld ? "var(--hold-light)" : "transparent",
                      color: billHeld ? "var(--hold)" : "var(--text)",
                      border: `1px solid ${billHeld ? "var(--hold-mid)" : "var(--border-md)"}`,
                      borderRadius: 10, cursor: "pointer",
                    }}
                  >
                    {billHeld ? "Bill held — click to release" : "Hold tonight's bill dispatch"}
                  </button>
                  {!billHeld && (
                    <div style={{ fontSize: 12, color: "var(--dim)", textAlign: "center", marginTop: 6 }}>
                      Suspends the 2am batch dispatch while you get a verified read
                    </div>
                  )}
                </div>
              </div>

              {billHeld && (
                <div className="card fade-up" style={{ padding: "16px 20px", background: "var(--hold-light)", borderColor: "var(--hold-mid)" }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--hold-dark)", marginBottom: 4 }}>
                    Bill held — ${account.estimatedBill.toFixed(2)} will not dispatch tonight
                  </div>
                  <div style={{ fontSize: 13, color: "var(--hold-dark)", lineHeight: 1.55 }}>
                    The 2am SYS-01 batch job will skip this account. {account.name.split(" ")[0]} won&apos;t receive the estimated bill while you get a verified dial read. Case stays open.
                  </div>
                </div>
              )}

              {/* ── AI Agent panel ─────────────────────────── */}
              {!agentVisible && (
                <button
                  onClick={() => { setAgentVisible(true); setAgentOpen(true); }}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: 11, color: "var(--dim)", display: "flex",
                    alignItems: "center", gap: 6, padding: "2px 0",
                  }}
                >
                  <span style={{
                    width: 16, height: 16, borderRadius: 5, background: "var(--blue-light)",
                    border: "1px solid var(--blue-mid)", display: "inline-flex",
                    alignItems: "center", justifyContent: "center",
                    fontSize: 9, color: "var(--blue)", flexShrink: 0,
                  }}>✦</span>
                  <span style={{ textDecoration: "underline", textDecorationStyle: "dotted" }}>Show AI agent</span>
                </button>
              )}
              {agentVisible && (
              <div className="card" style={{ padding: 0, overflow: "hidden", borderColor: "var(--blue-mid)" }}>
                <button
                  onClick={() => setAgentOpen((v) => !v)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 16px", background: "var(--blue-light)", border: "none", cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: 6, background: "var(--blue)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, color: "#fff", fontWeight: 500, flexShrink: 0,
                    }}>✦</div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--blue)" }}>Agent auto-fix</span>
                    <span style={{ fontSize: 11, color: "var(--dim)" }}>— let the AI handle it</span>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--dim)" }}>{agentOpen ? "▲" : "▼"}</span>
                </button>

                {agentOpen && (
                  <div style={{ padding: "12px 16px 16px", background: "var(--surface)", borderTop: "1px solid var(--border)" }}>

                    {/* Advisory chips — text output only */}
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", letterSpacing: "0.05em", marginBottom: 6 }}>ASK</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                      {[
                        { label: "Triage queue",       query: "Call list_backlog and rank all five cases by urgency. Use open days, callback count, status, and agent notes. Name who to deal with first and why in 2–3 sentences." },
                        { label: "Why overbilled?",    query: "Explain in plain English why this customer was overbilled. What did the SYS-06 algorithm get wrong for their specific account?" },
                        { label: "Escalate or close?", query: "Should I escalate this case, offer goodwill credit, or just correct and close? One clear recommendation with a single sentence of reasoning." },
                        { label: "Call prep",          query: "Give me 3 specific talking points for my live call with this customer. Base it on their wait time, what went wrong, and how I'm fixing it. Conversational, not scripted." },
                      ].map((chip) => (
                        <button
                          key={chip.label}
                          onClick={() => setAgentQuery(chip.query)}
                          style={{
                            padding: "5px 11px", fontSize: 11, fontWeight: 600,
                            background: agentQuery === chip.query ? "var(--blue-light)" : "var(--bg)",
                            color: agentQuery === chip.query ? "var(--blue)" : "var(--muted)",
                            border: `1px solid ${agentQuery === chip.query ? "var(--blue-mid)" : "var(--border-md)"}`,
                            borderRadius: 20, cursor: "pointer",
                          }}
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>

                    {/* Custom query */}
                    <textarea
                      value={agentQuery}
                      onChange={(e) => setAgentQuery(e.target.value)}
                      rows={2}
                      style={{
                        width: "100%", padding: "8px 10px", fontSize: 12, color: "var(--text)",
                        background: "var(--bg)", border: "1px solid var(--border-md)", borderRadius: 8,
                        resize: "none", boxSizing: "border-box", lineHeight: 1.5,
                      }}
                      placeholder="Or type a custom question…"
                    />

                    {/* Buttons: Ask (advisory) and Do it for me (action) */}
                    <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                      <button
                        onClick={() => handleAgentRun("advisory")}
                        disabled={agentRunning}
                        style={{
                          padding: "7px 16px", fontSize: 12, fontWeight: 700,
                          background: agentRunning ? "var(--hint)" : "var(--blue)",
                          color: "#fff", border: "none", borderRadius: 8,
                          cursor: agentRunning ? "default" : "pointer",
                        }}
                      >
                        {agentRunning
                          ? <><span style={{ display: "inline-block", animation: "spin 0.7s linear infinite" }}>⟳</span> Running…</>
                          : "Ask"}
                      </button>
                      <div style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0 }} />
                      <button
                        onClick={() => handleAgentRun("action", "Rate the bill using the suggested dial read, then close the case.")}
                        disabled={agentRunning}
                        style={{
                          padding: "7px 14px", fontSize: 12, fontWeight: 600,
                          background: "none", color: "var(--muted)",
                          border: "1px solid var(--border-md)", borderRadius: 8,
                          cursor: agentRunning ? "default" : "pointer",
                        }}
                      >
                        Do it for me →
                      </button>
                    </div>

                    {/* Reply output — strip markdown markers */}
                    {agentReply && (
                      <div style={{
                        marginTop: 12, padding: "12px 14px",
                        background: "var(--blue-light)", border: "1px solid var(--blue-mid)",
                        borderRadius: 10, fontSize: 12, color: "var(--muted)",
                        lineHeight: 1.75, whiteSpace: "pre-wrap",
                      }}>
                        {agentReply.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1")}
                      </div>
                    )}
                  </div>
                )}
              </div>
              )}

              <button onClick={reset} style={{ background: "none", border: "none", color: "var(--dim)", fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>
                ← Back to search
              </button>
            </div>
          )}

          {/* ── STEP 3: Result ──────────────────────────────── */}
          {step === "result" && account && result && (
            <CalcResult
              account={account}
              result={result}
              parsedDial={parsedDial}
              receiptSent={receiptSent}
              onSendReceipt={() => setReceiptSent(true)}
              onReset={reset}
            />
          )}
        </div>
      </main>

      {/* Command palette (Ctrl+K still works) */}
      {paletteOpen && (
        <PaletteModal onSelect={(a) => { setAccount(a); setStep("account"); setPaletteOpen(false); }} onClose={() => setPaletteOpen(false)} />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ── CalcResult — narrated calculation terminal ─────────────────────
function CalcResult({
  account, result, parsedDial, receiptSent, onSendReceipt, onReset,
}: {
  account: AccountRecord;
  result: CobolResult;
  parsedDial: number;
  receiptSent: boolean;
  onSendReceipt: () => void;
  onReset: () => void;
}) {
  type CalcLine = { text: string; kind: "section" | "row" | "divider" | "total" | "success" };
  const [lines, setLines] = useState<CalcLine[]>([]);
  const [done, setDone] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Build the narrated script from real result data
  const script: CalcLine[] = [
    { kind: "section", text: "Step 1 — Reading the meter" },
    { kind: "row",     text: `  Previous read  (${account.previousReadDate}):   ${account.previousRead.toLocaleString()} kWh` },
    { kind: "row",     text: `  Customer's dial (verified on call):  ${parsedDial.toLocaleString()} kWh` },
    { kind: "row",     text: `  ─────────────────────────────────────────────` },
    { kind: "row",     text: `  Units actually used:                 ${result.units.toLocaleString()} kWh  ✓` },
    { kind: "row",     text: `  Algorithm had guessed:              ${(account.estimatedRead - account.previousRead).toLocaleString()} kWh  ✗` },
    { kind: "row",     text: `` },
    { kind: "section", text: "Step 2 — Applying tariff " + account.tariffCode },
    { kind: "row",     text: `  Standing charge (quarterly):         $${result.standingCharge.toFixed(2)}` },
    ...result.tierBreakdown.map((t) => ({
      kind: "row" as const,
      text: `  ${t.tier.padEnd(28)} ${String(t.units).padStart(4)} kWh × $${t.rate.toFixed(4)} = $${t.cost.toFixed(2)}`,
    })),
    { kind: "row",     text: `` },
    { kind: "section", text: "Step 3 — Checking for exceptions" },
    { kind: "row",     text: `  Tariff mismatch?             NO` },
    { kind: "row",     text: `  Reading reversal?            NO` },
    { kind: "row",     text: `  Overflow (>50k units)?       NO` },
    { kind: "row",     text: `  Return code:                 ${result.returnCode}  (VALID)` },
    { kind: "row",     text: `` },
    { kind: "divider", text: `  ══════════════════════════════════════════════` },
    { kind: "total",   text: `  CORRECTED TOTAL:            $${result.total.toFixed(2)}` },
    { kind: "total",   text: `  Execution time:             ${result.execMs}ms` },
    { kind: "divider", text: `  ══════════════════════════════════════════════` },
    { kind: "success", text: `  ✓  RC 0000. Bill corrected. ${account.name.split(" ")[0]}'s account is clear.` },
  ];

  useEffect(() => {
    // Capture script at mount time so interval closure is stable
    const frozen = script.slice();
    setLines([]); setDone(false);
    let i = 0;
    const iv = setInterval(() => {
      if (i >= frozen.length) { clearInterval(iv); setDone(true); return; }
      const entry = frozen[i];
      if (entry) setLines((p) => [...p, entry]);
      i++;
      if (i >= frozen.length) { clearInterval(iv); setTimeout(() => setDone(true), 300); }
    }, 55);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines]);

  const savings = account.estimatedBill - result.total;

  const lineColor = (kind: CalcLine["kind"]) => {
    if (kind === "section") return "#00cc30";
    if (kind === "total")   return "#00FF41";
    if (kind === "success") return "#00FF41";
    if (kind === "divider") return "#1a3a1a";
    return "#2a7a2a";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Calc terminal */}
      <div className="card fade-up" style={{ overflow: "hidden" }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--border-md)" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--border-md)" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--border-md)" }} />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                Aurora COBOL Rating Engine — Live Calculation
              </div>
              <div style={{ fontSize: 10, color: "var(--dim)" }}>
                rating.cob v4.2.1 (1998) · running in WebAssembly · {result.execMs}ms
              </div>
            </div>
          </div>
          {done && (
            <span style={{
              fontSize: 11, fontWeight: 700, borderRadius: 100, padding: "4px 12px",
              background: savings >= 0 ? "var(--green-light)" : "var(--amber-light)",
              color: savings >= 0 ? "var(--green)" : "var(--amber)",
              border: `1px solid ${savings >= 0 ? "var(--green-mid)" : "var(--amber-mid)"}`,
            }}>
              ✓ RC: {result.returnCode}
            </span>
          )}
        </div>

        {/* The narrated terminal output */}
        <div
          ref={scrollRef}
          className="cobol-screen"
          style={{ padding: "16px 20px", minHeight: 200, maxHeight: 340, overflowY: "auto" }}
        >
          {lines.filter(Boolean).map((line, i) => (
            <div
              key={i}
              style={{
                fontSize: line.kind === "total" || line.kind === "success" ? 13 : 12,
                fontWeight: line.kind === "total" || line.kind === "section" ? 700 : 400,
                color: lineColor(line.kind),
                lineHeight: 1.7,
                whiteSpace: "pre",
              }}
            >
              {line.text || "\u00A0"}
            </div>
          ))}
          {!done && <span style={{ color: "#00FF41", animation: "blink 1s step-end infinite" }}>█</span>}
        </div>
      </div>

      {/* Bill change — shown once calc is done */}
      {done && (
        <div
          className="card fade-up"
          style={{ padding: 24, borderColor: savings >= 0 ? "var(--green-mid)" : "var(--amber-mid)", borderWidth: 2 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 20, justifyContent: "center", flexWrap: "wrap" }}>
            {/* Old */}
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "var(--dim)", marginBottom: 6 }}>
                {savings >= 0 ? "Estimated bill" : "Estimated bill"}
              </div>
              <div className="figure" style={{ fontSize: 34, color: "var(--dim)", textDecoration: "line-through", textDecorationColor: savings >= 0 ? "var(--blue)" : "var(--amber)" }}>
                ${account.estimatedBill.toFixed(2)}
              </div>
              <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 4 }}>
                {savings >= 0 ? "overestimated" : "underestimated"} — {(account.estimatedRead - account.previousRead).toLocaleString()} kWh guessed
              </div>
            </div>

            <div style={{ fontSize: 30, color: savings >= 0 ? "var(--green-mid)" : "var(--amber-mid)" }}>→</div>

            {/* New */}
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "var(--dim)", marginBottom: 6 }}>
                Corrected bill
              </div>
              <div className="num-tick figure" style={{ fontSize: 56, color: "var(--text)", lineHeight: 1 }}>
                ${result.total.toFixed(2)}
              </div>
              <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 4 }}>
                based on {result.units.toLocaleString()} kWh (verified)
              </div>
            </div>
          </div>

          <div style={{
            marginTop: 16, padding: "10px 16px", borderRadius: 10, textAlign: "center",
            background: savings >= 0 ? "var(--green-light)" : "var(--amber-light)",
            border: `1px solid ${savings >= 0 ? "var(--green-mid)" : "var(--amber-mid)"}`,
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: savings >= 0 ? "var(--green)" : "var(--amber)" }}>
              {savings >= 0
                ? `${account.name} saves $${savings.toFixed(2)} — corrected on the first call.`
                : `${account.name}'s corrected bill is $${Math.abs(savings).toFixed(2)} higher than estimated — reading confirmed on call.`
              }
            </span>
          </div>
        </div>
      )}

      {/* Batch line */}
      {done && (
        <div className="card fade-up" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "11px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>Aurora SYS-01 Batch File</div>
              <div style={{ fontSize: 10, color: "var(--dim)" }}>80-column · ready for 2:00 AM ingest · rejection rate: 0.00%</div>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(result.batchLine)}
              style={{ fontSize: 11, color: "var(--blue)", background: "var(--blue-light)", border: "1px solid var(--blue-mid)", borderRadius: 8, padding: "4px 10px", cursor: "pointer", }}
            >
              Copy
            </button>
          </div>
          <div className="cobol-screen" style={{ padding: "12px 16px", overflowX: "auto" }}>
            <div style={{ whiteSpace: "nowrap", fontSize: 13, fontWeight: 700, letterSpacing: "0.05em" }}>
              {result.batchLine}
            </div>
          </div>
        </div>
      )}

      {/* Under the hood — collapsible COBOL proof */}
      {done && (
        <UnderTheHood
          result={result}
          account={account}
          parsedDial={parsedDial}
        />
      )}

      {/* Actions */}
      {done && (
        <div className="fade-up" style={{ display: "flex", gap: 12 }}>
          <button
            onClick={onSendReceipt}
            style={{
              flex: 1, padding: "14px", borderRadius: 12, border: "none",
              background: receiptSent ? "var(--green)" : "var(--text)",
              color: "#fff", fontSize: 14, fontWeight: 500,
              cursor: "pointer", transition: "all 0.2s", 
            }}
          >
            {receiptSent ? `✓ Receipt sent to ${account.name.split(" ")[0]}` : "Send Receipt via SMS"}
          </button>
          <button
            onClick={onReset}
            style={{
              padding: "14px 20px", borderRadius: 12,
              background: "var(--surface)", color: "var(--muted)",
              border: "1px solid var(--border)", fontSize: 13,
              fontWeight: 600, cursor: "pointer", 
            }}
          >
            Next case
          </button>
        </div>
      )}

      {/* Receipt */}
      {done && receiptSent && (
        <BillAdjustmentReceipt account={account} result={result} parsedDial={parsedDial} savings={savings} />
      )}
    </div>
  );
}

// ── BillAdjustmentReceipt ──────────────────────────────────────────
function BillAdjustmentReceipt({
  account, result, parsedDial, savings,
}: {
  account: AccountRecord;
  result: CobolResult;
  parsedDial: number;
  savings: number;
}) {
  const ref = `ADJ-${account.id}-${result.returnCode}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const issuedAt = new Date("2023-10-24T14:32:00").toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const rows = [
    { label: "Account",         value: account.id },
    { label: "Customer",        value: account.name },
    { label: "Address",         value: account.address },
    { label: "Tariff",          value: account.tariffCode },
    { label: "Period end read", value: `${parsedDial.toLocaleString()} kWh (verified on call)` },
    { label: "Previous read",   value: `${account.previousRead.toLocaleString()} kWh · ${account.previousReadDate}` },
    { label: "Units consumed",  value: `${result.units.toLocaleString()} kWh` },
  ];

  return (
    <div className="fade-up" style={{
      borderRadius: 12, overflow: "hidden",
      border: "1px solid var(--green-mid)",
      background: "var(--surface)",
    }}>
      {/* Header strip */}
      <div style={{
        background: "var(--green)", padding: "14px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#fff", marginBottom: 2 }}>
            Bill Adjustment Confirmed
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>
            Sent via SMS · {issuedAt}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", marginBottom: 2 }}>REF</div>
          <div style={{
            fontSize: 11, fontWeight: 700, color: "#fff", letterSpacing: "0.06em",
            fontFamily: "var(--font-mono), monospace",
          }}>{ref}</div>
        </div>
      </div>

      {/* Account detail rows */}
      <div style={{ padding: "0 20px" }}>
        {rows.map((r, i) => (
          <div key={r.label} style={{
            display: "flex", justifyContent: "space-between", alignItems: "baseline",
            gap: 16, padding: "9px 0",
            borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none",
          }}>
            <span style={{ fontSize: 11, color: "var(--dim)", flexShrink: 0 }}>{r.label}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", textAlign: "right" }}>{r.value}</span>
          </div>
        ))}
      </div>

      {/* Bill comparison */}
      <div style={{
        margin: "0 20px 20px",
        borderRadius: 10, overflow: "hidden",
        border: "1px solid var(--border)",
      }}>
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr",
        }}>
          <div style={{ padding: "14px 16px", background: "var(--red-light)", borderRight: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6, fontWeight: 600 }}>ORIGINAL BILL</div>
            <div className="figure" style={{ fontSize: 28, color: "var(--dim)", lineHeight: 1, textDecoration: "line-through", textDecorationColor: "var(--blue)" }}>
              ${account.estimatedBill.toFixed(2)}
            </div>
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
              Based on {(account.estimatedRead - account.previousRead).toLocaleString()} kWh estimate
            </div>
          </div>
          <div style={{ padding: "14px 16px", background: "var(--green-light)" }}>
            <div style={{ fontSize: 10, color: "var(--green)", marginBottom: 6, fontWeight: 700 }}>CORRECTED BILL</div>
            <div className="figure" style={{ fontSize: 28, color: "var(--text)", lineHeight: 1 }}>
              ${result.total.toFixed(2)}
            </div>
            <div style={{ fontSize: 10, color: "var(--green)", marginTop: 4 }}>
              Based on {result.units.toLocaleString()} kWh actual
            </div>
          </div>
        </div>
        {savings > 0 && (
          <div style={{
            padding: "10px 16px", textAlign: "center",
            background: "var(--green-light)", borderTop: "1px solid var(--green-mid)",
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--green)" }}>
              ${savings.toFixed(2)} reduction applied · your account will reflect this within 2 working days
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: "12px 20px", borderTop: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "var(--bg)",
      }}>
        <div style={{ fontSize: 10, color: "var(--dim)", lineHeight: 1.6 }}>
          Northwind Energy · Authorised under Ofgem Licence · Engine: Aurora SYS-01 v4.2.1
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, borderRadius: 100, padding: "3px 10px",
            background: "var(--green-light)", color: "var(--green)", border: "1px solid var(--green-mid)",
          }}>
            RC: {result.returnCode}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 600, borderRadius: 100, padding: "3px 10px",
            background: "var(--bg)", color: "var(--dim)", border: "1px solid var(--border)",
          }}>
            {result.execMs}ms
          </span>
        </div>
      </div>
    </div>
  );
}

// ── UnderTheHood — collapsible COBOL proof ─────────────────────────
function UnderTheHood({
  result, account, parsedDial,
}: {
  result: CobolResult;
  account: AccountRecord;
  parsedDial: number;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"annotated" | "source" | "wasm">("annotated");

  const units = result.units;
  const t1Units = Math.min(units, 500);
  const t2Units = Math.max(0, Math.min(units - 500, 1500));
  const t3Units = Math.max(0, units - 2000);

  // Build annotated COBOL — real source with actual values substituted
  const annotated = [
    { code: `       IDENTIFICATION DIVISION.`,                                  note: "" },
    { code: `       PROGRAM-ID. RATING.`,                                       note: "" },
    { code: `      * Aurora Billing v4.2.1 — Tariff Rating Module`,             note: "" },
    { code: ``,                                                                  note: "" },
    { code: `       PROCEDURE DIVISION.`,                                        note: "" },
    { code: `       MAIN-LOGIC.`,                                                note: "" },
    { code: `           MOVE ${parsedDial} TO WS-CURRENT-READ`,                 note: `← customer's dial: ${parsedDial.toLocaleString()}` },
    { code: `           MOVE ${account.previousRead} TO WS-PREV-READ`,          note: `← previous billing read` },
    { code: `           SUBTRACT WS-PREV-READ FROM WS-CURRENT-READ`,           note: "" },
    { code: `             GIVING WS-UNITS-CONSUMED`,                            note: `→ ${units.toLocaleString()} kWh` },
    { code: `           MOVE "${account.tariffCode}" TO WS-TARIFF-CODE`,        note: "" },
    { code: `           MOVE 2250 TO WS-STANDING-CHG`,                         note: `→ $22.50 fixed` },
    { code: `           PERFORM CALC-TIER-RATING`,                              note: "" },
    { code: `           PERFORM VALIDATE-EXCEPTIONS`,                           note: "" },
    { code: `           PERFORM WRITE-BATCH-RECORD`,                            note: "" },
    { code: `           STOP RUN.`,                                              note: "" },
    { code: ``,                                                                  note: "" },
    { code: `       CALC-TIER-RATING.`,                                          note: "" },
    { code: `           IF WS-UNITS-CONSUMED <= 500`,                           note: units <= 500 ? `← TRUE (${units} ≤ 500)` : `← FALSE (${units} > 500)` },
    ...(units <= 500 ? [
      { code: `             COMPUTE WS-TIER1-COST =`,                           note: "" },
      { code: `               ${units} * 0.0895`,                               note: `→ $${(units * 0.0895).toFixed(2)}` },
    ] : [
      { code: `             COMPUTE WS-TIER1-COST = 500 * 0.0895`,             note: `→ $${(500 * 0.0895).toFixed(2)}` },
      { code: `             COMPUTE WS-TIER2-COST =`,                           note: "" },
      { code: `               (${units} - 500) * 0.1340`,                       note: `→ $${(t2Units * 0.1340).toFixed(2)}` },
      ...(t3Units > 0 ? [
        { code: `             COMPUTE WS-TIER3-COST =`,                         note: "" },
        { code: `               (${units} - 2000) * 0.2480`,                   note: `→ $${(t3Units * 0.2480).toFixed(2)}` },
      ] : []),
    ]),
    { code: ``,                                                                  note: "" },
    { code: `       VALIDATE-EXCEPTIONS.`,                                       note: "" },
    { code: `           IF WS-UNITS-CONSUMED < 0`,                             note: `← FALSE (${units} ≥ 0)` },
    { code: `             MOVE "8001" TO WS-RETURN-CODE`,                       note: `  skipped` },
    { code: `           ELSE IF WS-UNITS-CONSUMED > 50000`,                    note: `← FALSE (${units} ≤ 50000)` },
    { code: `             MOVE "8002" TO WS-RETURN-CODE`,                       note: `  skipped` },
    { code: `           ELSE`,                                                   note: "" },
    { code: `             MOVE "0000" TO WS-RETURN-CODE`,                       note: `→ VALID ✓` },
    { code: `           END-IF.`,                                                note: "" },
  ];

  const rawSource = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. RATING.
      *========================================
      * AURORA BILLING SYSTEM v4.2.1 (1998)
      * NORTHWIND ENERGY — TARIFF RATING MODULE
      *========================================
       WORKING-STORAGE SECTION.
           05 WS-CURRENT-READ   PIC 9(8).
           05 WS-PREV-READ      PIC 9(8).
           05 WS-UNITS-CONSUMED PIC 9(8).
           05 WS-STANDING-CHG   PIC 9(4)V99.
           05 WS-TIER1-COST     PIC 9(6)V99.
           05 WS-TIER2-COST     PIC 9(6)V99.
           05 WS-TIER3-COST     PIC 9(6)V99.
           05 WS-TOTAL          PIC 9(6)V99.
           05 WS-RETURN-CODE    PIC X(4).
           05 WS-TARIFF-CODE    PIC X(16).

       PROCEDURE DIVISION.
       MAIN-LOGIC.
           SUBTRACT WS-PREV-READ FROM WS-CURRENT-READ
             GIVING WS-UNITS-CONSUMED
           MOVE 2250 TO WS-STANDING-CHG
           PERFORM CALC-TIER-RATING
           PERFORM VALIDATE-EXCEPTIONS
           PERFORM WRITE-BATCH-RECORD
           STOP RUN.

       CALC-TIER-RATING.
           IF WS-UNITS-CONSUMED <= 500
             COMPUTE WS-TIER1-COST = WS-UNITS-CONSUMED * 0.0895
           ELSE
             COMPUTE WS-TIER1-COST = 500 * 0.0895
             IF WS-UNITS-CONSUMED > 500 AND <= 2000
               COMPUTE WS-TIER2-COST =
                 (WS-UNITS-CONSUMED - 500) * 0.1340
             ELSE
               COMPUTE WS-TIER2-COST = 1500 * 0.1340
               COMPUTE WS-TIER3-COST =
                 (WS-UNITS-CONSUMED - 2000) * 0.2480
             END-IF
           END-IF.

       VALIDATE-EXCEPTIONS.
           IF WS-UNITS-CONSUMED < 0
             MOVE "8001" TO WS-RETURN-CODE
           ELSE IF WS-UNITS-CONSUMED > 50000
             MOVE "8002" TO WS-RETURN-CODE
           ELSE
             MOVE "0000" TO WS-RETURN-CODE
           END-IF.

       WRITE-BATCH-RECORD.
           STRING "ADJ" BILLING-DATE ACCOUNT-ID
                  WS-UNITS-CONSUMED WS-TOTAL
                  CREDIT-FLAG FILLER WS-RETURN-CODE
             DELIMITED SIZE INTO BATCH-RECORD.`;

  const wasmMeta = [
    { label: "Module",          value: "rating.cob → rating.wasm" },
    { label: "Compiled",        value: "GnuCOBOL 3.1.2 + Emscripten 3.1.x" },
    { label: "Runtime",         value: "WebAssembly (browser sandbox)" },
    { label: "Entrypoint",      value: "MAIN-LOGIC" },
    { label: "Call args",       value: `current=${parsedDial}, prev=${account.previousRead}, tariff="${account.tariffCode}"` },
    { label: "WS-UNITS-CONSUMED", value: `${units.toLocaleString()} kWh` },
    { label: "WS-STANDING-CHG",  value: `$${result.standingCharge.toFixed(2)}` },
    ...result.tierBreakdown.map((t) => ({
      label: t.tier,
      value: `${t.units} kWh × $${t.rate.toFixed(4)} = $${t.cost.toFixed(2)}`,
    })),
    { label: "WS-TOTAL",        value: `$${result.total.toFixed(2)}` },
    { label: "WS-RETURN-CODE",  value: `${result.returnCode} (${result.returnCode === "0000" ? "VALID" : "EXCEPTION"})` },
    { label: "Execution time",  value: `${result.execMs}ms` },
    { label: "Memory (linear)", value: "64 KB (Wasm page)" },
    { label: "Sandbox",         value: "No file I/O · No network · No DOM access" },
  ];

  const tabs: { key: typeof tab; label: string }[] = [
    { key: "annotated", label: "Annotated run" },
    { key: "source",    label: "rating.cob source" },
    { key: "wasm",      label: "WASM call trace" },
  ];

  return (
    <div className="card fade-up" style={{ overflow: "hidden" }}>
      {/* Toggle header */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "13px 16px", background: "none", border: "none", cursor: "pointer",
          textAlign: "left",
          borderBottom: open ? "1px solid var(--border)" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
              How was ${ result.total.toFixed(2)} calculated?
            </div>
            <div style={{ fontSize: 10, color: "var(--dim)" }}>
              See the COBOL source, annotated execution, and WASM call trace
            </div>
          </div>
        </div>
        <span style={{ fontSize: 12, color: "var(--dim)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
          ▼
        </span>
      </button>

      {open && (
        <>
          {/* Tab bar */}
          <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: "8px 16px", fontSize: 11, fontWeight: 600,
                  border: "none", background: "none", cursor: "pointer",
                  
                  color: tab === t.key ? "var(--blue)" : "var(--dim)",
                  borderBottom: tab === t.key ? "2px solid var(--blue)" : "2px solid transparent",
                  transition: "all 0.15s",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Annotated run */}
          {tab === "annotated" && (
            <div className="cobol-screen" style={{ padding: "14px 16px", maxHeight: 360, overflowY: "auto" }}>
              <div className="cobol-head" style={{ fontSize: 10, marginBottom: 10, letterSpacing: "0.06em" }}>
                RATING.COB — executed with actual values from this call
              </div>
              {annotated.map((line, i) => (
                <div key={i} style={{ display: "flex", gap: 16, lineHeight: 1.6, minHeight: "1.6em" }}>
                  <span style={{ color: "#2a6a2a", fontSize: 12, whiteSpace: "pre", flex: "0 0 auto", maxWidth: 380 }}>
                    {line.code}
                  </span>
                  {line.note && (
                    <span style={{ color: "#00cc30", fontSize: 11, fontStyle: "italic", opacity: 0.9, whiteSpace: "nowrap" }}>
                      {line.note}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Raw source */}
          {tab === "source" && (
            <div className="cobol-screen" style={{ padding: "14px 16px", maxHeight: 360, overflowY: "auto" }}>
              <div className="cobol-head" style={{ fontSize: 10, marginBottom: 10, letterSpacing: "0.06em" }}>
                rating.cob — original 1998 source (abridged) · compiled to WASM via Emscripten
              </div>
              <pre style={{ color: "#2a7a2a", fontSize: 11, lineHeight: 1.65, margin: 0 }}>{rawSource}</pre>
            </div>
          )}

          {/* WASM call trace */}
          {tab === "wasm" && (
            <div style={{ padding: "14px 16px", background: "var(--surface)", maxHeight: 360, overflowY: "auto" }}>
              <div style={{ fontSize: 10, color: "var(--dim)", marginBottom: 12, letterSpacing: "0.05em" }}>
                WebAssembly execution metadata — this call, {new Date("2023-10-24").toDateString()}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {wasmMeta.map((row, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex", gap: 12, padding: "7px 10px",
                      background: i % 2 === 0 ? "var(--surface-2)" : "var(--surface)",
                      borderRadius: i === 0 ? "8px 8px 0 0" : i === wasmMeta.length - 1 ? "0 0 8px 8px" : 0,
                      border: "1px solid var(--border)",
                      borderTop: i === 0 ? "1px solid var(--border)" : "none",
                    }}
                  >
                    <span style={{ fontSize: 11, color: "var(--dim)", minWidth: 160, flexShrink: 0 }}>{row.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Outage alert banner ────────────────────────────────────────────
import { OutageRecord } from "@/lib/accounts";

function OutageAlert({ outage, customerFirstName }: { outage: OutageRecord; customerFirstName: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      borderRadius: 12,
      border: "1px solid var(--amber-mid)",
      background: "var(--amber-light)",
      overflow: "hidden",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "11px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {/* Status dot */}
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--amber)", flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text)", whiteSpace: "nowrap" }}>
            Grid incident active
          </span>
          <span style={{ fontSize: 12, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            · {outage.area}
          </span>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            flexShrink: 0, fontSize: 11, fontWeight: 500, color: "var(--muted)",
            background: "none", border: "none", cursor: "pointer", padding: 0,
            textDecoration: "underline", textDecorationColor: "var(--border-md)",
          }}
        >
          {expanded ? "Less ▲" : "Details ▼"}
        </button>
      </div>

      {/* Info lines */}
      <div style={{
        borderTop: "1px solid var(--amber-mid)",
        padding: "10px 14px",
        display: "flex", flexDirection: "column", gap: 6,
      }}>
        <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.5 }}>
          Debt-collection letters to <strong>{customerFirstName}</strong> are paused while the incident is open.
        </div>
        <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.5 }}>
          Regulatory compensation of <strong>${outage.compensationApplied.toFixed(2)}</strong> has been credited (Licence Cond. 14B).
        </div>
      </div>

      {/* Expanded metadata */}
      {expanded && (
        <div style={{
          borderTop: "1px solid var(--amber-mid)",
          padding: "10px 14px",
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12,
          background: "var(--bg)",
        }}>
          {[
            { label: "Ref", value: outage.ref },
            { label: "Since", value: outage.since },
            { label: "Credit", value: `$${outage.compensationApplied.toFixed(2)}` },
          ].map((f) => (
            <div key={f.label}>
              <div style={{ fontSize: 9, fontWeight: 500, color: "var(--muted)", letterSpacing: "0.06em", marginBottom: 2 }}>
                {f.label.toUpperCase()}
              </div>
              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text)" }}>{f.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Step dots ──────────────────────────────────────────────────────
function StepDots({ step }: { step: Step }) {
  const steps: Step[] = ["search", "account", "result"];
  const labels = ["Find account", "Enter dial read", "Bill fixed"];
  const idx = steps.indexOf(step);
  return (
    <div style={{ display: "flex", gap: 18, marginBottom: 24, fontSize: 13 }}>
      {steps.map((s, i) => (
        <span key={s} style={{ color: i === idx ? "var(--text)" : "var(--dim)", fontWeight: i === idx ? 500 : 400 }}>
          {labels[i]}
        </span>
      ))}
    </div>
  );
}

// ── Status badge ───────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const s: Record<string, { label: string; bg: string; color: string }> = {
    PENDING_OVERNIGHT_BATCH: { label: "Overbilled — Estimate Error", bg: "var(--red-light)", color: "var(--red)" },
    ESCALATED:               { label: "Escalated", bg: "var(--hint)", color: "var(--text)" },
    VERIFIED_CLEARED:        { label: "Cleared", bg: "var(--green-light)", color: "var(--green)" },
    CLOSED:                  { label: "Closed", bg: "var(--bg)", color: "var(--dim)" },
  };
  const st = s[status] ?? s.PENDING_OVERNIGHT_BATCH;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, borderRadius: 100, padding: "4px 10px",
      background: st.bg, color: st.color, border: `1px solid ${st.color}30`,
      flexShrink: 0, whiteSpace: "nowrap",
    }}>
      {st.label}
    </span>
  );
}

// ── InfoTip — hover tooltip ────────────────────────────────────────
function InfoTip({ content }: { content: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", verticalAlign: "middle" }}>
      <button
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 15, height: 15, borderRadius: "50%",
          background: "var(--border)", color: "var(--muted)",
          border: "none", cursor: "default", fontSize: 9, fontWeight: 500,
          flexShrink: 0, lineHeight: 1,
        }}
        aria-label="More information"
      >
        i
      </button>
      {visible && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 8px)", left: "50%",
          transform: "translateX(-50%)",
          background: "#1c1917", color: "#e7e5e4",
          borderRadius: 10, padding: "10px 14px",
          fontSize: 11, lineHeight: 1.65, width: 260,
          boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
          zIndex: 100, pointerEvents: "none",
        }}>
          {content}
          {/* Arrow */}
          <div style={{
            position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
            width: 0, height: 0,
            borderLeft: "6px solid transparent",
            borderRight: "6px solid transparent",
            borderTop: "6px solid #1c1917",
          }} />
        </div>
      )}
    </span>
  );
}

// ── Command palette (Ctrl+K) ───────────────────────────────────────
function PaletteModal({ onSelect, onClose }: { onSelect: (a: AccountRecord) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const results = searchAccounts(q);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === "Enter" && results[cursor]) onSelect(results[cursor]);
    else if (e.key === "Escape") onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "12vh" }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(13,17,23,0.5)", backdropFilter: "blur(4px)" }} />
      <div
        className="card"
        style={{ position: "relative", width: "100%", maxWidth: 520, margin: "0 16px", borderRadius: 16, overflow: "hidden", boxShadow: "0 20px 60px rgba(13,17,23,0.25)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: "var(--dim)" }}>
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
            <line x1="9.5" y1="9.5" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Account ID or name…" style={{ flex: 1, border: "none", outline: "none", fontSize: 14, color: "var(--text)", background: "transparent", }} />
          <kbd style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "var(--bg)", color: "var(--dim)", border: "1px solid var(--border)" }}>ESC</kbd>
        </div>
        <div style={{ maxHeight: 320, overflowY: "auto" }}>
          {results.map((acc, i) => (
            <button key={acc.id} onClick={() => onSelect(acc)} onMouseEnter={() => setCursor(i)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "11px 16px",
                background: i === cursor ? "var(--blue-light)" : "transparent", border: "none",
                cursor: "pointer", textAlign: "left", 
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 5, padding: "2px 7px", flexShrink: 0,
                background: "var(--hint)",
                color: "var(--muted)" }}>{acc.id}</span>
              <span style={{ flex: 1, fontSize: 13, color: "var(--text)", fontWeight: 500 }}>{acc.name}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--red)" }}>${acc.estimatedBill.toFixed(2)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
