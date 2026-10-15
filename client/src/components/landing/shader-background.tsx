"use client";

import { ShaderGradient, ShaderGradientCanvas } from "@shadergradient/react";
import { useTheme } from "@/components/theme-provider";

export function ShaderBackground() {
  const { theme, ready } = useTheme();
  const isDark = !ready || theme === "dark";

  const color1 = isDark ? "#07090c" : "#dfe8d4";
  const color2 = isDark ? "#1f3d2e" : "#a8c96a";
  const color3 = isDark ? "#b8f34a" : "#5f8f12";

  return (
    <div
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      aria-hidden
    >
      <ShaderGradientCanvas
        key={isDark ? "dark" : "light"}
        className="h-full w-full"
        style={{ width: "100%", height: "100%" }}
        pixelDensity={1.2}
        fov={45}
        pointerEvents="none"
        lazyLoad
      >
        <ShaderGradient
          control="props"
          animate="on"
          type="waterPlane"
          uSpeed={0.16}
          uStrength={isDark ? 1.7 : 1.2}
          uDensity={1.05}
          uFrequency={5}
          uAmplitude={isDark ? 2.2 : 1.6}
          positionX={0}
          positionY={0.35}
          positionZ={0}
          rotationX={50}
          rotationY={10}
          rotationZ={0}
          color1={color1}
          color2={color2}
          color3={color3}
          reflection={0.25}
          lightType="3d"
          brightness={isDark ? 1.1 : 1.35}
          grain="off"
          cAzimuthAngle={180}
          cPolarAngle={78}
          cDistance={4.2}
          cameraZoom={1}
        />
      </ShaderGradientCanvas>
      <div
        className="absolute inset-0"
        style={{
          background: isDark
            ? "radial-gradient(ellipse at center, transparent 8%, rgba(7,9,12,0.55) 68%, rgba(7,9,12,0.94) 100%)"
            : "radial-gradient(ellipse at center, transparent 12%, rgba(243,245,241,0.35) 70%, rgba(243,245,241,0.92) 100%)",
        }}
      />
      <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[color:var(--mkt-hero-fade)] to-transparent" />
    </div>
  );
}
