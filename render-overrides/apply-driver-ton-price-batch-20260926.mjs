import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const target = process.argv[2];
if (!target || !fs.existsSync(path.join(target, 'src'))) throw new Error('driver-ton-price-batch: expected app source');
const source = path.dirname(fileURLToPath(import.meta.url));
function edit(relative, changes) {
  const file = path.join(target, relative);
  let text = fs.readFileSync(file, 'utf8');
  for (const [before, after] of changes) {
    if (text.includes(after)) continue;
    if (!text.includes(before)) throw new Error('driver-ton-price-batch: baseline changed in ' + relative + ': ' + before.slice(0, 100));
    text = text.replace(before, after);
  }
  fs.writeFileSync(file, text);
}

fs.copyFileSync(path.join(source, 'driver-ton-price-batch.tsx'), path.join(target, 'src/components/driver-ton-price-batch.tsx'));
edit('src/routes/motorista.tsx', [
  ['import { TicketPhotoAccess, type PhotoAccess }', 'import { DriverTonPriceBatch } from "@/components/driver-ton-price-batch";\nimport { TicketPhotoAccess, type PhotoAccess }'],
  ['  dailyValue: number;\n  imagem?: string;', '  dailyValue: number;\n  pricePerTon?: number;\n  imagem?: string;'],
  ['  const [ticketReadError, setTicketReadError] = useState("");', '  const [ticketReadError, setTicketReadError] = useState("");\n  const [priceBatchMode, setPriceBatchMode] = useState(true);\n  const [priceBatchPending, setPriceBatchPending] = useState(false);'],
  ['disabled={isLoading || drivers.length === 0}', 'disabled={isLoading || drivers.length === 0 || priceBatchPending}'],
  ['disabled={isLoading || fleets.length === 0}', 'disabled={isLoading || fleets.length === 0 || priceBatchPending}'],
  ['                  aria-pressed={freightMode === mode}', '                  aria-pressed={freightMode === mode}\n                  disabled={priceBatchPending}'],
  ['    e.preventDefault();\n    const tonsN', '    e.preventDefault();\n    if (freightMode === "ton" && priceBatchMode) return;\n    const tonsN'],
  ['Escolha motorista, conjunto e o modo de frete. Em Cegonha e Caixinha você pode lançar várias viagens de uma vez.', 'Escolha motorista, conjunto e o modo de frete. Leia várias fotos e aplique o mesmo preço por tonelada às viagens selecionadas.'],
  ['? "Selecione uma ou várias fotos. O ChatGPT lê cada uma e envia automaticamente cada ticket válido ao Caixa da Gerência."', '? (priceBatchMode ? "Leia as fotos, confira as viagens e aplique o preço do grupo antes de enviar ao Caixa." : "Selecione uma ou várias fotos. Cada ticket válido é enviado automaticamente ao Caixa para a gerência definir o preço.")'],
  ['              <TicketPhotoAccess onAccess={setTicketAccess} />\n              <div className="grid grid-cols-2 gap-3">', `              <TicketPhotoAccess onAccess={setTicketAccess} />
              {freightMode === "ton" ? <label className="flex min-h-12 items-center gap-3 rounded-lg border border-border p-3 text-sm font-semibold">
                <input type="checkbox" className="size-5" checked={priceBatchMode} disabled={priceBatchPending || batchPhotos.length > 0} onChange={event => setPriceBatchMode(event.target.checked)} />
                Conferir fotos e definir preço em lote
              </label> : null}
              {freightMode === "ton" && priceBatchMode ? <DriverTonPriceBatch
                available={!!ticketAccess?.authenticated && ticketAccess.available && !!driverId && !!fleetId}
                upload={uploadSelectedPhotoFile}
                read={(image, fileName) => lerTicket(image, "ton", fleet ? { tractorPlate: fleet.tractorPlate, trailerPlate: fleet.trailerPlate } : undefined, fileName)}
                save={(dados, pricePerTon) => salvarTicket({ ...dados, conferido: true, driverId, fleetId, freightMode: "ton", dailyValue: 0, km_carreta: 0, pricePerTon })}
                link={(photoId, fileName, saved, dados) => linkSelectedPhoto(photoId, "", fileName, saved, dados)}
                onBusy={setTicketSending}
                onPending={setPriceBatchPending}
                onSaved={() => queryClient.invalidateQueries({ queryKey: fleetKey })}
              /> : <>
              <div className="grid grid-cols-2 gap-3">`],
  ['            </section>\n\n          {freightMode === "cegonha"', '              </>}\n            </section>\n\n          {!(freightMode === "ton" && priceBatchMode) ? <>\n          {freightMode === "cegonha"'],
  ['          </Button>\n          </fieldset>', '          </Button>\n          </> : null}\n          </fieldset>'],
]);

