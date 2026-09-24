import { useCallback, useEffect, useState } from "react";
import { managementLogin } from "@/lib/management-auth";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export type PhotoAccess = { authenticated: true; username: string; driverId: string | null; available: boolean };

export function TicketPhotoAccess({ onAccess }: { onAccess: (value: PhotoAccess | null) => void }) {
  const [access, setAccess] = useState<PhotoAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/ler-ticket", { credentials: "same-origin", signal });
    const result = await response.json();
    if (response.status !== 401 && !response.ok) throw new Error(result.erro || "Não foi possível verificar seu acesso.");
    const value = response.ok && result.authenticated ? result as PhotoAccess : null;
    if (!signal?.aborted) { setAccess(value); onAccess(value); setLoading(false); }
  }, [onAccess]);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch(() => {
      if (!controller.signal.aborted) { setLoading(false); setError("Não foi possível verificar seu acesso. Entre novamente."); }
    });
    return () => controller.abort();
  }, [load]);

  async function login() {
    if (busy || !username.trim() || !password) return;
    setBusy(true); setError("");
    try {
      const result = await managementLogin({ data: { username, password } });
      setPassword("");
      if (!result.ok) throw new Error("Login ou senha inválidos.");
      await load();
    } catch (error) { setError(error instanceof Error ? error.message : "Não foi possível entrar."); }
    finally { setBusy(false); }
  }
  if (loading) return <p className="text-sm text-muted" role="status">Verificando acesso à leitura…</p>;
  if (access) return <div className="text-sm"><p className="text-muted">Acesso: {access.username}</p>{!access.available ? <p className="mt-2 text-warn" role="status">A gerência precisa configurar a leitura por foto. Você pode continuar lançando manualmente.</p> : null}</div>;
  return (
    <div className="grid gap-3 rounded-lg border border-border p-3" onKeyDown={(event) => {
      if (event.key === "Enter") { event.preventDefault(); void login(); }
    }}>
      <p className="text-sm">Entre com seu login de motorista ou da gerência para ler fotos.</p>
      <Field label="Login"><Input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" disabled={busy} /></Field>
      <Field label="Senha"><Input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" disabled={busy} /></Field>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <Button type="button" onClick={() => void login()} disabled={busy || !username.trim() || !password}>{busy ? "Entrando…" : "Entrar para ler tickets"}</Button>
    </div>
  );
}
