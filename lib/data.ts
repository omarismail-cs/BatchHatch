// ============================================================
//  Real Northwind data — sourced directly from provided CSVs
//  northwind_monthly_kpis.csv, northwind_meter_reads.csv,
//  northwind_ai_pilot_2025.csv, northwind_unit_costs.csv,
//  northwind_systems.csv
// ============================================================

// --- Unit costs (northwind_unit_costs.csv) ---
export const UNIT_COSTS = {
  inboundCall: 7.40,
  complaintEndToEnd: 68.00,
  complaintTransferred: 121.00,
  manualBillCorrection: 34.00,
};

// --- Latest KPIs: Sep 2026 (northwind_monthly_kpis.csv, last row) ---
export const LATEST_KPI = {
  month: "2026-09",
  complaintsOpened: 1251,
  complaintsClosed: 1162,
  avgDaysToClose: 38.2,
  firstContactResolutionRate: 0.413,
  inboundCalls: 57060,
  costToServePerAccount: 23.92,
  regulatorSatisfactionScore: 2.58,
};

// --- Monthly KPI time series ---
export const MONTHLY_KPIS = [
  { month: "2024-10", inbound: 42571, avgDays: 9.1,  regScore: 4.30, complaints: 912  },
  { month: "2024-11", inbound: 43098, avgDays: 16.5, regScore: 4.22, complaints: 830  },
  { month: "2024-12", inbound: 41856, avgDays: 18.4, regScore: 4.15, complaints: 951  },
  { month: "2025-01", inbound: 42840, avgDays: 19.5, regScore: 4.08, complaints: 985  },
  { month: "2025-02", inbound: 41820, avgDays: 20.1, regScore: 4.00, complaints: 851  },
  { month: "2025-03", inbound: 42227, avgDays: 21.4, regScore: 3.92, complaints: 901  },
  { month: "2025-04", inbound: 44644, avgDays: 22.0, regScore: 3.85, complaints: 1023 },
  { month: "2025-05", inbound: 43396, avgDays: 23.2, regScore: 3.77, complaints: 1004 },
  { month: "2025-06", inbound: 45387, avgDays: 23.1, regScore: 3.70, complaints: 982  },
  { month: "2025-07", inbound: 50662, avgDays: 24.9, regScore: 3.62, complaints: 1222 },
  { month: "2025-08", inbound: 47010, avgDays: 26.6, regScore: 3.55, complaints: 1026 },
  { month: "2025-09", inbound: 47136, avgDays: 28.6, regScore: 3.47, complaints: 1020 },
  { month: "2025-10", inbound: 49033, avgDays: 27.6, regScore: 3.40, complaints: 1189 },
  { month: "2025-11", inbound: 48295, avgDays: 29.8, regScore: 3.32, complaints: 940  },
  { month: "2025-12", inbound: 48825, avgDays: 29.6, regScore: 3.25, complaints: 1120 },
  { month: "2026-01", inbound: 50977, avgDays: 31.0, regScore: 3.17, complaints: 1177 },
  { month: "2026-02", inbound: 48137, avgDays: 33.6, regScore: 3.10, complaints: 1002 },
  { month: "2026-03", inbound: 51169, avgDays: 32.8, regScore: 3.02, complaints: 1171 },
  { month: "2026-04", inbound: 50476, avgDays: 33.3, regScore: 2.95, complaints: 1190 },
  { month: "2026-05", inbound: 52245, avgDays: 34.6, regScore: 2.88, complaints: 1049 },
  { month: "2026-06", inbound: 53421, avgDays: 35.9, regScore: 2.80, complaints: 1164 },
  { month: "2026-07", inbound: 53113, avgDays: 35.7, regScore: 2.72, complaints: 1271 },
  { month: "2026-08", inbound: 55014, avgDays: 37.4, regScore: 2.65, complaints: 1185 },
  { month: "2026-09", inbound: 57060, avgDays: 38.2, regScore: 2.58, complaints: 1251 },
];

