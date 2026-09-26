import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Camera, ChevronRight, FileText, Fuel, House, LockKeyhole, LogOut, MoreHorizontal, ReceiptText, Truck, UserRound, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { BrandLockup } from "@/components/brand";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { getManagementSession, managementLogout } from "@/lib/management-auth";
import { cn } from "@/lib/utils";
import { useFleet } from "@/lib/use-fleet";

const NAV = [
  { to: "/dono", label: "Visão geral", mobileLabel: "Início", icon: House, exact: true },
  { to: "/dono/lancamentos", label: "Caixa", mobileLabel: "Caixa", icon: Wallet, exact: false },
  { to: "/dono/viagens", label: "Viagens", mobileLabel: "Viagens", icon: Truck, exact: false },
  { to: "/dono/abastecimentos", label: "Abastecimentos", mobileLabel: "Abastecimentos", icon: Fuel, exact: false },
  { to: "/dono/despesas", label: "Despesas", mobileLabel: "Despesas", icon: ReceiptText, exact: false },
  { to: "/dono/totais", label: "Relatórios", mobileLabel: "Relatórios", icon: FileText, exact: false },
  { to: "/dono/cadastros", label: "Cadastros", mobileLabel: "Cadastros", icon: Users, exact: false },
  { to: "/dono/fotos", label: "Fotos de tickets", mobileLabel: "Fotos de tickets", icon: Camera, exact: false },
] as const;

export function DonoShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const qc = useQueryClient();
  const { data } = useFleet();
  const { data: session } = useQuery({ queryKey: ["management-session"], queryFn: () => getManagementSession(), staleTime: 30_000 });
  const [moreOpen, setMoreOpen] = useState(false);
  const pending = data?.reports.filter((r) => r.status === "pendente").length ?? 0;
  const username = session?.username ?? "Gerência";
  const isFelipe = username.trim().toLocaleLowerCase("pt-BR") === "felipe";
  const active = (item: typeof NAV[number]) => item.exact ? pathname.replace(/\/$/, "") === item.to : pathname.startsWith(item.to);
  const moreActive = NAV.slice(3).some(active);

  async function logout() {
    try {
      await managementLogout();
      qc.setQueryData(["management-session"], { authenticated: false, username: null });
      toast.success("Você saiu do Painel da Gerência.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível sair.");
    }
  }

  return (
    <div className="owner-app min-h-dvh bg-bg text-fg">
      <a href="#conteudo" className="skip-link">Ir para o conteúdo</a>
      <aside className="owner-sidebar">
        <BrandLockup to="/" />
        <p className="nav-heading">Gestão</p>
        <nav aria-label="Navegação principal" className="grid gap-1">
          {NAV.map((item) => (
            <Link key={item.to} to={item.to} aria-current={active(item) ? "page" : undefined} className={cn("owner-nav-link", active(item) && "is-active")}>
              <item.icon className="size-[19px] shrink-0" aria-hidden="true" />
              <span className="flex-1">{item.label}</span>
              {item.to === "/dono/lancamentos" && pending > 0 ? <Badge tone="warn">{pending}</Badge> : null}
            </Link>
          ))}
        </nav>
        <div className="mt-auto pt-8">
          {isFelipe ? <div className="border-t border-border pt-5 pb-5">
            <p className="nav-heading !mt-0">Pessoal</p>
            <Link to="/dono" hash="minha-participacao" className="owner-nav-link"><LockKeyhole className="size-[18px] shrink-0" /><span>Minha participação · 3%</span></Link>
          </div> : null}
          <div className="border-t border-border pt-4">
            <div className="flex items-center gap-3 px-2 py-2">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-muted"><UserRound className="size-5" /></span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{username}</p><p className="mt-0.5 text-xs text-muted">Administrador</p></div>
              <button type="button" onClick={logout} className="grid size-10 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2" aria-label="Sair da Gerência" title="Sair da Gerência"><LogOut className="size-4" /></button>
            </div>
            <Link to="/motorista" className="owner-nav-link mt-2 text-xs"><Truck className="size-4" /><span>App do motorista</span><ChevronRight className="ml-auto size-4" /></Link>
          </div>
        </div>
      </aside>
      <header className="owner-mobile-header">
        <BrandLockup to="/" />
        <Link to="/dono/lancamentos" className="relative grid size-11 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2" aria-label={pending > 0 ? `${pending} lançamentos pendentes no Caixa` : "Abrir Caixa"}>
          <Wallet className="size-5" />
          {pending > 0 ? <span className="absolute right-1 top-1 grid min-w-4 h-4 place-items-center rounded-full bg-accent px-1 text-[10px] text-white">{pending}</span> : null}
        </Link>
      </header>
      <main id="conteudo" tabIndex={-1} className="owner-main"><div className="owner-content"><Outlet /></div></main>
      <nav className="owner-mobile-nav" aria-label="Navegação no celular">
        {NAV.slice(0, 3).map((item) => <Link key={item.to} to={item.to} aria-current={active(item) ? "page" : undefined} className={cn("mobile-nav-item", active(item) && "is-active")}>
          <span className="relative"><item.icon className="size-[21px]" />{item.to === "/dono/lancamentos" && pending > 0 ? <span className="absolute -right-2 -top-1 size-2 rounded-full bg-accent" /> : null}</span>
          <span>{item.mobileLabel}</span>
        </Link>)}
        <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" aria-expanded={moreOpen} className={cn("mobile-nav-item", (moreOpen || moreActive) && "is-active")}><MoreHorizontal className="size-[23px]" /><span>Mais</span></button>
      </nav>
      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent title="Mais opções" className="owner-more-sheet">
          <nav aria-label="Todas as abas" className="grid gap-1">
            {NAV.slice(3).map((item) => <Link key={item.to} to={item.to} onClick={() => setMoreOpen(false)} aria-current={active(item) ? "page" : undefined} className={cn("owner-nav-link !h-12", active(item) && "is-active")}><item.icon className="size-5" /><span className="flex-1">{item.label}</span><ChevronRight className="size-4 text-subtle" /></Link>)}
            {isFelipe ? <Link to="/dono" hash="minha-participacao" onClick={() => setMoreOpen(false)} className="owner-nav-link !h-12"><LockKeyhole className="size-5" /><span>Minha participação · 3%</span></Link> : null}
          </nav>
          <div className="mt-4 border-t border-border pt-3">
            <p className="px-3 py-2 text-sm font-semibold">{username} <span className="ml-2 font-normal text-muted">Administrador</span></p>
            <Link to="/motorista" onClick={() => setMoreOpen(false)} className="owner-nav-link"><Truck className="size-5" />App do motorista</Link>
            <button type="button" onClick={logout} className="owner-nav-link w-full"><LogOut className="size-5" />Sair da Gerência</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
