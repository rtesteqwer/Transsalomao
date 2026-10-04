import fs from "node:fs";
import path from "node:path";

const target = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(target, "src"))) {
  throw new Error("panel-load-recovery: expected reconstructed application directory");
}
const read = (rel) => fs.readFileSync(path.join(target, rel), "utf8");
const write = (rel, value) => fs.writeFileSync(path.join(target, rel), value);
const rep = (s, before, after, label) => {
  if (s.includes(after)) return s;
  if (!s.includes(before)) throw new Error("panel-load-recovery: pattern not found (" + label + ")");
  return s.replace(before, after);
};

// Recupera automaticamente abas antigas após um novo deploy da Vercel.
// Sem isso, uma aba aberta antes do deploy pode tentar carregar um chunk antigo
// que já não existe no alias atual e o Painel da Gerência fica em erro até F5.
{
  const rel = "src/routes/__root.tsx";
  let s = read(rel);

  s = rep(
    s,
    `import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";`,
    `import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";`,
    "root useEffect import",
  );

  s = rep(
    s,
    `function RootDocument() {
  return (`,
    `function RootDocument() {
  useEffect(() => {
    const reloadKey = "transsalomao:last-deploy-reload";
    const staleBuild = (value: unknown) => {
      const message = String(
        value instanceof Error ? value.message :
        value && typeof value === "object" && "message" in value ? (value as any).message :
        value ?? ""
      ).toLowerCase();
      return (
        message.includes("failed to fetch dynamically imported module") ||
        message.includes("importing a module script failed") ||
        message.includes("chunkloaderror") ||
        (message.includes("loading chunk") && message.includes("failed")) ||
        message.includes("failed to fetch module")
      );
    };
    const reloadOnce = () => {
      const now = Date.now();
      const previous = Number(sessionStorage.getItem(reloadKey) || "0");
      if (Number.isFinite(previous) && now - previous < 15_000) return;
      sessionStorage.setItem(reloadKey, String(now));
      window.location.reload();
    };
    const onPreloadError = (event: Event) => {
      event.preventDefault();
      reloadOnce();
    };
    const onError = (event: ErrorEvent) => {
      if (staleBuild(event.error || event.message)) reloadOnce();
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      if (staleBuild(event.reason)) reloadOnce();
    };

    window.addEventListener("vite:preloadError", onPreloadError);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("vite:preloadError", onPreloadError);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return (`,
    "automatic stale deployment recovery",
  );

  write(rel, s);
}

// Tela de erro em português, com recuperação manual e auto-reload apenas
// quando o erro é claramente de chunk/build antigo.
{
  const rel = "src/lib/error-component.tsx";
  let s = read(rel);

  s = rep(
    s,
    `import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";`,
    `import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";`,
    "error component useEffect",
  );

  const oldComponent = `export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main
      className={
        "flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center " +
        "bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50"
      }
    >
      <span className="text-red-500" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm break-words text-zinc-500 dark:text-zinc-400">
        {error.message || "An unexpected error occurred. Try reloading the page."}
      </p>
    </main>
  );
}`;

  const newComponent = `function isStaleBuildError(error: unknown) {
  const message = String(error instanceof Error ? error.message : error ?? "").toLowerCase();
  return (
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("importing a module script failed") ||
    message.includes("chunkloaderror") ||
    (message.includes("loading chunk") && message.includes("failed")) ||
    message.includes("failed to fetch module")
  );
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  useEffect(() => {
    if (!isStaleBuildError(error)) return;
    const key = "transsalomao:error-deploy-reload";
    const now = Date.now();
    const previous = Number(sessionStorage.getItem(key) || "0");
    if (Number.isFinite(previous) && now - previous < 15_000) return;
    sessionStorage.setItem(key, String(now));
    window.location.reload();
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 px-6 text-center text-zinc-900">
      <span className="text-red-500" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">Não foi possível carregar esta tela</h1>
      <p className="max-w-md text-sm break-words text-zinc-500">
        {error.message || "O painel encontrou um erro ao carregar."}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
        >
          Recarregar painel
        </button>
        <a href="/dono" className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900">
          Ir para a Gerência
        </a>
      </div>
    </main>
  );
}`;

  s = rep(s, oldComponent, newComponent, "management error recovery UI");
  write(rel, s);
}

console.log("[panel-load-recovery] stale deploy/chunk errors now auto-reload once and show recovery controls");