// --- Barrowdale & Dunmoor meter read data (latest Sep 2026) ---
// Smart meter penetration: 0.0% for both regions — unchanged across ENTIRE dataset
export const METER_READS_LATEST = {
  Barrowdale: {
    accounts: 298000,
    estimatedReadRate: 0.620, // 62% estimated — 2026-09
    smartMeterPenetration: 0.0,  // never installed
    billingExceptions: 7571,
    system: "SYS-01/SYS-06",
  },
  Dunmoor: {
    accounts: 221000,
    estimatedReadRate: 0.615, // 61.5% estimated — 2026-09
    smartMeterPenetration: 0.0,
    billingExceptions: 5576,
    system: "SYS-01/SYS-06",
  },
};

// Total SYS-01 billing exceptions/month (Barrowdale + Dunmoor, Sep 2026)
export const TOTAL_MONTHLY_EXCEPTIONS = 7571 + 5576; // 13,147

// --- AI pilot (AskNorthwind) — last known data Sep 2025 ---
export const AI_PILOT_LATEST = {
  month: "2025-09",
  sessions: 20780,
  fullyContainedRate: 0.104,    // 10.4% — down from 16% in Jan
  escalatedToAgentRate: 0.826,  // 82.6% — trending worse every month
  abandonedRate: 0.07,
  repeatContactWithin7Days: 0.446, // 44.6% — up from 31% in Jan
  assistantCsat: 2.04,          // down from 2.6 in Jan
  complaintRaisedAfterSession: 0.142,
};

// AI pilot trend (all months available)
export const AI_PILOT_TREND = [
  { month: "2025-01", contained: 0.160, escalated: 0.770, repeat: 0.310, csat: 2.60 },
  { month: "2025-02", contained: 0.153, escalated: 0.777, repeat: 0.327, csat: 2.53 },
  { month: "2025-03", contained: 0.146, escalated: 0.784, repeat: 0.344, csat: 2.46 },
  { month: "2025-04", contained: 0.139, escalated: 0.791, repeat: 0.361, csat: 2.39 },
  { month: "2025-05", contained: 0.132, escalated: 0.798, repeat: 0.378, csat: 2.32 },
  { month: "2025-06", contained: 0.125, escalated: 0.805, repeat: 0.395, csat: 2.25 },
  { month: "2025-07", contained: 0.118, escalated: 0.812, repeat: 0.412, csat: 2.18 },
  { month: "2025-08", contained: 0.111, escalated: 0.819, repeat: 0.429, csat: 2.11 },
  { month: "2025-09", contained: 0.104, escalated: 0.826, repeat: 0.446, csat: 2.04 },
];

// --- Systems (northwind_systems.csv) ---
export const SYSTEMS = {
  "SYS-01": {
    name: "Aurora Billing",
    tech: "COBOL / DB2 on mainframe",
    yearInstalled: 1998,
    annualRunCost: 4100000,
    integration: "Nightly batch file",
    notes: "Only 2 developers understand the rating engine.",
  },
  "SYS-02": {
    name: "Helix CIS",
    tech: "Oracle Forms / Oracle 11g",
    yearInstalled: 2004,
    annualRunCost: 3250000,
    integration: "Nightly batch file",
    notes: "Vendor support ends in 18 months.",
  },
  "SYS-04": {
    name: "CaseTrack",
    tech: "Java / SQL Server",
    yearInstalled: 2011,
    annualRunCost: 980000,
    integration: "Nightly batch file",
    notes: "Cases transferred between systems lose their history.",
  },
};

// --- Derived impact calculations ---
export const REGULATORY_PENALTY_PER_QUARTER = 2_400_000;

// Monthly call cost at current volume
export const MONTHLY_CALL_COST = LATEST_KPI.inboundCalls * UNIT_COSTS.inboundCall; // $422,244

// Monthly correction cost (conservative: 10% of SYS-01 exceptions need manual re-bill)
export const MONTHLY_CORRECTION_COST =
  TOTAL_MONTHLY_EXCEPTIONS * 0.1 * UNIT_COSTS.manualBillCorrection; // $44,699.80

// Repeat contact callbacks (44.6% of inbound are callbacks)
export const MONTHLY_CALLBACK_COST =
  LATEST_KPI.inboundCalls * AI_PILOT_LATEST.repeatContactWithin7Days * UNIT_COSTS.inboundCall;
