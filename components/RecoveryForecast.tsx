"use client";

import { useMemo, useState } from "react";
import { PRESETS, RECOVERY, PresetId, simulate } from "@/lib/recovery";

const AGENT_YEAR = 46000;
const COMPLAINT_COST = 68;
const CLOSES_PER_AGENT_MONTH = (AGENT_YEAR / COMPLAINT_COST) / 12;
const CALLS_LAST_YEAR = 617765;
const CALL_FTE = (CALLS_LAST_YEAR * 7.4) / AGENT_YEAR;

function fmt(n: number) {
  return Math.round(n).toLocaleString("en-US");
}

function money(n: number) {
  const v = Math.round(n);
  const sign = v < 0 ? "−" : "";
  const abs = Math.abs(v);
  if (abs >= 1e6) {
    const m = abs / 1e6;
    return sign + "$" + (m >= 10 ? m.toFixed(0) : m.toFixed(1)) + "m";
  }
  return sign + "$" + abs.toLocaleString("en-US");
}

export default function RecoveryForecast() {
  const [active, setActive] = useState<PresetId>("current");
  const [prevent, setPrevent] = useState(0);
  const [lift, setLift] = useState(0);
  const [pace, setPace] = useState(0);

  const model = useMemo(() => {
    const preset = PRESETS.find((item) => item.id === active);
    const batch = Boolean(preset && preset.batch && prevent === preset.prevent && lift === preset.lift);
    const inflowPreview = RECOVERY.base_inflow * (1 - RECOVERY.billing_share_recent * (prevent / 100));
    const organic = RECOVERY.base_capacity * (1 + lift / 100);
    const required = pace ? inflowPreview + RECOVERY.open_backlog / pace : organic;
    const forced = pace > 0 && required > organic + 0.5;
    const capacity = forced ? required : organic;
    const result = simulate(prevent, lift, batch, forced ? capacity : undefined);
    const current = simulate(0, 0, false).path;
    return { batch, organic, forced, capacity, result, current, required };
  }, [active, prevent, lift, pace]);

  const copy: Record<string, [string, string]> = {
    current: [
      "Left alone, the queue is still growing in month 12.",
      "About 1,185 complaints open each month and 1,129 are closed. No system change and no extra people.",
    ],
    batch_only: [
      "Instant bill post means the corrected bill appears the same day.",
      "This removes the overnight wait. About 37 cases come off the queue, then it grows again.",
    ],
    same_contact: [
      "Same contact means the agent finishes the case without sending it elsewhere.",
      `A transferred complaint takes ${RECOVERY.days_if_transferred} days. One that stays takes ${RECOVERY.days_if_stayed}. The queue clears in month 9 if that time becomes extra closes.`,
    ],
    prevent: [
      "Stop meter complaints means those bills are no longer raised.",
      "Disputed bills, estimated reads, and missed reads are 63% of new complaints. The queue clears in month 3.",
    ],
    both: [
      "Both means finish the case in one system, and stop the bad bills arriving.",
      "No new agents. The queue clears in month 2. A missing read still needs a visit.",
    ],
  };

  let title: string;
  let note: string;
  if (pace && model.forced) {
    title = `Clear the queue in ${pace} ${pace === 1 ? "month" : "months"}.`;
    note = "That pace is faster than the levers alone, so the people and cost below are the hire required to hold it.";
  } else if (copy[active]) {
    [title, note] = copy[active];
  } else if (model.result.cleared) {
    title = `On these settings the queue clears in month ${model.result.cleared}.`;
    note = `Inflow would be ${fmt(model.result.inflow)} a month. Close capacity would be ${fmt(model.result.capacity)}.`;
  } else {
    title = `On these settings ${fmt(model.result.end)} cases are still open in month 12.`;
    note = `Inflow would be ${fmt(model.result.inflow)} a month, against close capacity of ${fmt(model.result.capacity)}.`;
  }

  const hireMonthly = Math.max(0, model.result.capacity - model.organic);
  const hireFte = hireMonthly / CLOSES_PER_AGENT_MONTH;
  const permanentMonthly = Math.max(0, model.result.inflow - model.organic);
  const permanentFte = Math.min(hireFte, permanentMonthly / CLOSES_PER_AGENT_MONTH);
  const surgeCost = hireFte * AGENT_YEAR * ((pace || 0) / 12);
  const permanentCost = permanentFte * AGENT_YEAR;

  const peopleValue = hireFte >= 0.05 ? hireFte.toFixed(1) : "None";
  const peopleDetail = hireFte >= 0.05
    ? `That is ${Math.round((hireFte / CALL_FTE) * 100)}% of a year of call time.`
    : model.result.cleared
      ? `Today's close rate already beats the inflow. The queue clears in month ${model.result.cleared} without a hire.`
      : "These levers do not add closes, and no one new is being hired.";
  const costValue = hireFte < 0.05 ? "$0" : money(pace ? surgeCost : permanentCost);
  const costDetail = hireFte < 0.05
    ? "No added salary. Smart meters for Barrowdale and Dunmoor would be $77m."
    : `${money(surgeCost)} over ${pace} months at $46,000 a year.` + (permanentFte >= 0.05 ? ` After that, ${money(permanentCost)} a year.` : "");

  function applyPreset(id: PresetId) {
    const preset = PRESETS.find((item) => item.id === id);
    if (!preset) return;
    setActive(id);
    setPrevent(preset.prevent);
    setLift(preset.lift);
  }

  return (
    <section className="card" style={{ padding: "16px 18px" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 500, letterSpacing: "-0.02em" }}>{title}</h2>
      <p style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: 13, maxWidth: "68ch" }}>{note}</p>

      <div className="segment" role="group" aria-label="Recovery path" style={{ marginBottom: 16 }}>
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={active === preset.id}
            onClick={() => applyPreset(preset.id)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20, marginBottom: 8 }}>
        <Slider
          label="Meter-driven complaints prevented"
          min={0}
          max={100}
          value={prevent}
          onChange={(value) => { setPrevent(value); setActive("custom"); }}
          detail={`${prevent}% of that stream stopped · inflow ${fmt(model.result.inflow)} / month`}
        />
        <Slider
          label="Closing on the same contact"
          min={0}
          max={40}
          value={lift}
          onChange={(value) => { setLift(value); setActive("custom"); }}
          detail={`${lift}% more closes from the same team · ${fmt(RECOVERY.base_capacity * (1 + lift / 100))} / month`}
        />
        <div style={{ gridColumn: "1 / -1" }}>
          <Slider
            label="Pace, in months to clear the queue"
            min={0}
            max={12}
            value={pace}
            onChange={setPace}
            detail={pace
              ? `Clear in ${pace} ${pace === 1 ? "month" : "months"} · ${fmt(model.capacity)} closes a month`
              : "No added pace. The chart uses only the two levers above."}
          />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 14, fontSize: 12, color: "var(--muted)", margin: "8px 0 4px" }}>
        <span><i style={{ display: "inline-block", width: 16, borderTop: "2px dashed #8c7366", marginRight: 5, verticalAlign: "middle" }} />Current path</span>
        <span><i style={{ display: "inline-block", width: 16, borderTop: "2.5px solid var(--blue)", marginRight: 5, verticalAlign: "middle" }} />Selected path</span>
      </div>
      <ForecastChart current={model.current} selected={model.result.path} />
      <p style={{ margin: "4px 0 10px", color: "var(--muted)", fontSize: 12 }}>
        Open complaints through month 12. The solid line is the selected path. The dashed line is what happens if nothing changes.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginTop: 8 }}>
        <Fact value={peopleValue} label="Agents to add" detail={peopleDetail} />
        <Fact value={costValue} label={pace ? "Cost until the queue is gone" : "Added salary"} detail={costDetail} />
        <Fact
          value={model.result.cleared ? `Month ${model.result.cleared}` : "Not in 12 months"}
          label="Queue hits zero"
          detail={model.result.cleared
            ? `${fmt(model.result.capacity)} closes a month against ${fmt(model.result.inflow)} new complaints.`
            : `${fmt(model.result.end)} would still be open.`}
        />
      </div>
    </section>
  );
}