// Store a proposed ton price with the ticket metadata, without schema changes.
// Existing duplicate tickets keep their original price and report.
edit('src/lib/ticket-core.ts', [
  ['  const photo = body.imagem ? validateImage(body) : null;', `  const pricePerTon = freightMode === "ton" && body.pricePerTon != null ? body.pricePerTon : null;
  if (pricePerTon != null && (typeof pricePerTon !== "number" || !Number.isFinite(pricePerTon) || pricePerTon <= 0 || pricePerTon > 100_000_000)) {
    throw new TicketError(400, "Informe um preço por tonelada válido, maior que zero.");
  }
  const photo = body.imagem ? validateImage(body) : null;`],
  ['    dailyValue: dailyValueRaw,\n    freightMode,', '    dailyValue: dailyValueRaw,\n    pricePerTon,\n    freightMode,'],
  ['const { ticket: d, driverId, fleetId, km, tons, dailyValue, freightMode, photo } = data;', 'const { ticket: d, driverId, fleetId, km, tons, dailyValue, pricePerTon, freightMode, photo } = data;'],
  ['${reportId}, ${JSON.stringify(d)}::jsonb, ${freightMode}', '${reportId}, ${JSON.stringify({ ...d, price_per_ton: pricePerTon })}::jsonb, ${freightMode}'],
]);
edit('src/routes/api/ticket-meta.ts', [
  ['          numeroTicket: row.numero_ticket,', '          numeroTicket: row.numero_ticket,\n          pricePerTon: (row.ticket_data as Record<string, unknown> | null)?.price_per_ton ?? null,'],
]);
edit('src/routes/dono/lancamentos.tsx', [
  ['          pricePerTrip: open.freightMode', '          pricePerTon: open.freightMode === "ton" && Number(closingTicketMeta?.pricePerTon) > 0 ? String(closingTicketMeta?.pricePerTon) : "",\n          pricePerTrip: open.freightMode'],
  ['type PendingTicketMetadata = {\n  numeroTicket:', 'type PendingTicketMetadata = {\n  pricePerTon: number | null;\n  numeroTicket:'],
]);
edit('src/lib/api.ts', [
  ['      const tripId = newId("trip");\n      const created = report.created_at;', `      const ticketPrices = mode === "ton" ? await sql<{ ticket_data: Record<string, unknown> | null }>
        \`select ticket_data from tickets_balanca where report_id = \${reportId} order by id desc limit 1\` : [];
      const proposedPrice = Number(ticketPrices[0]?.ticket_data?.price_per_ton);
      const pricePerTon = Number.isFinite(proposedPrice) && proposedPrice > 0 && proposedPrice <= 100_000_000 ? proposedPrice : 0;
      // A ton trip without a price still needs management review before closing.
      if (mode === "ton" && (pricePerTon <= 0 || num(report.tons) <= 0)) { needsReview += 1; continue; }
      const tripId = newId("trip");
      const created = report.created_at;`],
  ['${tons}, 0, ${tons}, ${mode}, 0, ${price}, ${kmStart}', '${tons}, 0, ${tons}, ${mode}, ${pricePerTon}, ${price}, ${kmStart}'],
]);

// Linking an uploaded photo by its ID avoids keeping/reposting every base64
// image on mobile. Authorization and ownership checks still run before updates.
edit('src/routes/api/photo-intake.ts', [
  ['        const image = String(body?.image || "");', '        const image = String(body?.image || "");\n        const storedPhotoOnly = !image && !!String(body?.photoId || "").trim();'],
  ['        if (!image.startsWith("data:image/") || image.length > 3_000_000)', '        if (!storedPhotoOnly && (!image.startsWith("data:image/") || image.length > 3_000_000))'],
  ['        await sql`\n          insert into trip_ticket_photos', '        if (storedPhotoOnly) return json({ ok: false, message: "Foto salva não encontrada. Envie a foto novamente." }, 404);\n\n        await sql`\n          insert into trip_ticket_photos'],
]);
console.log('[driver-ton-price-batch] photo review, group prices and Caixa price persistence installed');
