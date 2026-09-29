import fs from "node:fs";
import path from "node:path";

const target = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(target, "src"))) {
  throw new Error("share-to-chatgpt: expected reconstructed application directory");
}
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dst = (rel) => path.join(target, rel);
const src = (rel) => path.join(repo, rel);

function copy(from, to) {
  fs.mkdirSync(path.dirname(dst(to)), { recursive: true });
  fs.copyFileSync(src(from), dst(to));
}
function addImport(text, line, marker) {
  if (text.includes(marker)) return text;
  const matches = [...text.matchAll(/^import .*;\s*$/gm)];
  if (!matches.length) throw new Error("share-to-chatgpt: import block not found");
  const last = matches[matches.length - 1];
  const end = (last.index || 0) + last[0].length;
  return text.slice(0, end) + "\n" + line + text.slice(end);
}
function injectBefore(text, marker, insertion, label) {
  if (text.includes(insertion.trim())) return text;
  if (!text.includes(marker)) throw new Error("share-to-chatgpt: insertion point not found (" + label + ")");
  return text.replace(marker, insertion + marker);
}

copy("render-overrides/share-to-chatgpt-20260929.tsx", "src/components/share-to-chatgpt.tsx");

{
  const rel = "src/components/operational-file-reader.tsx";
  let s = fs.readFileSync(dst(rel), "utf8");
  s = addImport(
    s,
    'import { ShareToChatGPT } from "@/components/share-to-chatgpt";',
    'from "@/components/share-to-chatgpt"',
  );
  const marker = '        </div>\n      </div>\n\n      <input\n        ref={cameraRef}';
  s = injectBefore(
    s,
    marker,
    '          <ShareToChatGPT kind={expectedKind} />\n',
    "operational readers",
  );
  fs.writeFileSync(dst(rel), s);
}

{
  const rel = "src/components/financial-document-reader.tsx";
  let s = fs.readFileSync(dst(rel), "utf8");
  s = addImport(
    s,
    'import { ShareToChatGPT } from "@/components/share-to-chatgpt";',
    'from "@/components/share-to-chatgpt"',
  );
  const marker = '        </div>\n      </div>\n\n      <input\n        ref={fileInput}';
  s = injectBefore(
    s,
    marker,
    '          <ShareToChatGPT kind={kind} />\n',
    "financial readers",
  );
  fs.writeFileSync(dst(rel), s);
}

{
  const rel = "src/routes/motorista.tsx";
  let s = fs.readFileSync(dst(rel), "utf8");
  s = addImport(
    s,
    'import { ShareToChatGPT } from "@/components/share-to-chatgpt";',
    'from "@/components/share-to-chatgpt"',
  );
  const marker = '              {batchPhotos.length > 0 ? (';
  s = injectBefore(
    s,
    marker,
    '              <ShareToChatGPT kind="trip" className="mt-2" />\n',
    "driver trip launcher",
  );
  fs.writeFileSync(dst(rel), s);
}

console.log("[share-to-chatgpt] Android native share launcher added to trips, fueling, expenses, advances and driver mode");
