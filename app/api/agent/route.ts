import { NextRequest, NextResponse } from "next/server";
import { ACCOUNTS as CASEBOOK, type AccountRecord } from "@/lib/accounts";
import { INBOUND_CASES } from "@/lib/inbound";
import { AI_PILOT_LATEST, LATEST_KPI, METER_READS_LATEST, TOTAL_MONTHLY_EXCEPTIONS, UNIT_COSTS } from "@/lib/data";
import { runCobolEngine } from "@/lib/billing";

const DIRECTORY = [...CASEBOOK, ...INBOUND_CASES];

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

// ── Desk triage ───────────────────────────────────────────────────────────────

type DeskSnapshot = {
  heldIds?: string[];
  rated?: { id: string; read: number; total: number }[];
  waitingIds?: string[];
  logged?: AccountRecord[];
  sessionBills?: number;
  sessionCorrected?: number;
};

const ISSUE_CHANNELS = ["Phone", "Web", "Email", "Letter", "Regulator referral"] as const;
const ISSUE_CATEGORIES = ["Estimated meter read", "Incorrect meter reading", "Incorrect bill or tariff", "Supply outage", "Payment or affordability", "Other complaint"] as const;
const ISSUE_IMPACTS = ["Standard", "Vulnerable customer", "Legal or regulator escalation"] as const;

function pickAllowed<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return allowed.find((item) => item.toLowerCase() === raw)
    ?? allowed.find((item) => raw.includes(item.toLowerCase()) || item.toLowerCase().includes(raw))
    ?? fallback;
}

function routeForIssue(category: string, impact: string) {
  const meterRelated = category === "Estimated meter read" || category === "Incorrect meter reading";
  if (impact !== "Standard") return "Priority human review";
  if (meterRelated) return "Meter-to-bill fast lane";
  if (category === "Incorrect bill or tariff") return "Billing specialist queue";
  if (category === "Supply outage") return "Network operations";
  if (category === "Payment or affordability") return "Customer support team";
  return "General complaints triage";
}

