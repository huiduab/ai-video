import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "soft";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary: "bg-[#1554ff] text-white shadow-sm hover:bg-[#0f3fd4]",
  secondary: "border border-slate-300 bg-white text-slate-900 hover:border-[#1554ff] hover:text-[#1554ff]",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
  soft: "bg-[#eaf1ff] text-[#1554ff] hover:bg-[#dce8ff]",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-8 px-3 text-xs",
  lg: "h-12 px-7 text-base",
};

export function Button({ className, variant = "primary", size = "md", children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1554ff]",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
