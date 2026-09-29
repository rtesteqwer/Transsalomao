// Shared by server OCR and the Android/browser fallback. Examples belong in
// tests; transactional values must always come from the current photograph.
export const FUELING_READER_VERSION = "2026-09-28-layouts-v2";
export const FUELING_MONEY_TOLERANCE = 0.02;

export const FUEL_RECEIPT_INSTRUCTIONS = [
  "Em cupons NFC-e/Linx, leia a área de itens: Qtde = litros, UN = L, Vl Unit = preço/L e o valor final pago vem de Valor Total/Valor Pago. O logotipo Linx NÃO é o nome do posto; use a razão social emitente.",
  "Em DANFE/Xpert/Fred Rosalem, QTD da linha OLEO DIESEL = litros, VL.UNIT = preço/L, Valor Total dos Produtos = bruto, Valor Descontos = desconto e Valor Total = total final pago.",
  "Em Nota Promissória do Posto Nevada, use a linha Produto/OLEO DIESEL: Qtd = litros, Unit = preço/L e Total = valor do abastecimento. A placa pode aparecer após Veículo:, mesmo sem a palavra Placa.",
  "Em ordem COOSSUTRAN, DIESEL = litros, o R$ na mesma linha é preço/L, o último TOTAL R$ é o valor final, Veículo Placa é a placa e a data pode vir separada em DIA / MÊS / ANO.",
  "O produto pode estar numa linha e os números na linha seguinte. Qtde. total de itens é contagem de produtos, NUNCA litros. Vencimento não é data do abastecimento.",
  "Leia todos os separadores: 1.000,00 significa mil reais; 156,495 litros significa 156.495 no JSON. Nunca remova vírgula/ponto de modo a multiplicar o valor por 100 ou 1000.",
  "Quando houver desconto, valide litros × preço/L − desconto ≈ total final. Diferença de arredondamento de centavos é aceitável; não altere litros/preço para forçar uma conta.",
  "Em nota com vários produtos ou mais de uma linha de diesel, não atribua total geral, pagamento, troco ou desconto global ao diesel sem separação segura. Sinalize conflito.",
].join("\n");

const folded = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// This normalization is idempotent: a dot in JSON is always decimal. The
// Brazilian thousands separator is removed only in an unambiguous locale form.
export function normalizeFuelDecimal(value: unknown): string | null {
  if (value == null || value === "") return null;
  let raw = String(value).trim().replace(/^R\$\s*/i, "").replace(/\s*(?:L|LT|LTS|LITROS)\.?$/i, "").trim();
  if (/^\d{1,3}(?:\.\d{3})+,\d+$/.test(raw)) raw = raw.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(?:,\d{3})+\.\d+$/.test(raw)) raw = raw.replace(/,/g, "");
  else if (/^\d+,\d+$/.test(raw)) raw = raw.replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const number = Number(raw);
  return Number.isFinite(number) && number > 0 && number <= 100_000_000 ? raw : null;
}

type ReceiptLine = { liters: string; price: string; gross: string | null };
export type FuelReceiptEvidence = {
  detected: boolean;
  ambiguous: boolean;
  multipleItems: boolean;
  line: ReceiptLine | null;
  fuelType: string | null;
};

