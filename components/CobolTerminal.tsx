"use client";
import { useEffect, useState } from "react";
import { CobolResult } from "@/lib/billing";

type Props = {
  result: CobolResult | null;
  running: boolean;
  estimatedBill: number;
  verifiedRead: number;
  onShowReceipt: () => void;
  onShowBatch: () => void;
};

export default function CobolTerminal({ result, running, estimatedBill, verifiedRead, onShowReceipt, onShowBatch }: Props) {
  const [revealed, setRevealed] = useState<string[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);

  useEffect(() => {
    if (!result) { setRevealed([]); setShowResult(false); return; }
    setRevealed([]); setShowResult(false);
    let i = 0;
    const iv = setInterval(() => {
      if (i < result.cobolTrace.length) { setRevealed((p) => [...p, result.cobolTrace[i]]); i++; }
      else { clearInterval(iv); setTimeout(() => setShowResult(true), 160); }
    }, 36);
    return () => clearInterval(iv);
  }, [result]);

  const isValid = result?.returnCode === "0000";
  const savings = result ? estimatedBill - result.total : 0;

  return (
    <div
      className="card overflow-hidden"
      style={showResult && isValid ? { borderColor: "var(--green-mid)" } : {}}
    >
      {/* Modern card header */}
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-3">
          {/* Traffic lights — purely decorative, signals "terminal inside" */}
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#FF5F56" }} />
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#FFBD2E" }} />
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#27C93F" }} />
          </div>
          <div>
            <div className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>
              GnuCOBOL WASM Runtime
            </div>
            <div className="text-[10px]" style={{ color: "var(--dim)" }}>rating.cob · Aurora SYS-01 v4.2.1 (1998)</div>
          </div>
        </div>
        <button
          onClick={() => setSourceOpen((v) => !v)}
          className="text-[11px] font-medium rounded-lg px-2.5 py-1 transition-colors"
          style={{
            background: sourceOpen ? "var(--blue-light)" : "transparent",
            color: sourceOpen ? "var(--blue)" : "var(--dim)",
            border: "1px solid var(--border)",
          }}
        >
          {sourceOpen ? "Hide COBOL ▲" : "View COBOL ▼"}
        </button>
      </div>

      {/* COBOL source — stays in the CRT world */}
      {sourceOpen && (
        <div className="cobol-screen px-5 py-4 max-h-48 overflow-y-auto" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="cobol-head text-[9px] mb-2 tracking-widest">RATING.COB — AURORA SYS-01 CORE (abridged)</div>
          <pre className="text-[11px] leading-5">{`       IDENTIFICATION DIVISION.
       PROGRAM-ID. RATING.
      *========================================
      * AURORA BILLING SYSTEM v4.2.1 (1998)
      * NORTHWIND ENERGY — TARIFF RATING MODULE
      *========================================
       WORKING-STORAGE SECTION.
           05 WS-CURRENT-READ   PIC 9(8).
           05 WS-PREV-READ      PIC 9(8).
           05 WS-UNITS-CONSUMED PIC 9(8).
           05 WS-STANDING-CHG   PIC 9(4)V99.
           05 WS-TIER1-COST     PIC 9(6)V99.
           05 WS-TIER2-COST     PIC 9(6)V99.
           05 WS-TOTAL          PIC 9(6)V99.
           05 WS-RETURN-CODE    PIC X(4).

       PROCEDURE DIVISION.
       MAIN-LOGIC.
           SUBTRACT WS-PREV-READ FROM WS-CURRENT-READ
             GIVING WS-UNITS-CONSUMED
           MOVE 2250 TO WS-STANDING-CHG
           PERFORM CALC-TIER-RATING
           PERFORM VALIDATE-EXCEPTIONS
           PERFORM WRITE-BATCH-RECORD
           STOP RUN.

       CALC-TIER-RATING.
           IF WS-UNITS-CONSUMED <= 500
             COMPUTE WS-TIER1-COST = WS-UNITS-CONSUMED * 0.0895
           ELSE
             COMPUTE WS-TIER1-COST = 500 * 0.0895
             COMPUTE WS-TIER2-COST =
               (WS-UNITS-CONSUMED - 500) * 0.1340
           END-IF.

       VALIDATE-EXCEPTIONS.
           IF WS-UNITS-CONSUMED < 0
             MOVE "8001" TO WS-RETURN-CODE
           ELSE IF WS-UNITS-CONSUMED > 50000
             MOVE "8002" TO WS-RETURN-CODE
           ELSE
             MOVE "0000" TO WS-RETURN-CODE
           END-IF.`}</pre>
        </div>
      )}

      {/* Execution log */}
      <div className="cobol-screen px-5 py-4 min-h-24 max-h-48 overflow-y-auto">
        {running && (
          <div className="cobol-dim animate-pulse">
            $ gnucobol-wasm --module rating.cob --mode batch-dry-run ...
          </div>
        )}
        {revealed.map((line, i) => <div key={i} className="cobol-dim">{line}</div>)}
        {showResult && result && (
          <div className="mt-2" style={{ borderTop: "1px solid #1a2a1a", paddingTop: 8 }}>
            <div className="cobol-dim">{"─".repeat(52)}</div>
            <div
              className="text-[12px] font-bold"
              style={{ color: isValid ? "#00FF41" : "#FF4444" }}
            >
              GNUCOBOL WASM: RATING.COB EXECUTED IN {result.execMs}ms | RC: {result.returnCode} ({isValid ? "VALID" : "EXCEPTION"})
            </div>
            {result.exception && (
              <div style={{ color: "#FF4444", fontSize: 11 }}>⚠ {result.exception}</div>
            )}
          </div>
        )}
      </div>

      {/* Result — back to light UI */}
      {showResult && result && (
        <div className="p-5" style={{ borderTop: "1px solid var(--border)" }}>
          {/* Big comparison */}
          <div className="flex items-center gap-6 mb-5 flex-wrap">
            <div className="text-center">
              <div className="text-[10px] mb-1" style={{ color: "var(--dim)" }}>Estimated (SYS-06)</div>
              <div className="text-[22px] font-bold line-through tabular-nums" style={{ color: "var(--red)" }}>
                ${estimatedBill.toFixed(2)}
              </div>
            </div>

            <div className="flex flex-col items-center gap-1 flex-1">
              <div
                className="text-[11px] font-bold rounded-full px-3 py-1"
                style={{
                  background: isValid ? "var(--green-light)" : "var(--red-light)",
                  color: isValid ? "var(--green)" : "var(--red)",
                  border: `1px solid ${isValid ? "var(--green-mid)" : "var(--red-mid)"}`,
                }}
              >
                {isValid ? "✓ COBOL validated" : "✗ Exception"}
              </div>
              <div className="text-[10px]" style={{ color: "var(--dim)" }}>
                {result.execMs}ms · RC {result.returnCode}
              </div>
            </div>

            <div className="text-center">
              <div className="text-[10px] mb-1" style={{ color: "var(--dim)" }}>Corrected balance</div>
              <div
                className="text-[28px] font-black tabular-nums"
                style={{ color: isValid ? "var(--green)" : "var(--red)" }}
              >
                ${result.total.toFixed(2)}
              </div>
              <div className="text-[10px]" style={{ color: "var(--dim)" }}>
                {result.units.toLocaleString()} kWh verified
              </div>
            </div>
          </div>

          {/* Tier breakdown */}
          <div className="rounded-xl overflow-hidden mb-4" style={{ border: "1px solid var(--border)" }}>
            <div
              className="grid grid-cols-3 px-4 py-2 text-[10px] font-medium"
              style={{ background: "var(--surface-2)", color: "var(--dim)", borderBottom: "1px solid var(--border)" }}
            >
              <span>Charge</span><span className="text-right">Units</span><span className="text-right">Amount</span>
            </div>
            <div className="px-4 py-2 grid grid-cols-3 text-[11px]" style={{ borderBottom: "1px solid var(--border)" }}>
              <span style={{ color: "var(--muted)" }}>Standing charge</span>
              <span className="text-right" style={{ color: "var(--dim)" }}>—</span>
              <span className="text-right font-semibold" style={{ color: "var(--text)" }}>${result.standingCharge.toFixed(2)}</span>
            </div>
            {result.tierBreakdown.map((t) => (
              <div key={t.tier} className="px-4 py-2 grid grid-cols-3 text-[11px]" style={{ borderBottom: "1px solid var(--border)" }}>
                <span style={{ color: "var(--muted)" }}>{t.tier}</span>
                <span className="text-right tabular-nums" style={{ color: "var(--dim)" }}>{t.units}</span>
                <span className="text-right font-semibold tabular-nums" style={{ color: "var(--text)" }}>${t.cost.toFixed(2)}</span>
              </div>
            ))}
            <div
              className="px-4 py-2.5 grid grid-cols-3 text-[12px] font-bold"
              style={{ background: "var(--surface-2)" }}
            >
              <span style={{ color: "var(--text)" }}>Total</span>
              <span />
              <span className="text-right" style={{ color: isValid ? "var(--green)" : "var(--red)" }}>
                ${result.total.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Savings banner */}
          {isValid && savings > 0 && (
            <div
              className="rounded-xl px-4 py-3 flex items-center justify-between mb-4"
              style={{ background: "var(--green-light)", border: "1px solid var(--green-mid)" }}
            >
              <div>
                <div className="text-[13px] font-bold" style={{ color: "var(--green)" }}>
                  Customer saves ${savings.toFixed(2)}
                </div>
                <div className="text-[11px]" style={{ color: "var(--green)", opacity: 0.8 }}>
                  Corrected on first call — no overnight wait
                </div>
              </div>
              <div className="text-[30px]">✓</div>
            </div>
          )}

          {/* Actions */}
          {isValid && (
            <div className="flex gap-3">
              <button
                onClick={onShowReceipt}
                className="flex-1 rounded-xl py-3 text-[13px] font-bold transition-all hover:opacity-90 flex items-center justify-center gap-2"
                style={{ background: "var(--blue)", color: "#fff", boxShadow: "0 2px 8px rgba(37,99,235,0.3)" }}
              >
                📄 Generate clearance
              </button>
              <button
                onClick={onShowBatch}
                className="flex-1 rounded-xl py-3 text-[13px] font-bold transition-colors flex items-center justify-center gap-2"
                style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--blue)")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
              >
                🖥 Aurora SYS-01 batch pipe
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
