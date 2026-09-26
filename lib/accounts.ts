export type ComplaintStatus =
  | "PENDING_OVERNIGHT_BATCH"
  | "VERIFIED_CLEARED"
  | "ESCALATED"
  | "CLOSED";

export type OutageRecord = {
  ref: string;                  // e.g. "INC-2023-10-NW-0084"
  since: string;                // human-readable start time
  area: string;                 // affected postcode sector / grid zone
  compensationApplied: number;  // £ auto-credited under licence condition 14B
};

export type AccountRecord = {
  id: string;
  name: string;
  address: string;
  region: "Barrowdale" | "Dunmoor";
  tariffCode: string;
  previousRead: number;
  previousReadDate: string;
  estimatedRead: number;
  estimatedAlgorithm: string;
  estimatedBill: number;
  meterType: string;
  callbackCount: number;
  status: ComplaintStatus;
  openDays: number;
  agentNotes: string;
  readingHistory: { date: string; read: number; type: "actual" | "estimated" }[];
  correctedBill?: number;
  verifiedRead?: number;
  outage?: OutageRecord;
  // Plausible real reading for this billing period — used for validation ceiling + demo hint
  suggestedRead: number;
  // Typical quarterly kWh for this household — used as plausibility ceiling
  typicalQuarterlyKwh: number;
};

