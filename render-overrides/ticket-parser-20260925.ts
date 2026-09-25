import { TicketError, normalizeTicket, ticketForMode, type TicketData, type TicketFreightMode } from "@/lib/ticket-core";

export type FleetPlates = { tractorPlate?: string; trailerPlate?: string };
const folded = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
const plate = (s: unknown) => {
  const p = typeof s === "string" ? folded(s).replace(/[^A-Z0-9]/g, "") : "";
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(p) ? p : null;
};
const platePattern = /\b[A-Z]{3}[ -]*[0-9][A-Z0-9][0-9]{2}\b|\b[A-Z]\s+[A-Z]\s+[A-Z]\s+[0-9]\s+[A-Z0-9]\s+[0-9]\s+[0-9]\b/g;

function editDistance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = old;
    }
  }
  return row[b.length];
}

function plateSeenApproximately(raw: string, expected: string | null) {
  if (!expected) return false;
  for (const line of folded(raw).split(/\n+/)) {
    const chunks = line.match(/[A-Z0-9-]{2,12}/g) || [];
    for (let start = 0; start < chunks.length; start++) {
      let candidate = "";
      for (let end = start; end < Math.min(chunks.length, start + 3); end++) {
        candidate += chunks[end].replace(/[^A-Z0-9]/g, "");
        if (candidate.length < 5) continue;
        if (candidate.length > 9) break;
        if (candidate[0] !== expected[0] || candidate.slice(-2) !== expected.slice(-2)) continue;
        if (editDistance(candidate, expected) <= 2) return true;
      }
    }
  }
  return false;
}

export function missingTicketFields(d: TicketData, mode: TicketFreightMode) {
  const missing = ["numero_ticket", "placa_veiculo", "placa_carreta", "transportadora"].filter(k => !d[k as keyof TicketData]);
  if (mode === "ton" && !d.peso_liquido_kg) missing.push("peso_liquido_kg");
  if (!d.operadora && !d.contratante && !d.destinatario) missing.push("operadora/contratante/destinatario");
  return missing;
}

// Only extracted plate values may be assigned from a selected fleet. Never fill a
// plate from the registry when that plate did not occur in the document.
export function finishTicketReading(value: unknown, mode: TicketFreightMode, fleet: FleetPlates = {}): TicketData {
  const d = ticketForMode(normalizeTicket(value), mode);
  const detected = d.placas_detectadas || [];
  const tractor = plate(fleet.tractorPlate), trailer = plate(fleet.trailerPlate);
  if (!d.placa_veiculo && tractor && detected.includes(tractor)) d.placa_veiculo = tractor;
  if (!d.placa_carreta && trailer && detected.includes(trailer)) d.placa_carreta = trailer;
  if (detected.length === 2 && d.placa_veiculo && !d.placa_carreta) d.placa_carreta = detected.find(p => p !== d.placa_veiculo) || null;
  if (detected.length === 2 && d.placa_carreta && !d.placa_veiculo) d.placa_veiculo = detected.find(p => p !== d.placa_carreta) || null;
  if (d.placa_veiculo && d.placa_veiculo === d.placa_carreta) {
    d.placa_carreta = null;
    d.alertas.push("A mesma placa foi lida nos dois campos. Confira a placa da carreta.");
  }
  if (detected.length && (!d.placa_veiculo || !d.placa_carreta)) d.alertas.push("Placas encontradas sem identificação segura de cavalo/carreta. Confira com o conjunto selecionado.");
  for (const [name, cnpj] of [["transportadora", "transportadora_cnpj"], ["destinatario", "destinatario_cnpj"]] as const) {
    const digits = (s: string | null) => (s || "").replace(/\D/g, "");
    if (digits(d[name]).length === 14 && /[A-Za-zÀ-ÿ]/.test(d[cnpj] || "")) [d[name], d[cnpj]] = [d[cnpj], digits(d[name])];
    if (d[cnpj]) d[cnpj] = digits(d[cnpj]).length === 14 ? digits(d[cnpj]) : null;
    if (d[name] && !/[A-Za-zÀ-ÿ]/.test(d[name]!)) d[name] = null;
  }
  if (mode === "ton" && d.pesagem_inicial_kg != null && d.pesagem_final_kg != null) {
    const difference = Math.abs(d.pesagem_inicial_kg - d.pesagem_final_kg);
    if ((!d.peso_liquido_kg || d.peso_liquido_kg < 1000) && difference >= 1000 && difference <= 100000) {
      d.peso_liquido_kg = difference;
      d.alertas = d.alertas.filter(a => !/^Peso líquido/.test(a));
      d.alertas.push(`Peso líquido calculado pela diferença das pesagens: ${difference} kg. Confira com a foto.`);
    }
  }
  d.campos_ausentes = missingTicketFields(d, mode);
  d.alertas = [...new Set(d.alertas.filter(a => !a.startsWith("Leitura incompleta:")))];
  if (d.campos_ausentes.length) d.alertas.push("Leitura incompleta: confira e preencha os campos destacados antes de lançar.");
  return d;
}

