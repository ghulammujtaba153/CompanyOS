import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#07090c",
          borderRadius: 40,
        }}
      >
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: 32,
            border: "3px solid rgba(184,243,74,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 999,
              background: "#b8f34a",
              boxShadow: "0 0 0 10px rgba(110,231,183,0.18)",
            }}
          />
          <div
            style={{
              marginTop: 18,
              width: 56,
              height: 6,
              borderRadius: 999,
              background: "#6ee7b7",
            }}
          />
        </div>
      </div>
    ),
    size,
  );
}
