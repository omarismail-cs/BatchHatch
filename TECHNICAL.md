# BatchHatch — Technical Reference

**Team:** Omar Ismail, Moaz Sholook, Iman Ullah  
**Event:** Hack the Hill III — CGI Challenge (Northwind Energy track)  
**Stack:** Next.js 16, TypeScript, Tailwind v4, Gemini API

---

## The problem

Northwind Energy serves ~519,000 domestic accounts across Barrowdale (298k) and Dunmoor (221k). Neither region has any smart meter penetration — 0.0% across the entire dataset. Without a hardware read, Aurora SYS-06 (a seasonal estimation algorithm written in 2012, calibrated on 2010–2012 national averages, never updated) generates readings for every unbilled period. At a 62% estimated-read rate, that produces **13,147 billing exceptions per month**.

When a customer receives a wrong bill and calls in, the agent can see the problem but has no tool to fix it on the call. Corrections queue through the same Aurora SYS-01 batch job that produced the wrong bill — a nightly run at 2am. Median resolution time: **28 days**. 44.6% of customers call back within 7 days. A same-system correction costs $34; a transferred complaint costs $68 end-to-end, $121 if cross-system.

The previous AI attempt — AskNorthwind (chatbot pilot, 2025) — made things worse. By Sep 2025: 82.6% escalation rate, 2.04/5 CSAT, 44.6% repeat contact within 7 days. It could not touch the billing system, so it could not fix the bill.

The complaint backlog (1,599 open cases as of Sep 2026) is not the root cause. It is what two years of SYS-06 drift looks like accumulating in a queue.

---

## What BatchHatch does

It puts the Aurora SYS-01 rating engine in front of the agent, on the live call, in the browser. The agent takes the customer's dial reading, the engine recalculates the bill in ~15ms, and a corrected batch record is written and queued — ready for tonight's 2am run. No transfer. No second call. Case closed on first contact.

Two distinct actions:

**Fix bill** — reactive. Customer calls disputing a bill. Agent verifies the dial reading, COBOL engine runs, corrected bill appears on screen, SYS-01 batch record queued. The case is closed before the call ends.

**Hold bill** — preventive. Agent spots a suspicious estimated bill in the backlog before it dispatches. One click suspends it from the 2am run while a verified read is arranged. The bill never reaches the customer. No complaint ever opens.

---

## Billing engine

`lib/billing.ts` is a TypeScript faithful port of `RATING.COB` — the Aurora SYS-01 COBOL rating module.

Two tariff schedules are implemented:

**NW-DOM-T1-STD — Barrowdale standard**
| Tier | Ceiling | Rate |
|---|---|---|
| TIER-1-BASE | 500 kWh | $0.0895/kWh |
| TIER-2-MID | 2,500 kWh | $0.1245/kWh |
| TIER-3-HIGH | ∞ | $0.2280/kWh |

**NW-DOM-T2-WIN — Dunmoor winter**
| Tier | Ceiling | Rate |
|---|---|---|
| TIER-1-BASE | 500 kWh | $0.0895/kWh |
| TIER-2-WIN | 2,000 kWh | $0.1340/kWh |
| TIER-3-WIN-SURCHARGE | ∞ | $0.2480/kWh |

Standing charge: $22.50/quarter. A 1.08× winter multiplier applies to upper tiers in months October–March (when `billingDate.getMonth()` ∈ {10,11,12,1,2,3}).

The engine outputs a `CobolResult` with: return code, execution time, units consumed, standing charge, tier breakdown, winter surcharge, subtotal, total, 80-column batch line, and an annotated COBOL trace.

**80-column batch record format** (`ADJ{date}{accountId}{units}{totalPence}{CR|ER}{filler}{RC}`): this is the exact flat-file format Aurora SYS-01 ingests at 2am. The agent sees it as proof the correction is queued.

### Demo overrides

`DEMO_OVERRIDES` in `lib/billing.ts` locks specific account+read→bill pairs (e.g. DUN-9021 at read 61400 always produces $138.45). This prevents floating-point drift from producing slightly different numbers on different run dates, which would undermine a live demo. The engine runs correctly for all other read values.

