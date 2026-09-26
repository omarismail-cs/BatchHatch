"use client";
import { useState } from "react";
import Link from "next/link";
import {
  LATEST_KPI, MONTHLY_KPIS, TOTAL_MONTHLY_EXCEPTIONS,
  UNIT_COSTS, AI_PILOT_LATEST, METER_READS_LATEST,
} from "@/lib/data";

// ── Derived numbers ───────────────────────────────────────────────
const EXCEPTIONS_PM   = TOTAL_MONTHLY_EXCEPTIONS;       // 13,147
const COMPLAINTS_PM   = LATEST_KPI.complaintsOpened;    // 1,251
const INBOUND_PM      = LATEST_KPI.inboundCalls;        // 57,060
const REPEAT_RATE     = AI_PILOT_LATEST.repeatContactWithin7Days; // 44.6%
const FCR_CURRENT     = LATEST_KPI.firstContactResolutionRate;    // 41.3%

const ANNUAL_CALLS       = INBOUND_PM * UNIT_COSTS.inboundCall * 12;
const ANNUAL_REPEATS     = INBOUND_PM * REPEAT_RATE * UNIT_COSTS.inboundCall * 12;
const ANNUAL_CORRECTIONS = EXCEPTIONS_PM * 0.10 * UNIT_COSTS.manualBillCorrection * 12;
const ANNUAL_COMPLAINTS  = COMPLAINTS_PM * UNIT_COSTS.complaintEndToEnd * 12;
const ANNUAL_REGULATORY  = 2_400_000 * 4;

// Conservative Year 1 BatchHatch model
const ADOPTION       = 0.70;
const FCR_TARGET     = 0.80;
const HANDLED_PM     = EXCEPTIONS_PM * ADOPTION;
const CALLBACKS_SAV  = HANDLED_PM * (FCR_TARGET - FCR_CURRENT) * UNIT_COSTS.inboundCall * 12;
const CORRECTION_SAV = HANDLED_PM * FCR_TARGET * 0.10 * UNIT_COSTS.manualBillCorrection * 12;
const COMPLAINT_SAV  = COMPLAINTS_PM * 0.40 * 0.60 * UNIT_COSTS.complaintEndToEnd * 12;
const TOTAL_SAV_Y1   = CALLBACKS_SAV + CORRECTION_SAV + COMPLAINT_SAV;
const IMPL_COST      = 65_000;
const PAYBACK_WEEKS  = Math.round(IMPL_COST / (TOTAL_SAV_Y1 / 52));

const $ = (n: number) =>
  "$" + Math.round(n).toLocaleString("en-US");

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const min = Math.min(...data), max = Math.max(...data);
  const W = 120, H = 36;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / (max - min || 1)) * H;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

function Trend({ label, values, suffix = "", invert = false }: {
  label: string; values: number[]; suffix?: string; invert?: boolean;
}) {
  const first = values[0], last = values[values.length - 1];
  const pct = Math.abs(Math.round(((last - first) / first) * 100));
  const isUp = last > first;
  const isBad = invert ? isUp : !isUp;
  const color = isBad ? "var(--red)" : "var(--green)";
  return (
    <div className="card" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 11, color: "var(--dim)", fontWeight: 700, letterSpacing: "0.05em" }}>{label.toUpperCase()}</div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1 }}>
            {last.toLocaleString("en-US", { maximumFractionDigits: 1 })}{suffix}
          </div>
          <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 4 }}>
            was {first.toLocaleString("en-US", { maximumFractionDigits: 1 })}{suffix} (Oct '24) · {isUp ? "+" : "-"}{pct}%
          </div>
        </div>
        <Sparkline data={values} color={color} />
      </div>
    </div>
  );
}

