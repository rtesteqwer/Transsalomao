package br.com.motoristaseguro.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {
    private String role = "";
    private boolean driverOnline = false;
    private double driverEarnings = 0;
    private final List<String> clientTrips = new ArrayList<>();
    private final List<String> driverTrips = new ArrayList<>();

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xff111111);
        getWindow().setNavigationBarColor(0xff111111);
        showRoleChooser();
    }

    private LinearLayout column() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(22, 30, 22, 30);
        root.setBackgroundColor(0xfff6f6f6);
        return root;
    }

    private TextView text(String s, int size, boolean bold) {
        TextView v = new TextView(this);
        v.setText(s);
        v.setTextSize(size);
        v.setTextColor(0xff161616);
        if (bold) v.setTypeface(null, android.graphics.Typeface.BOLD);
        v.setPadding(4, 8, 4, 8);
        return v;
    }

    private Button button(String label) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(16);
        b.setPadding(16, 12, 16, 12);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, 7, 0, 7);
        b.setLayoutParams(lp);
        return b;
    }

    private View mapCard(String title, String sub) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setPadding(18, 26, 18, 26);
        box.setBackgroundColor(0xffdce6d7);
        TextView pin = text("📍  MAPA / GPS", 24, true);
        pin.setGravity(Gravity.CENTER);
        TextView a = text(title, 19, true); a.setGravity(Gravity.CENTER);
        TextView b = text(sub, 14, false); b.setGravity(Gravity.CENTER); b.setTextColor(0xff666666);
        box.addView(pin); box.addView(a); box.addView(b);
        return box;
    }

    private ScrollView scroll(LinearLayout content) {
        ScrollView s = new ScrollView(this);
        s.addView(content);
        return s;
    }

    private void showRoleChooser() {
        role = "";
        LinearLayout root = column();
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.addView(text("TSV  Transporte Seguro Vix", 23, true));
        root.addView(text("Como você quer entrar?", 30, true));
        TextView sub = text("Escolha uma área. Agora cada botão abre uma página real do aplicativo.", 15, false);
        sub.setTextColor(0xff666666); root.addView(sub);
        Button c = button("👤  Entrar como Cliente"); c.setOnClickListener(v -> showLogin("client"));
        Button d = button("🚗  Entrar como Motorista"); d.setOnClickListener(v -> showLogin("driver"));
        Button a = button("🛡  Entrar como Gerência"); a.setOnClickListener(v -> showLogin("admin"));
        root.addView(c); root.addView(d); root.addView(a);
        setContentView(scroll(root));
    }

    private void showLogin(String r) {
        String label = r.equals("client") ? "Cliente" : r.equals("driver") ? "Motorista" : "Gerência";
        String email = r.equals("client") ? "cliente@motoristaseguro.app" : r.equals("driver") ? "motorista@motoristaseguro.app" : "admin@motoristaseguro.app";
        String pass = r.equals("client") ? "Cliente@2026!" : r.equals("driver") ? "Motorista@2026!" : "Admin@2026!";
        LinearLayout root = column();
        root.addView(text("Entrar como " + label, 28, true));
        TextView demo = text("Conta de teste\n" + email + "\n" + pass, 14, false); demo.setTextColor(0xff555555); root.addView(demo);
        EditText e = new EditText(this); e.setHint("E-mail"); e.setText(email); e.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        EditText p = new EditText(this); p.setHint("Senha"); p.setText(pass); p.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        Button enter = button("Entrar");
        enter.setOnClickListener(v -> {
            if (!e.getText().toString().trim().equalsIgnoreCase(email) || !p.getText().toString().equals(pass)) {
                Toast.makeText(this, "Login inválido para " + label, Toast.LENGTH_SHORT).show(); return;
            }
            role = r;
            if (r.equals("client")) showClientHome(); else if (r.equals("driver")) showDriverHome(); else showAdminHome();
        });
        Button back = button("Voltar"); back.setOnClickListener(v -> showRoleChooser());
        root.addView(e); root.addView(p); root.addView(enter); root.addView(back);
        setContentView(scroll(root));
    }

    private void addHeader(LinearLayout root, String title, String sub) {
        root.addView(text(title, 26, true));
        TextView s = text(sub, 14, false); s.setTextColor(0xff666666); root.addView(s);
    }

    private void addClientNav(LinearLayout root) {
        Button h = button("⌂ Início"); h.setOnClickListener(v -> showClientHome());
        Button t = button("▣ Viagens"); t.setOnClickListener(v -> showClientTrips());
        Button f = button("♡ Favoritos"); f.setOnClickListener(v -> showClientFavorites());
        Button a = button("☻ Conta"); a.setOnClickListener(v -> showAccount());
        root.addView(h); root.addView(t); root.addView(f); root.addView(a);
    }

    private void showClientHome() {
        LinearLayout root = column(); addHeader(root, "Olá, Cliente", "Solicite um motorista para dirigir seu próprio veículo.");
        root.addView(mapCard("Motoristas próximos", "Localização de demonstração ativa"));
        Button dest = button("🔎 Para onde você vai?"); dest.setOnClickListener(v -> requestRide()); root.addView(dest);
        Button casa = button("⌂ Casa"); casa.setOnClickListener(v -> requestRideWith("Casa")); root.addView(casa);
        Button trab = button("▣ Trabalho"); trab.setOnClickListener(v -> requestRideWith("Trabalho")); root.addView(trab);
        Button sos = button("🛡 Central de segurança"); sos.setOnClickListener(v -> showSafety()); root.addView(sos);
        addClientNav(root); setContentView(scroll(root));
    }

    private void requestRideWith(String dest) {
        clientTrips.add("Minha localização → " + dest + " • buscando motorista");
        Toast.makeText(this, "Corrida solicitada para " + dest, Toast.LENGTH_LONG).show();
        showClientTrips();
    }

    private void requestRide() {
        EditText input = new EditText(this); input.setHint("Destino"); input.setText("Praia da Costa, Vila Velha");
        new AlertDialog.Builder(this).setTitle("Escolher destino").setView(input)
            .setPositiveButton("Solicitar motorista", (d,w) -> requestRideWith(input.getText().toString().trim().isEmpty()?"Destino informado":input.getText().toString().trim()))
            .setNegativeButton("Cancelar", null).show();
    }

    private void showClientTrips() {
        LinearLayout root = column(); addHeader(root, "Minhas viagens", "Histórico e solicitações atuais");
        if (clientTrips.isEmpty()) root.addView(text("Nenhuma viagem ainda.", 17, false));
        for (String trip : clientTrips) { LinearLayout card = column(); card.setPadding(14,14,14,14); card.setBackgroundColor(Color.WHITE); card.addView(text(trip,16,true)); root.addView(card); }
        addClientNav(root); setContentView(scroll(root));
    }

    private void showClientFavorites() {
        LinearLayout root = column(); addHeader(root, "Favoritos", "Toque em um destino para solicitar uma corrida");
        Button a = button("⌂ Casa"); a.setOnClickListener(v -> requestRideWith("Casa"));
        Button b = button("▣ Trabalho"); b.setOnClickListener(v -> requestRideWith("Trabalho"));
        Button c = button("＋ Adicionar favorito"); c.setOnClickListener(v -> Toast.makeText(this,"Favorito salvo em modo de teste",Toast.LENGTH_SHORT).show());
        root.addView(a); root.addView(b); root.addView(c); addClientNav(root); setContentView(scroll(root));
    }

    private void addDriverNav(LinearLayout root) {
        Button h = button("⌂ Início"); h.setOnClickListener(v -> showDriverHome());
        Button t = button("▣ Viagens"); t.setOnClickListener(v -> showDriverTrips());
        Button g = button("R$ Ganhos"); g.setOnClickListener(v -> showDriverEarnings());
        Button a = button("☻ Conta"); a.setOnClickListener(v -> showAccount());
        root.addView(h); root.addView(t); root.addView(g); root.addView(a);
    }

    private void showDriverHome() {
        LinearLayout root = column(); addHeader(root, "Modo motorista", "CNH B • EAR ativo • cadastro aprovado");
        root.addView(mapCard(driverOnline?"Você está ONLINE":"Você está OFFLINE", driverOnline?"Recebendo solicitações próximas":"Ative para receber chamadas"));
        Button on = button(driverOnline?"🟢 Ficar Offline":"⚫ Ficar Online"); on.setOnClickListener(v -> {driverOnline=!driverOnline; showDriverHome();}); root.addView(on);
        if (driverOnline) {
            TextView req = text("Nova chamada\nCliente Teste • 8 km • 18 min\nPraia da Costa → Itapuã\nValor: R$ 32,50", 17, true); root.addView(req);
            Button accept = button("Aceitar corrida"); accept.setOnClickListener(v -> {driverTrips.add("Praia da Costa → Itapuã • concluída"); driverEarnings += 26.00; Toast.makeText(this,"Corrida aceita",Toast.LENGTH_SHORT).show(); showDriverTrips();}); root.addView(accept);
            Button decline = button("Recusar"); decline.setOnClickListener(v -> Toast.makeText(this,"Chamada recusada",Toast.LENGTH_SHORT).show()); root.addView(decline);
        }
        Button nav = button("🗺 Abrir navegação"); nav.setOnClickListener(v -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/maps")))); root.addView(nav);
        Button sos = button("🛡 Central de segurança"); sos.setOnClickListener(v -> showSafety()); root.addView(sos);
        addDriverNav(root); setContentView(scroll(root));
    }

    private void showDriverTrips() {
        LinearLayout root = column(); addHeader(root, "Viagens do motorista", "Chamadas aceitas e concluídas");
        if (driverTrips.isEmpty()) root.addView(text("Nenhuma viagem ainda. Fique online para receber chamadas.", 17, false));
        for (String trip: driverTrips) root.addView(text("🚗 " + trip, 16, true));
        addDriverNav(root); setContentView(scroll(root));
    }

    private void showDriverEarnings() {
        LinearLayout root = column(); addHeader(root, "Ganhos", "Resumo financeiro do motorista");
        root.addView(text(String.format("R$ %.2f", driverEarnings), 34, true));
        root.addView(text(driverTrips.size() + " viagem(ns) concluída(s)", 16, false));
        root.addView(text("Repasse de teste: 80% do valor da corrida", 14, false));
        addDriverNav(root); setContentView(scroll(root));
    }

    private void showAdminHome() {
        LinearLayout root = column(); addHeader(root, "Painel da Gerência", "Controle de clientes, motoristas e corridas");
        root.addView(text("Clientes: 1", 20, true));
        root.addView(text("Motoristas: 1", 20, true));
        root.addView(text("Motoristas online: " + (driverOnline?1:0), 20, true));
        root.addView(text("Corridas: " + (clientTrips.size()+driverTrips.size()), 20, true));
        Button drivers = button("🚗 Gerenciar motoristas"); drivers.setOnClickListener(v -> showAdminDrivers()); root.addView(drivers);
        Button rides = button("▣ Ver corridas"); rides.setOnClickListener(v -> showAdminRides()); root.addView(rides);
        Button web = button("🌐 Abrir plataforma online"); web.setOnClickListener(v -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://transportesegurovix-transsalomao.vercel.app/")))); root.addView(web);
        Button out = button("Sair"); out.setOnClickListener(v -> showRoleChooser()); root.addView(out);
        setContentView(scroll(root));
    }

    private void showAdminDrivers() {
        LinearLayout root = column(); addHeader(root, "Motoristas", "Aprovação e status");
        root.addView(text("Motorista Teste\nCNH B • EAR Sim • APROVADO", 18, true));
        Button block = button("Bloquear motorista"); block.setOnClickListener(v -> Toast.makeText(this,"Motorista bloqueado em modo de teste",Toast.LENGTH_SHORT).show()); root.addView(block);
        Button back = button("Voltar ao painel"); back.setOnClickListener(v -> showAdminHome()); root.addView(back); setContentView(scroll(root));
    }

    private void showAdminRides() {
        LinearLayout root = column(); addHeader(root, "Corridas", "Movimentação da plataforma");
        if (clientTrips.isEmpty() && driverTrips.isEmpty()) root.addView(text("Nenhuma corrida registrada neste aparelho.",16,false));
        for(String s: clientTrips) root.addView(text("Cliente: " + s,15,false));
        for(String s: driverTrips) root.addView(text("Motorista: " + s,15,false));
        Button back = button("Voltar ao painel"); back.setOnClickListener(v -> showAdminHome()); root.addView(back); setContentView(scroll(root));
    }

    private void showAccount() {
        LinearLayout root = column(); String label = role.equals("client")?"Cliente":"Motorista";
        addHeader(root, "Minha conta", label + " • Transporte Seguro Vix");
        root.addView(text(role.equals("client")?"cliente@motoristaseguro.app":"motorista@motoristaseguro.app",16,true));
        Button sec = button("🛡 Segurança"); sec.setOnClickListener(v -> showSafety()); root.addView(sec);
        Button out = button("Sair da conta"); out.setOnClickListener(v -> showRoleChooser()); root.addView(out);
        Button back = button("Voltar"); back.setOnClickListener(v -> {if(role.equals("client")) showClientHome(); else showDriverHome();}); root.addView(back);
        setContentView(scroll(root));
    }

    private void showSafety() {
        new AlertDialog.Builder(this).setTitle("Central de segurança")
            .setMessage("Compartilhe sua corrida com alguém de confiança.\n\nEm emergência, ligue 190 ou 192.")
            .setPositiveButton("Entendi", null).show();
    }

    @Override public void onBackPressed() {
        if (role.equals("client")) showClientHome(); else if (role.equals("driver")) showDriverHome(); else if (role.equals("admin")) showAdminHome(); else showRoleChooser();
    }
}
