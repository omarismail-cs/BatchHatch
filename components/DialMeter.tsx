"use client";
import { useState } from "react";

// ── Single mechanical dial face ───────────────────────────────────
// Real utility meters alternate CW / CCW on every dial.
// Dial 1 (ten-thousands): CW  Dial 2: CCW  Dial 3: CW  Dial 4: CCW  Dial 5: CW
function SingleDial({
  digit,
  nextDigit,
  isClockwise,
  index,
  isActive,
  isAmbiguous,
}: {
  digit: number | null;   // 0–9, or null if not yet entered
  nextDigit: number | null;
  isClockwise: boolean;
  index: number;
  isActive: boolean;     // cursor is on this dial
  isAmbiguous: boolean;
}) {
  const SIZE = 72;
  const R = 28;          // radius of number ring
  const NEEDLE = 22;     // needle length from centre

  // Fractional dial position: digit + nextDigit/10 gives smooth coupling
  const d = digit ?? 0;
  const nd = nextDigit ?? 0;
  const position = digit === null ? 0 : d + nd / 10;

  // Degrees from top (north), positive = clockwise
  const needleDeg = (isClockwise ? 1 : -1) * position * 36;

  // Needle tip in SVG coords (SVG rotate() is CW from +X, so we pre-rotate -90°)
  // We rotate the whole needle group by needleDeg around origin
  const tipRad  = ((needleDeg - 90) * Math.PI) / 180;
  const tailRad = ((needleDeg + 90) * Math.PI) / 180;
  const tipX  = Math.cos(tipRad)  * NEEDLE;
  const tipY  = Math.sin(tipRad)  * NEEDLE;
  const tailX = Math.cos(tailRad) * (NEEDLE * 0.25);
  const tailY = Math.sin(tailRad) * (NEEDLE * 0.25);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      {/* Direction badge */}
      <div style={{
        fontSize: 8, fontWeight: 700, letterSpacing: "0.04em",
        color: isClockwise ? "var(--blue)" : "var(--amber, #b45309)",
        opacity: 0.8,
      }}>
        {isClockwise ? "CW ↻" : "CCW ↺"}
      </div>

      {/* Dial face */}
      <svg
        width={SIZE} height={SIZE}
        viewBox="-36 -36 72 72"
        style={{
          filter: isAmbiguous
            ? "drop-shadow(0 0 4px rgba(239,68,68,0.5))"
            : isActive
              ? "drop-shadow(0 0 4px rgba(36,98,232,0.4))"
              : "none",
          transition: "filter 0.2s",
        }}
      >
        {/* Outer ring */}
        <circle cx={0} cy={0} r={35}
          fill={isActive ? "#f0f5ff" : "#fafafa"}
          stroke={isAmbiguous ? "#ef4444" : isActive ? "var(--blue)" : "#d1d5db"}
          strokeWidth={isAmbiguous ? 1.5 : 1}
        />

        {/* Numbers 0–9 around the ring */}
        {Array.from({ length: 10 }, (_, n) => {
          const angleDeg = (isClockwise ? n : -n) * 36;
          const rad = ((angleDeg - 90) * Math.PI) / 180;
          const x = Math.cos(rad) * R;
          const y = Math.sin(rad) * R;
          const isCurrent = digit !== null && n === d;
          return (
            <text
              key={n}
              x={x} y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={isCurrent ? 7 : 6}
              fontWeight={isCurrent ? "700" : "400"}
              fill={isCurrent ? "#111" : "#9ca3af"}
            >
              {n}
            </text>
          );
        })}

        {/* Tick marks */}
        {Array.from({ length: 10 }, (_, n) => {
          const angleDeg = (isClockwise ? n : -n) * 36;
          const rad = ((angleDeg - 90) * Math.PI) / 180;
          const innerR = 32;
          const outerR = 34;
          return (
            <line
              key={n}
              x1={Math.cos(rad) * innerR} y1={Math.sin(rad) * innerR}
              x2={Math.cos(rad) * outerR} y2={Math.sin(rad) * outerR}
              stroke="#d1d5db" strokeWidth={0.8}
            />
          );
        })}

        {/* Needle — tapers to a point */}
        {digit !== null && (
          <>
            <line
              x1={tailX * 0.6} y1={tailY * 0.6}
              x2={tipX}        y2={tipY}
              stroke="#1e293b" strokeWidth={1.5}
              strokeLinecap="round"
              style={{ transition: "x2 0.35s ease, y2 0.35s ease, x1 0.35s ease, y1 0.35s ease" }}
            />
            {/* Counterweight */}
            <line
              x1={0}           y1={0}
              x2={tailX * 0.6} y2={tailY * 0.6}
              stroke="#94a3b8" strokeWidth={1}
              strokeLinecap="round"
            />
          </>
        )}

        {/* Centre pivot */}
        <circle cx={0} cy={0} r={2.5}
          fill={digit !== null ? "#1e293b" : "#d1d5db"}
        />

        {/* Empty state cross */}
        {digit === null && (
          <>
            <line x1={-5} y1={0} x2={5} y2={0} stroke="#d1d5db" strokeWidth={0.8} />
            <line x1={0} y1={-5} x2={0} y2={5} stroke="#d1d5db" strokeWidth={0.8} />
          </>
        )}
      </svg>

      {/* Digit label */}
      <div style={{
        fontSize: 11, fontWeight: 700, fontVariantNumeric: "tabular-nums",
        color: digit !== null ? "var(--text)" : "var(--dim)",
        fontFamily: "var(--font-mono), monospace",
        width: SIZE, textAlign: "center",
        background: isActive ? "var(--blue-light)" : "transparent",
        borderRadius: 4, padding: "1px 0",
      }}>
        {digit !== null ? digit : "·"}
      </div>

      {/* Dial number */}
      <div style={{ fontSize: 9, color: "var(--dim)", letterSpacing: "0.04em" }}>
        #{index + 1}
      </div>
    </div>
  );
}