export function readFuelReceiptLine(text: string): FuelReceiptEvidence {
  const lines = text.replace(/\r/g, "\n").split(/\n+/).map(line => line.trim()).filter(Boolean);
  const document = folded(text);
  const detected = /nota\s+fiscal|danfe|nfc[\s-]*e|cnpj|qtde.*un.*(?:unit|total)/.test(document) && /diesel/.test(document);
  const result: FuelReceiptEvidence = { detected, ambiguous: false, multipleItems: false, line: null, fuelType: null };
  if (!detected) return result;
  const itemCount = document.match(/(?:qtde\.?|qtd\.?|quantidade)\s*total\s*(?:de\s*)?itens\s*[:=]?\s*(\d+)/);
  result.multipleItems = !!itemCount && Number(itemCount[1]) > 1;
  const dieselIndexes = lines.map((line, index) => /\bdiesel\b/.test(folded(line)) ? index : -1).filter(index => index >= 0);
  const candidates: ReceiptLine[] = [];
  for (const index of dieselIndexes) {
    const description = folded(lines[index]);
    result.fuelType = /diesel\s*(?:b\s*)?s\s*[- ]?500/.test(description) ? "Diesel S500"
      : /diesel\s*(?:b\s*)?s\s*[- ]?10\b/.test(description) ? "Diesel S10" : "Diesel";
    const area = [lines[index]];
    for (const next of lines.slice(index + 1, index + 4)) {
      if (/diesel|gasolina|etanol|arla|subtotal|total\s+de\s+itens|valor\s+total|pagamento|cnpj|chave|protocolo|tributo/.test(folded(next))) break;
      area.push(next);
    }
    // Prefer the explicit liter unit. Some real layouts (Nevada/Xpert OCR)
    // collapse the QTD/UN columns and omit the "L" from the recognized row;
    // in that case require decimal-shaped quantity + decimal-shaped unit price
    // immediately after DIESEL so S10/S500, dates and document numbers cannot
    // become liters or price.
    const number = "(?:[0-9]{1,3}(?:\\.[0-9]{3})+,[0-9]{2,4}|[0-9]+(?:[.,][0-9]{1,4})?)";
    const explicitRow = new RegExp("(" + number + ")\\s+(?:L|LT|LTS|LITRO|LITROS)\\.?\\s+(?:R\\$\\s*[:\\-]?\\s*)?(" + number + ")(?:\\s+(?:R\\$\\s*)?(" + number + "))?", "i");
    const compactQuantity = "[0-9]{1,4}[.,][0-9]{2,3}";
    const compactPrice = "[0-9]{1,2}[.,][0-9]{2,3}";
    const compactMoney = "(?:[0-9]{1,3}(?:\\.[0-9]{3})*,[0-9]{2}|[0-9]+[.,][0-9]{2})";
    const compactRow = new RegExp("(" + compactQuantity + ")\\s+(?:L|LT|LTS|LITRO|LITROS)?\\.?\\s*(?:R\\$\\s*[:\\-]?\\s*)?(" + compactPrice + ")(?:\\s+(?:R\\$\\s*)?(" + compactMoney + "))?", "i");
    const joinedArea = area.join(" ");
    const match = joinedArea.match(explicitRow) || joinedArea.match(compactRow);
    if (!match) continue;
    const liters = normalizeFuelDecimal(match[1]);
    const price = normalizeFuelDecimal(match[2]);
    const gross = normalizeFuelDecimal(match[3]);
    if (!liters || !price || Number(liters) > 2500 || Number(price) < 2 || Number(price) > 20) continue;
    candidates.push({ liters, price, gross });
  }
  // Two diesel items cannot silently collapse into the first purchase.
  result.ambiguous = dieselIndexes.length > 1;
  if (candidates.length === 1 && !result.ambiguous) result.line = candidates[0];
  return result;
}

type ReadingCore = {
  document_type: string;
  liters: string | null;
  price_per_liter: string | null;
  total_amount: string | null;
  discount_amount: string | null;
  fuel_type: string | null;
  consistency: string;
  confidence: number;
  calculation_basis: string | null;
  alerts: string[];
  visual_hints: string[];
};

export function applyFuelReceiptLine<T extends ReadingCore>(reading: T, evidence: FuelReceiptEvidence): T {
  if (!evidence.detected) return reading;
  if (evidence.ambiguous) return {
    ...reading, liters: null, price_per_liter: null, total_amount: null,
    consistency: "conflict", confidence: Math.min(reading.confidence, 0.75),
    alerts: [...reading.alerts, "Há mais de uma linha de diesel. Separe os abastecimentos antes de gravar."],
  };
  if (!evidence.line) return reading;
  const { liters, price, gross } = evidence.line;
  const expectedGross = Number(liters) * Number(price);
  const discount = evidence.multipleItems ? 0 : Number(reading.discount_amount || 0);
  const grossMatches = !!gross && Math.abs(expectedGross - Number(gross)) <= FUELING_MONEY_TOLERANCE;
  const finalMatches = !!reading.total_amount && Math.abs(expectedGross - discount - Number(reading.total_amount)) <= FUELING_MONEY_TOLERANCE;
  const confirmed = !evidence.multipleItems && (discount ? finalMatches : grossMatches || finalMatches);
  const total = confirmed ? (discount ? reading.total_amount : grossMatches ? gross : reading.total_amount) : null;
  return {
    ...reading,
    document_type: "invoice",
    liters, price_per_liter: price, total_amount: total,
    discount_amount: evidence.multipleItems ? null : reading.discount_amount,
    fuel_type: evidence.fuelType || reading.fuel_type,
    consistency: confirmed ? "confirmed" : "conflict",
    confidence: confirmed ? Math.max(reading.confidence, 0.92) : Math.min(reading.confidence, 0.79),
    calculation_basis: confirmed ? "Linha do diesel: Qtde × Vl Unit confere com o total do combustível." : null,
    alerts: [...reading.alerts, ...(confirmed ? [] : [evidence.multipleItems
      ? "A nota contém outros itens. Confira o total e o desconto somente do diesel antes de gravar."
      : "Litros e preço/L foram lidos na linha do diesel, mas o total não pôde ser confirmado. Confira o total na foto antes de gravar."])],
    visual_hints: [...reading.visual_hints, "NFC-e: Qtde / UN L / Vl Unit / Total na linha do diesel"],
  };
}