const TRIAGE_TOOLS = [
  {
    type: "function",
    function: {
      name: "list_cases",
      description: "List every billing case the desk can see, including complaints that have not arrived yet, with hold and rated status from this session.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "read_case",
      description: "Read one account in full: notes, meter history, suggested dial, bill, and whether it is held or already rated.",
      parameters: {
        type: "object",
        properties: { account_id: { type: "string", description: "Account ID or customer name" } },
        required: ["account_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "value_case",
      description: "Read the value-case dashboard: September 2026 complaints, call volume, meter estimates, and the AskNorthwind pilot.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "focus_case",
      description: "Open one account on the call screen. Use when the person asks to pull up a specific customer.",
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
      name: "hold_case",
      description: "Hold tonight's bill for one account so it is not dispatched. Use when they ask you to hold someone, and for any escalated, solicitor, or regulator case.",
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
      name: "rate_case",
      description: "Rate one account at its suggested dial and clear it from the open queue. Refuses escalated, solicitor, and regulator cases.",
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
      name: "work_queue",
      description: "Work every open case: hold escalations, rate everyone else at the suggested dial.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "log_issue",
      description: "Log a new complaint for someone who is not already on the desk. Call this when they ask you to log or create an issue, even if list_cases has no match.",
      parameters: {
        type: "object",
        properties: {
          account: { type: "string", description: "Customer name and account id, as given. Example: Sarah Keene, BAR-6618" },
          summary: { type: "string", description: "What happened, in the customer's words." },
          channel: { type: "string", description: "Phone, Web, Email, Letter, or Regulator referral" },
          category: { type: "string", description: "Estimated meter read, Incorrect meter reading, Incorrect bill or tariff, Supply outage, Payment or affordability, or Other complaint" },
          impact: { type: "string", description: "Standard, Vulnerable customer, or Legal or regulator escalation" },
          meter_read: { type: "string", description: "Customer-provided dial, digits only, if they gave one." },
        },
        required: ["account", "summary"],
        additionalProperties: false,
      },
    },
  },
];

function mustHold(notes: string, status: string) {
  return status === "ESCALATED" || /solicitor|regulator|escalat/i.test(notes);
}

function visibleAccounts(desk: DeskSnapshot) {
  const known = new Set(DIRECTORY.map((account) => account.id));
  return [...(desk.logged ?? []).filter((account) => !known.has(account.id)), ...DIRECTORY];
}

function findDirectoryAccount(query: string, accounts: AccountRecord[] = DIRECTORY) {
  const q = query.trim().toUpperCase();
  return accounts.find((a) => a.id.toUpperCase() === q || a.name.toUpperCase().includes(q));
}

function caseStatus(id: string, desk: DeskSnapshot) {
  const rated = (desk.rated ?? []).find((row) => row.id === id);
  if (rated) return { state: "rated", read: rated.read, total: rated.total };
  if ((desk.heldIds ?? []).includes(id)) return { state: "held" };
  if ((desk.waitingIds ?? []).includes(id)) return { state: "not_on_desk_yet" };
  return { state: "open" };
}

function triageTool(name: string, args: Record<string, unknown>, desk: DeskSnapshot) {
  const accounts = visibleAccounts(desk);
  const find = (query: string) => findDirectoryAccount(query, accounts);
  if (name === "list_cases") {
    return accounts.map((a) => ({
      id: a.id,
      name: a.name,
      region: a.region,
      status: a.status,
      openDays: a.openDays,
      callbackCount: a.callbackCount,
      estimatedBill: a.estimatedBill,
      suggestedRead: a.suggestedRead,
      notes: a.agentNotes,
      desk: caseStatus(a.id, desk),
    }));
  }
  if (name === "read_case") {
    const account = find(String(args.account_id ?? ""));
    if (!account) return { ok: false, error: "No account by that id or name." };
    return { ok: true, ...account, desk: caseStatus(account.id, desk) };
  }
  if (name === "value_case") {
    return {
      month: LATEST_KPI.month,
      complaintsOpened: LATEST_KPI.complaintsOpened,
      complaintsClosed: LATEST_KPI.complaintsClosed,
      avgDaysToClose: LATEST_KPI.avgDaysToClose,
      firstContactResolutionRate: LATEST_KPI.firstContactResolutionRate,
      inboundCalls: LATEST_KPI.inboundCalls,
      regulatorSatisfactionScore: LATEST_KPI.regulatorSatisfactionScore,
      billingExceptions: TOTAL_MONTHLY_EXCEPTIONS,
      meterReads: METER_READS_LATEST,
      askNorthwind: AI_PILOT_LATEST,
      unitCosts: UNIT_COSTS,
      thisSession: {
        billsFixed: desk.sessionBills ?? 0,
        dollarsCorrected: desk.sessionCorrected ?? 0,
      },
    };
  }
  if (name === "focus_case" || name === "hold_case") {
    const account = find(String(args.account_id ?? ""));
    if (!account) return { ok: false, error: "No account by that id or name." };
    return { ok: true, accountId: account.id, name: account.name };
  }
  if (name === "rate_case") {
    const account = find(String(args.account_id ?? ""));
    if (!account) return { ok: false, error: "No account by that id or name." };
    if (mustHold(account.agentNotes, account.status)) {
      return { ok: false, error: "This case must be held. Do not rate it.", accountId: account.id, name: account.name };
    }
    const rated = (desk.rated ?? []).find((row) => row.id === account.id);
    if (rated) return { ok: false, error: "Already rated this session.", accountId: account.id, read: rated.read, total: rated.total };
    const result = runCobolEngine(account.id, account.tariffCode, account.previousRead, account.suggestedRead, new Date("2023-10-24"));
    return { ok: true, accountId: account.id, name: account.name, read: account.suggestedRead, total: result.total };
  }
  if (name === "work_queue") return { ok: true, started: true };
  if (name === "log_issue") {
    const accountQuery = String(args.account ?? "").trim();
    const summary = String(args.summary ?? "").trim();
    if (accountQuery.length < 2 || !summary) return { ok: false, error: "Need an account name or id, and what happened." };
    const idMatch = accountQuery.toUpperCase().match(/[A-Z]{3}-\d+/);
    const named = accountQuery.split(",")[0]?.trim() ?? accountQuery;
    const existing = find(idMatch?.[0] ?? named) ?? (idMatch ? find(named) : undefined);
    if (existing) {
      return { ok: false, alreadyOpen: true, accountId: existing.id, name: existing.name, error: "This customer is already on the desk. Open that case instead of logging a duplicate." };
    }
    const channel = pickAllowed(args.channel, ISSUE_CHANNELS, "Phone");
    const category = pickAllowed(args.category, ISSUE_CATEGORIES, "Other complaint");
    const impact = pickAllowed(args.impact, ISSUE_IMPACTS, "Standard");
    const meterRead = String(args.meter_read ?? "").replace(/[^\d]/g, "");
    const accountId = idMatch?.[0] ?? `BAR-${named.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() || "NEW"}`;
    return {
      ok: true,
      reference: accountId,
      accountId,
      accountQuery,
      category,
      channel,
      route: routeForIssue(category, impact),
      status: impact === "Standard" ? "Accepted · triaged" : "Accepted · review required",
      summary,
      impact,
      meterRead: meterRead || undefined,
    };
  }
  return { ok: false, error: "Unknown tool." };
}

async function triage(payload: {
  messages?: { role?: string; content?: string }[];
  desk?: DeskSnapshot;
}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ error: "GEMINI_API_KEY not set in .env.local" }, { status: 500 });

  const desk = payload.desk ?? {};
  const history = (payload.messages ?? [])
    .filter((turn) => (turn.role === "user" || turn.role === "assistant") && typeof turn.content === "string" && turn.content.trim())
    .slice(-12)
    .map((turn) => ({ role: turn.role, content: turn.content!.trim() }));
  if (!history.length || history[history.length - 1].role !== "user") {
    return NextResponse.json({ error: "Send a question to start." }, { status: 400 });
  }

  const messages: object[] = [
    {
      role: "system",
      content: [
        "You sit with a Northwind Energy call-centre agent at the BatchHatch desk.",
        "They can see the open cases and the value-case dashboard. You can read the same records with tools.",
        "Call list_cases or read_case before you name a customer. Call value_case before you cite a dashboard figure.",
        "Do not invent reads, bills, or KPI numbers. If a tool did not return it, say you do not have it.",
        "When they ask you to hold, rate, open, work the queue, or log a new issue, call the tool. Then say what you did, including the new bill if you rated or the reference if you logged.",
        "A customer missing from list_cases is not a reason to stop. Call log_issue with the name, account id, channel, issue type, impact, meter read, and what happened.",
        "Never rate an escalated, solicitor, or regulator case. Hold it instead.",
        "Rate only at the suggested dial the tool returns.",
        "Answer in a few short sentences. Currency is dollars.",
      ].join(" "),
    },
    ...history,
  ];

  const actions: object[] = [];
  let reply = "I could not complete that request.";

  for (let i = 0; i < 5; i++) {
    let res: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gemini-3.5-flash-lite", temperature: 0.3, messages, tools: TRIAGE_TOOLS }),
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
      const result = triageTool(name, args, desk) as Record<string, unknown>;
      if (result.ok && name === "focus_case") actions.push({ type: "select", accountId: result.accountId });
      if (result.ok && name === "hold_case") actions.push({ type: "hold", accountId: result.accountId });
      if (result.ok && name === "rate_case") actions.push({ type: "rate", accountId: result.accountId, read: result.read });
      if (result.ok && name === "work_queue") actions.push({ type: "work_queue" });
      if (result.ok && name === "log_issue" && !result.alreadyLogged) {
        actions.push({
          type: "log_issue",
          issue: {
            reference: result.reference,
            accountId: result.accountId,
            accountQuery: result.accountQuery,
            category: result.category,
            channel: result.channel,
            route: result.route,
            status: result.status,
            summary: result.summary,
            impact: result.impact,
            meterRead: result.meterRead,
          },
        });
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  return NextResponse.json({ reply, actions });
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => ({}));
  if (payload.mode === "triage") return triage(payload);

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "GEMINI_API_KEY not set in .env.local" }, { status: 500 });
  }

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