// ── Ambiguity detection ───────────────────────────────────────────
// A reading is ambiguous when the next digit creates a fractional
// position close to 0.5 — pointer is between two numbers.
function isDialAmbiguous(digit: number | null, nextDigit: number | null): boolean {
  if (digit === null || nextDigit === null) return false;
  const frac = nextDigit / 10;
  return frac >= 3 && frac <= 7; // needle visibly between two marks
}

// ── Customer Perspective Assistant prompts ────────────────────────
function buildPrompts(digits: (number | null)[], isClockwises: boolean[]): string[] {
  const prompts: string[] = [];

  digits.forEach((d, i) => {
    if (d === null) return;
    const isCW = isClockwises[i];
    const next = digits[i + 1];
    const frac = next !== null && next !== undefined ? next / 10 : null;

    // CCW dial confusion
    if (!isCW && d !== null) {
      prompts.push(
        `Dial #${i + 1} rotates counter-clockwise — numbers increase to the LEFT. Ask: "On that dial, which direction does the pointer move as the number goes up?" to confirm they have the right orientation.`
      );
    }

    // Pointer between digits (ambiguous zone)
    if (frac !== null && frac >= 0.3 && frac <= 0.7) {
      const lower = d;
      const upper = (d + 1) % 10;
      prompts.push(
        `Dial #${i + 1}: Ask: "Is the pointer clearly past the ${lower}, or is it still approaching it?" — The rule is always read the lower number (${lower}) unless the pointer has completely passed it.`
      );
    }

    // Near-zero: pointer between 9 and 0 — common rollover misread
    if (d === 0 && (next === null || next === 0 || next === 1)) {
      prompts.push(
        `Dial #${i + 1} shows 0. Ask: "Is the pointer exactly at the top of the dial, or still approaching it from the 9?" — If approaching, the dial still reads 9.`
      );
    }

    // Digit 1 on CCW dial — often mistaken for 9 (opposite side)
    if (!isCW && d === 1) {
      prompts.push(
        `Dial #${i + 1} (CCW) reads 1, but on a counter-clockwise dial, 1 is to the RIGHT of 0. Ask: "Is the pointer just slightly right of the 0 mark, or further around?" — If they say left, it may actually be 9.`
      );
    }

    // Digit 6 vs 9 confusion on dim screens / bad lighting
    if (d === 6 || d === 9) {
      prompts.push(
        `Dial #${i + 1}: Ask the customer to double-check: "${d === 6 ? "6 and 9" : "9 and 6"} can look similar in poor light. Can you confirm the pointer is ${d === 6 ? "just past the 6 mark, not approaching 9" : "clearly past 9, near the top"}?"`
      );
    }
  });

  // De-dupe and limit to 3 most useful
  return [...new Set(prompts)].slice(0, 3);
}

