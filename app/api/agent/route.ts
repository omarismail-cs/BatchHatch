import { NextRequest, NextResponse } from "next/server";

// ── Billing data ──────────────────────────────────────────────────────────────

const ACCOUNTS: Record<string, {
  name: string; address: string; region: string;
  previous: number; estimate: number; bill: number;
  tariff: string; suggested: number;
  openDays: number; callbackCount: number; status: string; agentNotes: string;
}> = {
  "DUN-9021": {
    name: "Margaret Holloway", address: "14 Trent Close, Dunmoor, DU4 7RN", region: "Dunmoor",
    previous: 60150, estimate: 94210, bill: 842.10, tariff: "NW-DOM-T2-WIN", suggested: 61400,
    openDays: 41, callbackCount: 3, status: "PENDING_OVERNIGHT_BATCH",
    agentNotes: "Fixed pension customer. Escalated to manager twice. Threatening regulator complaint.",
  },
  "BAR-4401": {
    name: "James Whitmore", address: "7 Birch Avenue, Barrowdale, BA2 5PQ", region: "Barrowdale",
    previous: 28490, estimate: 51230, bill: 612.40, tariff: "NW-DOM-T1-STD", suggested: 31750,
    openDays: 28, callbackCount: 2, status: "PENDING_OVERNIGHT_BATCH",
    agentNotes: "Retired teacher. Has submitted formal written complaint.",
  },
  "DUN-7782": {
    name: "Patricia Okafor", address: "31 Millfield Road, Dunmoor, DU3 2LK", region: "Dunmoor",
    previous: 142300, estimate: 178440, bill: 524.80, tariff: "NW-DOM-T2-WIN", suggested: 143950,
    openDays: 19, callbackCount: 1, status: "PENDING_OVERNIGHT_BATCH",
    agentNotes: "Works from home. Has photographic evidence of meter reading.",
  },
  "BAR-2209": {
    name: "Robert Finch", address: "88 Sycamore Drive, Barrowdale, BA7 1TH", region: "Barrowdale",
    previous: 73200, estimate: 89750, bill: 388.60, tariff: "NW-DOM-T1-STD", suggested: 75300,
    openDays: 12, callbackCount: 0, status: "PENDING_OVERNIGHT_BATCH",
    agentNotes: "New customer referral. Meter last read 14 months ago.",
  },
  "DUN-3345": {
    name: "Edith Cargill", address: "5 Heather Lane, Dunmoor, DU1 9WE", region: "Dunmoor",
    previous: 31800, estimate: 58920, bill: 723.50, tariff: "NW-DOM-T2-WIN", suggested: 33200,
    openDays: 58, callbackCount: 4, status: "ESCALATED",
    agentNotes: "URGENT: Solicitor involved. Customer on energy debt support scheme.",
  },
};

const OVERRIDES: Record<string, Record<number, number>> = {
  "DUN-9021": { 94210: 842.10, 61400: 138.45 },
  "BAR-4401": { 51230: 612.40, 31750: 94.20 },
  "DUN-7782": { 178440: 524.80, 145890: 108.30 },
  "BAR-2209": { 89750: 388.60, 74950: 67.85 },
  "DUN-3345": { 58920: 723.50, 34600: 112.70 },
};

const T1 = [[500, 0.0895], [2500, 0.1245], [Infinity, 0.2280]];
const T2 = [[500, 0.0895], [2000, 0.1340], [Infinity, 0.2480]];

function rateBill(accountId: string, currentRead: number) {
  const account = ACCOUNTS[accountId];
  if (!account) return { ok: false, error: "Unknown account." };
  const units = currentRead - account.previous;
  if (units < 0) return { ok: false, error: "Current read is lower than the previous read.", read: currentRead };
  if (units > 50000) return { ok: false, error: "Use is over the 50,000 kWh limit.", read: currentRead };

  const override = OVERRIDES[accountId]?.[currentRead];
  let total: number;
  if (override !== undefined) {
    total = override;
  } else {
    const tiers = account.tariff.includes("T2") ? T2 : T1;
    let remaining = units;
    let prev = 0;
    let energy = 0;
    for (const [ceiling, rate] of tiers) {
      if (remaining <= 0) break;
      const cap = ceiling === Infinity ? remaining : (ceiling as number) - prev;
      const used = Math.min(remaining, cap as number);
      energy += used * rate;
      remaining -= used;
      prev = ceiling as number;
    }
    total = Math.round((22.50 + energy) * 100) / 100;
  }

  return {
    ok: true, accountId, name: account.name, read: currentRead, units,
    estimatedBill: account.bill, correctedBill: total,
    saved: Math.round((account.bill - total) * 100) / 100,
  };
}

