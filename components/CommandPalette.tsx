"use client";
import { useEffect, useRef, useState } from "react";
import { searchAccounts, AccountRecord } from "@/lib/accounts";

type Props = { onSelect: (a: AccountRecord) => void; onClose: () => void };

const STATUS: Record<string, { label: string; bg: string; color: string }> = {
  PENDING_OVERNIGHT_BATCH: { label: "Pending batch", bg: "var(--amber-light)", color: "var(--amber)" },
  VERIFIED_CLEARED:        { label: "Cleared",        bg: "var(--green-light)", color: "var(--green)" },
  ESCALATED:               { label: "Escalated",      bg: "var(--red-light)",   color: "var(--red)" },
  CLOSED:                  { label: "Closed",          bg: "var(--surface-2)",   color: "var(--dim)" },
};

export default function CommandPalette({ onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AccountRecord[]>(searchAccounts(""));
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setResults(searchAccounts(query)); setCursor(0); }, [query]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === "Enter" && results[cursor]) onSelect(results[cursor]);
    else if (e.key === "Escape") onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4" onClick={onClose}>
      {/* Scrim */}
      <div className="absolute inset-0" style={{ background: "rgba(15,23,42,0.4)", backdropFilter: "blur(4px)" }} />

      <div
        className="relative w-full max-w-lg rounded-2xl overflow-hidden"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "0 20px 60px rgba(15,23,42,0.2), 0 4px 16px rgba(15,23,42,0.1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: "1px solid var(--border)" }}>
          <svg className="w-4 h-4 shrink-0" style={{ color: "var(--dim)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search by account ID, name, or address…"
            className="flex-1 text-[14px] bg-transparent outline-none"
            style={{ color: "var(--text)" }}
          />
          <kbd
            className="text-[10px] rounded px-1.5 py-0.5 shrink-0"
            style={{ background: "var(--surface-2)", color: "var(--dim)", border: "1px solid var(--border)" }}
          >
            ESC
          </kbd>
        </div>

        {/* Section header */}
        <div className="px-4 pt-2 pb-1 text-[10px]" style={{ color: "var(--dim)" }}>
          Northwind Energy · {results.length} accounts · DuckDB-Wasm · 4ms
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--dim)" }}>No accounts found</div>
          ) : results.map((acc, i) => {
            const st = STATUS[acc.status];
            const isSel = i === cursor;
            return (
              <button
                key={acc.id}
                className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors"
                style={{ background: isSel ? "var(--blue-light)" : "transparent" }}
                onClick={() => onSelect(acc)}
                onMouseEnter={() => setCursor(i)}
              >
                <span
                  className="text-[10px] font-bold rounded-md px-1.5 py-0.5 shrink-0"
                  style={{
                    background: "var(--hint)",
                    color: "var(--muted)",
                  }}
                >
                  {acc.id}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium" style={{ color: "var(--text)" }}>{acc.name}</span>
                    {acc.callbackCount > 0 && (
                      <span className="text-[10px] font-medium" style={{ color: "var(--red)" }}>
                        ⚠ {acc.callbackCount} callbacks
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] truncate" style={{ color: "var(--dim)" }}>{acc.address}</div>
                </div>

                <div className="shrink-0 flex flex-col items-end gap-1">
                  <span
                    className="text-[10px] font-medium rounded-full px-2 py-0.5"
                    style={{ background: st.bg, color: st.color }}
                  >
                    {st.label}
                  </span>
                  <span className="text-[12px] font-bold tabular-nums" style={{ color: "var(--red)" }}>
                    ${acc.estimatedBill.toFixed(2)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div
          className="px-4 py-2.5 flex items-center gap-4 text-[10px]"
          style={{ borderTop: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--dim)" }}
        >
          <span className="flex items-center gap-1">
            <kbd className="rounded px-1 py-0.5" style={{ background: "var(--border)", color: "var(--muted)" }}>↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded px-1 py-0.5" style={{ background: "var(--border)", color: "var(--muted)" }}>↵</kbd>
            open account
          </span>
        </div>
      </div>
    </div>
  );
}
