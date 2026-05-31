import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  active?: boolean;
}

export function IconButton({ label, children, active = false, className, ...props }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        "flex size-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:border-[#1554ff] hover:text-[#1554ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1554ff]",
        active && "border-[#1554ff] bg-[#edf3ff] text-[#1554ff]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
