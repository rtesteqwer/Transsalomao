import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

export type SearchSuggestion = {
  value: string;
  label: string;
  count: number;
  score: number;
};

export function normalizeSmartSearch(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function smartSearchActive(query: string) {
  return normalizeSmartSearch(query).replace(/\s/g, "").length >= 3;
}

export function smartSearchMatches(query: string, values: unknown[]) {
  const q = normalizeSmartSearch(query);
  if (q.replace(/\s/g, "").length < 3) return true;
  const haystack = normalizeSmartSearch(values.filter(Boolean).join(" "));
  if (!haystack) return false;
  const tokens = q.split(" ").filter((token) => token.length > 0);
  return tokens.every((token) => haystack.includes(token));
}

export function buildSmartSuggestions(values: unknown[], query: string, limit = 7): SearchSuggestion[] {
  const q = normalizeSmartSearch(query);
  if (q.replace(/\s/g, "").length < 3) return [];

  const counts = new Map<string, { label: string; count: number }>();
  for (const raw of values) {
    const label = String(raw ?? "").trim();
    const key = normalizeSmartSearch(label);
    if (!label || key.length < 2) continue;
    const current = counts.get(key);
    if (current) current.count += 1;
    else counts.set(key, { label, count: 1 });
  }

  const tokens = q.split(" ").filter(Boolean);
  const rows: SearchSuggestion[] = [];
  for (const [key, current] of counts) {
    if (!tokens.every((token) => key.includes(token))) continue;
    let score = 0;
    if (key === q) score += 1500;
    if (key.startsWith(q)) score += 800;
    if (key.split(" ").some((word) => word.startsWith(q))) score += 500;
    if (key.includes(q)) score += 250;
    score += Math.min(current.count, 100) * 12;
    score += Math.max(0, 80 - Math.abs(key.length - q.length));
    rows.push({ value: current.label, label: current.label, count: current.count, score });
  }

  return rows
    .sort((a, b) => b.score - a.score || b.count - a.count || a.label.localeCompare(b.label, "pt-BR"))
    .slice(0, Math.max(1, limit));
}

export function SmartSearch({
  value,
  onChange,
  suggestions,
  placeholder = "Digite pelo menos 3 letras",
  label = "Pesquisar",
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions: SearchSuggestion[];
  placeholder?: string;
  label?: string;
}) {
  const active = smartSearchActive(value);
  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="pl-9 pr-10"
          aria-label={label}
        />
        {value ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
            onClick={() => onChange("")}
            aria-label="Limpar pesquisa"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      {value && !active ? (
        <p className="mt-1 text-[11px] text-muted">Digite no mínimo 3 letras para filtrar.</p>
      ) : null}
      {active && suggestions.length > 0 ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
          <div className="border-b border-border px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-muted">
            Mais relevantes e mais usadas
          </div>
          {suggestions.map((item) => (
            <button
              key={normalizeSmartSearch(item.value)}
              type="button"
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-surface-2"
              onClick={() => onChange(item.value)}
            >
              <span className="min-w-0 truncate font-medium">{item.label}</span>
              {item.count > 1 ? <span className="shrink-0 text-[11px] text-muted">{item.count} registros</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
