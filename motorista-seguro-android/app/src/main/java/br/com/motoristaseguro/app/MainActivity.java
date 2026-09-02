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
import android.graphics.drawable.GradientDrawable;
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
import android.widget.FrameLayout;
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
    private long lastMapUpdateMs = 0L;
    private boolean receiverRegistered = false;
    private TextView gpsStatusView;
    private WebView mapWebView;
    private String currentDestination = null;

    private final BroadcastReceiver locationReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (!LocationForegroundService.ACTION_LOCATION.equals(intent.getAction())) return;
            lastLat = intent.getDoubleExtra("lat", Double.NaN);
            lastLng = intent.getDoubleExtra("lng", Double.NaN);
            lastAccuracy = intent.getFloatExtra("accuracy", 0f);
            refreshGpsLabel();
            refreshGoogleMap(false);
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

    private Button compactButton(String label) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(13);
        b.setMinHeight(0);
        b.setMinimumHeight(0);
        b.setPadding(dp(5), dp(8), dp(5), dp(8));
        return b;
    }

    private GradientDrawable rounded(int color, float radiusDp) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(dp((int)radiusDp));
        return d;
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
        return Math.sqrt(dx*dx + dy*dy) > 15.0;
    }

    private String googleMapUrl() {
        double lat = Double.isNaN(lastLat) ? -20.3297 : lastLat;
        double lng = Double.isNaN(lastLng) ? -40.2925 : lastLng;
        return String.format(Locale.US,
                "https://www.google.com/maps/@?api=1&map_action=map&center=%.6f%%2C%.6f&zoom=18&basemap=roadmap",
                lat, lng);
    }

    private String googleDirectionsUrl(String destination) {
        double lat = Double.isNaN(lastLat) ? -20.3297 : lastLat;
        double lng = Double.isNaN(lastLng) ? -40.2925 : lastLng;
        return String.format(Locale.US,
                "https://www.google.com/maps/dir/?api=1&origin=%.6f%%2C%.6f&destination=%s&travelmode=driving",
                lat, lng, Uri.encode(destination));
    }

    private WebView createGoogleMap() {
        mapWebView = new WebView(this);
        mapWebView.setBackgroundColor(0xffe5e7eb);
        mapWebView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings ws = mapWebView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setDatabaseEnabled(true);
        ws.setLoadWithOverviewMode(true);
        ws.setUseWideViewPort(true);
        ws.setBuiltInZoomControls(false);
        ws.setDisplayZoomControls(false);
        mapWebView.setWebViewClient(new WebViewClient());
        refreshGoogleMap(true);
        return mapWebView;
    }

    private void refreshGoogleMap(boolean force) {
        if (mapWebView == null) return;
        long now = System.currentTimeMillis();
        if (!force && (!movedEnough() || now - lastMapUpdateMs < 5000L)) return;
        if (currentDestination == null || currentDestination.trim().isEmpty()) mapWebView.loadUrl(googleMapUrl());
        else mapWebView.loadUrl(googleDirectionsUrl(currentDestination));
        lastMapUpdateMs = now;
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
        String q = String.format(Locale.US, "%.6f,%.6f", lastLat, lastLng);
        Uri u = Uri.parse("https://www.google.com/maps/search/?api=1&query=" + Uri.encode(q));
        startActivity(new Intent(Intent.ACTION_VIEW, u));
    }

    private void showRoleChooser() {
        role = "";
        currentDestination = null;
        stopGpsTracking();
        mapWebView = null;
        gpsStatusView = null;
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
            currentDestination = null;
            if (!r.equals("admin")) startGpsTracking();
            if (r.equals("client")) showClientHome(); else if (r.equals("driver")) showDriverHome(); else showAdminHome();
        });
        Button back = button("Voltar"); back.setOnClickListener(v -> showRoleChooser());
        root.addView(e); root.addView(p); root.addView(enter); root.addView(back);
        setContentView(scroll(root));
    }

    private LinearLayout clientBottomNav() {
        LinearLayout nav = new LinearLayout(this);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        nav.setGravity(Gravity.CENTER);
        nav.setBackground(rounded(0xff111111, 28));
        nav.setPadding(dp(4), dp(3), dp(4), dp(3));
        String[] names = {"⌂\nInício","▣\nViagens","♡\nFavoritos","☻\nConta"};
        View.OnClickListener[] acts = {v->showClientHome(),v->showClientTrips(),v->showClientFavorites(),v->showAccount()};
        for(int i=0;i<names.length;i++){
            Button b=compactButton(names[i]);
            b.setTextColor(i==0 ? 0xffc6ff39 : 0xffdddddd);
            b.setBackgroundColor(Color.TRANSPARENT);
            b.setOnClickListener(acts[i]);
            b.setLayoutParams(new LinearLayout.LayoutParams(0, dp(62), 1));
            nav.addView(b);
        }
        return nav;
    }

    private LinearLayout driverBottomNav() {
        LinearLayout nav = new LinearLayout(this);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        nav.setGravity(Gravity.CENTER);
        nav.setBackground(rounded(0xff111111, 28));
        nav.setPadding(dp(4), dp(3), dp(4), dp(3));
        String[] names = {"⌂\nInício","▣\nViagens","R$\nGanhos","☻\nConta"};
        View.OnClickListener[] acts = {v->showDriverHome(),v->showDriverTrips(),v->showDriverEarnings(),v->showAccount()};
        for(int i=0;i<names.length;i++){
            Button b=compactButton(names[i]);
            b.setTextColor(i==0 ? 0xffc6ff39 : 0xffdddddd);
            b.setBackgroundColor(Color.TRANSPARENT);
            b.setOnClickListener(acts[i]);
            b.setLayoutParams(new LinearLayout.LayoutParams(0, dp(62), 1));
            nav.addView(b);
        }
        return nav;
    }

    private Button floatingSearchButton() {
        Button search = new Button(this);
        search.setText("🔎  Para onde você vai?");
        search.setTextSize(19);
        search.setAllCaps(false);
        search.setGravity(Gravity.CENTER_VERTICAL | Gravity.LEFT);
        search.setPadding(dp(18),0,dp(18),0);
        search.setBackground(rounded(Color.WHITE, 25));
        search.setOnClickListener(v -> requestRide());
        return search;
    }

    private void showClientHome() {
        startGpsTracking();
        currentDestination = null;
        mapWebView = null;
        gpsStatusView = null;

        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(0xffe5e7eb);
        WebView map = createGoogleMap();
        frame.addView(map, new FrameLayout.LayoutParams(-1,-1));

        Button search = floatingSearchButton();
        FrameLayout.LayoutParams sp = new FrameLayout.LayoutParams(-1, dp(64));
        sp.gravity = Gravity.TOP;
        sp.setMargins(dp(18), dp(22), dp(18), 0);
        frame.addView(search, sp);

        Button center = compactButton("◎");
        center.setTextSize(23);
        center.setBackground(rounded(Color.WHITE, 28));
        center.setOnClickListener(v -> { currentDestination=null; refreshGoogleMap(true); });
        FrameLayout.LayoutParams cp = new FrameLayout.LayoutParams(dp(54), dp(54));
        cp.gravity = Gravity.RIGHT | Gravity.CENTER_VERTICAL;
        cp.setMargins(0,0,dp(16),dp(75));
        frame.addView(center, cp);

        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(18),dp(14),dp(18),dp(16));
        panel.setBackground(rounded(Color.WHITE, 30));

        LinearLayout titleRow = new LinearLayout(this); titleRow.setOrientation(LinearLayout.HORIZONTAL); titleRow.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = text("Boa viagem, Cliente", 27, true);
        titleRow.addView(title,new LinearLayout.LayoutParams(0,-2,1));
        TextView live = text("GPS ativo",13,false); live.setTextColor(0xff166534); titleRow.addView(live);
        panel.addView(titleRow);

        gpsStatusView = text(gpsSummary(), 13, true); gpsStatusView.setTextColor(0xff166534); panel.addView(gpsStatusView);

        LinearLayout quick = new LinearLayout(this); quick.setOrientation(LinearLayout.HORIZONTAL);
        String[] qs={"⌂\nCasa","▣\nTrabalho","＋\nOutro"};
        View.OnClickListener[] qa={v->requestRideWith("Casa"),v->requestRideWith("Trabalho"),v->requestRide()};
        for(int i=0;i<3;i++){Button b=compactButton(qs[i]);b.setTextSize(14);b.setOnClickListener(qa[i]);b.setLayoutParams(new LinearLayout.LayoutParams(0,dp(64),1));quick.addView(b);} panel.addView(quick);

        Button exact = compactButton("📍 Minha localização exata no Google Maps");
        exact.setTextSize(14); exact.setOnClickListener(v->openExactLocation()); panel.addView(exact);

        TextView driver = text("Localização do motorista",16,true); panel.addView(driver);
        TextView driverState = text("Aguardando sincronização do motorista em tempo real",13,false); driverState.setTextColor(0xff666666); panel.addView(driverState);

        panel.addView(clientBottomNav());
        FrameLayout.LayoutParams pp = new FrameLayout.LayoutParams(-1,-2);
        pp.gravity = Gravity.BOTTOM;
        pp.setMargins(0,0,0,0);
        frame.addView(panel,pp);
        setContentView(frame);
    }

    private void requestRide() {
        EditText i = new EditText(this); i.setHint("Destino"); i.setText("Praia da Costa, Vila Velha");
        new AlertDialog.Builder(this).setTitle("Escolher destino").setView(i)
                .setPositiveButton("Mostrar rota",(d,w)->requestRideWith(i.getText().toString().trim().isEmpty()?"Destino":i.getText().toString().trim()))
                .setNegativeButton("Cancelar",null).show();
    }

    private void requestRideWith(String dest) {
        currentDestination = dest;
        clientTrips.add("Minha localização → " + dest + " • rota no Google Maps");
        if (mapWebView != null) {
            mapWebView.loadUrl(googleDirectionsUrl(dest));
            Toast.makeText(this,"Rota aberta no Google Maps",Toast.LENGTH_SHORT).show();
        } else {
            Toast.makeText(this,"Destino salvo",Toast.LENGTH_SHORT).show();
            showClientHome();
            currentDestination = dest;
            if (mapWebView != null) mapWebView.loadUrl(googleDirectionsUrl(dest));
        }
    }

    private void showClientTrips() {
        mapWebView=null; gpsStatusView=null;
        LinearLayout root=column(); header(root,"Minhas viagens","Histórico e solicitações");
        if(clientTrips.isEmpty()) root.addView(text("Nenhuma viagem ainda.",16,false));
        for(String x:clientTrips) root.addView(text("🚗 "+x,16,true));
        Button back=button("Voltar ao mapa");back.setOnClickListener(v->showClientHome());root.addView(back);
        setContentView(scroll(root));
    }

    private void showClientFavorites() {
        mapWebView=null; gpsStatusView=null;
        LinearLayout root=column(); header(root,"Favoritos","Destinos rápidos");
        Button c=button("⌂ Casa");c.setOnClickListener(v->{showClientHome();requestRideWith("Casa");});root.addView(c);
        Button t=button("▣ Trabalho");t.setOnClickListener(v->{showClientHome();requestRideWith("Trabalho");});root.addView(t);
        Button n=button("＋ Adicionar favorito");n.setOnClickListener(v->Toast.makeText(this,"Favorito salvo em modo de teste",Toast.LENGTH_SHORT).show());root.addView(n);
        Button back=button("Voltar ao mapa");back.setOnClickListener(v->showClientHome());root.addView(back);
        setContentView(scroll(root));
    }

    private void showDriverHome() {
        startGpsTracking();
        currentDestination = null;
        mapWebView=null; gpsStatusView=null;

        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(0xffe5e7eb);
        WebView map = createGoogleMap();
        frame.addView(map,new FrameLayout.LayoutParams(-1,-1));

        Button status = new Button(this);
        status.setAllCaps(false);
        status.setTextSize(18);
        status.setText(driverOnline ? "🟢 ONLINE" : "⚫ OFFLINE");
        status.setBackground(rounded(Color.WHITE,25));
        status.setOnClickListener(v->{driverOnline=!driverOnline;showDriverHome();});
        FrameLayout.LayoutParams stp = new FrameLayout.LayoutParams(dp(150),dp(58)); stp.gravity=Gravity.TOP|Gravity.CENTER_HORIZONTAL; stp.setMargins(0,dp(22),0,0); frame.addView(status,stp);

        Button center = compactButton("◎"); center.setTextSize(23); center.setBackground(rounded(Color.WHITE,28)); center.setOnClickListener(v->refreshGoogleMap(true));
        FrameLayout.LayoutParams cp = new FrameLayout.LayoutParams(dp(54),dp(54)); cp.gravity=Gravity.RIGHT|Gravity.CENTER_VERTICAL; cp.setMargins(0,0,dp(16),dp(70)); frame.addView(center,cp);

        LinearLayout panel = new LinearLayout(this); panel.setOrientation(LinearLayout.VERTICAL); panel.setPadding(dp(18),dp(14),dp(18),dp(16)); panel.setBackground(rounded(Color.WHITE,30));
        panel.addView(text("Modo motorista",27,true));
        gpsStatusView=text(gpsSummary(),13,true); gpsStatusView.setTextColor(0xff166534); panel.addView(gpsStatusView);
        panel.addView(text(driverOnline?"Recebendo solicitações próximas":"Fique online para receber chamadas",14,false));

        if(driverOnline){
            panel.addView(text("Nova chamada de teste\nPraia da Costa → Itapuã\nValor: R$ 32,50",16,true));
            LinearLayout actions=new LinearLayout(this);actions.setOrientation(LinearLayout.HORIZONTAL);
            Button rc=compactButton("Recusar");rc.setOnClickListener(v->Toast.makeText(this,"Chamada recusada",Toast.LENGTH_SHORT).show());rc.setLayoutParams(new LinearLayout.LayoutParams(0,dp(52),1));actions.addView(rc);
            Button ac=compactButton("Aceitar corrida");ac.setOnClickListener(v->{currentDestination="Itapuã, Vila Velha";if(mapWebView!=null)mapWebView.loadUrl(googleDirectionsUrl(currentDestination));driverTrips.add("Praia da Costa → Itapuã • aceita");driverEarnings+=26;Toast.makeText(this,"Corrida aceita e rota aberta",Toast.LENGTH_SHORT).show();});ac.setLayoutParams(new LinearLayout.LayoutParams(0,dp(52),1));actions.addView(ac);
            panel.addView(actions);
        }
        Button exact=compactButton("📍 Abrir minha posição no Google Maps");exact.setOnClickListener(v->openExactLocation());panel.addView(exact);
        panel.addView(driverBottomNav());
        FrameLayout.LayoutParams pp=new FrameLayout.LayoutParams(-1,-2);pp.gravity=Gravity.BOTTOM;frame.addView(panel,pp);
        setContentView(frame);
    }

    private void showDriverTrips(){mapWebView=null;gpsStatusView=null;LinearLayout root=column();header(root,"Viagens do motorista","Corridas aceitas e concluídas");if(driverTrips.isEmpty())root.addView(text("Nenhuma viagem ainda.",16,false));for(String x:driverTrips)root.addView(text("🚗 "+x,16,true));Button back=button("Voltar ao mapa");back.setOnClickListener(v->showDriverHome());root.addView(back);setContentView(scroll(root));}
    private void showDriverEarnings(){mapWebView=null;gpsStatusView=null;LinearLayout root=column();header(root,"Ganhos","Resumo financeiro");root.addView(text(String.format(Locale.getDefault(),"R$ %.2f",driverEarnings),34,true));root.addView(text(driverTrips.size()+" viagem(ns)",16,false));Button back=button("Voltar ao mapa");back.setOnClickListener(v->showDriverHome());root.addView(back);setContentView(scroll(root));}

    private void showAccount(){mapWebView=null;gpsStatusView=null;LinearLayout root=column();header(root,"Minha conta",role.equals("client")?"Cliente":"Motorista");Button sec=button("🛡 Central de segurança");sec.setOnClickListener(v->new AlertDialog.Builder(this).setTitle("Segurança").setMessage("Em emergência ligue 190 ou 192.").setPositiveButton("OK",null).show());root.addView(sec);Button out=button("Sair");out.setOnClickListener(v->showRoleChooser());root.addView(out);Button back=button("Voltar ao mapa");back.setOnClickListener(v->{if(role.equals("client"))showClientHome();else showDriverHome();});root.addView(back);setContentView(scroll(root));}

    private void showAdminHome(){mapWebView=null;gpsStatusView=null;LinearLayout root=column();header(root,"Painel da Gerência","Controle de motoristas, clientes e corridas");root.addView(text("Clientes: 1",20,true));root.addView(text("Motoristas: 1",20,true));root.addView(text("Corridas: "+(clientTrips.size()+driverTrips.size()),20,true));Button out=button("Sair");out.setOnClickListener(v->showRoleChooser());root.addView(out);setContentView(scroll(root));}

    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] grantResults){super.onRequestPermissionsResult(requestCode,permissions,grantResults);if(requestCode==LOCATION_REQUEST&&grantResults.length>0&&grantResults[0]==PackageManager.PERMISSION_GRANTED)startGpsTracking();}

    @Override public void onBackPressed(){if(role.equals("client"))showClientHome();else if(role.equals("driver"))showDriverHome();else if(role.equals("admin"))showAdminHome();else showRoleChooser();}
}