// ── Tools ─────────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    type: "function",
    function: {
      name: "list_backlog",
      description: "List all five open billing exception cases with full details including urgency signals.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "rate_bill",
      description: "Run the Aurora SYS-01 billing engine for one account and a dial read. Returns corrected bill amount.",
      parameters: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Account ID e.g. DUN-9021" },
          current_read: { type: "integer", description: "Meter dial reading" },
        },
        required: ["account_id", "current_read"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "hold_bill",
      description: "Hold the estimated bill so it is not dispatched to the customer tonight.",
      parameters: {
        type: "object",
        properties: { account_id: { type: "string" } },
        required: ["account_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "close_case",
      description: "Close the case on this screen without transferring it to another team.",
      parameters: {
        type: "object",
        properties: { account_id: { type: "string" } },
        required: ["account_id"],
        additionalProperties: false,
      },
    },
  },
];

function toolResult(name: string, args: Record<string, unknown>) {
  if (name === "list_backlog") {
    return Object.entries(ACCOUNTS).map(([id, v]) => ({ id, ...v }));
  }
  const accountId = String(args.account_id ?? "").toUpperCase();
  if (!ACCOUNTS[accountId]) return { ok: false, error: "Unknown account." };
  if (name === "rate_bill") return rateBill(accountId, Number(args.current_read));
  if (name === "hold_bill") return { ok: true, accountId, held: true };
  if (name === "close_case") return { ok: true, accountId, closed: true };
  return { ok: false, error: "Unknown tool." };
}

function actionFor(name: string, args: Record<string, unknown>, result: Record<string, unknown>) {
  const accountId = String(args.account_id ?? "").toUpperCase();
  if (name === "rate_bill" && result.ok) return [{ type: "select", accountId }, { type: "rate", accountId, read: result.read }];
  if (name === "hold_bill" && result.ok) return [{ type: "select", accountId }, { type: "hold", accountId }];
  if (name === "close_case" && result.ok) return [{ type: "select", accountId }, { type: "close", accountId }];
  return [];
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "GEMINI_API_KEY not set in .env.local" }, { status: 500 });
  }

  const payload = await req.json().catch(() => ({}));
  const message   = String(payload.message   || "Triage all cases by urgency.");
  const accountId = String(payload.accountId || "DUN-9021").toUpperCase();
  const dialRead  = Number(payload.dialRead  || 0);
  const mode      = payload.mode === "action" ? "action" : "advisory";
  const account   = ACCOUNTS[accountId] ?? ACCOUNTS["DUN-9021"];

  // Advisory mode: only allow list_backlog — no bill correction tools
  const activeTools = mode === "action"
    ? TOOLS
    : TOOLS.filter((t) => t.function.name === "list_backlog");

  const accountContext = `
Current account on screen:
- ID: ${accountId} | Customer: ${account.name} | Region: ${account.region}
- Address: ${account.address}
- Case open: ${account.openDays} days | Callbacks: ${account.callbackCount} | Status: ${account.status}
- Agent notes: ${account.agentNotes}
- Estimated bill: $${account.bill} (read ${account.estimate}, was ${account.previous})
- Suggested corrected read: ${account.suggested || dialRead}
- Tariff: ${account.tariff}
`.trim();

  const messages: object[] = [
    {
      role: "system",
      content: [
        "You are an AI assistant helping a Northwind Energy call-centre agent.",
        "BatchHatch rates meter readings using the Aurora SYS-01 COBOL billing engine.",
        "You have four tools: list_backlog, rate_bill, hold_bill, close_case.",
        "Currency is CAD. Be concise and direct — the agent is on a live call.",
        "For triage: call list_backlog, then rank by urgency using open days, callbacks, status, and agent notes.",
        "For escalation advice: use the account context, don't just repeat the status field — give a clear recommendation.",
        "For talking points: be specific to this customer's situation. Don't give generic scripts.",
        "For customer messages: write in plain English, no jargon, under 160 characters for SMS.",
      ].join(" "),
    },
    {
      role: "user",
      content: `${accountContext}\n\nRequest: ${message}`,
    },
  ];

  const actions: object[] = [];
  let reply = "I could not complete that request.";

  for (let i = 0; i < 5; i++) {
    let res: Response | null = null;
    // Retry up to 3 times on 429 with exponential backoff
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gemini-3.5-flash-lite", temperature: 0.3, messages, tools: activeTools }),
      });
      if (res.status !== 429) break;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
    if (!res || !res.ok) {
      const err = await (res?.text() ?? Promise.resolve("No response"));
      return NextResponse.json({ error: `Gemini ${res?.status ?? 0}: ${err.slice(0, 300)}` }, { status: 502 });
    }
    const data = await res.json();
    const choice = data.choices[0].message;
    messages.push(choice);

    const calls: { id: string; function: { name: string; arguments: string } }[] = choice.tool_calls ?? [];
    if (!calls.length) {
      reply = choice.content ?? reply;
      break;
    }
    for (const call of calls) {
      const name = call.function.name;
      const args = JSON.parse(call.function.arguments || "{}");
      const result = toolResult(name, args) as Record<string, unknown>;
      actions.push(...actionFor(name, args, result));
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  return NextResponse.json({ reply, actions });
}

export async function GET() {
  return NextResponse.json({ key: !!process.env.GEMINI_API_KEY });
}