// ── Main export ───────────────────────────────────────────────────
export default function DialMeter({ value }: { value: string }) {
  const [assistantOpen, setAssistantOpen] = useState(false);

  const isClockwises = [true, false, true, false, true];
  const padded = value.padStart(5, "");   // right-align: last chars = lowest dials
  // For a 5-digit meter, left-pad with nulls for untyped positions
  const rawDigits: (number | null)[] = Array.from({ length: 5 }, (_, i) => {
    const char = padded[i];
    if (!char || char === " ") return null;
    const n = parseInt(char, 10);
    return isNaN(n) ? null : n;
  });

  // Find the first non-null index to mark as "active"
  const activeIdx = rawDigits.findIndex((d) => d !== null);

  const ambiguous = rawDigits.map((d, i) => isDialAmbiguous(d, rawDigits[i + 1] ?? null));
  const prompts = buildPrompts(rawDigits, isClockwises);
  const hasAmbiguous = ambiguous.some(Boolean);

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Dial row */}
      <div style={{
        display: "flex", gap: 8, justifyContent: "center",
        padding: "16px 12px 12px",
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        position: "relative",
      }}>
        {/* Meter label */}
        <div style={{
          position: "absolute", top: 6, left: 10,
          fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
          color: "var(--dim)",
        }}>
          AURORA MK-IV · 5-DIAL MECHANICAL
        </div>

        {rawDigits.map((d, i) => (
          <SingleDial
            key={i}
            digit={d}
            nextDigit={rawDigits[i + 1] ?? null}
            isClockwise={isClockwises[i]}
            index={i}
            isActive={i === activeIdx}
            isAmbiguous={ambiguous[i]}
          />
        ))}
      </div>

      {/* Assistant toggle */}
      <button
        onClick={() => setAssistantOpen((v) => !v)}
        style={{
          marginTop: 8, width: "100%",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 12px", borderRadius: 8,
          background: assistantOpen
            ? (hasAmbiguous ? "var(--red-light, #fff1f0)" : "var(--hint)")
            : "var(--bg)",
          border: `1px solid ${assistantOpen && hasAmbiguous ? "var(--red-mid, #fca5a5)" : "var(--border-md)"}`,
          cursor: "pointer", transition: "all 0.15s",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: hasAmbiguous && assistantOpen ? "var(--red)" : "var(--text)" }}>
            Customer Perspective Assistant
          </span>
          {hasAmbiguous && (
            <span style={{
              fontSize: 9, fontWeight: 700, borderRadius: 100,
              padding: "2px 7px", background: "var(--red-light, #fff1f0)",
              color: "var(--red)", border: "1px solid var(--red-mid, #fca5a5)",
            }}>
              {ambiguous.filter(Boolean).length} ambiguous dial{ambiguous.filter(Boolean).length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <span style={{ fontSize: 10, color: "var(--dim)" }}>{assistantOpen ? "▲" : "▼"}</span>
      </button>

      {assistantOpen && (
        <div style={{
          border: "1px solid var(--border)",
          borderRadius: "0 0 10px 10px",
          borderTop: "none",
          padding: "12px 14px",
          background: "var(--surface)",
        }}>
          {value.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--dim)", fontStyle: "italic" }}>
              Start typing the customer&apos;s reading to see dial-specific guidance.
            </div>
          ) : prompts.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--green)", fontWeight: 600 }}>
              ✓ All dials look unambiguous — reading appears clean.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", letterSpacing: "0.05em" }}>
                SUGGESTED QUESTIONS FOR CUSTOMER
              </div>
              {prompts.map((p, i) => (
                <div key={i} style={{
                  fontSize: 11, color: "var(--text)", lineHeight: 1.7,
                  padding: "8px 10px",
                  background: "var(--bg)",
                  borderRadius: 8,
                  borderLeft: "3px solid var(--blue)",
                }}>
                  {p}
                </div>
              ))}
              <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 2, lineHeight: 1.6 }}>
                Standard rule: always record the <strong>lower</strong> number when the pointer sits between two digits. Only advance to the higher number when the pointer has clearly passed it.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
