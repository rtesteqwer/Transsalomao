import fs from "node:fs";
import path from "node:path";

const target = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(target, "src"))) {
  throw new Error("felipe-ia-bridge: expected reconstructed application directory");
}
const repo = process.cwd();

function copy(from, to) {
  const source = path.join(repo, from);
  const destination = path.join(target, to);
  if (!fs.existsSync(source)) throw new Error("felipe-ia-bridge missing " + from);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

copy("render-overrides/felipe-ia-bridge-20261003.ts", "src/routes/api/felipe-ia-bridge.ts");
copy("render-overrides/felipe-ia-bridge-20261003.py", "public/felipe-ia-bridge.py");
copy("render-overrides/felipe-ia-link-20261003.sh", "public/felipe-ia-link.sh");

const helper = String.raw`
const FELIPE_IA_BRIDGE_VERSION = "2026.10.03.1";

async function felipeBridge(action: string, extra: Record<string, unknown> = {}) {
  const response = await api("/api/felipe-ia-bridge", {
    method: "POST",
    headers: { "X-Salomao-App": "1" },
    body: JSON.stringify({ action, ...extra }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(data?.code || data?.error || "FELIPE_IA_BRIDGE_ERROR"));
  }
  return data as any;
}

async function sendViaFelipeIA(message: string, history: Turn[]) {
  const worker = await felipeBridge("worker_status");
  if (!worker?.online) throw new Error("FELIPE_IA_OFFLINE");

  const queued = await felipeBridge("enqueue", {
    message,
    history: history.slice(-30),
  });
  const id = String(queued?.id || "");
  if (!id) throw new Error("FELIPE_IA_QUEUE_FAILED");

  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => window.setTimeout(resolve, 900));
    const result = await felipeBridge("status", { id });
    const status = String(result?.status || "");

    if (status === "done") {
      const answer = String(result?.answer || "").trim();
      if (!answer) throw new Error("FELIPE_IA_EMPTY");
      return answer;
    }
    if (status === "failed") {
      throw new Error(String(result?.error || "FELIPE_IA_FAILED"));
    }
    if (status === "cancelled") {
      throw new Error("FELIPE_IA_CANCELLED");
    }
  }

  try {
    await felipeBridge("cancel", { id });
  } catch {}
  throw new Error("FELIPE_IA_TIMEOUT");
}
`;

function patchAssistantPage(rel) {
  const file = path.join(target, rel);
  if (!fs.existsSync(file)) throw new Error("felipe-ia-bridge missing generated route " + rel);

  let s = fs.readFileSync(file, "utf8");
  if (s.includes('const FELIPE_IA_BRIDGE_VERSION = "2026.10.03.1";')) {
    console.log("[felipe-ia-bridge] already patched " + rel);
    return;
  }

  const componentMarker = "\nfunction SalomaoWeb() {";
  if (!s.includes(componentMarker)) throw new Error("felipe-ia-bridge component marker missing in " + rel);
  s = s.replace(componentMarker, helper + componentMarker);

  const stateMarker = '  const [activeChangeId, setActiveChangeId] = useState("");';
  if (!s.includes(stateMarker)) throw new Error("felipe-ia-bridge state marker missing in " + rel);
  s = s.replace(
    stateMarker,
    stateMarker + '\n  const [felipeIaOnline, setFelipeIaOnline] = useState(false);'
  );

  const sessionEffect = String.raw`  useEffect(() => {
    void checkSession();
  }, []);
`;
  if (!s.includes(sessionEffect)) throw new Error("felipe-ia-bridge session effect missing in " + rel);
  const bridgeEffect = sessionEffect + String.raw`
  useEffect(() => {
    if (session.status !== "ready") {
      setFelipeIaOnline(false);
      return;
    }
    let cancelled = false;
    const check = async () => {
      try {
        const result = await felipeBridge("worker_status");
        if (!cancelled) setFelipeIaOnline(Boolean(result?.online));
      } catch {
        if (!cancelled) setFelipeIaOnline(false);
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [session.status]);
`;
  s = s.replace(sessionEffect, bridgeEffect);

  const sendMarker = String.raw`    try {
      const isFelipe = session.username.trim().toLowerCase() === "felipe";
      const target = developerMode && isFelipe ? "/api/assistant/developer" : "/api/assistant";
`;
  if (!s.includes(sendMarker)) throw new Error("felipe-ia-bridge send marker missing in " + rel);
  const sendReplacement = String.raw`    try {
      const isFelipe = session.username.trim().toLowerCase() === "felipe";

      if (!(developerMode && isFelipe)) {
        try {
          const localAnswer = await sendViaFelipeIA(message, prior);
          if (localAnswer) {
            setFelipeIaOnline(true);
            setHistory((current) => [...current, { role: "assistant", content: localAnswer }]);
            return;
          }
        } catch {
          setFelipeIaOnline(false);
        }
      }

      const target = developerMode && isFelipe ? "/api/assistant/developer" : "/api/assistant";
`;
  s = s.replace(sendMarker, sendReplacement);

  s = s.replaceAll(
    "{session.model} • Trans Salomão",
    '{felipeIaOnline ? "Felipe IA local" : session.model} • Trans Salomão'
  );
  s = s.replaceAll(
    '}{session.model} • {session.username}',
    '}{felipeIaOnline ? "Felipe IA local" : session.model} • {session.username}'
  );

  const capabilityText = "                Pode consultar dados e executar os mesmos comandos autorizados do aplicativo.";
  if (s.includes(capabilityText)) {
    s = s.replace(
      capabilityText,
      '                {felipeIaOnline ? "Felipe IA do Ubuntu conectado. " : "Felipe IA do Ubuntu offline; usando o modo atual. "}Pode consultar dados e executar os mesmos comandos autorizados do aplicativo.'
    );
  }

  fs.writeFileSync(file, s);
  console.log("[felipe-ia-bridge] patched " + rel);
}

patchAssistantPage("src/routes/salomao-ia.tsx");
patchAssistantPage("src/routes/trans-salomao-ia.tsx");

console.log("[felipe-ia-bridge] relay API, Ubuntu worker and web routing installed");
