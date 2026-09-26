import { NextRequest, NextResponse } from "next/server";

// ── Billing data (mirrors lib/accounts.ts + lib/billing.ts) ──────────────────

const ACCOUNTS: Record<string, {
  name: string; previous: number; estimate: number; bill: number;
  tariff: string; suggested: number; region: string;
}> = {
  "DUN-9021": { name: "Margaret Holloway", previous: 60150, estimate: 94210, bill: 842.10, tariff: "NW-DOM-T2-WIN", suggested: 61400, region: "Dunmoor" },
  "BAR-4401": { name: "James Whitmore",    previous: 28490, estimate: 51230, bill: 612.40, tariff: "NW-DOM-T1-STD", suggested: 31750, region: "Barrowdale" },
  "DUN-7782": { name: "Patricia Okafor",   previous: 142300, estimate: 178440, bill: 524.80, tariff: "NW-DOM-T2-WIN", suggested: 143950, region: "Dunmoor" },
  "BAR-2209": { name: "Robert Finch",      previous: 73200, estimate: 89750, bill: 388.60, tariff: "NW-DOM-T1-STD", suggested: 75300, region: "Barrowdale" },
  "DUN-3345": { name: "Edith Cargill",     previous: 31800, estimate: 58920, bill: 723.50, tariff: "NW-DOM-T2-WIN", suggested: 33200, region: "Dunmoor" },
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
    ok: true,
    accountId,
    name: account.name,
    read: currentRead,
    units,
    estimatedBill: account.bill,
    correctedBill: total,
    saved: Math.round((account.bill - total) * 100) / 100,
  };
}

// ── OpenAI tool definitions ───────────────────────────────────────────────────

const TOOLS = [
  {
    type: "function",
    function: {
      name: "list_backlog",
      description: "List the five open estimated-bill cases.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "rate_bill",
      description: "Run BatchHatch Aurora rating for one account and a dial read.",
      parameters: {
        type: "object",
        properties: {
          account_id: { type: "string" },
          current_read: { type: "integer" },
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
      description: "Hold the estimated bill so it is not sent to the customer.",
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
      description: "Close the case on this screen without transferring it.",
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
  if (name === "rate_bill" && result.ok) {
    return [
      { type: "select", accountId },
      { type: "rate", accountId, read: result.read },
    ];
  }
  if (name === "hold_bill" && result.ok) return [{ type: "select", accountId }, { type: "hold", accountId }];
  if (name === "close_case" && result.ok) return [{ type: "select", accountId }, { type: "close", accountId }];
  return [];
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "OPENAI_API_KEY not set in .env.local" }, { status: 500 });
  }

  const payload = await req.json().catch(() => ({}));
  const message = String(payload.message || "Correct the open case from the dial read and close it.");
  const accountId = String(payload.accountId || "DUN-9021").toUpperCase();
  const dialRead = Number(payload.dialRead || 0);
  const account = ACCOUNTS[accountId] ?? ACCOUNTS["DUN-9021"];

  const messages: object[] = [
    {
      role: "system",
      content:
        "You act for a Northwind call-centre agent. Use the tools. " +
        "Be brief. Currency is CAD. BatchHatch rates the dial read with Aurora's tariff. " +
        "If the user does not give a read, use the account suggested read. " +
        "After a correction, say the old bill, the new bill, and that the case can close without a transfer.",
    },
    {
      role: "user",
      content: `Open account ${accountId}. Suggested dial read ${dialRead || account.suggested}. Estimated bill $${account.bill}. Request: ${message}`,
    },
  ];

  const actions: object[] = [];
  let reply = "I could not finish that.";

  for (let i = 0; i < 4; i++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.2, messages, tools: TOOLS }),
    });
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `OpenAI ${res.status}: ${err.slice(0, 200)}` }, { status: 502 });
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
  const hasKey = !!process.env.OPENAI_API_KEY;
  return NextResponse.json({ key: hasKey });
}
