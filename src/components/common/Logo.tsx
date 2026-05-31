import { Orbit } from "lucide-react";
import { cn } from "@/lib/cn";

interface LogoProps {
  compact?: boolean;
  className?: string;
}

export function Logo({ compact = false, className }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex size-8 items-center justify-center rounded-xl bg-[#1554ff] text-white shadow-sm">
        <Orbit size={20} strokeWidth={2.4} />
      </div>
      {!compact && <span className="text-xl font-semibold tracking-normal text-slate-950">MotionWeave AI</span>}
    </div>
  );
}
