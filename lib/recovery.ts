export const RECOVERY = {
  open_backlog: 1599,
  open_billing_share: 0.6848,
  past_sla: 841,
  base_inflow: 1185,
  base_capacity: 1128.8,
  billing_share_recent: 0.6293,
  capacity_lift_if_no_transfer: 0.2105,
  one_day_queue_cases: 37.1,
  reopen_if_transferred: 0.294,
  reopen_if_stayed: 0.095,
  days_if_transferred: 38.2,
  days_if_stayed: 23,
  categories: [
    { name: "Billing, disputed amount", count: 576, meter: true },
    { name: "Billing, estimated read", count: 348, meter: true },
    { name: "Metering, no read taken", count: 171, meter: true },
    { name: "Supply, interruption", count: 125, meter: false },
    { name: "Service, poor communication", count: 108, meter: false },
    { name: "Service, missed appointment", count: 88, meter: false },
    { name: "Payment, plan or arrears", count: 80, meter: false },
    { name: "Water, pressure or quality", count: 60, meter: false },
    { name: "Other", count: 43, meter: false },
  ],
  regions: [
    { region: "Barrowdale", estimated: 0.641, per1k: 5.44, legacy: true },
    { region: "Dunmoor", estimated: 0.587, per1k: 7.28, legacy: true },
    { region: "Fenwick", estimated: 0.26, per1k: 5.75, legacy: false },
    { region: "Calderfield", estimated: 0.238, per1k: 3.25, legacy: false },
    { region: "Ashford", estimated: 0.202, per1k: 2.95, legacy: false },
    { region: "Eastmarch", estimated: 0.17, per1k: 3.94, legacy: false },
  ],
  pilot: [
    { label: "Contained", a: 0.16, b: 0.104, start: "16%", end: "10%" },
    { label: "Satisfaction / 5", a: 2.6 / 5, b: 2.04 / 5, start: "2.60", end: "2.04" },
    { label: "Complaint after", a: 0.11, b: 0.142, start: "11%", end: "14%" },
  ],
} as const;

export const PRESETS = [
  { id: "current", label: "Do nothing", prevent: 0, lift: 0, batch: false },
  { id: "batch_only", label: "Instant bill post", prevent: 0, lift: 0, batch: true },
  { id: "same_contact", label: "Same contact", prevent: 0, lift: Math.round(RECOVERY.capacity_lift_if_no_transfer * 100), batch: false },
  { id: "prevent", label: "Stop meter complaints", prevent: 100, lift: 0, batch: false },
  { id: "both", label: "Both", prevent: 100, lift: Math.round(RECOVERY.capacity_lift_if_no_transfer * 100), batch: false },
] as const;

export type PresetId = (typeof PRESETS)[number]["id"] | "custom";

export function simulate(preventPct: number, liftPct: number, batch: boolean, capacityOverride?: number) {
  const D = RECOVERY;
  const inflow = D.base_inflow * (1 - D.billing_share_recent * (preventPct / 100));
  const capacity = capacityOverride == null ? D.base_capacity * (1 + liftPct / 100) : capacityOverride;
  const start = batch ? D.open_backlog - D.one_day_queue_cases : D.open_backlog;
  const path = [Math.round(start * 10) / 10];
  let cleared: number | null = null;
  let backlog = start;
  for (let month = 1; month <= 12; month++) {
    backlog = Math.max(0, backlog + inflow - capacity);
    path.push(Math.round(backlog * 10) / 10);
    if (cleared === null && backlog <= 0) cleared = month;
  }
  return { path, cleared, inflow, capacity, end: path[12] };
}