function Slider({
  label, min, max, value, onChange, detail,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  detail: string;
}) {
  return (
    <label style={{ display: "block", fontSize: 13, fontWeight: 500 }}>
      {label}
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        step={1}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", margin: "10px 0 6px", accentColor: "var(--blue)" }}
      />
      <span style={{ display: "block", color: "var(--muted)", fontSize: 12, fontWeight: 400 }}>{detail}</span>
    </label>
  );
}

function Fact({ value, label, detail }: { value: string; label: string; detail: string }) {
  return (
    <div>
      <b className="figure" style={{ display: "block", fontSize: 30, lineHeight: 1 }}>{value}</b>
      <span style={{ display: "block", marginTop: 6, fontSize: 13, fontWeight: 500 }}>{label}</span>
      <span style={{ display: "block", marginTop: 4, color: "var(--muted)", fontSize: 13 }}>{detail}</span>
    </div>
  );
}

function ForecastChart({ current, selected }: { current: number[]; selected: number[] }) {
  const w = 720, h = 230, left = 48, right = 56, top = 14, bottom = 26;
  const max = Math.max(...current, ...selected, 100);
  const x = (i: number) => left + (i / 12) * (w - left - right);
  const y = (v: number) => top + (1 - v / max) * (h - top - bottom);
  const line = (path: number[]) => path.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const marks = [0, 3, 6, 9, 12];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Open complaints over 12 months" style={{ display: "block" }}>
      {[0, max / 2, max].map((value) => (
        <g key={value}>
          <text x={left - 8} y={y(value) + 3} textAnchor="end" fontSize={11} fill="#6f6a64">{fmt(value)}</text>
          <line x1={left} y1={y(value)} x2={w - right} y2={y(value)} stroke="#efece6" />
        </g>
      ))}
      <path d={line(current)} fill="none" stroke="#8c7366" strokeWidth={1.75} strokeDasharray="5 4" />
      <path d={line(selected)} fill="none" stroke="#e85d04" strokeWidth={2.25} />
      <text x={x(12) + 6} y={y(current[12]) + 3} fontSize={11} fill="#6b574c">{fmt(current[12])}</text>
      <text x={x(12) + 6} y={Math.min(y(selected[12]) + 14, h - 30)} fontSize={11} fill="#e85d04">{fmt(selected[12])}</text>
      {marks.map((month) => (
        <text key={month} x={x(month)} y={h - 6} textAnchor="middle" fontSize={11} fill="#6f6a64">
          {month === 0 ? "Now" : month}
        </text>
      ))}
    </svg>
  );
}