function weightNumber(raw: string, unit: string) {
  let value = raw.replace(/\s/g, "");
  const tons = /^(T|TON|TONELADAS?)$/i.test(unit);
  // In tonnes a lone comma/dot is a decimal separator (35,810 t = 35810 kg).
  if (tons && /^\d{1,3}[.,]\d{1,3}$/.test(value)) value = value.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(value)) value = value.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(value)) value = value.replace(/,/g, "");
  else value = value.replace(",", ".");
  const n = Number(value) * (tons ? 1000 : 1);
  const rounded = Math.round(n);
  return Number.isFinite(n) && n >= 0 && n <= 200000 && Math.abs(n - rounded) < 0.000001 ? rounded : null;
}

export function parseTicketOcr(text: string, mode: TicketFreightMode, fleet: FleetPlates = {}): TicketData {
  const raw = String(text || "").replace(/\r\n?/g, "\n").slice(0, 30000);
  if (raw.replace(/\s/g, "").length < 8) throw new TicketError(422, "A leitura local não encontrou texto suficiente. Tire outra foto mais nítida.");
  const lines = raw.split(/\n+/).map(s => s.replace(/[ \t]+/g, " ").trim()).filter(Boolean);
  const joined = folded(lines.join("\n"));
  const model = /MULTIL[IA]FT/.test(joined) ? "multilift" : /ADUBOS\s+REAL/.test(joined) ? "adubos_real"
    : /PLACA\s+DO\s+VEICULO|PESO\s+LIQUIDO\s+DE\s+ENTRADA/.test(joined) ? "log_consulting"
    : /TICKET\s+AGEND|BERCO/.test(joined) ? "vports_recibo"
    : /NUMERO\s+(?:DO\s+)?TICKET|PLACA\s+CARRETA/.test(joined) ? "vports_relatorio" : "desconhecido";
  const separator = "[\\s.:#=º°°_—–-]*";
  const labels = "(?:PLACA|CARRETA|VEIC|MOTORISTA|OPERACAO|TRANSPORTADORA|EMPRESA|DESTINATARIO|REMETENTE|PRODUTO|NOTA FISCAL|PESO|PESAGEM|TARA|BRUTO|LIQUIDO|STATUS|NAVIO|BERCO|CNPJ|RAZAO SOCIAL|EMISSOR|ITEM|DATA|HORA|SETOR|OPERADOR|TICKET|TIQUETE)";
  const isLabel = (s: string) => new RegExp("^" + labels + "\\b").test(folded(s));
  function field(label: string) {
    const pattern = new RegExp("(?:^|\\s)(?:" + label + ")\\b" + separator, "i");
    for (let i = 0; i < lines.length; i++) {
      const hit = folded(lines[i]).match(pattern);
      if (!hit) continue;
      let value = lines[i].slice((hit.index || 0) + hit[0].length).trim();
      if (!value && lines[i + 1] && !isLabel(lines[i + 1])) value = lines[i + 1];
      // Stop before a second labeled column, preserving the first field's value.
      const boundary = folded(value).search(new RegExp("\\s+" + labels + "\\b\\s*[:.]"));
      if (boundary >= 0) value = value.slice(0, boundary);
      if (value) return value.slice(0, 200);
    }
    return null;
  }
  function company(label: string) {
    const value = field(label);
    if (value && !/^(CNPJ|RAZAO SOCIAL)\b/.test(folded(value)) && /[A-Za-zÀ-ÿ]/.test(value)) return value.replace(/^\d+\s*[-–]\s*/, "");
    const start = lines.findIndex(s => new RegExp("^(?:" + label + ")\\b").test(folded(s)));
    if (start < 0) return null;
    for (const line of lines.slice(start + 1, start + 6)) {
      const u = folded(line);
      if (/^(DESTINATARIO|REMETENTE|TRANSPORTADORA|NUMERO NF|MOTORISTA|PESAGEM)\b/.test(u)) break;
      const hit = u.match(/^(?:RAZAO\s+SOCIAL|CNPJ|NOME)[\s.:\-]*/);
      if (hit) {
        const candidate = line.slice(hit[0].length).trim();
        if (/[A-Za-zÀ-ÿ]/.test(candidate)) return candidate.slice(0, 200);
      }
    }
    return null;
  }
  function readWeight(label: string) {
    const pattern = new RegExp("(?:^|\\s)(?:" + label + ")\\b" + separator + "([0-9]+(?:[.,][0-9]+)*)(?:[ \\t]*(KG|KGS|TONELADAS?|TON|T)\\b)?", "gm");
    for (const hit of joined.matchAll(pattern)) {
      const n = weightNumber(hit[1], hit[2] || "");
      if (n != null) return n;
    }
    // Multilift puts Peso on a separate line inside each Pesagem block.
    const start = lines.findIndex(s => new RegExp("^(?:" + label + ")\\b").test(folded(s)));
    if (start >= 0) for (const line of lines.slice(start + 1, start + 5)) {
      if (/^(PESAGEM|PESO LIQUIDO)/.test(folded(line))) break;
      const hit = folded(line).match(/^PESO[\s.:=-]*([0-9]+(?:[.,][0-9]+)*)\s*(KG|T)?/);
      if (hit) return weightNumber(hit[1], hit[2] || "");
    }
    return null;
  }
  let numero: string | null = null;
  for (const line of lines) {
    const u = folded(line);
    if (/TICKET\s+AGEND/.test(u)) continue;
    const hit = u.match(/(?:^|\s)(?:(?:NUMERO|N[º°])\s+(?:DO\s+)?(?:TICKET|TIQUETE)|(?:TICKET|TIQUETE|TIQUET|ROMANEIO|COMPROVANTE)(?:\s+DE\s+PESAGEM)?)(?:\s*(?:NUMERO|N[Oº°.]?))?[\s.:#=–-]*([0-9][A-Z0-9/-]{1,29})\b/);
    if (hit) { numero = hit[1]; break; }
  }
  // A filename, NF, CNPJ, schedule number, or title is never a physical ticket.
  const detected = [...new Set((joined.match(platePattern) || []).map(plate).filter((p): p is string => !!p))];
  const tractorFromEvidence = plate(fleet.tractorPlate);
  const trailerFromEvidence = plate(fleet.trailerPlate);
  const labeledPlate = (label: string) => {
    const value = field(label);
    return value ? plate((folded(value).match(platePattern) || [])[0]) : null;
  };
  const vehicle = labeledPlate("PLACA\\s+(?:DO\\s+)?(?:VEICULO|CAVALO)|VEIC(?:ULO)?\\.?\\s*/\\s*CAVALO|CAVALO|PLACA(?!S|\\s+(?:DA|CARRETA))");
  const trailer = labeledPlate("PLACA\\s+(?:DA\\s+)?CARRETA|CARRETA|REBOQUE");
  const headerCompany = /MULTIL[IA]FT\s+LOGISTICA\s+LTDA/.test(joined) ? "Multilift Logística Ltda" : null;
  let transportadora = company("TRANSPORTADORA|TRANSP\\.");
  if (model === "multilift" && headerCompany && (!transportadora || transportadora.length <= 10 || /MULTIL/.test(folded(transportadora)))) {
    transportadora = headerCompany;
  }
  let vehicleFromOcr = vehicle;
  let trailerFromOcr = trailer;
  if (!vehicleFromOcr && tractorFromEvidence && plateSeenApproximately(raw, tractorFromEvidence)) vehicleFromOcr = tractorFromEvidence;
  if (!trailerFromOcr && trailerFromEvidence && plateSeenApproximately(raw, trailerFromEvidence)) trailerFromOcr = trailerFromEvidence;
  const contextualPlateAlerts: string[] = [];
  if (model === "multilift" && trailerFromOcr && trailerFromEvidence && trailerFromOcr === trailerFromEvidence && !vehicleFromOcr && tractorFromEvidence) {
    vehicleFromOcr = tractorFromEvidence;
    contextualPlateAlerts.push("Placa do veículo confirmada pelo conjunto selecionado após a carreta ser reconhecida no ticket.");
  }
  if (model === "multilift" && vehicleFromOcr && tractorFromEvidence && vehicleFromOcr === tractorFromEvidence && !trailerFromOcr && trailerFromEvidence) {
    trailerFromOcr = trailerFromEvidence;
    contextualPlateAlerts.push("Placa da carreta confirmada pelo conjunto selecionado após o veículo ser reconhecido no ticket.");
  }
  const data = {
    numero_ticket: numero, model_type: model,
    status: field("STATUS"), placa_veiculo: vehicleFromOcr, placa_carreta: trailerFromOcr, placas_detectadas: detected,
    produto: field("PRODUTO|MERCADORIA|ITEM"), motorista: field("MOTORISTA"),
    transportadora,
    destinatario: company("DESTINATARIO|RECEBEDOR"), contratante: company("EMPRESA\\s+CONTRATANTE|CONTRATANTE|TOMADOR|EMPRESA"),
    operadora: model === "multilift" ? null : company("OPERADORA|OPERADOR"),
    operador_pesagem: model === "multilift" ? field("OPERADOR") : null,
    remetente: company("REMETENTE"), cliente: company("CLIENTE"),
    empresa_documento: model === "adubos_real" ? "ADUBOS REAL S.A." : model === "multilift" ? headerCompany : null,
    navio: field("NAVIO(?!\\s+(?:ORIGEM|DESTINO))"), navio_origem: field("NAVIO\\s+ORIGEM"), navio_destino: field("NAVIO\\s+DESTINO"),
    emissor: field("EMISSOR"), numero_nf: field("NUMERO\\s+NF|NOTA\\s+FISCAL|NF-E|NFE"),
    pesagem_inicial_kg: mode === "ton" ? readWeight("PESO\\s+LIQUIDO\\s+DE\\s+ENTRADA|PESO\\s+ENTRADA|PESO\\s+BRUTO|BRUTO|PESAGEM\\s+INICIAL") : null,
    pesagem_final_kg: mode === "ton" ? readWeight("PESO\\s+LIQUIDO\\s+DE\\s+SAIDA|PESO\\s+SAIDA|PESO\\s+TARA|TARA|PESAGEM\\s+FINAL") : null,
    peso_liquido_kg: mode === "ton" ? readWeight("(?:PESO\\s+)?LIQUI(?:DO)?(?!\\s+(?:DE\\s+)?(?:ENTRADA|SAIDA))") : null,
    alertas: ["Leitura feita pelo OCR local da Salomão IA. Confira os dados com a foto antes de lançar.", ...contextualPlateAlerts],
  };
  if (mode === "ton" && model === "multilift" && data.peso_liquido_kg == null) {
    const netIndex = lines.findIndex(line => /^PESO\s+LIQ/i.test(folded(line)) || /^LIQ/i.test(folded(line)));
    if (netIndex >= 0) {
      for (const line of lines.slice(netIndex, netIndex + 4)) {
        const hit = folded(line).match(/(?:^|[^0-9])([0-9]{1,3}(?:[.,][0-9]{3})|[0-9]{4,6})\s*(KG|KGS|T|TON)?\b/);
        if (!hit) continue;
        const n = weightNumber(hit[1], hit[2] || "KG");
        if (n != null && n >= 1000) { data.peso_liquido_kg = n; break; }
      }
    }
  }
  if (model === "adubos_real" && !data.destinatario) data.destinatario = data.empresa_documento;
  return finishTicketReading(data, mode, fleet);
}
