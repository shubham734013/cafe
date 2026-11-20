import React from "react";
import { cn } from "@/lib/utils";

interface ShinyTextProps {
  text: string;
  disabled?: boolean;
  speed?: number;
  className?: string;
  shimmerWidth?: number;
}

/**
 * React Bits - ShinyText
 * Metallic iridescent text shimmer animation
 */
export const ShinyText: React.FC<ShinyTextProps> = ({
  text,
  disabled = false,
  speed = 3,
  className = "",
  shimmerWidth = 100,
}) => {
  return (
    <span
      className={cn(
        "inline-block bg-clip-text text-transparent transition-all",
        !disabled &&
          "bg-[linear-gradient(110deg,#a1a1aa,45%,#ffffff,55%,#a1a1aa)] dark:bg-[linear-gradient(110deg,#94a3b8,45%,#ffffff,55%,#94a3b8)] bg-[length:250%_100%] animate-shine",
        className
      )}
      style={{
        animationDuration: `${speed}s`,
      }}
    >
      {text}
    </span>
  );
};
