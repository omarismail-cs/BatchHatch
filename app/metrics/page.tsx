"use client";

import Logo from "@/components/Logo";
import OriginalValueCase from "@/components/OriginalValueCase";

export default function MetricsPage() {
  return (
    <div style={{ minHeight: "100vh" }}>
      <header style={{
        background: "color-mix(in srgb, #f3e6d8 70%, transparent)",
        backdropFilter: "blur(10px)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0 20px",
        height: 52,
        position: "sticky",
        top: 0,
        zIndex: 40,
      }}>
        <Logo />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", whiteSpace: "nowrap" }}>Value case</span>
      </header>

      <main style={{
        width: "min(1040px, calc(100% - 32px))",
        margin: "0 auto",
        padding: "16px 0 48px",
      }}>
        <OriginalValueCase />
      </main>
    </div>
  );
}
