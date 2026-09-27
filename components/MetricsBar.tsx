"use client";
import { useEffect, useState } from "react";
import {
  LATEST_KPI,
  TOTAL_MONTHLY_EXCEPTIONS,
  AI_PILOT_LATEST,
  REGULATORY_PENALTY_PER_QUARTER,
} from "@/lib/data";

type Props = {
  manualRebillsSaved: number;
  callbacksSaved: number;
  resolvedToday: boolean;
  onSearch: () => void;
};

export default function MetricsBar({ manualRebillsSaved, callbacksSaved, resolvedToday, onSearch }: Props) {
  const [blink, setBlink] = useState(true);
  useEffect(() => {
    const t = setInterval(() => setBlink((b) => !b), 900);
    return () => clearInterval(t);
  }, []);

  return (
    <header
      style={{
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
      }}
    >
      {/* Top row — brand + search + agent */}
      <div className="flex items-center gap-4 px-5 py-3">
        {/* Brand */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[12px] font-black text-white"
            style={{ background: "var(--blue)" }}
          >
            BH
          </div>
          <div>
            <div className="text-[13px] font-bold" style={{ color: "var(--text)" }}>
              BatchHatch
            </div>
            <div className="text-[10px]" style={{ color: "var(--dim)" }}>
              Aurora SYS-01 · Agent Console
            </div>
          </div>
        </div>

        {/* Search bar */}
        <button
          onClick={onSearch}
          className="flex-1 max-w-md flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-left"
          style={{
            background: "var(--bg)",
            border: "1px solid var(--border)",
            color: "var(--dim)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--blue)")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="flex-1 text-[12px]">Search account — DUN-9021, Margaret Holloway…</span>
          <span
            className="text-[10px] rounded px-1.5 py-0.5 font-mono shrink-0"
            style={{ background: "var(--border)", color: "var(--muted)" }}
          >
            Ctrl K
          </span>
        </button>

        {/* Agent */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {(manualRebillsSaved > 0 || callbacksSaved > 0) && (
            <div
              className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold"
              style={{ background: "var(--green-light)", color: "var(--green)", border: "1px solid var(--green-mid)" }}
            >
              <span>✓</span>
              <span>+${(manualRebillsSaved + callbacksSaved).toFixed(2)} saved this session</span>
            </div>
          )}
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
            style={{ background: "var(--text)" }}
          >
            T1
          </div>
        </div>
      </div>

      {/* Bottom row — live crisis metrics */}
      <div
        className="flex items-center overflow-x-auto px-5 pb-2 gap-2"
        style={{ scrollbarWidth: "none" }}
      >
        <Pill
          label="Regulatory penalty"
          value={`$${(REGULATORY_PENALTY_PER_QUARTER / 1_000_000).toFixed(1)}M / qtr`}
          variant="red"
          dot
          blink={blink}
          tip="Ofgem enhanced monitoring · penalty threshold breached"
        />
        <Pill
          label="Avg resolution"
          value={resolvedToday ? "Same day ✓" : `${LATEST_KPI.avgDaysToClose} days`}
          variant={resolvedToday ? "green" : "red"}
          tip="Sep 2026 — up from 9.1 days (Oct 2024)"
        />
        <Pill
          label="Inbound calls"
          value={`${(LATEST_KPI.inboundCalls / 1000).toFixed(0)}k / month`}
          variant="red"
          tip="Sep 2026 — +34% since AI pilot launched"
        />
        <Pill
          label="SYS-01 billing errors"
          value={`${TOTAL_MONTHLY_EXCEPTIONS.toLocaleString()} / month`}
          variant="amber"
          tip="Barrowdale 7,571 + Dunmoor 5,576 · Sep 2026"
        />
        <Pill
          label="AI pilot escalation"
          value={`${(AI_PILOT_LATEST.escalatedToAgentRate * 100).toFixed(0)}% to agents`}
          variant="amber"
          tip="AskNorthwind Sep 2025 — up from 77% at launch"
        />
        <Pill
          label="Regulator score"
          value={`${LATEST_KPI.regulatorSatisfactionScore} / 5`}
          variant="red"
          tip="Sep 2026 — penalty threshold 2.5, currently below"
        />
        <Pill
          label="Smart meters BAR+DUN"
          value="0% penetration"
          variant="amber"
          tip="Both regions — deferred twice, still 0% across entire dataset"
        />
      </div>
    </header>
  );
}

function Pill({
  label,
  value,
  variant,
  dot,
  blink,
  tip,
}: {
  label: string;
  value: string;
  variant: "red" | "amber" | "green" | "blue";
  dot?: boolean;
  blink?: boolean;
  tip?: string;
}) {
  const colors = {
    red:   { bg: "var(--hint)", border: "var(--border)", text: "var(--text)",  dot: "var(--text)" },
    amber: { bg: "var(--hint)", border: "var(--border)", text: "var(--muted)", dot: "var(--muted)" },
    green: { bg: "var(--hint)", border: "var(--border)", text: "var(--text)",  dot: "var(--text)" },
    blue:  { bg: "var(--hint)", border: "var(--border)", text: "var(--text)",  dot: "var(--text)" },
  };
  const c = colors[variant];

  return (
    <div
      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 shrink-0 cursor-default"
      style={{ background: c.bg, border: `1px solid ${c.border}` }}
      title={tip}
    >
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: c.dot, opacity: blink ? 1 : 0.25, transition: "opacity 0.4s" }}
        />
      )}
      <span className="text-[10px]" style={{ color: "var(--muted)" }}>{label}:</span>
      <span className="text-[11px] font-bold whitespace-nowrap" style={{ color: c.text }}>{value}</span>
    </div>
  );
}