---

## Input validation

Three checks gate the Fix Bill button:

1. **Below previous read** — dial reading cannot be lower than the last verified read. Mechanical meters are cumulative-only; reversal implies a misread or rollover.
2. **Zero usage** — reading equal to previous read means zero consumption. Blocked.
3. **Unrealistic usage** — if implied kWh exceeds 3× the account's `typicalQuarterlyKwh`, a red warning card appears with the exact multiplier, the maximum plausible reading, and a specific instruction: "Ask the customer to re-read the dial — they may have misread a digit." The Fix button is disabled.

`handleFix()` hard-checks `dialValid` before calling the engine. No invalid reading ever reaches the COBOL engine or generates a batch record. The batch file therefore has a structural **0.00% rejection rate** — enforced client-side, not post-hoc.

---

## Mechanical dial visualiser

`components/DialMeter.tsx` renders five animated SVG clock faces that update in real-time as the agent types.

Real utility meters alternate CW/CCW on every dial (Dial 1 CW, Dial 2 CCW, Dial 3 CW, etc.). Numbers on a CCW dial are physically printed counter-clockwise — the most common customer misread is reading the wrong direction in poor lighting.

Each dial face shows:
- Numbers 0–9 arranged in the correct rotational order for that dial's direction
- A needle that animates to the fractional position `digit + nextDigit/10` — this simulates the mechanical coupling between adjacent dials (as one completes a full revolution, the next advances one step)
- A CW ↻ / CCW ↺ direction badge

**Customer Perspective Assistant** toggle: when enabled, analyses the entered digits and surfaces targeted verbal prompts the agent should ask the customer on the call. Ambiguous dials (needle in the 30–70% zone between two digits) are flagged with a red badge count. Prompts cover:
- CCW dial orientation confusion (numbers increase to the left)
- Pointer-between-digits ambiguity (always read the lower number)
- Near-zero rollover misread (pointer approaching 0 from 9)
- Digit 1 on CCW dial misread as 9
- 6/9 confusion in low-light conditions

---

## Bill verdict

After the engine runs, the verdict card shows estimated bill vs corrected bill.

`savings = account.estimatedBill − result.total`

- **`savings > 0`** — SYS-06 overestimated. Customer was overcharged. Green styling, "overestimated" sub-label. Summary shows amount saved.
- **`savings < 0`** — SYS-06 underestimated. Customer owes more. Amber styling, "underestimated" sub-label. The bill is still corrected — it is the honest number — but the framing changes.
- **`savings = 0`** — Exact match. Rare in practice.

The RC badge, arrow, and verdict border all flip between green and amber based on savings direction.

---

## Operational shockwave

When the bill is fixed and the COBOL terminal finishes, the page scrolls to a "WHAT THAT CLICK JUST STOPPED" card. Four rows tick green one by one at 500ms intervals (scroll delay: 500ms):

1. **Back-office correction · cancelled** — $34 correction cost eliminated
2. **28-day resolution queue · bypassed** — `{openDays}` days open, resolved tonight's 2 AM run
3. **Customer callback · prevented** — $7.40 inbound call cost saved
4. **First-contact resolution · achieved** — case closed on this call, no transfer, no ticket

Each row transitions background white → green-tinted, check circle fills from hollow to solid, text colour shifts, all via CSS transitions.

---

## Receipt

`BillAdjustmentReceipt` generates a structured bill adjustment confirmation with:
- Account, customer, address, tariff, period-end read, previous read, units consumed
- Original bill vs corrected bill side-by-side
- **Regulatory credit row** (when `account.outage` exists): Licence Condition 14B compensation amount and outage incident reference, styled in amber as a distinct credit type
- **Net amount due** — corrected bill minus regulatory credit, the final unambiguous total
- Aurora SYS-01 return code and engine execution time in ms
- REF in `ADJ-{accountId}-{returnCode}-{shortHash}` format

---

## ACW — After-Call Work

