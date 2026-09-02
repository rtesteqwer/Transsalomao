package br.com.motoristaseguro.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
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

    private double lastLat = Double.NaN;
    private double lastLng = Double.NaN;
    private float lastAccuracy = 0f;
    private double lastMapLat = Double.NaN;
    private double lastMapLng = Double.NaN;
    private boolean receiverRegistered = false;
    private TextView gpsStatusView;
    private WebView mapWebView;

    private final BroadcastReceiver locationReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (!LocationForegroundService.ACTION_LOCATION.equals(intent.getAction())) return;
            lastLat = intent.getDoubleExtra("lat", Double.NaN);
            lastLng = intent.getDoubleExtra("lng", Double.NaN);
            lastAccuracy = intent.getFloatExtra("accuracy", 0f);
            refreshGpsLabel();
            refreshStreetMap(false);
        }
    };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xff111111);
        getWindow().setNavigationBarColor(0xff111111);
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

    private int dp(int n) { return (int)(n * getResources().getDisplayMetrics().density + .5f); }

    private LinearLayout column() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(18), dp(20), dp(18), dp(90));
        root.setBackgroundColor(0xfff5f5f5);
        return root;
    }

    private ScrollView scroll(LinearLayout content) {
        ScrollView s = new ScrollView(this);
        s.setFillViewport(true);
        s.addView(content);
        return s;
    }

    private TextView text(String value, int size, boolean bold) {
        TextView v = new TextView(this);
        v.setText(value);
        v.setTextSize(size);
        v.setTextColor(0xff151515);
        if (bold) v.setTypeface(null, android.graphics.Typeface.BOLD);
        v.setPadding(dp(4), dp(7), dp(4), dp(7));
        return v;
    }

    private Button button(String label) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(16);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, dp(6), 0, dp(6));
        b.setLayoutParams(lp);
        return b;
    }

    private void header(LinearLayout root, String title, String sub) {
        root.addView(text(title, 29, true));
        TextView s = text(sub, 14, false); s.setTextColor(0xff666666); root.addView(s);
    }

    private String gpsSummary() {
        if (Double.isNaN(lastLat) || Double.isNaN(lastLng)) return "GPS: obtendo localização exata…";
        return String.format(Locale.US, "GPS AO VIVO • %.6f, %.6f • precisão ±%.0f m", lastLat, lastLng, lastAccuracy);
    }

    private void refreshGpsLabel() {
        if (gpsStatusView != null) gpsStatusView.setText(gpsSummary());
    }

    private boolean movedEnough() {
        if (Double.isNaN(lastMapLat) || Double.isNaN(lastMapLng) || Double.isNaN(lastLat)) return true;
        double dx = (lastLat-lastMapLat) * 111000.0;
        double dy = (lastLng-lastMapLng) * 111000.0 * Math.cos(Math.toRadians(lastLat));
        return Math.sqrt(dx*dx + dy*dy) > 8.0;
    }

    private String streetMapUrl() {
        double lat = Double.isNaN(lastLat) ? -20.3297 : lastLat;
        double lng = Double.isNaN(lastLng) ? -40.2925 : lastLng;
        double d = 0.0035;
        String bbox = String.format(Locale.US, "%f,%f,%f,%f", lng-d, lat-d, lng+d, lat+d);
        return "https://www.openstreetmap.org/export/embed.html?bbox=" + Uri.encode(bbox) + "&layer=mapnik&marker=" +
                String.format(Locale.US, "%f%%2C%f", lat, lng);
    }

    private View streetMapCard(String title) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setBackgroundColor(Color.WHITE);
        box.setPadding(dp(10), dp(10), dp(10), dp(10));

        TextView label = text("MAPA DE RUAS • " + title, 14, true);
        label.setTextColor(0xff166534);
        box.addView(label);

        gpsStatusView = text(gpsSummary(), 13, true);
        gpsStatusView.setTextColor(0xff166534);
        box.addView(gpsStatusView);

        mapWebView = new WebView(this);
        WebSettings ws = mapWebView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setLoadWithOverviewMode(true);
        ws.setUseWideViewPort(true);
        mapWebView.setWebViewClient(new WebViewClient());
        LinearLayout.LayoutParams mp = new LinearLayout.LayoutParams(-1, dp(360));
        mp.setMargins(0, dp(6), 0, dp(6));
        mapWebView.setLayoutParams(mp);
        box.addView(mapWebView);
        refreshStreetMap(true);

        Button center = button("◎ Centralizar no meu GPS");
        center.setOnClickListener(v -> refreshStreetMap(true));
        box.addView(center);

        Button exact = button("📍 Abrir posição exata");
        exact.setOnClickListener(v -> openExactLocation());
        box.addView(exact);
        return box;
    }

    private void refreshStreetMap(boolean force) {
        if (mapWebView == null) return;
        if (!force && !movedEnough()) return;
        mapWebView.loadUrl(streetMapUrl());
        if (!Double.isNaN(lastLat)) { lastMapLat = lastLat; lastMapLng = lastLng; }
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

    private void openExactLocation() {
        if (Double.isNaN(lastLat) || Double.isNaN(lastLng)) {
            Toast.makeText(this, "Aguardando sinal GPS…", Toast.LENGTH_LONG).show();
            return;
        }
        Uri u = Uri.parse(String.format(Locale.US, "https://www.openstreetmap.org/?mlat=%f&mlon=%f#map=18/%f/%f", lastLat,lastLng,lastLat,lastLng));
        startActivity(new Intent(Intent.ACTION_VIEW, u));
    }

    private void showRoleChooser() {
        role = "";
        stopGpsTracking();
        mapWebView = null;
        LinearLayout root = column();
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.addView(text("TSV • Transporte Seguro Vix", 23, true));
        root.addView(text("Como você quer entrar?", 30, true));
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
        header(root, "Entrar como " + label, "Conta de teste: " + email);
        EditText e = new EditText(this); e.setHint("E-mail"); e.setText(email); e.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        EditText p = new EditText(this); p.setHint("Senha"); p.setText(pass); p.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        Button enter = button("Entrar"); enter.setOnClickListener(v -> {
            if (!e.getText().toString().trim().equalsIgnoreCase(email) || !p.getText().toString().equals(pass)) {
                Toast.makeText(this,"Login inválido",Toast.LENGTH_SHORT).show(); return;
            }
            role = r;
            if (!r.equals("admin")) startGpsTracking();
            if (r.equals("client")) showClientHome(); else if (r.equals("driver")) showDriverHome(); else showAdminHome();
        });
        Button back = button("Voltar"); back.setOnClickListener(v -> showRoleChooser());
        root.addView(e); root.addView(p); root.addView(enter); root.addView(back);
        setContentView(scroll(root));
    }

    private void addClientNav(LinearLayout root) {
        LinearLayout nav = new LinearLayout(this); nav.setOrientation(LinearLayout.HORIZONTAL);
        String[] names = {"⌂ Início","▣ Viagens","♡ Favoritos","☻ Conta"};
        View.OnClickListener[] acts = {v->showClientHome(),v->showClientTrips(),v->showClientFavorites(),v->showAccount()};
        for(int i=0;i<names.length;i++){Button b=button(names[i]); b.setOnClickListener(acts[i]); b.setLayoutParams(new LinearLayout.LayoutParams(0,-2,1)); nav.addView(b);} root.addView(nav);
    }

    private void addDriverNav(LinearLayout root) {
        LinearLayout nav = new LinearLayout(this); nav.setOrientation(LinearLayout.HORIZONTAL);
        String[] names = {"⌂ Início","▣ Viagens","R$ Ganhos","☻ Conta"};
        View.OnClickListener[] acts = {v->showDriverHome(),v->showDriverTrips(),v->showDriverEarnings(),v->showAccount()};
        for(int i=0;i<names.length;i++){Button b=button(names[i]); b.setOnClickListener(acts[i]); b.setLayoutParams(new LinearLayout.LayoutParams(0,-2,1)); nav.addView(b);} root.addView(nav);
    }

    private void showClientHome() {
        startGpsTracking(); mapWebView = null;
        LinearLayout root = column();
        header(root, "Boa viagem, Cliente", "Mapa leve em modo ruas, acompanhando seu GPS.");
        root.addView(streetMapCard("SUA POSIÇÃO"));
        Button dest = button("🔎 Para onde você vai?"); dest.setOnClickListener(v -> requestRide()); root.addView(dest);
        LinearLayout quick = new LinearLayout(this); quick.setOrientation(LinearLayout.HORIZONTAL);
        String[] qs={"⌂ Casa","▣ Trabalho","＋ Outro"};
        View.OnClickListener[] qa={v->requestRideWith("Casa"),v->requestRideWith("Trabalho"),v->requestRide()};
        for(int i=0;i<3;i++){Button b=button(qs[i]);b.setOnClickListener(qa[i]);b.setLayoutParams(new LinearLayout.LayoutParams(0,-2,1));quick.addView(b);} root.addView(quick);
        root.addView(text("Localização do motorista",18,true));
        root.addView(text("Será exibida no mesmo mapa quando a sincronização entre aparelhos pelo Neon estiver ativa.",14,false));
        addClientNav(root); setContentView(scroll(root));
    }

    private void requestRide() {
        EditText i = new EditText(this); i.setHint("Destino"); i.setText("Praia da Costa, Vila Velha");
        new AlertDialog.Builder(this).setTitle("Escolher destino").setView(i)
                .setPositiveButton("Solicitar",(d,w)->requestRideWith(i.getText().toString().trim().isEmpty()?"Destino":i.getText().toString().trim()))
                .setNegativeButton("Cancelar",null).show();
    }

    private void requestRideWith(String dest) {
        clientTrips.add("Minha localização → " + dest + " • buscando motorista");
        Toast.makeText(this,"Corrida solicitada",Toast.LENGTH_SHORT).show(); showClientTrips();
    }

    private void showClientTrips() {
        mapWebView=null; LinearLayout root=column(); header(root,"Minhas viagens","Histórico e solicitações");
        if(clientTrips.isEmpty()) root.addView(text("Nenhuma viagem ainda.",16,false));
        for(String x:clientTrips) root.addView(text("🚗 "+x,16,true)); addClientNav(root); setContentView(scroll(root));
    }

    private void showClientFavorites() {
        mapWebView=null; LinearLayout root=column(); header(root,"Favoritos","Destinos rápidos");
        Button c=button("⌂ Casa");c.setOnClickListener(v->requestRideWith("Casa"));root.addView(c);
        Button t=button("▣ Trabalho");t.setOnClickListener(v->requestRideWith("Trabalho"));root.addView(t);
        Button n=button("＋ Adicionar favorito");n.setOnClickListener(v->Toast.makeText(this,"Favorito salvo em modo de teste",Toast.LENGTH_SHORT).show());root.addView(n);
        addClientNav(root); setContentView(scroll(root));
    }

    private void showDriverHome() {
        startGpsTracking(); mapWebView=null;
        LinearLayout root=column(); header(root,"Modo motorista",driverOnline?"ONLINE • mapa de ruas seguindo seu GPS":"OFFLINE • GPS permanece ativo enquanto conectado");
        root.addView(streetMapCard("POSIÇÃO DO MOTORISTA"));
        Button on=button(driverOnline?"🟢 Ficar Offline":"⚫ Ficar Online");on.setOnClickListener(v->{driverOnline=!driverOnline;showDriverHome();});root.addView(on);
        if(driverOnline){root.addView(text("Nova chamada de teste • Praia da Costa → Itapuã • R$ 32,50",17,true));Button ac=button("Aceitar corrida");ac.setOnClickListener(v->{driverTrips.add("Praia da Costa → Itapuã • concluída");driverEarnings+=26;showDriverTrips();});root.addView(ac);Button rc=button("Recusar");rc.setOnClickListener(v->Toast.makeText(this,"Chamada recusada",Toast.LENGTH_SHORT).show());root.addView(rc);} 
        addDriverNav(root); setContentView(scroll(root));
    }

    private void showDriverTrips(){mapWebView=null;LinearLayout root=column();header(root,"Viagens do motorista","Corridas aceitas e concluídas");if(driverTrips.isEmpty())root.addView(text("Nenhuma viagem ainda.",16,false));for(String x:driverTrips)root.addView(text("🚗 "+x,16,true));addDriverNav(root);setContentView(scroll(root));}
    private void showDriverEarnings(){mapWebView=null;LinearLayout root=column();header(root,"Ganhos","Resumo financeiro");root.addView(text(String.format(Locale.getDefault(),"R$ %.2f",driverEarnings),34,true));root.addView(text(driverTrips.size()+" viagem(ns)",16,false));addDriverNav(root);setContentView(scroll(root));}

    private void showAccount(){mapWebView=null;LinearLayout root=column();header(root,"Minha conta",role.equals("client")?"Cliente":"Motorista");Button sec=button("🛡 Central de segurança");sec.setOnClickListener(v->new AlertDialog.Builder(this).setTitle("Segurança").setMessage("Em emergência ligue 190 ou 192.").setPositiveButton("OK",null).show());root.addView(sec);Button out=button("Sair");out.setOnClickListener(v->showRoleChooser());root.addView(out);Button back=button("Voltar");back.setOnClickListener(v->{if(role.equals("client"))showClientHome();else showDriverHome();});root.addView(back);setContentView(scroll(root));}

    private void showAdminHome(){mapWebView=null;LinearLayout root=column();header(root,"Painel da Gerência","Controle de motoristas, clientes e corridas");root.addView(text("Clientes: 1",20,true));root.addView(text("Motoristas: 1",20,true));root.addView(text("Corridas: "+(clientTrips.size()+driverTrips.size()),20,true));Button out=button("Sair");out.setOnClickListener(v->showRoleChooser());root.addView(out);setContentView(scroll(root));}

    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] grantResults){super.onRequestPermissionsResult(requestCode,permissions,grantResults);if(requestCode==LOCATION_REQUEST&&grantResults.length>0&&grantResults[0]==PackageManager.PERMISSION_GRANTED)startGpsTracking();}

    @Override public void onBackPressed(){if(role.equals("client"))showClientHome();else if(role.equals("driver"))showDriverHome();else if(role.equals("admin"))showAdminHome();else showRoleChooser();}
}
