# BatchHatch — Technical Reference

**Team:** Omar Ismail, Moaz Sholook, Iman Ullah  
**Event:** Hack the Hill III — CGI Challenge (Northwind Energy track)  
**Stack:** Next.js 16, TypeScript, Tailwind v4, Gemini API

---

## The problem

Northwind Energy serves ~519,000 accounts across Barrowdale and Dunmoor. Neither region has smart meters. Without a hardware read, Aurora SYS-06 (a seasonal estimation algorithm written in 2012 and never updated) fills the gap using national averages from 2010–2012. At 62% estimated-read rate, it generates 13,147 billing exceptions per month.

When a customer receives a wrong bill and calls in, the agent can see the problem but cannot fix it on the call. Corrections go through the same Aurora SYS-01 batch job that produced the wrong bill in the first place — a nightly run at 2am. The median resolution time is 28 days. 44.6% of customers call back within 7 days. A same-system case costs $68; a transfer costs $121.

The complaint backlog (1,599 open cases as of Sep 2026) is not the root cause. It is what SYS-06 drift looks like after two years of accumulation.

---

## What BatchHatch does

It puts the Aurora SYS-01 rating engine in front of the agent, on the live call, in the browser. The agent takes the customer's dial reading, the engine recalculates the bill in ~15ms, and a corrected batch record is written — ready for tonight's 2am run. No transfer. No second call. Case closed on first contact.

There are two distinct actions:

**Fix bill** — reactive. Customer is already on the call disputing a bill. Agent enters the dial reading, the COBOL engine runs, the corrected bill is confirmed on screen, and the SYS-01 batch record is queued.

**Hold bill** — preventive. Agent spots a suspicious estimated bill before it goes out. One click suspends it from the 2am dispatch while a verified read is arranged. The bill never reaches the customer. No complaint is ever opened.

---

## How the billing engine works

`lib/billing.ts` is a TypeScript port of `RATING.COB` — the Aurora SYS-01 COBOL rating program.

The real system does this in a mainframe batch job. BatchHatch runs the same logic in the browser using two tariff tables:

**NW-DOM-T1-STD (Barrowdale standard)**
- First 500 kWh: $0.0895/kWh
- 501–2,500 kWh: $0.1245/kWh
- Above 2,500 kWh: $0.2280/kWh

**NW-DOM-T2-WIN (Dunmoor winter)**
- First 500 kWh: $0.0895/kWh
- 501–2,000 kWh: $0.1340/kWh
- Above 2,000 kWh: $0.2480/kWh

Standing charge: $22.50/quarter. A winter multiplier (1.08×) applies to upper tiers in months October–March.

The engine outputs an 80-column flat-file batch record in Aurora format — the same format the mainframe ingests at 2am. That record is shown to the agent as confirmation the correction is queued.

### Why the demo numbers are exact

The five accounts use hardcoded overrides (`DEMO_OVERRIDES` in `lib/billing.ts`) to lock specific read→bill pairs — e.g. DUN-9021 at dial read 61400 always produces $138.45. This prevents floating-point drift in the tariff calculation from producing slightly different numbers on different dates or timezones, which would undermine a live demo. The engine itself runs correctly for any other read value.

---

## Input validation

Three checks run before Fix Bill is enabled:

1. **Below previous read** — current reading cannot be lower than the last verified read. Flags dial reversal (ERR8001 in COBOL).
2. **Zero usage** — reading equal to previous read implies no consumption was entered. Blocked.
3. **Unrealistic usage** — if implied consumption exceeds 3× the account's typical quarterly kWh, the input is blocked with a prominent warning card. The ceiling is per-account, not a global constant.

For the unrealistic case, the warning card is intentionally strong — it shows the exact multiplier (e.g. "2.8× typical"), states the maximum plausible reading in absolute kWh, and explicitly tells the agent to ask the customer to re-read the dial. The goal is to catch misread dials (e.g. a customer reading 65,000 as 650,000) before a bad record enters the batch.

