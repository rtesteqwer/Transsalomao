import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (!target || !fs.existsSync(path.join(target, "src"))) throw new Error("route-memory-caixa: expected app source");
const file = path.join(target, "src/routes/dono/lancamentos.tsx");
let s = fs.readFileSync(file, "utf8");

function replaceRequired(before, after, label) {
  if (s.includes(after)) return;
  if (!s.includes(before)) throw new Error("route-memory-caixa: pattern not found (" + label + ")");
  s = s.replace(before, after);
}

replaceRequired(
  '          origin: closingTicketMeta?.navioOrigem || closingTicketMeta?.remetente || "",\n          destination: closingTicketMeta?.navioDestino || closingTicketMeta?.destinatario || "",',
  '          origin: closingTicketMeta?.routeOrigin || closingTicketMeta?.navioOrigem || closingTicketMeta?.remetente || "",\n          destination: closingTicketMeta?.routeDestination || closingTicketMeta?.navioDestino || closingTicketMeta?.destinatario || "",',
  "route origin destination"
);

replaceRequired(
  '          pricePerTon: open.freightMode === "ton" && Number(closingTicketMeta?.pricePerTon) > 0 ? String(closingTicketMeta?.pricePerTon) : "",',
  '          pricePerTon: open.freightMode === "ton" && Number(closingTicketMeta?.pricePerTon) > 0 ? String(closingTicketMeta?.pricePerTon) : (open.freightMode === "ton" && Number(closingTicketMeta?.routePricePerTon) > 0 ? String(closingTicketMeta?.routePricePerTon) : ""),',
  "route price fallback"
);

replaceRequired(
  'type PendingTicketMetadata = {\n  pricePerTon: number | null;\n  numeroTicket:',
  'type PendingTicketMetadata = {\n  pricePerTon: number | null;\n  routeGroup: string | null;\n  routeOrigin: string | null;\n  routeDestination: string | null;\n  routePricePerTon: number | null;\n  routeConfidence: number | null;\n  numeroTicket:',
  "route metadata type"
);

replaceRequired(
  '        <span>Destinatário: <b className="text-fg">{ticket.destinatario || "—"}</b></span>\n        <span>Produto:',
  '        <span>Destinatário: <b className="text-fg">{ticket.destinatario || "—"}</b></span>\n        {ticket.routeGroup ? <span className="sm:col-span-2">Rota identificada: <b className="text-fg">{ticket.routeGroup}</b>{ticket.routePricePerTon ? " · " + new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(ticket.routePricePerTon) + "/t" : ""}</span> : null}\n        <span>Produto:',
  "route display"
);

fs.writeFileSync(file, s);
console.log("[route-memory-caixa] learned route now prefills Caixa origin, destination and ton price");
