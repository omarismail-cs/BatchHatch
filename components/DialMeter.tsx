"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { playMeterClick, playCarryClick } from "@/lib/sound";
import { runCobolEngine } from "@/lib/billing";
import type { AccountRecord } from "@/lib/accounts";

// ── Constants ─────────────────────────────────────────────────────
// Dials: 1=CW, 2=CCW, 3=CW, 4=CCW, 5=CW
const IS_CW = [true, false, true, false, true];
const PLACE  = [10000, 1000, 100, 10, 1];
const SIZE   = 72;
const R_NUM  = 28; // number ring radius
const NEEDLE = 22; // needle length

// ── Helpers ───────────────────────────────────────────────────────
function readingToPositions(reading: number): number[] {
  // Returns fractional position (0–10) for each of 5 dials
  return PLACE.map((p) => (reading / p) % 10);
}

function positionToNeedleAngle(pos: number, isCW: boolean): number {
  // Degrees from north (positive = CW in screen space)
  return (isCW ? 1 : -1) * pos * 36;
}

function clampReading(r: number): number {
  return Math.max(0, Math.min(99999, r));
}

// ── Single dial SVG ───────────────────────────────────────────────
interface DialProps {
  position: number;      // fractional 0–10
  isCW: boolean;
  index: number;
  isAmbiguous: boolean;
  carriedRecently: boolean;
  onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp:   (e: React.PointerEvent<SVGSVGElement>) => void;
}

