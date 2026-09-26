import { freightModeLabel } from "@/lib/calc";
import type { FreightMode } from "@/lib/types";

export function FreightModeBadge({ mode }: { mode: FreightMode | null }) {
  return <span className="freight-mode" data-mode={mode ?? "pending"}>{mode ? freightModeLabel(mode) : "A definir"}</span>;
}
