import fs from "node:fs";
import path from "node:path";

const target = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(target, "src"))) {
  throw new Error("mobile-report-retry-get: target missing");
}

const file = path.join(target, "src/routes/api/baixar-relatorio.ts");
fs.mkdirSync(path.dirname(file), { recursive: true });

fs.writeFileSync(file, `import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { createFileRoute } from "@tanstack/react-router";

const MAX_BASE64_LENGTH = 16_000_000;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const DOWNLOAD_TTL_MINUTES = 15;

function safeFilename(value: unknown) {
  const raw = String(value || "Relatorio_Trans_Salomao.pdf")
    .replace(/[\\r\\n\\t]/g, " ")
    .replace(/[\\\\/:*?"<>|]+/g, "-")
    .replace(/\\s+/g, " ")
    .trim()
    .slice(0, 180);
  return raw || "Relatorio_Trans_Salomao.pdf";
}

function asciiFilename(fileName: string) {
  return fileName
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .replace(/[^A-Za-z0-9._ -]+/g, "")
    .replace(/\\s+/g, "_")
    .slice(0, 150) || "relatorio";
}

function contentDisposition(fileName: string) {
  const asciiName = asciiFilename(fileName);
  return "attachment; filename=" + JSON.stringify(asciiName) + "; filename*=UTF-8''" + encodeURIComponent(fileName);
}

function db() {
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) throw new Error("DATABASE_URL ausente");
  return neon(databaseUrl);
}

async function ensureTable(sql: ReturnType<typeof neon>) {
  await sql\`
    CREATE TABLE IF NOT EXISTS report_downloads (
      token TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      mime TEXT NOT NULL,
      base64 TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  \`;
}

export const Route = createFileRoute("/api/baixar-relatorio")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const requestUrl = new URL(request.url);
          const origin = request.headers.get("origin");
          if (origin && origin !== requestUrl.origin) {
            return new Response("Origem não permitida.", { status: 403 });
          }

          const form = await request.formData();
          const fileName = safeFilename(form.get("fileName"));
          const mime = String(form.get("mime") || "");
          const base64 = String(form.get("base64") || "").replace(/\\s+/g, "");

          if (!ALLOWED_MIME.has(mime)) {
            return new Response("Tipo de arquivo não permitido.", { status: 400 });
          }
          if (!base64 || base64.length > MAX_BASE64_LENGTH || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
            return new Response("Arquivo inválido ou muito grande.", { status: 413 });
          }

          const bytes = Buffer.from(base64, "base64");
          if (!bytes.length) return new Response("Arquivo vazio.", { status: 400 });
          if (mime === "application/pdf" && bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
            return new Response("PDF inválido.", { status: 400 });
          }

          const sql = db();
          await ensureTable(sql);
          await sql\`DELETE FROM report_downloads WHERE expires_at < NOW()\`;

          const token = randomUUID().replace(/-/g, "");
          await sql\`
            INSERT INTO report_downloads (token, file_name, mime, base64, expires_at)
            VALUES (
              \${token},
              \${fileName},
              \${mime},
              \${base64},
              NOW() + (\${DOWNLOAD_TTL_MINUTES}::text || ' minutes')::interval
            )
          \`;

          const location = "/api/baixar-relatorio?token=" + encodeURIComponent(token);
          return new Response(null, {
            status: 303,
            headers: {
              "Location": location,
              "Cache-Control": "no-store, max-age=0",
            },
          });
        } catch (error) {
          console.error("[report-download-post]", error);
          return new Response("Não foi possível preparar o arquivo.", { status: 500 });
        }
      },

      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const token = String(url.searchParams.get("token") || "").trim();
          if (!/^[a-f0-9]{32}$/i.test(token)) {
            return new Response("Link de relatório inválido.", { status: 400 });
          }

          const sql = db();
          await ensureTable(sql);
          const rows = await sql\`
            SELECT file_name, mime, base64
            FROM report_downloads
            WHERE token = \${token}
              AND expires_at >= NOW()
            LIMIT 1
          \`;
          const item = rows[0] as any;
          if (!item) {
            return new Response("Este link expirou. Gere o relatório novamente.", { status: 404 });
          }

          const fileName = safeFilename(item.file_name);
          const mime = String(item.mime || "");
          if (!ALLOWED_MIME.has(mime)) {
            return new Response("Tipo de arquivo inválido.", { status: 400 });
          }

          const bytes = Buffer.from(String(item.base64 || ""), "base64");
          if (!bytes.length) return new Response("Arquivo vazio.", { status: 404 });
          if (mime === "application/pdf" && bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
            return new Response("PDF inválido.", { status: 422 });
          }

          return new Response(bytes, {
            status: 200,
            headers: {
              "Content-Type": mime,
              "Content-Length": String(bytes.length),
              "Content-Disposition": contentDisposition(fileName),
              "Cache-Control": "private, no-store, max-age=0",
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch (error) {
          console.error("[report-download-get]", error);
          return new Response("Não foi possível baixar o arquivo.", { status: 500 });
        }
      },
    },
  },
});
`);

console.log("[mobile-report-retry-get] POST now redirects to a stable GET download URL for Android/PDF viewers");
