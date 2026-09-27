"use client";

import { useEffect, useState } from "react";

function untilNextBatch(now: Date) {
  const next = new Date(now);
  next.setHours(2, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const mins = Math.max(0, Math.round((next.getTime() - now.getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** How long the customer would wait if we left it to the 02:00 mainframe run. */
export default function BatchClock() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setLabel(untilNextBatch(new Date()));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <span
      title="Aurora SYS-01 runs the overnight billing file at 02:00. BatchHatch does not wait for it."
      style={{ display: "inline-flex", alignItems: "baseline", gap: 8, fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}
    >
      <span>Next overnight batch</span>
      <span className="mono" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums", minWidth: "6ch" }}>
        {label ?? "\u00A0"}
      </span>
    </span>
  );
}
