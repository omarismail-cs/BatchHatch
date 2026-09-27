"use client";
import { useState } from "react";
import { AccountRecord } from "@/lib/accounts";
import { runCobolEngine, CobolResult } from "@/lib/billing";
import CobolTerminal from "./CobolTerminal";

type Props = {
  account: AccountRecord;
  onSimulated: (result: CobolResult) => void;
  onClear: () => void;
};

const STATUS: Record<string, { label: string; bg: string; color: string }> = {
  PENDING_OVERNIGHT_BATCH: { label: "Pending overnight batch", bg: "var(--amber-light)", color: "var(--amber)" },
  VERIFIED_CLEARED:        { label: "✓ Verified cleared",      bg: "var(--green-light)", color: "var(--green)" },
  ESCALATED:               { label: "⚠ Escalated",             bg: "var(--red-light)",   color: "var(--red)" },
  CLOSED:                  { label: "Closed",                   bg: "var(--surface-2)",   color: "var(--dim)" },
};

export default function AccountCard({ account, onSimulated, onClear }: Props) {
  const [verifiedRead, setVerifiedRead] = useState("");
  const [result, setResult] = useState<CobolResult | null>(null);
  const [running, setRunning] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showBatch, setShowBatch] = useState(false);

  const parsed = parseInt(verifiedRead, 10);
  const valid = verifiedRead !== "" && !isNaN(parsed) && parsed > 0;
  const diff = valid ? account.estimatedRead - parsed : null;
  const st = STATUS[account.status];

  async function simulate() {
    if (!valid) return;
    setRunning(true); setResult(null);
    await new Promise((r) => setTimeout(r, 380));
    const res = runCobolEngine(account.id, account.tariffCode, account.previousRead, parsed, new Date("2023-10-24"));
    setResult(res); setRunning(false);
    onSimulated(res);
  }

  function onKey(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") simulate();
  }

  const maxR = Math.max(...account.readingHistory.map((h) => h.read));
  const minR = Math.min(...account.readingHistory.map((h) => h.read));

  return (
    <div className="max-w-4xl mx-auto space-y-4">

      {/* Account header card */}
      <div className="card p-5">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-[16px] font-bold shrink-0"
            style={{ background: "var(--blue-light)", color: "var(--blue)" }}
          >
            {account.name.split(" ").map((n) => n[0]).join("")}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <h2 className="text-[16px] font-bold" style={{ color: "var(--text)" }}>{account.name}</h2>
              <span
                className="text-[10px] font-bold rounded-md px-1.5 py-0.5"
                style={{
                  background: "var(--hint)",
                  color: "var(--muted)",
                }}
              >
                {account.id}
              </span>
              <span
                className="text-[10px] font-medium rounded-full px-2 py-0.5"
                style={{ background: st.bg, color: st.color }}
              >
                {st.label}
              </span>
            </div>
            <div className="text-[13px]" style={{ color: "var(--muted)" }}>{account.address}</div>
            <div className="text-[11px] mt-0.5 flex items-center gap-3 flex-wrap" style={{ color: "var(--dim)" }}>
              <span>Tariff: {account.tariffCode}</span>
              <span>·</span>
              <span>{account.meterType}</span>
              <span>·</span>
              <span style={{ color: "var(--red)", fontWeight: 600 }}>{account.openDays} days open</span>
              {account.callbackCount > 0 && (
                <><span>·</span><span style={{ color: "var(--red)", fontWeight: 600 }}>⚠ {account.callbackCount} callbacks</span></>
              )}
            </div>

            {account.agentNotes && (
              <div
                className="mt-2 rounded-lg px-3 py-2 text-[11px]"
                style={{ background: "var(--hint)", color: "var(--text)", border: "1px solid var(--border)" }}
              >
                {account.agentNotes}
              </div>
            )}
          </div>

          <button
            onClick={onClear}
            className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors"
            style={{ background: "var(--surface-2)", color: "var(--dim)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--border)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Reading grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* SYS-06 estimated */}
        <div className="card p-5" style={{ borderColor: "var(--red-mid)" }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full" style={{ background: "var(--red)" }} />
            <span className="text-[11px] font-medium" style={{ color: "var(--muted)" }}>
              SYS-06 estimated read — 2012 algorithm
            </span>
          </div>
          <div className="text-[36px] font-bold tabular-nums leading-none mb-1" style={{ color: "var(--red)" }}>
            {account.estimatedRead.toLocaleString()}
          </div>
          <div className="text-[11px] mb-4" style={{ color: "var(--dim)" }}>kWh · flagged anomalous</div>

          <div className="flex items-center justify-between pt-3" style={{ borderTop: "1px solid var(--border)" }}>
            <span className="text-[11px]" style={{ color: "var(--muted)" }}>Billed amount</span>
            <span className="text-[20px] font-bold tabular-nums" style={{ color: "var(--red)" }}>
              ${account.estimatedBill.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Verified input */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full" style={{ background: "var(--green)" }} />
            <span className="text-[11px] font-medium" style={{ color: "var(--muted)" }}>
              Customer verified read
            </span>
          </div>

          <input
            type="number"
            value={verifiedRead}
            onChange={(e) => setVerifiedRead(e.target.value)}
            onKeyDown={onKey}
            placeholder="Enter kWh…"
            className="w-full rounded-lg text-[28px] font-bold tabular-nums px-4 py-3 outline-none transition-all"
            style={{
              background: "var(--surface-2)",
              border: `2px solid ${valid ? "var(--blue)" : "var(--border)"}`,
              color: "var(--text)",
            }}
          />

          {diff !== null && (
            <div className="mt-2 text-[12px] font-medium" style={{ color: "var(--amber)" }}>
              Δ {diff.toLocaleString()} kWh overestimated
            </div>
          )}

          <div className="text-[11px] mt-1" style={{ color: "var(--dim)" }}>
            Previous: {account.previousRead.toLocaleString()} kWh ({account.previousReadDate})
          </div>

          <button
            onClick={simulate}
            disabled={!valid || running}
            className="mt-4 w-full rounded-lg px-4 py-3 text-[13px] font-bold transition-all flex items-center justify-center gap-2"
            style={{
              background: valid && !running ? "var(--blue)" : "var(--border)",
              color: valid && !running ? "#fff" : "var(--dim)",
              cursor: !valid || running ? "not-allowed" : "pointer",
              boxShadow: valid && !running ? "0 2px 8px rgba(37,99,235,0.3)" : "none",
            }}
            onMouseEnter={(e) => { if (valid && !running) e.currentTarget.style.background = "var(--blue-dark)"; }}
            onMouseLeave={(e) => { if (valid && !running) e.currentTarget.style.background = "var(--blue)"; }}
          >
            {running ? (
              <><span className="animate-spin inline-block">⟳</span> Loading WASM module…</>
            ) : (
              <>⚡ Simulate Batch <kbd className="text-[10px] opacity-60 border border-white/30 rounded px-1">⌘↵</kbd></>
            )}
          </button>
        </div>
      </div>

      {/* History chart */}
      <div className="card p-4">
        <div className="text-[11px] font-medium mb-3" style={{ color: "var(--muted)" }}>Reading history</div>
        <div className="flex items-end gap-1.5 h-16">
          {account.readingHistory.map((r, i) => {
            const isLast = i === account.readingHistory.length - 1;
            const pct = ((r.read - minR) / (maxR - minR || 1)) * 100;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${r.date}: ${r.read.toLocaleString()} kWh (${r.type})`}>
                <div className="w-full flex flex-col items-center justify-end h-12">
                  <div
                    className="w-full rounded-t-sm transition-all"
                    style={{
                      height: `${Math.max(pct, 8)}%`,
                      background: isLast && r.type === "estimated"
                        ? "var(--red)"
                        : r.type === "estimated"
                        ? "var(--amber-mid)"
                        : "var(--blue-mid)",
                    }}
                  />
                </div>
                <div
                  className="text-[9px] text-center"
                  style={{ color: isLast && r.type === "estimated" ? "var(--red)" : "var(--dim)" }}
                >
                  {r.date.slice(2, 7)}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-4 text-[10px]" style={{ color: "var(--dim)" }}>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "var(--blue-mid)" }} /> Actual
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "var(--amber-mid)" }} /> Estimated
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "var(--red)" }} /> Flagged
          </span>
        </div>
      </div>

      {/* COBOL terminal */}
      {(result || running) && (
        <CobolTerminal
          result={result}
          running={running}
          estimatedBill={account.estimatedBill}
          verifiedRead={parsed}
          onShowReceipt={() => setShowReceipt(true)}
          onShowBatch={() => setShowBatch(true)}
        />
      )}

      {showReceipt && result && (
        <ReceiptModal account={account} result={result} verifiedRead={parsed} onClose={() => setShowReceipt(false)} />
      )}
      {showBatch && result && (
        <BatchDrawer result={result} onClose={() => setShowBatch(false)} />
      )}
    </div>
  );
}

// ─── Receipt Modal ─────────────────────────────────────────────────
function ReceiptModal({ account, result, verifiedRead, onClose }: {
  account: AccountRecord; result: CobolResult; verifiedRead: number; onClose: () => void;
}) {
  const ref = "DUN-9021-CLR-20231024";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)" }} />
      <div
        className="relative w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: "var(--surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-6 py-5 text-white text-center"
          style={{ background: "var(--blue)" }}
        >
          <div className="text-[10px] opacity-70 uppercase tracking-widest mb-1">Northwind Energy Systems</div>
          <div className="text-[18px] font-bold">Settlement Clearance</div>
          <div className="text-[11px] opacity-70 mt-0.5">Ref: {account.id}-CLR-20231024</div>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-2 text-[12px]">
          {[
            ["Account", account.id],
            ["Customer", account.name],
            ["Verified read", `${verifiedRead.toLocaleString()} kWh`],
            ["Units consumed", `${result.units.toLocaleString()} kWh`],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between py-1" style={{ borderBottom: "1px solid var(--border)" }}>
              <span style={{ color: "var(--muted)" }}>{k}</span>
              <span className="font-semibold" style={{ color: "var(--text)" }}>{v}</span>
            </div>
          ))}
        </div>

        <div className="px-6 pb-4 space-y-1.5 text-[11px]">
          <div className="flex justify-between py-1">
            <span className="line-through" style={{ color: "var(--dim)" }}>Previous estimate (SYS-06)</span>
            <span className="line-through font-semibold" style={{ color: "var(--red)" }}>${account.estimatedBill.toFixed(2)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span style={{ color: "var(--muted)" }}>Standing charge</span>
            <span className="font-semibold">${result.standingCharge.toFixed(2)}</span>
          </div>
          {result.tierBreakdown.map((t) => (
            <div key={t.tier} className="flex justify-between py-0.5">
              <span style={{ color: "var(--dim)" }}>{t.tier} ({t.units} × ${t.rate.toFixed(4)})</span>
              <span style={{ color: "var(--muted)" }}>${t.cost.toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div
          className="mx-6 mb-4 rounded-xl px-4 py-3 flex items-center justify-between"
          style={{ background: "var(--surface-2)", border: "2px solid var(--green-mid)" }}
        >
          <span className="text-[14px] font-bold" style={{ color: "var(--text)" }}>Corrected total</span>
          <span className="text-[26px] font-black" style={{ color: "var(--green)" }}>
            ${result.total.toFixed(2)}
          </span>
        </div>

        <div
          className="mx-6 mb-4 rounded-lg px-3 py-2 text-center"
          style={{ background: "var(--green-light)", border: "1px solid var(--green-mid)" }}
        >
          <div className="text-[11px] font-bold" style={{ color: "var(--green)" }}>
            ✓ COBOL validated — batch pre-cleared
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: "var(--green)" }}>
            RC: {result.returnCode} · {result.execMs}ms · Rejection rate: 0.00%
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-2">
          <button
            className="flex-1 rounded-xl py-2.5 text-[13px] font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--text)" }}
          >
            📱 Send SMS to customer
          </button>
          <button
            onClick={onClose}
            className="px-4 rounded-xl text-[13px] font-medium transition-colors"
            style={{ background: "var(--surface-2)", color: "var(--muted)", border: "1px solid var(--border)" }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Batch Drawer ──────────────────────────────────────────────────
function BatchDrawer({ result, onClose }: { result: CobolResult; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const isValid = result.returnCode === "0000";

  function copy() {
    navigator.clipboard.writeText(result.batchLine);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const segments = [
    { label: "REC",    chars: result.batchLine.slice(0, 3),   tip: "Record type" },
    { label: "DATE",   chars: result.batchLine.slice(3, 11),  tip: "Adjustment date" },
    { label: "ACC",    chars: result.batchLine.slice(11, 19), tip: "Account ID" },
    { label: "UNITS",  chars: result.batchLine.slice(19, 27), tip: "Units consumed" },
    { label: "TOTAL",  chars: result.batchLine.slice(27, 35), tip: "Total pence" },
    { label: "FLG",    chars: result.batchLine.slice(35, 37), tip: "Credit flag" },
    { label: "FILLER", chars: result.batchLine.slice(37, 76), tip: "Reserved" },
    { label: "RC",     chars: result.batchLine.slice(76, 80), tip: "Return code" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: "rgba(15,23,42,0.5)", backdropFilter: "blur(2px)" }} />
      <div
        className="relative w-full rounded-t-2xl overflow-hidden shadow-2xl"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: isValid ? "var(--green)" : "var(--red)" }} />
            <div>
              <div className="text-[14px] font-bold" style={{ color: "var(--text)" }}>
                Aurora SYS-01 Batch Pipe
              </div>
              <div className="text-[11px]" style={{ color: "var(--dim)" }}>
                80-column fixed-width · nightly ingest at 2:00 AM
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copy}
              className="rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors"
              style={{
                background: copied ? "var(--green-light)" : "var(--surface-2)",
                color: copied ? "var(--green)" : "var(--muted)",
                border: `1px solid ${copied ? "var(--green-mid)" : "var(--border)"}`,
              }}
            >
              {copied ? "✓ Copied" : "Copy record"}
            </button>
            <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "var(--surface-2)", color: "var(--dim)" }}>
              ✕
            </button>
          </div>
        </div>

        {/* The batch line — stays dark green as the terminal */}
        <div className="cobol-screen px-6 py-4 overflow-x-auto">
          <div className="text-[13px] font-bold whitespace-nowrap tracking-wider">{result.batchLine}</div>
          <div className="cobol-dim text-[10px] mt-1">{result.batchLine.length} / 80 columns</div>
        </div>

        {/* Segment breakdown */}
        <div className="px-6 py-4" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="text-[10px] font-medium mb-2" style={{ color: "var(--dim)" }}>Record schema</div>
          <div className="flex flex-wrap gap-2">
            {segments.map((s) => (
              <div key={s.label} title={s.tip} className="rounded-lg px-3 py-2" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                <div className="text-[9px]" style={{ color: "var(--dim)" }}>{s.label}</div>
                <div className="text-[12px] font-bold tabular-nums" style={{ color: "var(--text)" }}>{s.chars || "—"}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Return code */}
        <div
          className="mx-6 mb-6 rounded-xl px-4 py-3 flex items-center gap-3"
          style={{
            background: isValid ? "var(--green-light)" : "var(--red-light)",
            border: `1px solid ${isValid ? "var(--green-mid)" : "var(--red-mid)"}`,
          }}
        >
          <span className="text-[13px] font-bold" style={{ color: isValid ? "var(--green)" : "var(--red)" }}>
            RC: {result.returnCode}
          </span>
          <span className="text-[12px]" style={{ color: "var(--muted)" }}>
            {isValid
              ? "VALID — guaranteed acceptance at 2:00 AM. Rejection rate: 0.00%."
              : result.exception}
          </span>
        </div>
      </div>
    </div>
  );
}
