"use client";

import { type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type LiquidGlassProps = {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
  intensity?: "soft" | "strong";
  style?: CSSProperties;
  id?: string;
};

export function LiquidGlass({
  children,
  className,
  as: Tag = "div",
  intensity = "soft",
  style,
  id,
}: LiquidGlassProps) {
  return (
    <Tag
      id={id}
      className={cn(
        "liquid-glass relative overflow-hidden",
        intensity === "strong" && "liquid-glass-strong",
        className,
      )}
      style={style}
    >
      <div className="relative z-10">{children}</div>
    </Tag>
  );
}