function SingleDial({
  position, isCW, index, isAmbiguous, carriedRecently,
  onPointerDown, onPointerMove, onPointerUp,
}: DialProps) {
  const digit = Math.floor(position) % 10;
  const angleDeg = positionToNeedleAngle(position, isCW);
  const tipRad  = ((angleDeg - 90) * Math.PI) / 180;
  const tailRad = ((angleDeg + 90) * Math.PI) / 180;
  const tipX  = Math.cos(tipRad)  * NEEDLE;
  const tipY  = Math.sin(tipRad)  * NEEDLE;
  const tailX = Math.cos(tailRad) * NEEDLE * 0.25;
  const tailY = Math.sin(tailRad) * NEEDLE * 0.25;

  const ringColor = carriedRecently
    ? "#16a34a"
    : isAmbiguous
      ? "#ef4444"
      : "var(--blue)";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.04em", color: isCW ? "var(--blue)" : "var(--amber, #b45309)", opacity: 0.8 }}>
        {isCW ? "CW ↻" : "CCW ↺"}
      </div>

      <svg
        width={SIZE} height={SIZE} viewBox="-36 -36 72 72"
        style={{
          cursor: "grab",
          filter: isAmbiguous
            ? "drop-shadow(0 0 4px rgba(239,68,68,0.5))"
            : carriedRecently
              ? "drop-shadow(0 0 5px rgba(22,163,74,0.6))"
              : "none",
          transition: "filter 0.2s",
          touchAction: "none",
          userSelect: "none",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Outer ring */}
        <circle cx={0} cy={0} r={35}
          fill={carriedRecently ? "#f0fdf4" : "#fafafa"}
          stroke={ringColor}
          strokeWidth={carriedRecently ? 1.8 : 1}
          style={{ transition: "stroke 0.25s, fill 0.25s" }}
        />

        {/* Numbers 0–9 */}
        {Array.from({ length: 10 }, (_, n) => {
          const a = (isCW ? n : -n) * 36;
          const rad = ((a - 90) * Math.PI) / 180;
          const x = Math.cos(rad) * R_NUM;
          const y = Math.sin(rad) * R_NUM;
          const isCurrent = n === digit;
          return (
            <text key={n} x={x} y={y}
              textAnchor="middle" dominantBaseline="central"
              fontSize={isCurrent ? 7 : 6}
              fontWeight={isCurrent ? "700" : "400"}
              fill={isCurrent ? "#111" : "#9ca3af"}
            >{n}</text>
          );
        })}

        {/* Tick marks */}
        {Array.from({ length: 10 }, (_, n) => {
          const a = (isCW ? n : -n) * 36;
          const rad = ((a - 90) * Math.PI) / 180;
          return (
            <line key={n}
              x1={Math.cos(rad) * 32} y1={Math.sin(rad) * 32}
              x2={Math.cos(rad) * 34} y2={Math.sin(rad) * 34}
              stroke="#d1d5db" strokeWidth={0.8}
            />
          );
        })}

        {/* Needle */}
        <line x1={tailX * 0.6} y1={tailY * 0.6} x2={tipX} y2={tipY}
          stroke="#1e293b" strokeWidth={1.5} strokeLinecap="round" />
        <line x1={0} y1={0} x2={tailX * 0.6} y2={tailY * 0.6}
          stroke="#94a3b8" strokeWidth={1} strokeLinecap="round" />

        {/* Pivot */}
        <circle cx={0} cy={0} r={2.5} fill="#1e293b" />
      </svg>

      <div style={{
        fontSize: 11, fontWeight: 700, fontVariantNumeric: "tabular-nums",
        color: "var(--text)", fontFamily: "var(--font-mono), monospace",
        width: SIZE, textAlign: "center",
      }}>
        {digit}
      </div>

      <div style={{ fontSize: 9, color: "var(--dim)", letterSpacing: "0.04em" }}>#{index + 1}</div>
    </div>
  );
}

// ── Live bill ticker ──────────────────────────────────────────────
function LiveBill({ total, prev }: { total: number; prev: number }) {
  const delta = total - prev;
  const up = delta > 0;
  return (
    <div style={{
      display: "flex", alignItems: "baseline", gap: 8,
      padding: "8px 14px",
      background: Math.abs(delta) < 0.005
        ? "var(--bg)"
        : up ? "var(--amber-light, #fffbeb)" : "var(--green-light)",
      borderRadius: 8, transition: "background 0.2s",
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", letterSpacing: "0.05em" }}>LIVE ESTIMATE</span>
      <span style={{
        fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums",
        color: Math.abs(delta) < 0.005 ? "var(--text)" : up ? "var(--amber, #b45309)" : "var(--green)",
        fontFamily: "var(--font-mono), monospace",
        transition: "color 0.2s",
      }}>
        ${total.toFixed(2)}
      </span>
      {Math.abs(delta) >= 0.005 && (
        <span style={{ fontSize: 11, fontWeight: 600, color: up ? "var(--amber, #b45309)" : "var(--green)" }}>
          {up ? "+" : ""}{delta.toFixed(2)}
        </span>
      )}
    </div>
  );
}

// ── Customer Perspective Assistant prompts ────────────────────────
function buildPrompts(positions: number[], isClockwises: boolean[]): string[] {
  const prompts: string[] = [];
  positions.forEach((pos, i) => {
    const d = Math.floor(pos) % 10;
    const frac = pos % 1;
    const isCW = isClockwises[i];
    if (!isCW) {
      prompts.push(`Dial #${i + 1} rotates counter-clockwise — numbers increase to the LEFT. Ask: "On that dial, which direction does the pointer move as the number goes up?" to confirm they have the right orientation.`);
    }
    if (frac >= 0.3 && frac <= 0.7) {
      const upper = (d + 1) % 10;
      prompts.push(`Dial #${i + 1}: Ask: "Is the pointer clearly past the ${d}, or still approaching it?" — The rule is always read the lower number (${d}) unless the pointer has completely passed it to ${upper}.`);
    }
    if (d === 0 && frac < 0.15) {
      prompts.push(`Dial #${i + 1} shows 0. Ask: "Is the pointer exactly at the top of the dial, or still approaching from the 9?" — If approaching, the dial still reads 9.`);
    }
    if (!isCW && d === 1) {
      prompts.push(`Dial #${i + 1} (CCW) reads 1, but on a counter-clockwise dial, 1 is to the RIGHT of 0. Ask: "Is the pointer just slightly right of the 0 mark?" — If they say left, it may be 9.`);
    }
    if (d === 6 || d === 9) {
      prompts.push(`Dial #${i + 1}: 6 and 9 look similar in poor light. Ask the customer to confirm which side of the scale the pointer is on.`);
    }
  });
  return [...new Set(prompts)].slice(0, 3);
}

// ── Main component ────────────────────────────────────────────────
export default function DialMeter({
  value,
  onChange,
  account,
}: {
  value: string;
  onChange?: (v: string) => void;
  account?: AccountRecord;
}) {
  // Internal reading as a float so we get sub-digit needle positions
  const [reading, setReading] = useState<number>(() => {
    const n = parseInt(value, 10);
    return isNaN(n) ? 0 : n;
  });
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [carriedDials, setCarriedDials] = useState<Set<number>>(new Set());

  // Live bill (only when account is provided)
  const [liveBill, setLiveBill] = useState<number | null>(null);
  const [prevBill, setPrevBill]   = useState<number | null>(null);

  // Ref mirror of reading for synchronous access inside pointer handlers
  const readingRef = useRef(reading);
  useEffect(() => { readingRef.current = reading; }, [reading]);

  // Drag state per dial (ref so we don't re-render during RAF)
  const dragRef = useRef<{
    dialIndex: number;
    lastAngle: number;
  } | null>(null);

  // Sync external value → internal when not dragging
  const isDragging = useRef(false);
  useEffect(() => {
    if (isDragging.current) return;
    const n = parseInt(value, 10);
    if (!isNaN(n)) setReading(n);
  }, [value]);

  // Live billing update
  useEffect(() => {
    if (!account) return;
    const dialInt = Math.round(reading);
    if (dialInt <= account.previousRead) { setLiveBill(null); return; }
    try {
      const res = runCobolEngine(
        account.id, account.tariffCode,
        account.previousRead, dialInt,
        new Date("2023-10-24"),
      );
      setPrevBill(liveBill);
      setLiveBill(res.total);
    } catch { setLiveBill(null); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reading, account]);

  // ── Drag handler factory ────────────────────────────────────────
  const getAngle = useCallback((e: React.PointerEvent, svg: SVGSVGElement): number => {
    const rect = svg.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top  + rect.height / 2;
    return Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
  }, []);

  const handlePointerDown = useCallback((dialIndex: number) =>
    (e: React.PointerEvent<SVGSVGElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      isDragging.current = true;
      dragRef.current = {
        dialIndex,
        lastAngle: getAngle(e, e.currentTarget),
      };
    }, [getAngle]);

  const handlePointerMove = useCallback((dialIndex: number) =>
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!dragRef.current || dragRef.current.dialIndex !== dialIndex) return;

      const currentAngle = getAngle(e, e.currentTarget);
      let delta = currentAngle - dragRef.current.lastAngle;
      if (delta >  180) delta -= 360;
      if (delta < -180) delta += 360;
      dragRef.current.lastAngle = currentAngle;

      const direction = IS_CW[dialIndex] ? 1 : -1;
      const digitDelta   = direction * delta / 36;
      const readingDelta = digitDelta * PLACE[dialIndex];

      // Use ref for synchronous read — no setState inside another setState
      const prev = readingRef.current;
      const prevPositions = readingToPositions(prev);
      const next = clampReading(prev + readingDelta);
      const nextPositions = readingToPositions(next);

      // Detect integer crossings → sound + carry flash
      const newCarried = new Set<number>();
      for (let i = 0; i < 5; i++) {
        if (Math.floor(prevPositions[i]) !== Math.floor(nextPositions[i])) {
          if (i === dialIndex) {
            playMeterClick();
          } else {
            playCarryClick();
            newCarried.add(i);
          }
        }
      }
      if (newCarried.size > 0) {
        setCarriedDials(newCarried);
        setTimeout(() => setCarriedDials(new Set()), 350);
      }

      // Update ref immediately so next pointer event sees latest value
      readingRef.current = next;
      setReading(next);
      onChange?.(String(Math.round(next)));
    }, [getAngle, onChange]);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
    isDragging.current = false;
  }, []);

  const positions = readingToPositions(reading);
  const ambiguous  = positions.map((pos) => { const f = pos % 1; return f >= 0.3 && f <= 0.7; });
  const hasAmbiguous = ambiguous.some(Boolean);
  const prompts    = buildPrompts(positions, IS_CW);

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Dial row */}
      <div style={{
        display: "flex", gap: 8, justifyContent: "center",
        padding: "20px 12px 14px",
        background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 12,
        position: "relative",
      }}>
        <div style={{
          position: "absolute", top: 6, left: 10,
          fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: "var(--dim)",
        }}>
          AURORA MK-IV · 5-DIAL MECHANICAL · drag to rotate
        </div>

        {positions.map((pos, i) => (
          <SingleDial
            key={i}
            position={pos}
            isCW={IS_CW[i]}
            index={i}
            isAmbiguous={ambiguous[i]}
            carriedRecently={carriedDials.has(i)}
            onPointerDown={handlePointerDown(i)}
            onPointerMove={handlePointerMove(i)}
            onPointerUp={handlePointerUp}
          />
        ))}
      </div>

      {/* Live bill scrubber */}
      {account && liveBill !== null && (
        <div style={{ marginTop: 6 }}>
          <LiveBill total={liveBill} prev={prevBill ?? liveBill} />
        </div>
      )}

      {/* Assistant toggle */}
      <button
        onClick={() => setAssistantOpen((v) => !v)}
        style={{
          marginTop: 8, width: "100%",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 12px", borderRadius: 8,
          background: assistantOpen ? (hasAmbiguous ? "var(--red-light, #fff1f0)" : "var(--hint)") : "var(--bg)",
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
              {ambiguous.filter(Boolean).length} ambiguous
            </span>
          )}
        </div>
        <span style={{ fontSize: 10, color: "var(--dim)" }}>{assistantOpen ? "▲" : "▼"}</span>
      </button>

      {assistantOpen && (
        <div style={{
          border: "1px solid var(--border)", borderRadius: "0 0 10px 10px",
          borderTop: "none", padding: "12px 14px", background: "var(--surface)",
        }}>
          {value.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--dim)", fontStyle: "italic" }}>
              Start typing or drag a dial to see guidance.
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
                  padding: "8px 10px", background: "var(--bg)", borderRadius: 8,
                  borderLeft: "3px solid var(--blue)",
                }}>
                  {p}
                </div>
              ))}
              <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 2, lineHeight: 1.6 }}>
                Standard rule: always record the <strong>lower</strong> number when the pointer sits between two digits.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