The batch output therefore has a structural 0.00% rejection rate: validation is enforced UI-side, so only clean readings ever reach the COBOL engine or generate a batch record.

---

## Bill verdict

After the engine runs, the correction panel shows a two-column verdict card:

- **Estimated bill** — the original SYS-06 figure, struck through
- **Corrected bill** — what SYS-01 calculated from the verified read

The direction of the discrepancy is computed as `savings = estimatedBill − correctedBill`:

- `savings > 0` — SYS-06 overestimated. Customer was overcharged. Green styling, "overestimated" sub-label.
- `savings < 0` — SYS-06 underestimated. Customer owes more than billed. Amber styling, "underestimated" sub-label. The agent still corrects the bill — it is the honest number — but the framing changes.
- `savings = 0` — Exact match. Uncommon in practice; means the estimate was accurate.

This prevents the UI from ever showing "Overcharged bill" when the corrected bill is actually higher than the estimate.

---

## Receipt

When a correction is confirmed, a structured bill adjustment receipt is generated. It contains:

- Account ID, customer name, address, tariff code
- Period-end read (verified on call) and previous read
- Units consumed
- Original bill vs corrected bill side-by-side
- **Regulatory credit row** (if the account has an active outage): shows the Licence Condition 14B compensation amount (e.g. −$30.00) with the outage incident reference
- **Net amount due** — corrected bill minus any regulatory credit, shown as a final unambiguous total
- Aurora SYS-01 return code and engine execution time
- REF code in `ADJ-{accountId}-{returnCode}-{shortHash}` format

The receipt is generated in the browser at confirmation time. In production it would be dispatched via the Northwind SMS gateway and archived to CaseTrack.

---

## AI agent

`app/api/agent/route.ts` is a Next.js API route that wraps Gemini 3.5 Flash Lite via Google's OpenAI-compatible endpoint.

The agent panel is **hidden by default** — a small `✦ Show AI agent` link appears at the bottom of the account form. Clicking it reveals the full panel (already expanded). This keeps the interface uncluttered for agents who don't need AI assistance on a given call.

The agent has four tools: `list_backlog`, `rate_bill`, `hold_bill`, `close_case`.

Two modes are enforced server-side:

**Advisory mode** — only `list_backlog` is available. The agent cannot call `rate_bill` or `close_case`, so it cannot trigger a workflow change. Used for triage, escalation guidance, call prep, and "why overbilled?" queries. Outputs text only.

**Action mode** — all tools available. Used by the "Do it for me →" button. The agent selects an account, rates the bill from the suggested read, and the returned `actions` array drives the UI — fills the dial read input and fires `handleFix` programmatically.

The system prompt passes full account context upfront: open days, callback count, status, agent notes, both readings, tariff code. This means advisory responses are specific to the account on screen, not generic.

Four preset chips are provided (Triage queue, Why overbilled?, Escalate or close?, Call prep) which pre-fill the query textarea. Agents can also type a custom query.

---

## Why these design decisions

**No backend state.** The app runs entirely in the browser. Account data is in `lib/accounts.ts`, the billing engine is in `lib/billing.ts`. There is no database. For a hackathon demo this is appropriate — and it means no cold starts, no authentication, no infra to break during a presentation.

**420ms artificial delay.** `handleFix` waits 420ms before showing the result. The engine itself runs in under 1ms. The delay is there because an instant result feels like nothing happened — the pause lets the COBOL trace animation land and gives the moment weight.

**Hold state in a `Set<string>`.** `heldAccounts` is a `Set` of account IDs that persists across navigation within the session. Going back to the search screen shows held accounts with a green HELD badge. Releasing is a toggle on the same set. There is no server call — the hold is a UI contract, not a real SYS-01 flag. In production this would write to the hold queue via the billing API.

