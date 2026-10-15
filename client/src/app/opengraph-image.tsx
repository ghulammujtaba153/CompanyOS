import { ImageResponse } from "next/og";

export const alt = "CompanyOS — AI Operating System for Business";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background:
            "linear-gradient(135deg, #07090c 0%, #11151c 55%, #1a2a1c 100%)",
          color: "#f2f4f0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: "linear-gradient(135deg, #d4ff4f, #6ee7b7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#0a0c10",
              fontSize: 34,
              fontWeight: 700,
            }}
          >
            ✦
          </div>
          <div style={{ fontSize: 36, fontWeight: 700 }}>CompanyOS</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -2,
              maxWidth: 900,
            }}
          >
            The AI operating system for business.
          </div>
          <div
            style={{
              fontSize: 28,
              color: "#9aa3ae",
              maxWidth: 820,
              lineHeight: 1.4,
            }}
          >
            Coordinate people, processes, and AI agents with controlled
            autonomy.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 16,
            color: "#b8f34a",
            fontSize: 22,
            fontWeight: 600,
          }}
        >
          <span>Organization</span>
          <span>·</span>
          <span>Work</span>
          <span>·</span>
          <span>Agents</span>
          <span>·</span>
          <span>Governance</span>
        </div>
      </div>
    ),
    size,
  );
}