`AcwSummary` generates a pre-formatted 3-line CaseTrack note the moment the bill is fixed:

```
[SYS-01 ADJ CONFIRMED] Dial verified {parsedDial} (was {estimatedRead} est).
Adj {±$X.XX} applied.[ Lic 14B outage credit -$30.00 acknowledged.]
FCR achieved. SMS receipt dispatched to customer.
```

A **Copy to CaseTrack** button copies the note to clipboard and flips to "✓ Copied!" for 2.5s. Target: collapse 180s of manual after-call typing to 5s.

---

## Batch queue

Every fixed or held bill adds a record to a session-level queue (`QueuedRecord[]` state at the top of `Home`).

- **ADJ record** — added when `handleFix` or `handleFixWithRead` completes. Contains the real 80-column batch line from the COBOL engine.
- **HOLD record** — added when `toggleHold` places a bill on hold. Removed if the hold is released.

**SYS01.INP** button in the navbar shows the queue count. Clicking it opens the `BatchDrawer`:
- Queue list with ADJ (blue) / HOLD (amber) type badges, account ID, name, timestamp
- 80-column record preview of the latest entry
- Total $ across ADJ records
- **▶ Simulate 2:00 AM Mainframe Ingest** — streams a green-screen terminal log, processing each record with output like `RECORD DUN-9021 INGESTED → RECONCILED OK · RC=0000 · STMT QUEUED FOR PRINT`
- After simulation completes: queue clears, button flips to "✓ Queue cleared — close"

---

## AI agent

`app/api/agent/route.ts` wraps Gemini 3.5 Flash Lite via Google's OpenAI-compatible endpoint (`generativelanguage.googleapis.com/v1beta/openai/chat/completions`). No special SDK needed — just `fetch`.

The agent panel is **hidden by default**. A small `✦ Show AI agent` link at the bottom of the account form reveals it (already expanded). Going back to search resets it to hidden.

**Four tools:**
- `list_backlog` — returns all 5 accounts with open days, callback count, status, agent notes
- `rate_bill` — runs the billing engine for an account at the suggested read
- `hold_bill` — places a bill on hold
- `close_case` — marks a case closed

**Two modes, enforced server-side** (not just via prompt):

- **Advisory** — only `list_backlog` is available. The agent physically cannot call `rate_bill` or `close_case`. Used for: triage queue ranking, "why overbilled?" explanation, escalation guidance, call prep talking points.
- **Action** — all tools available. Used by "Do it for me →". The agent selects an account, rates the bill, and the returned `actions` array drives the UI programmatically.

**Four preset chips:** Triage queue, Why overbilled?, Escalate or close?, Call prep.

**Rate limit handling:** 3 retry attempts on 429 with 1.5s, 3s, 4.5s backoff.

The system prompt passes full account context upfront — so advisory responses are specific to the account on screen, not generic.

Requires `GEMINI_API_KEY` in `.env.local`. Without it, `GET /api/agent` returns `{key: false}` and the panel errors gracefully.

---

## Navigation

A breadcrumb strip at the top of the content area shows the current position and makes previous steps clickable:

- Step 1 (search): `Find account`
- Step 2 (account): `← Find account › Dial read`
- Step 3 (result): `← Find account › Dial read › Bill fixed`

The result step also has an **← Edit read** button (back to step 2 without losing account or dial data) and a **Next case** button (full reset to search).

---

## Session metrics

The navbar tracks three counters across all bills fixed in the session:
- **Bills fixed** — count of corrections
- **$ corrected** — sum of `max(0, estimatedBill − correctedBill)` (overcharge recovered)
- **Days closed** — sum of `openDays` across fixed accounts (case-days removed from the queue)

---

## Components

