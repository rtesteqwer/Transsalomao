import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/salomao-ia")({ component: SalomaoWeb });

type Turn = { role: "user" | "assistant"; content: string };
type SessionState =
  | { status: "checking"; username: ""; model: "" }
  | { status: "guest"; username: ""; model: "" }
  | { status: "ready"; username: string; model: string };

const TOKEN_KEY = "salomao_web_token";
const HISTORY_KEY = "salomao_web_history";

function getToken() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(TOKEN_KEY) || "";
}

function setToken(token: string) {
  if (typeof window === "undefined") return;
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

async function api(path: string, init: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(init.headers || {});
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", "Bearer " + token);
  return fetch(path, { ...init, headers, credentials: "same-origin", cache: "no-store" });
}

function readHistory(): Turn[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .slice(-40)
      .map((x: any) => ({
        role: x?.role === "user" ? "user" : "assistant",
        content: String(x?.content || "").slice(0, 6000),
      }))
      .filter((x: Turn) => x.content.trim());
  } catch {
    return [];
  }
}

function saveHistory(history: Turn[]) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-40)));
  } catch {}
}

function SalomaoWeb() {
  const [session, setSession] = useState<SessionState>({ status: "checking", username: "", model: "" });
  const [history, setHistory] = useState<Turn[]>(() => readHistory());
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [username, setUsername] = useState("Felipe");
  const [password, setPassword] = useState("");
  const [developerMode, setDeveloperMode] = useState(false);
  const [activeChangeId, setActiveChangeId] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    void checkSession();
  }, []);

  useEffect(() => {
    saveHistory(history);
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [history, sending]);

  useEffect(() => {
    if (!activeChangeId || session.status !== "ready") return;
    const timer = window.setInterval(async () => {
      try {
        const response = await api("/api/assistant/developer", {
          method: "POST",
          headers: { "X-Salomao-App": "1" },
          body: JSON.stringify({ action: "status", id: activeChangeId }),
        });
        const data = await response.json().catch(() => ({}));
        const change = data?.change;
        if (!response.ok || !change) return;
        const status = String(change.status || "");
        if (!["ready", "published", "failed", "cancelled"].includes(status)) return;

        const result =
          status === "published"
            ? "✅ Alteração programada, testada e publicada.\n" + String(change.result_summary || "")
            : status === "ready"
              ? "✅ Alteração programada e testada. PR: " + String(change.pull_request_url || "") + "\n" + String(change.result_summary || "")
              : status === "failed"
                ? "❌ A programação falhou no pipeline. " + String(change.error_text || "Consulte o GitHub Actions.")
                : "Alteração cancelada.";

        setHistory((current) => [...current, { role: "assistant", content: result }]);
        setActiveChangeId("");
      } catch {}
    }, 15000);
    return () => window.clearInterval(timer);
  }, [activeChangeId, session.status]);

  async function checkSession() {
    try {
      let response = await api("/api/assistant", { method: "GET" });
      if (!response.ok && getToken()) {
        setToken("");
        response = await api("/api/assistant", { method: "GET" });
      }
      if (!response.ok) {
        setSession({ status: "guest", username: "", model: "" });
        return;
      }
      const data = await response.json();
      setSession({
        status: "ready",
        username: String(data?.username || "Usuário"),
        model: String(data?.model || "GPT"),
      });
    } catch {
      setSession({ status: "guest", username: "", model: "" });
    }
  }

  async function login(event: FormEvent) {
    event.preventDefault();
    if (!username.trim() || !password) return;
    setLoginBusy(true);
    setLoginError("");
    try {
      const response = await fetch("/api/assistant/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "login",
          username: username.trim(),
          password,
          deviceLabel: "Trans Salomão IA Web • PC",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.token) {
        setLoginError("Login ou senha inválidos.");
        return;
      }
      setToken(String(data.token));
      setPassword("");
      await checkSession();
      setTimeout(() => inputRef.current?.focus(), 120);
    } catch {
      setLoginError("Não foi possível conectar ao Trans Salomão.");
    } finally {
      setLoginBusy(false);
    }
  }

  async function logout() {
    try {
      await api("/api/assistant/auth", { method: "DELETE" });
    } catch {}
    setToken("");
    setSession({ status: "guest", username: "", model: "" });
    setHistory([]);
    saveHistory([]);
  }

  async function send() {
    const message = input.trim();
    if (!message || sending || session.status !== "ready") return;

    const prior = history.slice(-30);
    const next = [...history, { role: "user", content: message } as Turn];
    setHistory(next);
    setInput("");
    setSending(true);

    try {
      const isFelipe = session.username.trim().toLowerCase() === "felipe";
      const target = developerMode && isFelipe ? "/api/assistant/developer" : "/api/assistant";
      const payload = developerMode && isFelipe
        ? { action: "request", request: message, title: message.slice(0, 160), scope: "full" }
        : { message, history: prior };

      const response = await api(target, {
        method: "POST",
        headers: { "X-Salomao-App": "1" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      const answer =
        String(data?.answer || "").trim() ||
        (response.status === 401
          ? "Sua sessão expirou. Entre novamente."
          : "Não consegui concluir esse comando agora.");

      setHistory((current) => [...current, { role: "assistant", content: developerMode && data?.id ? answer + "\nTarefa: " + data.id : answer }]);
      if (developerMode && data?.id) setActiveChangeId(String(data.id));
      if (response.status === 401) {
        setToken("");
        setSession({ status: "guest", username: "", model: "" });
      }
    } catch {
      setHistory((current) => [
        ...current,
        {
          role: "assistant",
          content: "Não consegui acessar o Trans Salomão agora. Verifique a conexão e tente novamente.",
        },
      ]);
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }

  if (session.status === "checking") return <CheckingScreen />;
  if (session.status === "guest") {
    return (
      <LoginScreen
        username={username}
        password={password}
        busy={loginBusy}
        error={loginError}
        setUsername={setUsername}
        setPassword={setPassword}
        onSubmit={login}
      />
    );
  }

  return (
    <main className="h-dvh overflow-hidden bg-[#0b141a] text-[#e9edef]">
      <div className="mx-auto flex h-full w-full max-w-[1600px] overflow-hidden bg-[#111b21] shadow-2xl">
        <aside className="hidden w-[360px] shrink-0 flex-col border-r border-white/10 bg-[#111b21] lg:flex">
          <div className="border-b border-white/10 px-5 py-5">
            <div className="flex items-center gap-3">
              <div className="grid size-12 place-items-center rounded-full bg-[#005c4b] text-2xl">🚛</div>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold text-white">Trans Salomão IA</h1>
                <p className="truncate text-xs text-[#8696a0]">{session.model} • Trans Salomão</p>
              </div>
            </div>
          </div>

          <div className="flex-1 p-4">
            <div className="rounded-xl border border-white/10 bg-[#202c33] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <span className="size-2 rounded-full bg-[#00a884]" />
                Conectado
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[#aebac1]">
                Pode consultar dados e executar os mesmos comandos autorizados do aplicativo.
              </p>
            </div>

            {session.username.trim().toLowerCase() === "felipe" ? (
              <button
                type="button"
                onClick={() => setDeveloperMode((value) => !value)}
                className={"mb-4 w-full rounded-xl border px-4 py-3 text-left text-sm font-semibold " +
                  (developerMode
                    ? "border-[#00a884] bg-[#063f36] text-white"
                    : "border-white/10 bg-[#182229] text-[#d1d7db] hover:bg-[#202c33]")}
              >
                🛠 {developerMode ? "Modo Desenvolvedor ATIVO" : "Ativar Modo Desenvolvedor"}
              </button>
            ) : null}

            <div className="mt-4 grid gap-2">
              <Quick label="📊 Resumo da empresa" onClick={() => setInput("Mostre o resumo atual da empresa")} />
              <Quick label="🚛 Consultar motorista" onClick={() => setInput("Quero consultar um motorista")} />
              <Quick label="⛽ Abastecimentos" onClick={() => setInput("Mostre os abastecimentos recentes")} />
              <Quick label="💰 Caixa" onClick={() => setInput("Mostre os lançamentos pendentes do Caixa")} />
              <Quick label="🧾 Despesas" onClick={() => setInput("Mostre as despesas recentes")} />
            </div>
          </div>

          <div className="border-t border-white/10 p-4">
            <div className="mb-3 text-xs text-[#8696a0]">
              Logado como <span className="font-semibold text-[#e9edef]">{session.username}</span>
            </div>
            <div className="flex gap-2">
              <a
                href="/dono"
                className="flex-1 rounded-lg bg-[#202c33] px-3 py-2 text-center text-sm font-medium hover:bg-[#2a3942]"
              >
                Abrir Gerência
              </a>
              <button
                type="button"
                onClick={logout}
                className="rounded-lg border border-white/10 px-3 py-2 text-sm text-[#aebac1] hover:bg-[#202c33]"
              >
                Sair
              </button>
            </div>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col bg-[#0b141a]">
          <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-white/10 bg-[#202c33] px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[#005c4b] text-xl">🚛</div>
              <div className="min-w-0">
                <h2 className="truncate font-semibold text-white">Trans Salomão IA</h2>
                <p className="truncate text-xs text-[#8696a0]">
                  {developerMode ? "🛠 desenvolvedor • " : "online • "}{session.model} • {session.username}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 lg:hidden">
              <a href="/dono" className="rounded-lg bg-[#2a3942] px-3 py-2 text-xs font-medium">Gerência</a>
              <button type="button" onClick={logout} className="rounded-lg px-3 py-2 text-xs text-[#aebac1]">Sair</button>
            </div>
          </header>

          <div
            className="flex-1 overflow-y-auto px-3 py-5 sm:px-8 lg:px-12"
            style={{
              backgroundColor: "#0b141a",
              backgroundImage:
                "radial-gradient(circle at 25px 25px, rgba(255,255,255,.025) 2px, transparent 2px)",
              backgroundSize: "50px 50px",
            }}
          >
            <div className="mx-auto flex w-full max-w-4xl flex-col">
              <div className="mx-auto mb-5 rounded-lg bg-[#182229] px-4 py-2 text-center text-xs text-[#8696a0]">
                {developerMode
                  ? "🛠 Modo Desenvolvedor: ordens de Felipe entram no pipeline GitHub → Codex → testes → PR → produção quando autorizada."
                  : "🔒 Os comandos usam seu acesso da Gerência e são enviados com conexão segura."}
              </div>

              {history.length === 0 ? (
                <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-white/10 bg-[#111b21]/95 p-6 text-center shadow-xl">
                  <div className="mx-auto grid size-16 place-items-center rounded-full bg-[#005c4b] text-3xl">🚛</div>
                  <h3 className="mt-4 text-xl font-semibold text-white">Trans Salomão IA no PC</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#aebac1]">
                    Digite uma consulta ou comando do Trans Salomão. Para ações que alteram dados, a IA valida os campos antes de executar.
                  </p>
                </div>
              ) : null}

              {history.map((turn, index) => (
                <MessageBubble key={index} turn={turn} />
              ))}

              {sending ? (
                <div className="mb-2 flex justify-start">
                  <div className="rounded-xl rounded-tl-sm bg-[#202c33] px-4 py-3 text-sm text-[#aebac1] shadow">
                    <span className="inline-flex gap-1">
                      <i className="size-1.5 animate-pulse rounded-full bg-[#8696a0]" />
                      <i className="size-1.5 animate-pulse rounded-full bg-[#8696a0] [animation-delay:150ms]" />
                      <i className="size-1.5 animate-pulse rounded-full bg-[#8696a0] [animation-delay:300ms]" />
                    </span>
                  </div>
                </div>
              ) : null}
              <div ref={bottomRef} />
            </div>
          </div>

          <div className="shrink-0 border-t border-white/10 bg-[#202c33] px-3 py-3 sm:px-6">
            <div className="mx-auto flex max-w-4xl items-end gap-2">
              <div className="min-w-0 flex-1 rounded-2xl bg-[#2a3942] px-4 py-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  rows={1}
                  disabled={sending}
                  placeholder="Digite uma mensagem para Trans Salomão IA"
                  className="max-h-36 min-h-8 w-full resize-none bg-transparent py-1 text-[15px] leading-6 text-white outline-none placeholder:text-[#8696a0] disabled:opacity-70"
                  autoFocus
                />
              </div>
              <button
                type="button"
                disabled={sending || !input.trim()}
                onClick={() => void send()}
                className="grid size-12 shrink-0 place-items-center rounded-full bg-[#00a884] text-xl text-white shadow disabled:opacity-40"
                aria-label="Enviar mensagem"
                title="Enviar"
              >
                ➤
              </button>
            </div>
            <div className="mx-auto mt-1 max-w-4xl px-2 text-[10px] text-[#667781]">
              Enter envia • Shift + Enter quebra a linha
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Quick({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-white/10 bg-[#182229] px-4 py-3 text-left text-sm text-[#d1d7db] hover:bg-[#202c33]"
    >
      {label}
    </button>
  );
}

function MessageBubble({ turn }: { turn: Turn }) {
  const user = turn.role === "user";
  const formatted = useMemo(() => formatMessage(turn.content), [turn.content]);
  const classes =
    "max-w-[86%] whitespace-pre-wrap break-words rounded-xl px-3.5 py-2.5 text-[14px] leading-[1.45] shadow sm:max-w-[72%] " +
    (user
      ? "rounded-tr-sm bg-[#005c4b] text-white"
      : "rounded-tl-sm bg-[#202c33] text-[#e9edef]");
  return (
    <div className={"mb-2 flex " + (user ? "justify-end" : "justify-start")}>
      <div className={classes}>{formatted}</div>
    </div>
  );
}

function formatMessage(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
}

function CheckingScreen() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#0b141a] px-4 text-[#e9edef]">
      <div className="text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-[#005c4b] text-3xl">🚛</div>
        <p className="mt-4 text-sm text-[#aebac1]">Conectando à Trans Salomão IA…</p>
      </div>
    </main>
  );
}

function LoginScreen({
  username,
  password,
  busy,
  error,
  setUsername,
  setPassword,
  onSubmit,
}: {
  username: string;
  password: string;
  busy: boolean;
  error: string;
  setUsername: (value: string) => void;
  setPassword: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#0b141a] px-4 py-10 text-[#e9edef]">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-[#111b21] shadow-2xl">
        <div className="border-b border-white/10 bg-[#202c33] px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="grid size-14 place-items-center rounded-full bg-[#005c4b] text-3xl">🚛</div>
            <div>
              <h1 className="text-2xl font-semibold text-white">Trans Salomão IA</h1>
              <p className="text-sm text-[#8696a0]">Acesso pelo computador</p>
            </div>
          </div>
        </div>

        <form className="p-6" onSubmit={onSubmit}>
          <p className="text-sm leading-relaxed text-[#aebac1]">
            Entre com seu login da Gerência do Trans Salomão. A sessão da Trans Salomão IA fica somente nesta aba do navegador.
          </p>

          <label className="mt-6 block text-sm">
            <span className="mb-2 block font-medium text-[#d1d7db]">Login</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              className="h-12 w-full rounded-xl border border-white/10 bg-[#202c33] px-4 text-white outline-none focus:border-[#00a884]"
            />
          </label>

          <label className="mt-4 block text-sm">
            <span className="mb-2 block font-medium text-[#d1d7db]">Senha</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="h-12 w-full rounded-xl border border-white/10 bg-[#202c33] px-4 text-white outline-none focus:border-[#00a884]"
            />
          </label>

          {error ? (
            <p className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={busy || !username.trim() || !password}
            className="mt-6 h-12 w-full rounded-xl bg-[#00a884] font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Entrando…" : "Entrar na Trans Salomão IA"}
          </button>

          <a href="/dono" className="mt-4 block text-center text-xs text-[#8696a0] hover:text-[#d1d7db]">
            Abrir Painel da Gerência
          </a>
        </form>
      </div>
    </main>
  );
}
