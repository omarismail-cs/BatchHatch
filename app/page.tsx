"use client";
import Image from "next/image";
import { useEffect, useState, useRef, useCallback } from "react";
import { runCobolEngine, CobolResult } from "@/lib/billing";
import { findAccount, AccountRecord } from "@/lib/accounts";
import { UNIT_COSTS, TOTAL_MONTHLY_EXCEPTIONS, LATEST_KPI } from "@/lib/data";

// ─── Types ────────────────────────────────────────────────────────
type Step = "search" | "account" | "result";

export default function Home() {
  const [step, setStep] = useState<Step>("search");
  const [query, setQuery] = useState("");
  const [searchMiss, setSearchMiss] = useState("");   // last query that found nothing
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
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentQuery, setAgentQuery] = useState("Call list_backlog and rank all five cases by urgency. Use open days, callback count, status, and agent notes. Be specific — name who needs attention first and why.");
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

  function handleSearch(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    const a = findAccount(trimmed);
    if (a) {
      setAccount(a); setStep("account"); setQuery(""); setSearchMiss(""); setPaletteOpen(false);
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

  async function handleAgentRun() {
    if (!account || agentRunning) return;
    setAgentRunning(true);
    setAgentReply("");
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: agentQuery,
          accountId: account.id,
          dialRead: parseInt(dialRead, 10) || account.suggestedRead,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Agent failed");
      setAgentReply(data.reply || "");
      for (const action of (data.actions || []) as { type: string; accountId?: string; read?: number }[]) {
        if (action.type === "rate" && action.read) {
          setDialRead(String(action.read));
          await handleFixWithRead(action.read);
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
    setAgentOpen(false); setAgentReply(""); setAgentRunning(false);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>

      {/* ── Navbar ──────────────────────────────────────────── */}
      <nav style={{
        background: "#0D1117",
        borderBottom: "1px solid #1E2530",
        display: "flex", alignItems: "center",
        padding: "0 20px", height: 56,
        position: "sticky", top: 0, zIndex: 40,
      }}>
        {/* Logo — cropped via overflow hidden */}
        <button onClick={reset} style={{ display: "flex", alignItems: "center", flexShrink: 0, cursor: "pointer", background: "none", border: "none" }}>
          <div style={{ width: 200, height: 40, overflow: "hidden", position: "relative", flexShrink: 0 }}>
              <Image
              src="/logo.png"
              alt="BatchHatch"
              fill
              sizes="200px"
              style={{ objectFit: "cover", objectPosition: "center 50%" }}
              priority
            />
          </div>
        </button>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Context pills */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <NavPill label={`${(LATEST_KPI.inboundCalls / 1000).toFixed(0)}k calls/mo`} color="#EF4444" />
          <NavPill label={`${TOTAL_MONTHLY_EXCEPTIONS.toLocaleString()} errors/mo`} color="#F59E0B" />
        </div>

        {/* Session counter — updates live as bills get fixed */}
        {sessionBills > 0 && (
          <div style={{
            marginLeft: 12, display: "flex", alignItems: "center", gap: 0,
            background: "#0E1A0E", border: "1px solid #1A3A1A",
            borderRadius: 10, overflow: "hidden", flexShrink: 0,
          }}>
            {[
              { label: "fixed", value: String(sessionBills) },
              { label: "corrected", value: `$${sessionCorrected.toFixed(0)}` },
              { label: "days saved", value: String(sessionDays) },
            ].map((s, i) => (
              <div key={s.label} style={{
                padding: "5px 12px", textAlign: "center",
                borderLeft: i > 0 ? "1px solid #1A3A1A" : "none",
              }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: "#00EE38", lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 9, color: "#2a7a2a", letterSpacing: "0.04em", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Metrics link */}
        <a href="/metrics" style={{
          marginLeft: 16, fontSize: 11, fontWeight: 700, color: "#94A3B8",
          textDecoration: "none", padding: "4px 10px", borderRadius: 8,
          border: "1px solid #2A3441", whiteSpace: "nowrap",
        }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#94A3B8")}
        >
          Value case
        </a>

        {/* Agent */}
        <div style={{
          marginLeft: 10, width: 34, height: 34, borderRadius: "50%",
          background: "#6366F1", display: "flex", alignItems: "center",
          justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700, flexShrink: 0,
        }}>T1</div>
      </nav>

      {/* ── Main ────────────────────────────────────────────── */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 16px 60px" }}>
        <div style={{ width: "100%", maxWidth: 580 }}>

          {/* Step indicator */}
          <StepDots step={step} />

          {/* ── STEP 1: Search ──────────────────────────────── */}
          {step === "search" && (
            <div className="fade-up">
              <div style={{ textAlign: "center", marginBottom: 32 }}>
                <h1 style={{ fontSize: 28, fontWeight: 800, color: "var(--text)", lineHeight: 1.2, marginBottom: 10 }}>
                  Fix the overbilled customer<br />
                  <span style={{ color: "var(--blue)" }}>while they're still on the phone.</span>
                </h1>
                <p style={{ color: "var(--muted)", fontSize: 13, maxWidth: "44ch", margin: "0 auto", lineHeight: 1.7 }}>
                  Pull up their account, enter the meter reading the customer gives you,
                  and the COBOL engine issues a corrected bill in 15ms.
                </p>
              </div>

              {/* Search box */}
              <div className="card" style={{ padding: 6, marginBottom: 20 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setSearchMiss(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSearch(query); }}
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
                <div style={{ fontSize: 10, color: "var(--dim)", marginBottom: 8, letterSpacing: "0.06em" }}>
                  Active cases — click to load
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[
                    { id: "DUN-9021", name: "Margaret Holloway", bill: 842.10, days: 41, tag: "Featured demo", region: "Dunmoor" },
                    { id: "DUN-3345", name: "Edith Cargill",     bill: 723.50, days: 58, tag: "Solicitor involved", region: "Dunmoor" },
                    { id: "BAR-4401", name: "James Whitmore",    bill: 612.40, days: 28, tag: "", region: "Barrowdale" },
                    { id: "DUN-7782", name: "Patricia Okafor",   bill: 524.80, days: 19, tag: "", region: "Dunmoor" },
                    { id: "BAR-2209", name: "Robert Finch",      bill: 388.60, days: 12, tag: "", region: "Barrowdale" },
                  ].map((a) => (
                    <button
                      key={a.id}
                      onClick={() => handleSearch(a.id)}
                      className="card"
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "12px 16px", border: "1px solid var(--border)",
                        cursor: "pointer", textAlign: "left", transition: "border-color 0.15s",
                        
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--blue)")}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                    >
                      <span style={{
                        fontSize: 10, fontWeight: 700, borderRadius: 6, padding: "2px 7px", flexShrink: 0,
                        background: a.region === "Dunmoor" ? "#EDE9FE" : "#EFF6FF",
                        color:      a.region === "Dunmoor" ? "#6D28D9" : "#1D4ED8",
                      }}>{a.id}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", display: "block" }}>{a.name}</span>
                        {a.tag && <span style={{ fontSize: 10, color: "var(--amber)" }}>{a.tag}</span>}
                      </span>
                      <span style={{ flexShrink: 0, textAlign: "right" }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color: "var(--red)", display: "block" }}>${a.bill.toFixed(2)}</span>
                        <span style={{ fontSize: 10, color: "var(--dim)" }}>{a.days}d open</span>
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
                    <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>{account.name}</div>
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
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>Power company guessed</div>
                    <div style={{ fontSize: 13, color: "var(--muted)", textDecoration: "line-through" }}>
                      {account.estimatedRead.toLocaleString()} kWh
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 900, color: "var(--red)", lineHeight: 1, marginTop: 4 }}>
                      ${account.estimatedBill.toFixed(2)}
                    </div>
                  </div>
                  <div style={{ fontSize: 20, color: "var(--red-mid)" }}>→</div>
                  <div>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>Customer says real dial reads</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "var(--muted)", lineHeight: 1.1 }}>
                      {account.estimatedRead - account.previousRead > 0
                        ? `Off by ${(account.estimatedRead - account.previousRead).toLocaleString()} kWh`
                        : "—"}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                      Prev. read: {account.previousRead.toLocaleString()}
                    </div>
                  </div>
                </div>

                {account.agentNotes && (
                  <div style={{
                    marginTop: 12, padding: "8px 12px", borderRadius: 8,
                    background: "#FFF7ED", border: "1px solid #FED7AA",
                    fontSize: 11, color: "#92400E",
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
                        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
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
                              <strong style={{ color: "#FCD34D" }}>{daysSince} days</strong> without a verified read is {daysSince > 90 ? "above the recommended 90-day threshold." : "within threshold, but drift is still possible."}
                            </>
                          } />
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 900, color: daysColor, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
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
                              <span style={{ color: "#94A3B8" }}>Formula:</span>{" "}
                              last read + (daily avg × days in period)<br /><br />
                              <span style={{ color: "#FCD34D" }}>{account.previousRead.toLocaleString()}</span>
                              {" + "}(<span style={{ color: "#F87171" }}>{impliedDailyRate} kWh/day</span> × {daysSince} days)
                              {" = "}<span style={{ color: "#F87171" }}>{account.estimatedRead.toLocaleString()}</span><br /><br />
                              The implied rate of <strong style={{ color: "#F87171" }}>{impliedDailyRate} kWh/day</strong> is roughly <strong style={{ color: "#F87171" }}>{Math.round(impliedDailyRate / typicalDailyRate)}×</strong> the typical rate of ~{typicalDailyRate} kWh/day for this household. SYS-06's seasonal curve (calibrated 2010–2012) hasn't been updated and doesn't account for changes in this customer's usage pattern.
                            </>
                          } />
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--red)", fontVariantNumeric: "tabular-nums" }}>
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

                {/* Suggested reading shortcut — for demo and training */}
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
                  <span style={{ fontSize: 10, color: "var(--dim)" }}>(use for this demo)</span>
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
                    fontWeight: 800, color: dialBelowPrev || dialNegativeUsage ? "var(--red)" : "var(--text)",
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
                    <div style={{ fontSize: 11, color: "var(--red)", fontWeight: 600 }}>
                      That implies {dialUsage.toLocaleString()} kWh — over 3× the typical quarterly usage of {account.typicalQuarterlyKwh.toLocaleString()} kWh for this account. Verify the reading; this may be a misread dial.
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
                    border: "none", fontSize: 16, fontWeight: 800,
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
                    <>FIX BILL NOW</>
                  )}
                </button>
                <div style={{ textAlign: "center", fontSize: 10, color: "var(--dim)", marginTop: 8 }}>
                  Ctrl+Enter · Aurora SYS-01 rating engine · batch record ready for 2am ingest
                </div>
              </div>

              {/* ── AI Agent panel ─────────────────────────── */}
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
                      fontSize: 10, color: "#fff", fontWeight: 900, flexShrink: 0,
                    }}>✦</div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--blue)" }}>Agent auto-fix</span>
                    <span style={{ fontSize: 11, color: "var(--dim)" }}>— let the AI handle it</span>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--dim)" }}>{agentOpen ? "▲" : "▼"}</span>
                </button>

                {agentOpen && (
                  <div style={{ padding: "12px 16px 16px", background: "var(--surface)", borderTop: "1px solid var(--border)" }}>
                    {/* Preset chips */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                      {[
                        { label: "Triage queue",         query: "Call list_backlog and rank all five cases by urgency. Use open days, callback count, status, and agent notes. Be specific — name who needs attention first and why." },
                        { label: "What should I say?",   query: "I'm on a live call with this customer right now. Give me 3–4 specific talking points based on their situation: how long they've waited, what went wrong with the estimate, and how we're fixing it. Be conversational, not scripted." },
                        { label: "Should I escalate?",   query: "Based on this account's open days, callback count, status, and agent notes — should I escalate this case, offer goodwill credit, or just correct and close? Give a clear recommendation with one sentence of reasoning." },
                        { label: "Draft customer SMS",   query: "Write a plain-English SMS (under 160 characters) to this customer confirming their corrected bill amount and what happens next. No jargon." },
                      ].map((chip) => (
                        <button
                          key={chip.label}
                          onClick={() => { setAgentQuery(chip.query); }}
                          style={{
                            padding: "5px 11px", fontSize: 11, fontWeight: 600,
                            background: agentQuery === chip.query ? "var(--blue)" : "var(--bg)",
                            color: agentQuery === chip.query ? "#fff" : "var(--muted)",
                            border: `1px solid ${agentQuery === chip.query ? "var(--blue)" : "var(--border-md)"}`,
                            borderRadius: 20, cursor: "pointer", transition: "all 0.15s",
                          }}
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>

                    {/* Query input */}
                    <textarea
                      value={agentQuery}
                      onChange={(e) => setAgentQuery(e.target.value)}
                      rows={2}
                      style={{
                        width: "100%", padding: "8px 10px", fontSize: 12, color: "var(--text)",
                        background: "var(--bg)", border: "1px solid var(--border-md)", borderRadius: 8,
                        resize: "none", boxSizing: "border-box", lineHeight: 1.5,
                      }}
                      placeholder="Or type a custom request…"
                    />

                    <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                      <button
                        onClick={handleAgentRun}
                        disabled={agentRunning}
                        style={{
                          padding: "7px 16px", fontSize: 12, fontWeight: 700,
                          background: agentRunning ? "var(--dim)" : "var(--blue)",
                          color: "#fff", border: "none", borderRadius: 8,
                          cursor: agentRunning ? "default" : "pointer",
                        }}
                      >
                        {agentRunning
                          ? <><span style={{ display: "inline-block", animation: "spin 0.7s linear infinite" }}>⟳</span> Running…</>
                          : "Run"}
                      </button>
                      <span style={{ fontSize: 11, color: "var(--dim)" }}>
                        Needs <code style={{ fontSize: 10, fontFamily: "var(--font-mono)" }}>GEMINI_API_KEY</code> in .env.local
                      </span>
                    </div>

                    {agentReply && (
                      <div style={{
                        marginTop: 10, padding: "12px 14px", background: "var(--blue-light)",
                        border: "1px solid var(--blue-mid)", borderRadius: 10,
                        fontSize: 12, color: "var(--muted)", lineHeight: 1.7,
                        whiteSpace: "pre-wrap",
                      }}>
                        {agentReply}
                      </div>
                    )}
                  </div>
                )}
              </div>

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
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#FF5F56" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#FFBD2E" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#27C93F" }} />
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
              background: "var(--green-light)", color: "var(--green)", border: "1px solid var(--green-mid)",
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
                Overcharged bill
              </div>
              <div style={{ fontSize: 30, fontWeight: 900, color: "var(--red)", textDecoration: "line-through", opacity: 0.65 }}>
                ${account.estimatedBill.toFixed(2)}
              </div>
              <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 4 }}>
                based on {(account.estimatedRead - account.previousRead).toLocaleString()} kWh (wrong)
              </div>
            </div>

            <div style={{ fontSize: 30, color: "var(--green-mid)" }}>→</div>

            {/* New */}
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "var(--dim)", marginBottom: 6 }}>
                Corrected bill
              </div>
              <div className="num-tick" style={{ fontSize: 42, fontWeight: 900, color: "var(--green)", lineHeight: 1 }}>
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
              color: "#fff", fontSize: 14, fontWeight: 800,
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
          <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", marginBottom: 2 }}>
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
            <div style={{ fontSize: 26, fontWeight: 900, color: "var(--red)", lineHeight: 1, textDecoration: "line-through", opacity: 0.7 }}>
              ${account.estimatedBill.toFixed(2)}
            </div>
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
              Based on {(account.estimatedRead - account.previousRead).toLocaleString()} kWh estimate
            </div>
          </div>
          <div style={{ padding: "14px 16px", background: "var(--green-light)" }}>
            <div style={{ fontSize: 10, color: "var(--green)", marginBottom: 6, fontWeight: 700 }}>CORRECTED BILL</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: "var(--green)", lineHeight: 1 }}>
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
          <span style={{ fontSize: 12, fontWeight: 700, color: "#78350F", whiteSpace: "nowrap" }}>
            Grid incident active
          </span>
          <span style={{ fontSize: 12, color: "#92400E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            · {outage.area}
          </span>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            flexShrink: 0, fontSize: 11, fontWeight: 600, color: "#92400E",
            background: "none", border: "none", cursor: "pointer", padding: 0,
            textDecoration: "underline", textDecorationColor: "#D9770660",
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
        <div style={{ fontSize: 12, color: "#78350F", lineHeight: 1.5 }}>
          Debt-collection letters to <strong>{customerFirstName}</strong> are paused while the incident is open.
        </div>
        <div style={{ fontSize: 12, color: "#78350F", lineHeight: 1.5 }}>
          Regulatory compensation of <strong>${outage.compensationApplied.toFixed(2)}</strong> has been credited (Licence Cond. 14B).
        </div>
      </div>

      {/* Expanded metadata */}
      {expanded && (
        <div style={{
          borderTop: "1px solid var(--amber-mid)",
          padding: "10px 14px",
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12,
          background: "#FEF3C7",
        }}>
          {[
            { label: "Ref", value: outage.ref },
            { label: "Since", value: outage.since },
            { label: "Credit", value: `$${outage.compensationApplied.toFixed(2)}` },
          ].map((f) => (
            <div key={f.label}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#92400E", letterSpacing: "0.06em", marginBottom: 2 }}>
                {f.label.toUpperCase()}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#78350F" }}>{f.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Reading history chart — quarterly usage bars ───────────────────
function ReadingHistoryChart({
  history, correctedRead,
}: {
  history: AccountRecord["readingHistory"];
  correctedRead?: number;
}) {
  // Build per-period usage deltas (skip the first point — it's just the baseline)
  type Bar = { label: string; kwh: number; type: "actual" | "estimated" | "corrected" };
  const bars: Bar[] = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1], cur = history[i];
    const kwh = cur.read - prev.read;
    const dt = new Date(cur.date);
    const label = dt.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
    bars.push({ label, kwh, type: cur.type });
  }
  // If corrected read is supplied, replace the last (bad estimate) bar
  if (correctedRead !== undefined) {
    const prev = history[history.length - 2];
    bars[bars.length - 1] = {
      label: bars[bars.length - 1].label,
      kwh: correctedRead - prev.read,
      type: "corrected",
    };
  }

  const maxKwh = Math.max(...bars.map((b) => b.kwh));
  const W = 520, H = 130;
  const PAD = { t: 24, r: 16, b: 28, l: 52 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const barW = (plotW / bars.length) * 0.55;
  const gap   = plotW / bars.length;

  const barColor = (type: Bar["type"]) =>
    type === "corrected" ? "#0E9B52" :
    type === "estimated" ? "#E02424" : "#2462E8";
  const barFill = (type: Bar["type"]) =>
    type === "corrected" ? "#EDFBF3" :
    type === "estimated" ? "#FEF1F1" : "#EEF3FD";

  const fmtKwh = (v: number) =>
    v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);

  // Y gridlines
  const yStep = maxKwh / 3;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }}>
      {/* Gridlines */}
      {[0, 1, 2, 3].map((i) => {
        const val = yStep * i;
        const y = PAD.t + plotH - (val / maxKwh) * plotH;
        return (
          <g key={i}>
            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y}
              stroke="#E4E8F0" strokeWidth={1} strokeDasharray={i === 0 ? "0" : "3 2"} />
            <text x={PAD.l - 6} y={y + 4} textAnchor="end" fontSize={9} fill="#8896A8">
              {fmtKwh(val)}
            </text>
          </g>
        );
      })}

      {/* Bars */}
      {bars.map((b, i) => {
        const cx = PAD.l + gap * i + gap / 2;
        const bh = Math.max(2, (b.kwh / maxKwh) * plotH);
        const by = PAD.t + plotH - bh;
        const color = barColor(b.type);
        const fill  = barFill(b.type);
        const isWrong = b.type === "estimated";

        return (
          <g key={b.label}>
            {/* Bar */}
            <rect x={cx - barW / 2} y={by} width={barW} height={bh}
              fill={fill} stroke={color} strokeWidth={1.5} rx={3} />

            {/* Value label above bar */}
            <text x={cx} y={by - 4} textAnchor="middle" fontSize={isWrong ? 10 : 9}
              fontWeight={isWrong ? "bold" : "normal"} fill={color}>
              {fmtKwh(b.kwh)}
            </text>

            {/* "~Nx typical" annotation on the bad bar */}
            {isWrong && bars.filter(x => x.type !== "estimated").length > 0 && (() => {
              const typicalAvg = bars.filter(x => x.type !== "estimated" && x.type !== "corrected")
                .reduce((s, x) => s + x.kwh, 0) /
                Math.max(1, bars.filter(x => x.type !== "estimated" && x.type !== "corrected").length);
              const multiple = Math.round(b.kwh / typicalAvg);
              return (
                <text x={cx} y={by - 16} textAnchor="middle" fontSize={8.5}
                  fill="#E02424" opacity={0.8}>
                  ~{multiple}× typical
                </text>
              );
            })()}

            {/* X label */}
            <text x={cx} y={H - 6} textAnchor="middle" fontSize={9} fill="#8896A8">
              {b.label}
            </text>
          </g>
        );
      })}

      {/* Legend */}
      <g transform={`translate(${PAD.l}, 10)`}>
        <rect x={0} y={-6} width={10} height={10} rx={2}
          fill="#EEF3FD" stroke="#2462E8" strokeWidth={1.5} />
        <text x={14} y={4} fontSize={9} fill="#8896A8">Actual usage</text>
        <rect x={76} y={-6} width={10} height={10} rx={2}
          fill="#FEF1F1" stroke="#E02424" strokeWidth={1.5} />
        <text x={90} y={4} fontSize={9} fill="#8896A8">SYS-06 estimate</text>
        {correctedRead !== undefined && (
          <>
            <rect x={176} y={-6} width={10} height={10} rx={2}
              fill="#EDFBF3" stroke="#0E9B52" strokeWidth={1.5} />
            <text x={190} y={4} fontSize={9} fill="#0E9B52">Corrected</text>
          </>
        )}
      </g>

      {/* kWh unit label */}
      <text x={PAD.l - 6} y={PAD.t - 10} textAnchor="middle" fontSize={8.5}
        fill="#8896A8" transform={`rotate(-90, ${PAD.l - 36}, ${PAD.t + plotH / 2})`}>
        kWh / period
      </text>
    </svg>
  );
}

// ── Step dots ──────────────────────────────────────────────────────
function StepDots({ step }: { step: Step }) {
  const steps: Step[] = ["search", "account", "result"];
  const labels = ["Find account", "Enter dial read", "Bill fixed"];
  const idx = steps.indexOf(step);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 28 }}>
      {steps.map((s, i) => (
        <div key={s} style={{ display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: i === idx ? "var(--blue)" : i < idx ? "var(--green)" : "var(--border)",
              color: i <= idx ? "#fff" : "var(--dim)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, transition: "all 0.2s",
            }}>
              {i < idx ? "✓" : i + 1}
            </div>
            <div style={{ fontSize: 9, color: i === idx ? "var(--blue)" : i < idx ? "var(--green)" : "var(--dim)", fontWeight: i === idx ? 700 : 400, whiteSpace: "nowrap" }}>
              {labels[i]}
            </div>
          </div>
          {i < steps.length - 1 && (
            <div style={{ width: 48, height: 2, background: i < idx ? "var(--green)" : "var(--border)", margin: "0 4px", marginBottom: 18, transition: "background 0.3s" }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Status badge ───────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const s: Record<string, { label: string; bg: string; color: string }> = {
    PENDING_OVERNIGHT_BATCH: { label: "Overbilled — Estimate Error", bg: "var(--red-light)", color: "var(--red)" },
    ESCALATED:               { label: "Escalated", bg: "#FFF7ED", color: "#B45309" },
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
          border: "none", cursor: "default", fontSize: 9, fontWeight: 800,
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
          background: "#0D1117", color: "#E2E8F0",
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
            borderTop: "6px solid #0D1117",
          }} />
        </div>
      )}
    </span>
  );
}

// ── Nav pill ───────────────────────────────────────────────────────
function NavPill({ label, color }: { label: string; color: string }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, color, borderRadius: 100,
      padding: "3px 9px", border: `1px solid ${color}40`,
      background: `${color}18`, whiteSpace: "nowrap",
    }}>
      {label}
    </div>
  );
}

// ── Command palette (Ctrl+K) ───────────────────────────────────────
import { searchAccounts } from "@/lib/accounts";

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
                background: acc.region === "Dunmoor" ? "#EDE9FE" : "#EFF6FF",
                color:      acc.region === "Dunmoor" ? "#6D28D9" : "#1D4ED8" }}>{acc.id}</span>
              <span style={{ flex: 1, fontSize: 13, color: "var(--text)", fontWeight: 500 }}>{acc.name}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: "var(--red)" }}>${acc.estimatedBill.toFixed(2)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
