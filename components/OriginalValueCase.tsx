"use client";
import { useState } from "react";
import RecoveryForecast from "@/components/RecoveryForecast";
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

function Trend({ label, values, suffix = "" }: {
  label: string; values: number[]; suffix?: string;
}) {
  const first = values[0], last = values[values.length - 1];
  const pct = Math.abs(Math.round(((last - first) / first) * 100));
  const isUp = last > first;
  return (
    <div className="card" style={{ padding: "14px 16px" }}>
      <span style={{ display: "block", fontSize: 13, fontWeight: 500 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginTop: 8 }}>
        <div>
          <b className="figure" style={{ display: "block", fontSize: 30, lineHeight: 1 }}>
            {last.toLocaleString("en-US", { maximumFractionDigits: 1 })}{suffix}
          </b>
          <span style={{ display: "block", marginTop: 6, fontSize: 13, color: "var(--muted)" }}>
            was {first.toLocaleString("en-US", { maximumFractionDigits: 1 })}{suffix} in Oct 2024 · {isUp ? "up" : "down"} {pct}%
          </span>
        </div>
        <Sparkline data={values} color="#e85d04" />
      </div>
    </div>
  );
}

export default function OriginalValueCase() {
  const [tab, setTab] = useState<"overview" | "value" | "assumptions" | "adjust">("overview");

  const tabs = [
    { key: "overview" as const,    label: "Situation" },
    { key: "value" as const,       label: "Value case" },
    { key: "assumptions" as const, label: "Assumptions" },
    { key: "adjust" as const,      label: "Adjust" },
  ];

  return (
      <section>

        <div style={{ marginBottom: 16 }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1.2 }}>
            The value case, on one page.
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", maxWidth: "58ch" }}>
            Northwind Utilities, Barrowdale and Dunmoor billing correction, September 2026.
          </p>
        </div>

        <div className="segment" role="group" aria-label="Value case sections" style={{ marginBottom: 16 }}>
          {tabs.map((t) => (
            <button key={t.key} type="button" aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── TAB: Situation ────────────────────────────────────── */}
        {tab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

            {/* Key trend metrics */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
              <Trend label="Average days to resolve"
                values={MONTHLY_KPIS.filter((_, i) => i % 2 === 0).map((m) => m.avgDays)} />
              <Trend label="Inbound calls a month"
                values={MONTHLY_KPIS.filter((_, i) => i % 2 === 0).map((m) => m.inbound)} />
              <Trend label="Regulator score out of 5"
                values={MONTHLY_KPIS.filter((_, i) => i % 2 === 0).map((m) => m.regScore)} />
            </div>

            <div className="card" style={{ padding: "16px 18px" }}>
              <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 500 }}>The backlog starts with the estimate</p>
              <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.5, maxWidth: "68ch" }}>
                519,000 accounts across Barrowdale and Dunmoor have no smart meters. Aurora SYS-06 still uses a seasonal estimate calibrated on 2010–2012 averages. At a 62% estimated-read rate it produces {EXCEPTIONS_PM.toLocaleString()} billing exceptions a month. The complaints and callbacks follow from that number.
              </p>
            </div>

            {/* Two-column stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
              <div className="card" style={{ padding: "16px 18px" }}>
                <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 500 }}>AskNorthwind, September 2025</p>
                <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--muted)" }}>The assistant launched in January 2025. Every measure got worse.</p>
                {[
                  { label: "Escalated to a person", value: "82.6%" },
                  { label: "Called again within 7 days", value: "44.6%" },
                  { label: "Finished without an agent", value: "10.4%" },
                  { label: "Satisfaction", value: "2.04 / 5" },
                ].map((r) => (
                  <div key={r.label} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderTop: "1px solid var(--border)", fontSize: 13 }}>
                    <span style={{ color: "var(--muted)" }}>{r.label}</span>
                    <span style={{ fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{r.value}</span>
                  </div>
                ))}
              </div>

              <div className="card" style={{ padding: "16px 18px" }}>
                <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 500 }}>Meter reads, September 2026</p>
                <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--muted)" }}>Neither region has a smart meter.</p>
                {[
                  { label: "Barrowdale accounts", value: METER_READS_LATEST.Barrowdale.accounts.toLocaleString() },
                  { label: "Dunmoor accounts", value: METER_READS_LATEST.Dunmoor.accounts.toLocaleString() },
                  { label: "Smart meter penetration", value: "0.0%" },
                  { label: "Barrowdale estimated reads", value: "62.0%" },
                  { label: "Dunmoor estimated reads", value: "61.5%" },
                  { label: "Billing exceptions a month", value: EXCEPTIONS_PM.toLocaleString() },
                ].map((r) => (
                  <div key={r.label} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderTop: "1px solid var(--border)", fontSize: 13 }}>
                    <span style={{ color: "var(--muted)" }}>{r.label}</span>
                    <span style={{ fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{r.value}</span>
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
              {[
                { label: "Year 1 savings", value: $(TOTAL_SAV_Y1) },
                { label: "Build cost", value: $(IMPL_COST) },
                { label: "Year 1 net", value: $(TOTAL_SAV_Y1 - IMPL_COST) },
                { label: "Payback", value: `${PAYBACK_WEEKS} weeks` },
              ].map((s) => (
                <div key={s.label} className="card" style={{ padding: "14px 16px" }}>
                  <b className="figure" style={{ display: "block", fontSize: 30, lineHeight: 1 }}>{s.value}</b>
                  <span style={{ display: "block", marginTop: 6, fontSize: 13, color: "var(--muted)" }}>{s.label}</span>
                </div>
              ))}
            </div>

            <div className="card" style={{ padding: "16px 18px" }}>
              <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 500 }}>What it costs to leave this as it is</p>
              <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--muted)" }}>Annual cost at the September run rate.</p>
              {[
                { driver: "Inbound calls", calc: `${INBOUND_PM.toLocaleString()} calls a month × $${UNIT_COSTS.inboundCall.toFixed(2)} × 12`, value: ANNUAL_CALLS },
                { driver: "Repeat contacts", calc: `${INBOUND_PM.toLocaleString()} × 44.6% call back within 7 days × $${UNIT_COSTS.inboundCall.toFixed(2)} × 12`, value: ANNUAL_REPEATS },
                { driver: "Manual bill corrections", calc: `${EXCEPTIONS_PM.toLocaleString()} × 10% × $${UNIT_COSTS.manualBillCorrection.toFixed(0)} × 12`, value: ANNUAL_CORRECTIONS },
                { driver: "Complaint handling", calc: `${COMPLAINTS_PM.toLocaleString()} complaints a month × $${UNIT_COSTS.complaintEndToEnd.toFixed(0)} × 12`, value: ANNUAL_COMPLAINTS },
                { driver: "Regulatory penalty exposure", calc: "$2.4m a quarter × 4", value: ANNUAL_REGULATORY },
              ].map((r) => (
                <div key={r.driver} style={{ display: "flex", alignItems: "baseline", gap: 16, padding: "8px 0", borderTop: "1px solid var(--border)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{r.driver}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{r.calc}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{$(r.value)}</div>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", borderTop: "1px solid var(--border)", fontSize: 13, fontWeight: 500 }}>
                <span>Total at risk a year</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{$(ANNUAL_CALLS + ANNUAL_CORRECTIONS + ANNUAL_COMPLAINTS + ANNUAL_REGULATORY)}</span>
              </div>
            </div>

            <div className="card" style={{ padding: "16px 18px" }}>
              <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 500 }}>Year 1 savings</p>
              <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--muted)" }}>70% of exceptions handled. First-contact resolution on those calls moves from 41% to 80%.</p>
              {[
                { driver: "Fewer callbacks", calc: `${Math.round(HANDLED_PM).toLocaleString()} calls handled × ${Math.round((FCR_TARGET - FCR_CURRENT) * 100)} point gain × $${UNIT_COSTS.inboundCall.toFixed(2)} × 12`, value: CALLBACKS_SAV },
                { driver: "Fewer manual corrections", calc: `${Math.round(HANDLED_PM).toLocaleString()} handled × 80% resolved × 10% still corrected × $${UNIT_COSTS.manualBillCorrection.toFixed(0)} × 12`, value: CORRECTION_SAV },
                { driver: "Fewer complaints", calc: `${COMPLAINTS_PM.toLocaleString()} complaints × 40% billing × 60% deflected × $${UNIT_COSTS.complaintEndToEnd.toFixed(0)} × 12`, value: COMPLAINT_SAV },
              ].map((r) => (
                <div key={r.driver} style={{ display: "flex", alignItems: "baseline", gap: 16, padding: "8px 0", borderTop: "1px solid var(--border)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{r.driver}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{r.calc}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{$(r.value)}</div>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", borderTop: "1px solid var(--border)", fontSize: 13, fontWeight: 500 }}>
                <span>Total Year 1 savings</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{$(TOTAL_SAV_Y1)}</span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
              <div className="card" style={{ padding: "16px 18px" }}>
                <p style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 500 }}>Build cost</p>
                {[
                  { item: "Production SYS-01 batch integration", cost: "$40,000" },
                  { item: "Agent training", cost: "$15,000" },
                  { item: "Infrastructure, nothing per call", cost: "$0" },
                ].map((r) => (
                  <div key={r.item} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderTop: "1px solid var(--border)", fontSize: 13 }}>
                    <span style={{ color: "var(--muted)" }}>{r.item}</span>
                    <span style={{ fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{r.cost}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", borderTop: "1px solid var(--border)", fontSize: 13, fontWeight: 500 }}>
                  <span>Total</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{$(IMPL_COST)}</span>
                </div>
              </div>
              <div className="card" style={{ padding: "16px 18px" }}>
                <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 500 }}>Against a smart-meter rollout</p>
                <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
                  Meters for 519,000 accounts at $400–600 each are $250m or more, over 5–7 years. BatchHatch costs {$(IMPL_COST)} and pays back in {PAYBACK_WEEKS} weeks. It runs on the SYS-01 batch file that already exists.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: Assumptions ──────────────────────────────────── */}
        {tab === "assumptions" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="card" style={{ padding: "4px 18px 8px" }}>
              {[
                { assumption: "Adoption in year 1", value: "70% of billing exception calls", sensitivity: "At 50% adoption the year 1 saving is about $615k, and payback is still under 11 weeks." },
                { assumption: "First-contact resolution", value: "41.3% to 80%", sensitivity: "At 70% the total saving falls by about 12%." },
                { assumption: "Billing share of complaints", value: "40% of 1,251 a month", sensitivity: "Recent complaints put the meter-driven share nearer 63%." },
                { assumption: "Exceptions still corrected by hand", value: "10% of 13,147", sensitivity: "Taken from the SYS-01 rejection log. The true share may be higher." },
                { assumption: "Regulatory penalty", value: "$2.4m a quarter", sensitivity: "Held flat. The score trajectory suggests it can rise." },
                { assumption: "Unit costs", value: "From the cost file", sensitivity: "A call is $7.40. A complaint in one system is $68. A correction is $34. A transfer is $121." },
                { assumption: "Smart meters", value: "Not treated as the alternative", sensitivity: "519,000 meters at $400–600 each is $250m or more over 5–7 years." },
              ].map((r) => (
                <div key={r.assumption} style={{ display: "grid", gridTemplateColumns: "minmax(140px, 1.1fr) minmax(120px, 1fr) minmax(0, 1.6fr)", gap: 12, padding: "10px 0", borderTop: "1px solid var(--border)", fontSize: 13 }}>
                  <span style={{ fontWeight: 500 }}>{r.assumption}</span>
                  <span style={{ color: "var(--muted)" }}>{r.value}</span>
                  <span style={{ color: "var(--muted)" }}>{r.sensitivity}</span>
                </div>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", maxWidth: "68ch" }}>
              Figures come from the monthly KPIs, unit costs, meter reads, the 2025 assistant pilot, and the systems file. Dollars are the cost-file numbers.
            </p>
          </div>
        )}

        {tab === "adjust" && <RecoveryForecast />}

      </section>
  );
}
