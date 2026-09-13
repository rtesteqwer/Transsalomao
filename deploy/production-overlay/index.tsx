import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BarChart3,
  ClipboardList,
  FileText,
  Fuel,
  Gauge,
  HomeIcon,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";

export const Route = createFileRoute("/")({ component: Home });

type RouteTo =
  | "/"
  | "/dono/viagens"
  | "/dono"
  | "/dono/cadastros"
  | "/dono/abastecimentos"
  | "/dono/totais"
  | "/dono/lancamentos"
  | "/motorista";

type Hotspot = {
  to: RouteTo;
  label: string;
  line1: string;
  line2: string;
  icon: LucideIcon;
  left: string;
  top: string;
  width: string;
  height: string;
};

const HOTSPOTS: Hotspot[] = [
  { to: "/", label: "Início do site", line1: "INÍCIO", line2: "SITE", icon: HomeIcon, left: "5.8%", top: "70.0%", width: "20.7%", height: "9.5%" },
  { to: "/motorista", label: "Registrar viagens", line1: "REGISTRAR", line2: "VIAGENS", icon: Truck, left: "28.3%", top: "70.0%", width: "20.7%", height: "9.5%" },
  { to: "/dono", label: "Painel da Gerência", line1: "PAINEL", line2: "DA GERÊNCIA", icon: BarChart3, left: "50.8%", top: "70.0%", width: "20.7%", height: "9.5%" },
  { to: "/dono/cadastros", label: "Nossa equipe", line1: "NOSSA", line2: "EQUIPE", icon: Users, left: "73.5%", top: "70.0%", width: "20.7%", height: "9.5%" },
  { to: "/dono/abastecimentos", label: "Controle de combustível", line1: "CONTROLE", line2: "COMBUSTÍVEL", icon: Fuel, left: "5.8%", top: "80.3%", width: "20.7%", height: "9.5%" },
  { to: "/dono/totais", label: "Relatórios e exportação", line1: "RELATÓRIOS", line2: "E EXPORTAR", icon: FileText, left: "28.3%", top: "80.3%", width: "20.7%", height: "9.5%" },
  { to: "/dono/lancamentos", label: "Caixa de lançamentos", line1: "CAIXA", line2: "LANÇAMENTOS", icon: ClipboardList, left: "50.8%", top: "80.3%", width: "20.7%", height: "9.5%" },
  { to: "/motorista", label: "App do motorista", line1: "APP DO", line2: "MOTORISTA", icon: Gauge, left: "73.5%", top: "80.3%", width: "20.7%", height: "9.5%" },
];

function Home() {
  return (
    <main className="min-h-dvh bg-black/30 text-fg">
      <div className="mx-auto min-h-dvh w-full max-w-[768px]">
        <div className="poster-nav relative overflow-hidden shadow-2xl">
          <img
            src="/trans-salomao-background.webp"
            alt="Trans Salomão — logística que move o seu mundo"
            className="block h-auto w-full select-none"
            draggable={false}
          />
          {HOTSPOTS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={`${item.to}-${item.label}`}
                to={item.to}
                aria-label={item.label}
                title={item.label}
                className="poster-hotspot absolute flex flex-col items-center justify-center rounded-[13%] text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9b65f] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                style={{ left: item.left, top: item.top, width: item.width, height: item.height }}
              >
                <Icon aria-hidden="true" />
                <span className="poster-label mt-[5%] block font-semibold leading-[1.02] text-white">
                  {item.line1}
                  <span className="block font-medium text-white/85">{item.line2}</span>
                </span>
              </Link>
            );
          })}
          <a
            href="https://transsalomao.vercel.app"
            aria-label="Abrir transsalomao.vercel.app"
            title="transsalomao.vercel.app"
            className="poster-domain absolute left-[20%] top-[91.3%] h-[4.8%] w-[60%] rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9b65f]"
          >
            <span className="sr-only">transsalomao.vercel.app</span>
          </a>
        </div>
      </div>
    </main>
  );
}
