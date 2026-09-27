const STORAGE_KEY = "batchhatch.meterhub.v1";

/** The demo billing day the COBOL engine rates against. */
export const METERHUB_READ_DATE = "2023-10-24";

export type MeterRead = {
  accountId: string;
  read: number;
  date: string;
};

export function loadMeterReads(): Record<string, MeterRead> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, MeterRead>;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

export function saveMeterRead(entry: MeterRead): Record<string, MeterRead> {
  const all = { ...loadMeterReads(), [entry.accountId]: entry };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return all;
}

/** Next dial estimate: the verified read plus one typical quarter. */
export function nextDialEstimate(read: number, typicalQuarterlyKwh: number): number {
  return read + typicalQuarterlyKwh;
}

export function formatMeterDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