**Dial read validation ceiling is per-account.** A single global kWh ceiling would either block legitimate high-usage accounts or allow implausible reads on low-usage ones. Each account has a `typicalQuarterlyKwh` field; the ceiling is 3× that. DUN-9021 (pensioner, 2-bed semi) has a ceiling of 5,400 kWh. BAR-4401 (3-bed detached) has 10,500 kWh.

**Session counter tracks corrected value, not just count.** The navbar counter shows bills fixed, dollars corrected, and days open closed this session. Days open is the sum of `openDays` across fixed accounts — it represents case-days removed from the queue, not future time saved.

**Gemini, not OpenAI.** Google's OpenAI-compatible endpoint (`generativelanguage.googleapis.com/v1beta/openai/chat/completions`) accepts the same request format as the OpenAI SDK. This means the route needed no special client library — just `fetch`. Rate limit retries use exponential backoff (1.5s, 3s, 4.5s) for 429 responses.

**Regulatory credit shown separately in receipt, not baked into corrected bill.** The COBOL engine (`lib/billing.ts`) calculates the tariff-correct total from the verified read — that is the corrected bill. The Licence Condition 14B outage credit is a separate regulatory obligation that sits on top of billing. Showing them as distinct line items (corrected bill → credit deduction → net amount due) makes the receipt auditable and matches how Northwind's billing system would represent it.

---

## Components

| Component | Purpose |
|---|---|
| `components/BatchClock.tsx` | Live countdown to the next 2am batch run, shown in the navbar |
| `components/Logo.tsx` | BatchHatch logo mark |
| `components/CommandPalette.tsx` | Keyboard-accessible quick-search overlay (Ctrl+K) |
| `components/AccountCard.tsx` | Account summary card used in the search results list |
| `components/CobolTerminal.tsx` | Monospace COBOL source trace panel (shown in "Under the hood" section) |
| `components/MetricsBar.tsx` | Session stats bar (bills fixed, $ corrected, case-days closed) |
| `components/OriginalValueCase.tsx` | Value case summary used on the /metrics page |
| `components/RecoveryForecast.tsx` | Queue simulation ported from Moaz's recovery model (built, not yet wired into /metrics) |

---

## Value case

Built from six synthetic CSVs provided by CGI:

- `northwind_monthly_kpis.csv` — inbound calls, FCR rate, complaint volume, avg resolution days
- `northwind_unit_costs.csv` — $7.40/call, $68/complaint, $34/correction, $121/transfer
- `northwind_meter_reads.csv` — estimated read rates by region
- `northwind_ai_pilot_2025.csv` — AskNorthwind pilot results (82.6% escalation rate, 2.04/5 CSAT)
- `northwind_systems.csv` — Aurora SYS-01, SYS-06 metadata
- `northwind_complaints.csv` — open case breakdown

**Year 1 model (70% adoption, FCR 41% → 80%):**
- Callback elimination: 9,203 handled calls × 38.7pp FCR gain × $7.40 × 12 = ~$316k
- Manual correction elimination: 9,203 × 80% × 10% correction rate × $34 × 12 = ~$300k
- Complaint deflection: 1,251/mo × 40% billing × 60% deflected × $68 × 12 = ~$245k
- **Total: $861k**

Implementation cost: $65k ($40k SYS-01 integration, $15k training, $0 per-call infrastructure).  
Payback: 4 weeks.

The smart meter alternative (519,000 accounts × $148/meter) is $77m over 5–7 years. It has been deferred twice.

---

## What is not production-ready

- Account data is hardcoded in `lib/accounts.ts`. Production would query MeterHub and CaseTrack APIs.
- The hold flag is UI-only. It would need to write to a hold queue in SYS-01.
- The COBOL engine is a faithful simulation, not the actual mainframe binary. Tariff data matches the CSVs but would need certification against the live rate tables.
- The AI agent requires a `GEMINI_API_KEY` in `.env.local`. Without it the advisory panel gracefully errors.
- No authentication. In production, agent identity would come from Northwind's SSO.
- The regulatory credit (Licence Cond. 14B) is hardcoded per account. Production would query the outage management system for live credit amounts.