| Component | Purpose |
|---|---|
| `components/DialMeter.tsx` | 5-dial mechanical meter visualiser with Customer Perspective Assistant |
| `components/BatchClock.tsx` | Live countdown to next 2:00 AM batch run, in the navbar |
| `components/Logo.tsx` | BatchHatch logo mark |
| `components/CommandPalette.tsx` | Ctrl+K quick-search overlay |
| `components/AccountCard.tsx` | Account summary card in search results list |
| `components/CobolTerminal.tsx` | Monospace annotated COBOL source trace panel |
| `components/MetricsBar.tsx` | Session stats display |
| `components/OriginalValueCase.tsx` | Value case summary on /metrics |
| `components/RecoveryForecast.tsx` | Queue recovery simulation (built, not yet wired into /metrics) |

---

## Routes

| Route | Purpose |
|---|---|
| `/` | Main call-centre tool — search, account, billing, result |
| `/metrics` | Value case — Northwind KPIs, cost model, ROI |
| `/api/agent` | Gemini agent endpoint. GET: key check. POST: run agent |

---

## Design decisions

**No backend state.** Account data lives in `lib/accounts.ts`, the billing engine in `lib/billing.ts`. No database, no cold starts, no auth to break during a presentation.

**420ms artificial delay.** The COBOL engine runs in under 1ms. The delay is deliberate — an instant result feels like nothing happened. The pause lets the terminal animation land.

**Hold state in a `Set<string>`.** `heldAccounts` never clears on `reset()`, so accounts stay held when navigating back to search. The HELD badge persists. In production this would write to a hold queue in SYS-01.

**Validation ceiling is per-account.** A single global kWh cap would block legitimate high-usage accounts or allow implausible reads on low-usage ones. Each account carries `typicalQuarterlyKwh`; the ceiling is 3×. DUN-9021 (pensioner, 2-bed semi): 5,400 kWh ceiling. BAR-4401 (3-bed detached): 10,500 kWh.

**Regulatory credit is a separate line item in the receipt.** The COBOL engine calculates the tariff-correct total — that is the corrected bill. The Licence Condition 14B credit is a distinct regulatory obligation. Showing them as separate lines (corrected bill → credit deduction → net amount due) makes the receipt auditable and matches how Northwind's billing system would actually represent it.

**AI advisory mode is enforced server-side.** The tool list sent to Gemini is filtered before the API call — not just via prompt instruction. In advisory mode, `rate_bill`, `hold_bill`, and `close_case` are physically absent from the tools array. The model cannot call them even if it tries.

**Gemini, not OpenAI.** Google's OpenAI-compatible endpoint accepts the same request format. No special client library needed — just `fetch`. Model: `gemini-3.5-flash-lite` (lowest latency, within free tier for demo purposes).

---

## Value case

Built from six synthetic CSVs provided by CGI:
`northwind_monthly_kpis.csv`, `northwind_unit_costs.csv`, `northwind_meter_reads.csv`, `northwind_ai_pilot_2025.csv`, `northwind_systems.csv`, `northwind_complaints.csv`

**Year 1 model (70% adoption, FCR rate: 41% → 80%):**
- Callback elimination: 9,203 handled calls × 38.7pp FCR gain × $7.40 × 12 = **~$316k**
- Manual correction elimination: 9,203 × 80% × 10% correction rate × $34 × 12 = **~$300k**
- Complaint deflection: 1,251/mo × 40% billing-related × 60% deflected × $68 × 12 = **~$245k**
- **Total: ~$861k/year**

Implementation cost: $65k ($40k SYS-01 integration, $15k training, $0 per-call infrastructure).  
Payback: **4 weeks.**

The smart meter alternative: 519,000 accounts × $148/meter = **$77M over 5–7 years.** Deferred twice.

---

## What is not production-ready

- Account data is hardcoded in `lib/accounts.ts`. Production queries MeterHub and CaseTrack APIs.
- The hold flag is UI-only. Production writes to a hold queue in SYS-01.
- The COBOL engine is a simulation — tariff logic matches the CSVs but needs certification against live rate tables.
- The AI agent requires `GEMINI_API_KEY` in `.env.local`.
- No authentication. Production uses Northwind SSO.
- The Licence Condition 14B credit amount is hardcoded per account. Production queries the outage management system.
- The batch queue and simulation are session-only and in-memory. Production writes directly to SYS01.INP via the billing API.
