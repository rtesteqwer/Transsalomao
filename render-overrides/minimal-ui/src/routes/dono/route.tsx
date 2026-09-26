import { createFileRoute, Link } from "@tanstack/react-router";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { BrandLockup } from "@/components/brand";
import { DonoShell } from "@/components/owner/shell";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getManagementSession, managementLogin } from "@/lib/management-auth";

export const Route = createFileRoute("/dono")({
  component: ProtectedManagement,
});

const sessionKey = ["management-session"] as const;

function ProtectedManagement() {
  const qc = useQueryClient();
  const session = useQuery({
    queryKey: sessionKey,
    queryFn: () => getManagementSession(),
    staleTime: 30_000,
  });
  const [username, setUsername] = useState("Felipe");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (session.isLoading) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg px-5 text-fg">
        <div className="text-center">
          <BrandLockup to="/" subtitle="Gerência" />
          <p className="mt-5 text-sm text-muted">Verificando acesso…</p>
        </div>
      </main>
    );
  }

  if (!session.data?.authenticated) {
    return (
      <main className="min-h-dvh bg-bg px-5 py-6 text-fg">
        <div className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-md flex-col">
          <header className="flex items-center justify-between gap-4">
            <BrandLockup to="/" subtitle="Gerência" />
            <Link to="/" className="text-xs text-muted hover:text-fg">Voltar</Link>
          </header>

          <section className="my-auto rounded-xl border border-border bg-surface p-6 shadow-panel sm:p-8">
            <div className="grid size-12 place-items-center rounded-lg bg-surface-2 text-accent">
              <LockKeyhole className="size-6" />
            </div>
            <p className="mt-6 text-[11px] uppercase tracking-[0.18em] text-muted">
              Área protegida
            </p>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">
              Painel da Gerência
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Entre com seu login para acessar a Gerência.
            </p>

            <form
              className="mt-7 grid gap-4"
              onSubmit={async (event) => {
                event.preventDefault();
                setSubmitting(true);
                try {
                  const result = await managementLogin({
                    data: { username: username.trim(), password },
                  });
                  if (!result.ok) {
                    toast.error(result.message);
                    return;
                  }
                  if (result.role === "driver") {
                    window.location.assign("/klebersom");
                    return;
                  }
                  await qc.invalidateQueries({ queryKey: sessionKey });
                  toast.success("Acesso liberado para a Gerência.");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Não foi possível entrar.");
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              <Field label="Login">
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoCapitalize="none"
                  autoComplete="username"
                  placeholder="Felipe"
                />
              </Field>
              <Field label="Senha">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Digite a senha"
                />
              </Field>
              <Button type="submit" size="lg" disabled={submitting}>
                <ShieldCheck className="size-5" />
                {submitting ? "Entrando…" : "Entrar na Gerência"}
              </Button>
            </form>
          </section>
        </div>
      </main>
    );
  }

  return <DonoShell />;
}
