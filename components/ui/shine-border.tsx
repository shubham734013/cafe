import React from "react";
import { cn } from "@/lib/utils";

interface ShineBorderProps extends React.HTMLAttributes<HTMLDivElement> {
  borderRadius?: number;
  borderWidth?: number;
  duration?: number;
  color?: string | string[];
  className?: string;
  children: React.ReactNode;
}

/**
 * Magic UI - ShineBorder
 * Animated continuous conic gradient border
 */
export const ShineBorder: React.FC<ShineBorderProps> = ({
  borderRadius = 24,
  borderWidth = 1.5,
  duration = 8,
  color = ["#FF6422", "#F5A638", "#10B98C"],
  className,
  children,
  ...props
}) => {
  return (
    <div
      style={
        {
          "--border-radius": `${borderRadius}px`,
        } as React.CSSProperties
      }
      className={cn(
        "relative min-h-[60px] w-full rounded-[var(--border-radius)] p-px bg-transparent",
        className
      )}
      {...props}
    >
      <div
        style={
          {
            "--border-width": `${borderWidth}px`,
            "--border-radius": `${borderRadius}px`,
            "--duration": `${duration}s`,
            "--mask-linear-gradient": `linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)`,
            "--background-radial-gradient": `radial-gradient(transparent,transparent, ${
              Array.isArray(color) ? color.join(",") : color
            },transparent,transparent)`,
          } as React.CSSProperties
        }
        className={`before:bg-shine-size pointer-events-none absolute inset-0 size-full rounded-[var(--border-radius)] p-[var(--border-width)] will-change-[background-position] content-[""] [background-image:var(--background-radial-gradient)] [background-size:300%_300%] [mask:var(--mask-linear-gradient)] motion-safe:animate-shine [mask-composite:exclude]`}
      />
      {children}
    </div>
  );
};
