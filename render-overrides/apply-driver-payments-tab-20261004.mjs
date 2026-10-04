import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const target = process.argv[2];
if (!target || !fs.existsSync(path.join(target, "src"))) {
  throw new Error("driver-payments-tab: expected reconstructed application directory");
}

const here = path.dirname(fileURLToPath(import.meta.url));
const copy = (source, destination) => {
  const from = path.join(here, source);
  const to = path.join(target, destination);
  if (!fs.existsSync(from)) throw new Error("driver-payments-tab: missing " + source);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
};

copy("0025_driver_payments.sql", "migrations/0025_driver_payments.sql");
copy("driver-payments-api-20261004.ts", "src/lib/driver-payments.ts");
copy("driver-payments-page-20261004.tsx", "src/routes/dono/pagamentos.tsx");

const shellPath = path.join(target, "src/components/owner/shell.tsx");
if (!fs.existsSync(shellPath)) throw new Error("driver-payments-tab: owner shell missing");
let shell = fs.readFileSync(shellPath, "utf8");

if (!shell.includes("CircleDollarSign")) {
  const importBefore = "Camera, ChevronRight, FileText, Fuel, House, LockKeyhole, LogOut, MoreHorizontal, ReceiptText, Truck, UserRound, Users, Wallet, X";
  const importAfter = "Camera, ChevronRight, CircleDollarSign, FileText, Fuel, House, LockKeyhole, LogOut, MoreHorizontal, ReceiptText, Truck, UserRound, Users, Wallet, X";
  if (!shell.includes(importBefore)) throw new Error("driver-payments-tab: lucide import baseline changed");
  shell = shell.replace(importBefore, importAfter);
}

const paymentNav = '  { to: "/dono/pagamentos", label: "Pagamentos", mobileLabel: "Pagamentos", icon: CircleDollarSign, exact: false },';
if (!shell.includes(paymentNav)) {
  const anchor = '  { to: "/dono/despesas", label: "Despesas", mobileLabel: "Despesas", icon: ReceiptText, exact: false },';
  if (!shell.includes(anchor)) throw new Error("driver-payments-tab: Despesas nav anchor missing");
  shell = shell.replace(anchor, anchor + "\n" + paymentNav);
}

fs.writeFileSync(shellPath, shell);
console.log("[driver-payments-tab] Pagamentos + adiantamentos + termo de acerto para assinatura installed");