export const ACCOUNTS: AccountRecord[] = [
  {
    id: "DUN-9021",
    name: "Margaret Holloway",
    address: "14 Trent Close, Dunmoor, DU4 7RN",
    region: "Dunmoor",
    tariffCode: "NW-DOM-T2-WIN",
    previousRead: 60150,
    previousReadDate: "2023-07-01",
    estimatedRead: 94210,
    estimatedAlgorithm: "SYS-06 v2012",
    estimatedBill: 842.10,
    meterType: "Mechanical Dial (No AMR)",
    callbackCount: 3,
    status: "PENDING_OVERNIGHT_BATCH",
    openDays: 41,
    agentNotes: "Fixed pension customer. Escalated to manager twice. Threatening regulator complaint.",
    readingHistory: [
      { date: "2022-10-01", read: 56200, type: "actual" },
      { date: "2023-01-01", read: 58100, type: "estimated" },
      { date: "2023-04-01", read: 59200, type: "estimated" },
      { date: "2023-07-01", read: 60150, type: "actual" },
      { date: "2023-10-01", read: 94210, type: "estimated" },
    ],
    outage: {
      ref: "INC-2023-10-NW-0084",
      since: "22 Oct 2023 · 06:14",
      area: "Dunmoor North (DU4 postcode sector)",
      compensationApplied: 30.00,
    },
    // Pensioner, 2-bed semi, Jul–Oct (summer→early autumn). ~1,250 kWh is realistic.
    suggestedRead: 61400,
    typicalQuarterlyKwh: 1800,
  },
  {
    id: "BAR-4401",
    name: "James Whitmore",
    address: "7 Birch Avenue, Barrowdale, BA2 5PQ",
    region: "Barrowdale",
    tariffCode: "NW-DOM-T1-STD",
    previousRead: 28490,
    previousReadDate: "2023-08-15",
    estimatedRead: 51230,
    estimatedAlgorithm: "SYS-06 v2012",
    estimatedBill: 612.40,
    meterType: "Mechanical Dial (No AMR)",
    callbackCount: 2,
    status: "PENDING_OVERNIGHT_BATCH",
    openDays: 28,
    agentNotes: "Retired teacher. Has submitted formal written complaint.",
    readingHistory: [
      { date: "2023-02-15", read: 24100, type: "actual" },
      { date: "2023-05-15", read: 26200, type: "estimated" },
      { date: "2023-08-15", read: 28490, type: "actual" },
      { date: "2023-11-15", read: 51230, type: "estimated" },
    ],
    outage: {
      ref: "INC-2023-11-NW-0091",
      since: "14 Nov 2023 · 03:47",
      area: "Barrowdale Central (BA2 postcode sector)",
      compensationApplied: 30.00,
    },
    // Retired teacher, 3-bed detached, Aug–Nov (autumn). ~3,260 kWh is plausible for larger house.
    suggestedRead: 31750,
    typicalQuarterlyKwh: 3500,
  },
  {
    id: "DUN-7782",
    name: "Patricia Okafor",
    address: "31 Millfield Road, Dunmoor, DU3 2LK",
    region: "Dunmoor",
    tariffCode: "NW-DOM-T2-WIN",
    previousRead: 142300,
    previousReadDate: "2023-06-01",
    estimatedRead: 178440,
    estimatedAlgorithm: "SYS-06 v2012",
    estimatedBill: 524.80,
    meterType: "Mechanical Dial (No AMR)",
    callbackCount: 1,
    status: "PENDING_OVERNIGHT_BATCH",
    openDays: 19,
    agentNotes: "Works from home. Has photographic evidence of meter reading.",
    readingHistory: [
      { date: "2022-12-01", read: 137800, type: "actual" },
      { date: "2023-03-01", read: 139900, type: "estimated" },
      { date: "2023-06-01", read: 142300, type: "actual" },
      { date: "2023-09-01", read: 178440, type: "estimated" },
    ],
    // WFH, 2-bed flat, Jun–Sep (summer, high daytime usage). ~1,650 kWh.
    suggestedRead: 143950,
    typicalQuarterlyKwh: 2200,
  },
  {
    id: "BAR-2209",
    name: "Robert Finch",
    address: "88 Sycamore Drive, Barrowdale, BA7 1TH",
    region: "Barrowdale",
    tariffCode: "NW-DOM-T1-STD",
    previousRead: 73200,
    previousReadDate: "2023-09-01",
    estimatedRead: 89750,
    estimatedAlgorithm: "SYS-06 v2012",
    estimatedBill: 388.60,
    meterType: "Mechanical Dial (No AMR)",
    callbackCount: 0,
    status: "PENDING_OVERNIGHT_BATCH",
    openDays: 12,
    agentNotes: "New customer referral. Meter last read 14 months ago.",
    readingHistory: [
      { date: "2022-09-01", read: 69100, type: "actual" },
      { date: "2023-03-01", read: 71100, type: "estimated" },
      { date: "2023-09-01", read: 73200, type: "actual" },
      { date: "2023-12-01", read: 89750, type: "estimated" },
    ],
    // Single occupant, 1-bed flat, Sep–Dec (early winter). ~2,100 kWh.
    suggestedRead: 75300,
    typicalQuarterlyKwh: 2500,
  },
  {
    id: "DUN-3345",
    name: "Edith Cargill",
    address: "5 Heather Lane, Dunmoor, DU1 9WE",
    region: "Dunmoor",
    tariffCode: "NW-DOM-T2-WIN",
    previousRead: 31800,
    previousReadDate: "2023-08-01",
    estimatedRead: 58920,
    estimatedAlgorithm: "SYS-06 v2012",
    estimatedBill: 723.50,
    meterType: "Mechanical Dial (No AMR)",
    callbackCount: 4,
    status: "ESCALATED",
    openDays: 58,
    agentNotes: "URGENT: Solicitor involved. Customer on energy debt support scheme.",
    readingHistory: [
      { date: "2023-02-01", read: 27400, type: "actual" },
      { date: "2023-05-01", read: 29400, type: "estimated" },
      { date: "2023-08-01", read: 31800, type: "actual" },
      { date: "2023-11-01", read: 58920, type: "estimated" },
    ],
    // Elderly, 2-bed terrace, Aug–Nov (summer into autumn). ~1,400 kWh.
    suggestedRead: 33200,
    typicalQuarterlyKwh: 2000,
  },
];

export function findAccount(query: string): AccountRecord | undefined {
  const q = query.trim().toUpperCase();
  return ACCOUNTS.find(
    (a) =>
      a.id.toUpperCase() === q ||
      a.name.toUpperCase().includes(q) ||
      a.address.toUpperCase().includes(q)
  );
}

export function searchAccounts(query: string): AccountRecord[] {
  if (!query.trim()) return ACCOUNTS;
  const q = query.trim().toUpperCase();
  return ACCOUNTS.filter(
    (a) =>
      a.id.toUpperCase().includes(q) ||
      a.name.toUpperCase().includes(q) ||
      a.address.toUpperCase().includes(q) ||
      a.region.toUpperCase().includes(q)
  );
}
