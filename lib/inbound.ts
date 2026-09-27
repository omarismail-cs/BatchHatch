import type { AccountRecord } from "@/lib/accounts";

export type InboundRow = {
  id: string;
  name: string;
  bill: number;
  days: number;
  tag: string;
  region: string;
};

/** Complaints that are not on the opening backlog. They arrive while the desk is idle. */
export const INBOUND_CASES: AccountRecord[] = [
  {
    id: "DUN-1184",
    name: "Helen Marsh",
    address: "19 Orchard Way, Dunmoor, DU2 4NP",
    region: "Dunmoor",
    tariffCode: "NW-DOM-T1-STD",
    previousRead: 41000,
    previousReadDate: "2023-08-02",
    estimatedRead: 62000,
    estimatedAlgorithm: "SYS-06 v2012",
    estimatedBill: 410.2,
    meterType: "Mechanical Dial (No AMR)",
    callbackCount: 1,
    status: "PENDING_OVERNIGHT_BATCH",
    openDays: 2,
    agentNotes: "Called this morning. Says the bill jumped after an estimated read.",
    readingHistory: [
      { date: "2023-08-02", read: 41000, type: "actual" },
      { date: "2023-10-20", read: 62000, type: "estimated" },
    ],
    suggestedRead: 42800,
    typicalQuarterlyKwh: 1600,
  },
  {
    id: "BAR-7710",
    name: "Colin Adeyemi",
    address: "2 Station Road, Barrowdale, BA1 8QL",
    region: "Barrowdale",
    tariffCode: "NW-DOM-T2-WIN",
    previousRead: 88000,
    previousReadDate: "2023-06-11",
    estimatedRead: 140000,
    estimatedAlgorithm: "SYS-06 v2012",
    estimatedBill: 990.4,
    meterType: "Mechanical Dial (No AMR)",
    callbackCount: 3,
    status: "ESCALATED",
    openDays: 6,
    agentNotes: "Writing to the regulator. Do not guess a dial. Hold the estimate.",
    readingHistory: [
      { date: "2023-06-11", read: 88000, type: "actual" },
      { date: "2023-10-18", read: 140000, type: "estimated" },
    ],
    suggestedRead: 90500,
    typicalQuarterlyKwh: 2200,
  },
  {
    id: "DUN-5602",
    name: "Nina Pell",
    address: "44 Chapel Street, Dunmoor, DU5 1BW",
    region: "Dunmoor",
    tariffCode: "NW-DOM-T1-STD",
    previousRead: 22000,
    previousReadDate: "2023-09-01",
    estimatedRead: 31000,
    estimatedAlgorithm: "SYS-06 v2012",
    estimatedBill: 276.15,
    meterType: "Mechanical Dial (No AMR)",
    callbackCount: 0,
    status: "PENDING_OVERNIGHT_BATCH",
    openDays: 1,
    agentNotes: "Texted a photo of the dial. Suggested read matches the photo.",
    readingHistory: [
      { date: "2023-09-01", read: 22000, type: "actual" },
      { date: "2023-10-22", read: 31000, type: "estimated" },
    ],
    suggestedRead: 23650,
    typicalQuarterlyKwh: 1500,
  },
];

export const INBOUND_ROWS: InboundRow[] = INBOUND_CASES.map((a) => ({
  id: a.id,
  name: a.name,
  bill: a.estimatedBill,
  days: a.openDays,
  tag: a.status === "ESCALATED" ? "Regulator complaint" : "Just opened",
  region: a.region,
}));
