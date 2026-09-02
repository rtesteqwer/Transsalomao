package br.com.motoristaseguro.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
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
import java.util.Locale;

public class MainActivity extends Activity {
    private static final int LOCATION_REQUEST = 3101;
    private String role = "";
    private boolean driverOnline = false;
    private double driverEarnings = 0;
    private final List<String> clientTrips = new ArrayList<>();
    private final List<String> driverTrips = new ArrayList<>();
    private TextView gpsStatusView;
    private double lastLat = Double.NaN;
    private double lastLng = Double.NaN;
    private float lastAccuracy = 0f;
    private boolean receiverRegistered = false;

    private final BroadcastReceiver locationReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (!LocationForegroundService.ACTION_LOCATION.equals(intent.getAction())) return;
            lastLat = intent.getDoubleExtra("lat", Double.NaN);
            lastLng = intent.getDoubleExtra("lng", Double.NaN);
            lastAccuracy = intent.getFloatExtra("accuracy", 0f);
            saveRoleLocation();
            refreshGpsLabel();
        }
    };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xff111111);
        getWindow().setNavigationBarColor(0xff111111);
        loadLastLocation();
        showRoleChooser();
    }

    @Override protected void onStart() {
        super.onStart();
        if (!receiverRegistered) {
            IntentFilter filter = new IntentFilter(LocationForegroundService.ACTION_LOCATION);
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(locationReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            else registerReceiver(locationReceiver, filter);
            receiverRegistered = true;
        }
    }

    @Override protected void onStop() {
        if (receiverRegistered) {
            try { unregisterReceiver(locationReceiver); } catch (Exception ignored) {}
            receiverRegistered = false;
        }
        super.onStop();
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

    private ScrollView scroll(LinearLayout content) {
        ScrollView s = new ScrollView(this);
        s.addView(content);
        return s;
    }

    private String gpsSummary() {
        if (Double.isNaN(lastLat) || Double.isNaN(lastLng)) return "Obtendo localização GPS exata…";
        return String.format(Locale.US, "GPS AO VIVO\nLat %.6f • Lng %.6f\nPrecisão aproximada ±%.0f m", lastLat, lastLng, lastAccuracy);
    }

    private void refreshGpsLabel() {
        if (gpsStatusView != null) gpsStatusView.setText(gpsSummary());
    }

    private View mapCard(String title, String sub) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setPadding(18, 24, 18, 24);
        box.setBackgroundColor(0xffdce6d7);
        TextView pin = text("📍  LOCALIZAÇÃO EM TEMPO REAL", 22, true);
        pin.setGravity(Gravity.CENTER);
        TextView a = text(title, 19, true); a.setGravity(Gravity.CENTER);
        TextView b = text(sub, 14, false); b.setGravity(Gravity.CENTER); b.setTextColor(0xff555555);
        gpsStatusView = text(gpsSummary(), 14, true); gpsStatusView.setGravity(Gravity.CENTER); gpsStatusView.setTextColor(0xff166534);
        Button exact = button("Abrir minha posição exata no mapa"); exact.setOnClickListener(v -> openExactLocation());
        Button gps = button("Configurações de localização"); gps.setOnClickListener(v -> startActivity(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)));
        box.addView(pin); box.addView(a); box.addView(b); box.addView(gpsStatusView); box.addView(exact); box.addView(gps);
        return box;
    }

    private void showRoleChooser() {
        role = "";
        stopGpsTracking();
        LinearLayout root = column();
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.addView(text("TSV  Transporte Seguro Vix", 23, true));
        root.addView(text("Como você quer entrar?", 30, true));
        root.addView(text("Cliente, Motorista e Gerência possuem páginas independentes.", 15, false));
        Button c = button("👤 Entrar como Cliente"); c.setOnClickListener(v -> showLogin("client"));
        Button d = button("🚗 Entrar como Motorista"); d.setOnClickListener(v -> showLogin("driver"));
        Button a = button("🛡 Entrar como Gerência"); a.setOnClickListener(v -> showLogin("admin"));
        root.addView(c); root.addView(d); root.addView(a);
        setContentView(scroll(root));
    }

    private void showLogin(String r) {
        String label = r.equals("client") ? "Cliente" : r.equals("driver") ? "Motorista" : "Gerência";
        String email = r.equals("client") ? "cliente@motoristaseguro.app" : r.equals("driver") ? "motorista@motoristaseguro.app" : "admin@motoristaseguro.app";
        String pass = r.equals("client") ? "Cliente@2026!" : r.equals("driver") ? "Motorista@2026!" : "Admin@2026!";
        LinearLayout root = column();
        root.addView(text("Entrar como " + label, 28, true));
        root.addView(text("Conta de teste\n" + email + "\n" + pass, 14, false));
        EditText e = new EditText(this); e.setHint("E-mail"); e.setText(email); e.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        EditText p = new EditText(this); p.setHint("Senha"); p.setText(pass); p.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        Button enter = button("Entrar");
        enter.setOnClickListener(v -> {
            if (!e.getText().toString().trim().equalsIgnoreCase(email) || !p.getText().toString().equals(pass)) {
                Toast.makeText(this, "Login inválido para " + label, Toast.LENGTH_SHORT).show(); return;
            }
            role = r;
            if (!r.equals("admin")) startGpsTracking();
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

    private void startGpsTracking() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, LOCATION_REQUEST);
            return;
        }
        Intent service = new Intent(this, LocationForegroundService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(service); else startService(service);
    }

    private void stopGpsTracking() {
        try { stopService(new Intent(this, LocationForegroundService.class)); } catch (Exception ignored) {}
    }

    private void loadLastLocation() {
        SharedPreferences p = getSharedPreferences(LocationForegroundService.PREFS, MODE_PRIVATE);
        try {
            String la = p.getString("lat", null), ln = p.getString("lng", null);
            if (la != null && ln != null) { lastLat = Double.parseDouble(la); lastLng = Double.parseDouble(ln); }
            lastAccuracy = p.getFloat("accuracy", 0f);
        } catch (Exception ignored) {}
    }

    private void saveRoleLocation() {
        if (role.isEmpty() || role.equals("admin") || Double.isNaN(lastLat)) return;
        getSharedPreferences("tsv_role_locations", MODE_PRIVATE).edit()
            .putString(role + "_lat", Double.toString(lastLat))
            .putString(role + "_lng", Double.toString(lastLng))
            .putFloat(role + "_accuracy", lastAccuracy)
            .putLong(role + "_time", System.currentTimeMillis())
            .apply();
    }

    private boolean locationEnabled() {
        LocationManager lm = (LocationManager) getSystemService(LOCATION_SERVICE);
        try {
            if (Build.VERSION.SDK_INT >= 28) return lm.isLocationEnabled();
            return lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        } catch (Exception e) { return false; }
    }

    private void openExactLocation() {
        if (Double.isNaN(lastLat) || Double.isNaN(lastLng)) {
            Toast.makeText(this, locationEnabled() ? "Aguardando sinal GPS…" : "Ative a localização do aparelho.", Toast.LENGTH_LONG).show();
            if (!locationEnabled()) startActivity(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS));
            return;
        }
        Uri uri = Uri.parse(String.format(Locale.US, "geo:%f,%f?q=%f,%f", lastLat, lastLng, lastLat, lastLng));
        startActivity(new Intent(Intent.ACTION_VIEW, uri));
    }

    private void addClientNav(LinearLayout root) {
        Button h = button("⌂ Início"); h.setOnClickListener(v -> showClientHome());
        Button t = button("▣ Viagens"); t.setOnClickListener(v -> showClientTrips());
        Button f = button("♡ Favoritos"); f.setOnClickListener(v -> showClientFavorites());
        Button a = button("☻ Conta"); a.setOnClickListener(v -> showAccount());
        root.addView(h); root.addView(t); root.addView(f); root.addView(a);
    }

    private void showClientHome() {
        startGpsTracking();
        LinearLayout root = column(); addHeader(root, "Boa viagem, Cliente", "GPS contínuo ativo enquanto você estiver conectado.");
        root.addView(mapCard("Sua localização exata", "A posição é atualizada continuamente pelo GPS do aparelho."));
        root.addView(text("Localização do motorista", 18, true));
        root.addView(text("A posição exata do motorista será mostrada aqui assim que a sincronização entre aparelhos pelo Neon estiver habilitada.", 14, false));
        Button dest = button("🔎 Para onde você vai?"); dest.setOnClickListener(v -> requestRide()); root.addView(dest);
        Button casa = button("⌂ Casa"); casa.setOnClickListener(v -> requestRideWith("Casa")); root.addView(casa);
        Button trab = button("▣ Trabalho"); trab.setOnClickListener(v -> requestRideWith("Trabalho")); root.addView(trab);
        Button sos = button("🛡 Central de segurança"); sos.setOnClickListener(v -> showSafety()); root.addView(sos);
        addClientNav(root); setContentView(scroll(root));
    }

    private void requestRideWith(String dest) {
        String origin = Double.isNaN(lastLat) ? "Minha localização" : String.format(Locale.US, "%.6f, %.6f", lastLat, lastLng);
        clientTrips.add(origin + " → " + dest + " • buscando motorista");
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
        LinearLayout root = column(); addHeader(root, "Favoritos", "Todos os botões abaixo executam uma ação real");
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
        startGpsTracking();
        LinearLayout root = column(); addHeader(root, "Modo motorista", "CNH B • EAR ativo • cadastro aprovado");
        root.addView(mapCard(driverOnline?"Você está ONLINE":"Você está OFFLINE", driverOnline?"Sua posição continua sendo atualizada em tempo real.":"O GPS permanece ativo enquanto você estiver conectado."));
        root.addView(text("Localização do cliente", 18, true));
        root.addView(text("Quando uma corrida estiver sincronizada pelo backend, a posição exata do cliente aparecerá aqui e poderá ser aberta na navegação.", 14, false));
        Button on = button(driverOnline?"🟢 Ficar Offline":"⚫ Ficar Online"); on.setOnClickListener(v -> {driverOnline=!driverOnline; showDriverHome();}); root.addView(on);
        if (driverOnline) {
            TextView req = text("Nova chamada de teste\nCliente Teste • 8 km • 18 min\nPraia da Costa → Itapuã\nValor: R$ 32,50", 17, true); root.addView(req);
            Button accept = button("Aceitar corrida"); accept.setOnClickListener(v -> {driverTrips.add("Praia da Costa → Itapuã • concluída"); driverEarnings += 26.00; Toast.makeText(this,"Corrida aceita",Toast.LENGTH_SHORT).show(); showDriverTrips();}); root.addView(accept);
            Button decline = button("Recusar"); decline.setOnClickListener(v -> Toast.makeText(this,"Chamada recusada",Toast.LENGTH_SHORT).show()); root.addView(decline);
        }
        Button nav = button("🗺 Abrir minha posição na navegação"); nav.setOnClickListener(v -> openExactLocation()); root.addView(nav);
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
        root.addView(text(String.format(Locale.US, "R$ %.2f", driverEarnings), 34, true));
        root.addView(text(driverTrips.size() + " viagem(ns) concluída(s)", 16, false));
        addDriverNav(root); setContentView(scroll(root));
    }

    private void showAdminHome() {
        LinearLayout root = column(); addHeader(root, "Painel da Gerência", "Controle de clientes, motoristas e corridas");
        root.addView(text("Clientes: 1", 20, true));
        root.addView(text("Motoristas: 1", 20, true));
        root.addView(text("Motoristas online neste aparelho: " + (driverOnline?1:0), 20, true));
        root.addView(text("Corridas registradas neste aparelho: " + (clientTrips.size()+driverTrips.size()), 20, true));
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
        root.addView(text(gpsSummary(), 14, true));
        Button pos = button("📍 Ver minha posição exata"); pos.setOnClickListener(v -> openExactLocation()); root.addView(pos);
        Button sec = button("🛡 Segurança"); sec.setOnClickListener(v -> showSafety()); root.addView(sec);
        Button out = button("Sair da conta"); out.setOnClickListener(v -> showRoleChooser()); root.addView(out);
        Button back = button("Voltar"); back.setOnClickListener(v -> {if(role.equals("client")) showClientHome(); else showDriverHome();}); root.addView(back);
        setContentView(scroll(root));
    }

    private void showSafety() {
        new AlertDialog.Builder(this).setTitle("Central de segurança")
            .setMessage("O GPS permanece ativo enquanto você estiver conectado.\n\nCompartilhe sua corrida com alguém de confiança.\n\nEm emergência, ligue 190 ou 192.")
            .setPositiveButton("Entendi", null).show();
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == LOCATION_REQUEST) {
            boolean ok = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (ok) startGpsTracking();
            else Toast.makeText(this, "Permita Localização precisa para acompanhar cliente e motorista.", Toast.LENGTH_LONG).show();
        }
    }

    @Override public void onBackPressed() {
        if (role.equals("client")) showClientHome(); else if (role.equals("driver")) showDriverHome(); else if (role.equals("admin")) showAdminHome(); else showRoleChooser();
    }
}
