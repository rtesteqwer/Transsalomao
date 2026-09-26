import { Truck } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return <Truck className={cn("size-8 shrink-0 text-fg", className)} strokeWidth={1.6} aria-hidden="true" />;
}

export function BrandLockup({
  to = "/",
  subtitle,
}: {
  to?: string;
  subtitle?: string;
}) {
  return (
    <Link to={to} className="flex items-center gap-3 min-w-0">
      <LogoMark />
      <span className="min-w-0">
        <span className="block font-display text-[18px] font-semibold tracking-tight leading-tight">
          Trans Salomão
        </span>
        {subtitle ? (
          <span className="mt-1 block text-[11px] uppercase tracking-[0.16em] text-muted truncate">
            {subtitle}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