export default function MetricsPage() {
  const [tab, setTab] = useState<"overview" | "value" | "assumptions">("overview");

  const tabs = [
    { key: "overview" as const,    label: "Situation" },
    { key: "value" as const,       label: "Value case" },
    { key: "assumptions" as const, label: "Assumptions" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>

      {/* Navbar */}
      <nav style={{
        background: "#0D1117", borderBottom: "1px solid #1E2530",
        display: "flex", alignItems: "center", padding: "0 24px", height: 56,
        position: "sticky", top: 0, zIndex: 40,
      }}>
        <Link href="/" style={{ fontSize: 13, fontWeight: 700, color: "#fff", textDecoration: "none", opacity: 0.7 }}>
          ← BatchHatch
        </Link>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, fontWeight: 600, color: "#6366F1" }}>Northwind Value Case</div>
      </nav>

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: "var(--text)", marginBottom: 6 }}>
            One-Page Value Case
          </h1>
          <p style={{ fontSize: 13, color: "var(--muted)", maxWidth: "60ch" }}>
            Northwind Utilities · Barrowdale &amp; Dunmoor billing correction · Sep 2026 data
          </p>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 0, marginBottom: 28, borderBottom: "1px solid var(--border)" }}>
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: "10px 20px", fontSize: 13, fontWeight: 600,
              background: "none", border: "none", cursor: "pointer",
              color: tab === t.key ? "var(--blue)" : "var(--dim)",
              borderBottom: tab === t.key ? "2px solid var(--blue)" : "2px solid transparent",
              marginBottom: -1,
            }}>{t.label}</button>
          ))}
        </div>

        {/* ── TAB: Situation ────────────────────────────────────── */}
        {tab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

            {/* Key trend metrics */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              <Trend label="Avg. days to resolve"
                values={MONTHLY_KPIS.filter((_, i) => i % 2 === 0).map((m) => m.avgDays)}
                invert />
              <Trend label="Inbound calls / month"
                values={MONTHLY_KPIS.filter((_, i) => i % 2 === 0).map((m) => m.inbound)}
                invert />
              <Trend label="Regulator score / 5"
                values={MONTHLY_KPIS.filter((_, i) => i % 2 === 0).map((m) => m.regScore)}
                suffix="" />
            </div>

            {/* Root cause */}
            <div className="card" style={{ padding: 20, borderColor: "var(--amber-mid)", background: "var(--amber-light)" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#78350F", marginBottom: 8 }}>
                Root cause — not a complaints backlog problem
              </div>
              <p style={{ fontSize: 13, color: "#92400E", lineHeight: 1.7, maxWidth: "72ch" }}>
                519,000 accounts across Barrowdale and Dunmoor have <strong>zero smart-meter penetration</strong>.
                Aurora SYS-06 (2012) fills the gap with a seasonal estimate calibrated on 2010–2012 national
                averages — never updated since. At 62% estimated-read rate,
                it generates <strong>13,147 billing exceptions per month</strong>.
                The complaints, callbacks, and escalations all follow from that number.
              </p>
            </div>

            {/* Two-column stats */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

              {/* AI pilot verdict */}
              <div className="card" style={{ padding: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: "0.05em", marginBottom: 12 }}>
                  ASKNORTHWIND AI PILOT — SEP 2025
                </div>
                {[
                  { label: "Escalated to human agent", value: "82.6%", bad: true },
                  { label: "Repeat contact within 7 days", value: "44.6%", bad: true },
                  { label: "Fully self-contained", value: "10.4%", bad: false },
                  { label: "CSAT score", value: "2.04 / 5", bad: true },
                ].map((r) => (
                  <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{r.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: r.bad ? "var(--red)" : "var(--green)" }}>{r.value}</span>
                  </div>
                ))}
                <p style={{ fontSize: 11, color: "var(--dim)", marginTop: 10, lineHeight: 1.6 }}>
                  The AI complaint wrapper launched Jan 2025. Every metric has worsened since.
                </p>
              </div>

              {/* Meter reads */}
              <div className="card" style={{ padding: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: "0.05em", marginBottom: 12 }}>
                  METER READ PROFILE — SEP 2026
                </div>
                {[
                  { label: "Barrowdale accounts", value: METER_READS_LATEST.Barrowdale.accounts.toLocaleString() },
                  { label: "Dunmoor accounts", value: METER_READS_LATEST.Dunmoor.accounts.toLocaleString() },
                  { label: "Smart meter penetration", value: "0.0%", bad: true },
                  { label: "Barrowdale — estimated reads", value: "62.0%", bad: true },
                  { label: "Dunmoor — estimated reads", value: "61.5%", bad: true },
                  { label: "SYS-01 billing exceptions / mo", value: EXCEPTIONS_PM.toLocaleString(), bad: true },
                ].map((r) => (
                  <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{r.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: (r as { bad?: boolean }).bad ? "var(--red)" : "var(--text)" }}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* ── TAB: Value case ───────────────────────────────────── */}
        {tab === "value" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

            {/* Headline payback numbers */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {[
                { label: "Year 1 savings", value: $(TOTAL_SAV_Y1), color: "var(--green)" },
                { label: "Implementation cost", value: $(IMPL_COST), color: "var(--text)" },
                { label: "Year 1 net benefit", value: $(TOTAL_SAV_Y1 - IMPL_COST), color: "var(--green)" },
                { label: "Payback period", value: `${PAYBACK_WEEKS} weeks`, color: "var(--blue)" },
              ].map((s) => (
                <div key={s.label} className="card" style={{ padding: "14px 16px" }}>
                  <div style={{ fontSize: 10, color: "var(--dim)", fontWeight: 700, letterSpacing: "0.05em", marginBottom: 6 }}>
                    {s.label.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Cost baseline */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: "0.05em", marginBottom: 10 }}>
                CURRENT ANNUAL COST BASELINE (STATUS QUO)
              </div>
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                {[
                  { driver: "Inbound call handling", calc: `${INBOUND_PM.toLocaleString()} calls/mo × $${UNIT_COSTS.inboundCall} × 12`, value: ANNUAL_CALLS, warn: false },
                  { driver: "Avoidable repeat contacts (44.6% call back within 7 days)", calc: `${INBOUND_PM.toLocaleString()} × 44.6% × $${UNIT_COSTS.inboundCall} × 12`, value: ANNUAL_REPEATS, warn: true },
                  { driver: "Manual bill corrections (10% of exceptions)", calc: `${EXCEPTIONS_PM.toLocaleString()} × 10% × $${UNIT_COSTS.manualBillCorrection} × 12`, value: ANNUAL_CORRECTIONS, warn: false },
                  { driver: "End-to-end complaint handling", calc: `${COMPLAINTS_PM.toLocaleString()} complaints/mo × $${UNIT_COSTS.complaintEndToEnd} × 12`, value: ANNUAL_COMPLAINTS, warn: false },
                  { driver: "Regulatory penalty exposure", calc: "$2.4M/quarter × 4", value: ANNUAL_REGULATORY, warn: true },
                ].map((r, i, arr) => (
                  <div key={r.driver} style={{
                    display: "flex", alignItems: "center", gap: 16, padding: "12px 16px",
                    background: r.warn ? "var(--red-light)" : i % 2 === 0 ? "var(--surface)" : "var(--bg)",
                    borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none",
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{r.driver}</div>
                      <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>{r.calc}</div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: r.warn ? "var(--red)" : "var(--text)", textAlign: "right", flexShrink: 0 }}>
                      {$(r.value)}
                    </div>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", background: "#0D1117" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Total at risk annually</span>
                  <span style={{ fontSize: 15, fontWeight: 900, color: "#F87171" }}>
                    {$(ANNUAL_CALLS + ANNUAL_CORRECTIONS + ANNUAL_COMPLAINTS + ANNUAL_REGULATORY)}
                  </span>
                </div>
              </div>
            </div>

            {/* Savings */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: "0.05em", marginBottom: 10 }}>
                BATCHHATCH — YEAR 1 SAVINGS (70% ADOPTION · FCR 41% → 80%)
              </div>
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                {[
                  {
                    driver: "Callback elimination",
                    calc: `${Math.round(HANDLED_PM).toLocaleString()} calls handled × ${Math.round((FCR_TARGET - FCR_CURRENT) * 100)}pp FCR gain × $${UNIT_COSTS.inboundCall} × 12`,
                    value: CALLBACKS_SAV,
                  },
                  {
                    driver: "Manual correction elimination",
                    calc: `${Math.round(HANDLED_PM).toLocaleString()} handled × 80% resolved × 10% correction × $${UNIT_COSTS.manualBillCorrection} × 12`,
                    value: CORRECTION_SAV,
                  },
                  {
                    driver: "Complaint deflection (billing-related)",
                    calc: `${COMPLAINTS_PM.toLocaleString()} complaints × 40% billing × 60% deflected × $${UNIT_COSTS.complaintEndToEnd} × 12`,
                    value: COMPLAINT_SAV,
                  },
                ].map((r, i, arr) => (
                  <div key={r.driver} style={{
                    display: "flex", alignItems: "center", gap: 16, padding: "12px 16px",
                    background: i % 2 === 0 ? "var(--green-light)" : "var(--surface)",
                    borderBottom: i < arr.length - 1 ? "1px solid var(--green-mid)" : "none",
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{r.driver}</div>
                      <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>{r.calc}</div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "var(--green)", textAlign: "right", flexShrink: 0 }}>
                      {$(r.value)}
                    </div>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", background: "var(--green)" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Total Year 1 savings</span>
                  <span style={{ fontSize: 15, fontWeight: 900, color: "#fff" }}>{$(TOTAL_SAV_Y1)}</span>
                </div>
              </div>
            </div>

            {/* Implementation */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: "0.05em", marginBottom: 10 }}>
                  IMPLEMENTATION COST
                </div>
                <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                  {[
                    { item: "Production SYS-01 batch integration", cost: "$40,000" },
                    { item: "Agent training + change management", cost: "$15,000" },
                    { item: "Infrastructure (browser-based, zero per-call)", cost: "$0" },
                  ].map((r, i, arr) => (
                    <div key={r.item} style={{
                      display: "flex", justifyContent: "space-between", padding: "10px 14px",
                      borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none",
                    }}>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>{r.item}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{r.cost}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "var(--bg)", borderTop: "1px solid var(--border)" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>Total</span>
                    <span style={{ fontSize: 13, fontWeight: 900, color: "var(--text)" }}>{$(IMPL_COST)}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="card" style={{ padding: "16px 20px", flex: 1 }}>
                  <div style={{ fontSize: 10, color: "var(--dim)", fontWeight: 700, letterSpacing: "0.05em", marginBottom: 6 }}>VS. SMART METER ROLLOUT</div>
                  <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7 }}>
                    Full smart meter deployment: 519k accounts × $400–600/meter =
                    <strong style={{ color: "var(--text)" }}> $250M+</strong> over 5–7 years.
                    BatchHatch costs <strong style={{ color: "var(--text)" }}>{$(IMPL_COST)}</strong> and
                    pays back in <strong style={{ color: "var(--text)" }}>{PAYBACK_WEEKS} weeks</strong>.
                    It runs on the existing SYS-01 infrastructure — no new hardware required.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: Assumptions ──────────────────────────────────── */}
        {tab === "assumptions" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              {[
                { assumption: "BatchHatch adoption rate (Year 1)", value: "70% of billing exception calls", sensitivity: "At 50% adoption Year 1 saving ~$615k — payback still under 11 weeks" },
                { assumption: "FCR improvement for BatchHatch calls", value: "41.3% → 80%", sensitivity: "At 70% FCR, total saving reduces by ~12%" },
                { assumption: "Billing-related complaint share", value: "40% of 1,251/mo", sensitivity: "Ofgem data suggests 35–55% for non-AMR regions" },
                { assumption: "Exceptions requiring manual correction", value: "10% of 13,147", sensitivity: "Conservative — SYS-01 rejection log baseline; may be higher" },
                { assumption: "Regulatory penalty", value: "$2.4M/quarter (fixed)", sensitivity: "Actual varies with severity rating; trajectory suggests escalation" },
                { assumption: "Unit costs", value: "From northwind_unit_costs.csv", sensitivity: "Call $7.40 · complaint E2E $68 · correction $34 · transferred $121" },
                { assumption: "Smart meter alternative", value: "Not modelled as competition", sensitivity: "519k × $400–600/meter = $250M+ over 5–7 years — BatchHatch is the bridge" },
              ].map((r, i, arr) => (
                <div key={r.assumption} style={{
                  display: "grid", gridTemplateColumns: "2fr 1fr 2fr", gap: 0,
                  borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none",
                  background: i % 2 === 0 ? "var(--surface)" : "var(--bg)",
                }}>
                  <div style={{ padding: "12px 16px", fontSize: 12, fontWeight: 600, color: "var(--text)", borderRight: "1px solid var(--border)" }}>
                    {r.assumption}
                  </div>
                  <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--blue)", fontWeight: 700, borderRight: "1px solid var(--border)" }}>
                    {r.value}
                  </div>
                  <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--muted)" }}>
                    {r.sensitivity}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.7 }}>
              Source: northwind_monthly_kpis.csv · northwind_unit_costs.csv · northwind_meter_reads.csv ·
              northwind_ai_pilot_2025.csv · northwind_systems.csv — Sep 2026.
              All figures USD. Regulatory score and penalty from Ofgem licence condition data.
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
