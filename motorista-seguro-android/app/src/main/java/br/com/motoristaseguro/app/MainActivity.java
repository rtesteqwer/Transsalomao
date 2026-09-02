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
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.text.InputType;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.webkit.WebChromeClient;
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

import java.util.Locale;

public class MainActivity extends Activity implements LocationListener {
    private static final int LOCATION_REQUEST = 3101;
    private static final int BG = 0xff111111;
    private static final int CARD = 0xff292929;
    private static final int CARD2 = 0xff363636;
    private static final int WHITE = 0xfff4f4f4;
    private static final int MUTED = 0xffaaaaaa;
    private static final int ACCENT = 0xffc9ff35;

    private String role = "";
    private LocationManager locationManager;
    private boolean directRegistered = false;
    private boolean receiverRegistered = false;
    private boolean mapReady = false;
    private double lastLat = Double.NaN;
    private double lastLng = Double.NaN;
    private float lastAccuracy = 0f;
    private WebView mapWebView;
    private TextView gpsLabel;
    private float sheetMaxTranslation;
    private boolean driverOnline = false;

    private final BroadcastReceiver locationReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (!LocationForegroundService.ACTION_LOCATION.equals(intent.getAction())) return;
            applyLocation(intent.getDoubleExtra("lat", Double.NaN), intent.getDoubleExtra("lng", Double.NaN), intent.getFloatExtra("accuracy", 0f));
        }
    };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        loadLastLocation();
        showRoleChooser();
    }

    @Override protected void onStart() {
        super.onStart();
        if (!receiverRegistered) {
            IntentFilter f = new IntentFilter(LocationForegroundService.ACTION_LOCATION);
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(locationReceiver, f, Context.RECEIVER_NOT_EXPORTED);
            else registerReceiver(locationReceiver, f);
            receiverRegistered = true;
        }
        if (!role.isEmpty() && !role.equals("admin")) startDirectLocationUpdates();
    }

    @Override protected void onStop() {
        if (receiverRegistered) {
            try { unregisterReceiver(locationReceiver); } catch (Exception ignored) {}
            receiverRegistered = false;
        }
        stopDirectLocationUpdates();
        super.onStop();
    }

    @Override public void onLocationChanged(Location l) {
        if (l != null) applyLocation(l.getLatitude(), l.getLongitude(), l.hasAccuracy() ? l.getAccuracy() : 0f);
    }
    @Override public void onProviderEnabled(String p) {}
    @Override public void onProviderDisabled(String p) { refreshGps(); }
    @Override public void onStatusChanged(String p, int s, Bundle b) {}

    private int dp(int n) { return (int)(n * getResources().getDisplayMetrics().density + .5f); }

    private GradientDrawable rounded(int color, int radius) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(radius));
        return g;
    }

    private TextView text(String s, int sp, boolean bold) {
        TextView v = new TextView(this);
        v.setText(s);
        v.setTextSize(sp);
        v.setTextColor(WHITE);
        v.setPadding(dp(4), dp(5), dp(4), dp(5));
        if (bold) v.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return v;
    }

    private TextView muted(String s, int sp) {
        TextView v = text(s, sp, false);
        v.setTextColor(MUTED);
        return v;
    }

    private Button button(String s) {
        Button b = new Button(this);
        b.setAllCaps(false);
        b.setText(s);
        b.setTextColor(WHITE);
        b.setTextSize(16);
        b.setBackground(rounded(CARD2, 18));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(56));
        lp.setMargins(0, dp(6), 0, dp(6));
        b.setLayoutParams(lp);
        return b;
    }

    private Button accentButton(String s) {
        Button b = button(s);
        b.setTextColor(Color.BLACK);
        b.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        b.setBackground(rounded(ACCENT, 18));
        return b;
    }

    private LinearLayout page() {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.VERTICAL);
        r.setPadding(dp(20), dp(24), dp(20), dp(32));
        r.setBackgroundColor(BG);
        return r;
    }

    private ScrollView scroll(LinearLayout c) {
        ScrollView s = new ScrollView(this);
        s.setFillViewport(true);
        s.setBackgroundColor(BG);
        s.addView(c);
        return s;
    }

    private void loadLastLocation() {
        SharedPreferences p = getSharedPreferences(LocationForegroundService.PREFS, MODE_PRIVATE);
        try {
            String la = p.getString("lat", null), ln = p.getString("lng", null);
            if (la != null && ln != null) {
                lastLat = Double.parseDouble(la);
                lastLng = Double.parseDouble(ln);
            }
            lastAccuracy = p.getFloat("accuracy", 0f);
        } catch (Exception ignored) {}
    }

    private void applyLocation(double lat, double lng, float acc) {
        if (Double.isNaN(lat) || Double.isNaN(lng)) return;
        lastLat = lat;
        lastLng = lng;
        lastAccuracy = acc;
        getSharedPreferences(LocationForegroundService.PREFS, MODE_PRIVATE).edit()
            .putString("lat", Double.toString(lat))
            .putString("lng", Double.toString(lng))
            .putFloat("accuracy", acc)
            .apply();
        refreshGps();
        updateMapPosition();
    }

    private boolean locationEnabled() {
        try {
            if (Build.VERSION.SDK_INT >= 28) return locationManager.isLocationEnabled();
            return locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) || locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        } catch (Exception e) { return false; }
    }

    private String gpsText() {
        if (!locationEnabled()) return "GPS desligado";
        if (Double.isNaN(lastLat)) return "GPS ativo • localizando…";
        return String.format(Locale.US, "GPS ao vivo • %.5f, %.5f • ±%.0f m", lastLat, lastLng, lastAccuracy);
    }

    private void refreshGps() {
        if (gpsLabel != null) gpsLabel.setText(gpsText());
    }

    private void startGps() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, LOCATION_REQUEST);
            return;
        }
        if (!locationEnabled()) {
            new AlertDialog.Builder(this)
                .setTitle("Ativar localização")
                .setMessage("Ative o GPS para mostrar sua posição no mapa.")
                .setPositiveButton("Abrir configurações", (d,w) -> startActivity(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)))
                .setNegativeButton("Agora não", null)
                .show();
            return;
        }
        startDirectLocationUpdates();
        Intent i = new Intent(this, LocationForegroundService.class);
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i);
    }

    private void startDirectLocationUpdates() {
        if (directRegistered) return;
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) return;
        try {
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER))
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000, 0, this);
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER))
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 1500, 0, this);
            directRegistered = true;
        } catch (Exception ignored) {}
    }

    private void stopDirectLocationUpdates() {
        if (!directRegistered) return;
        try { locationManager.removeUpdates(this); } catch (Exception ignored) {}
        directRegistered = false;
    }

    private void stopGps() {
        stopDirectLocationUpdates();
        try { stopService(new Intent(this, LocationForegroundService.class)); } catch (Exception ignored) {}
    }

    private String mapHtml() {
        double lat = Double.isNaN(lastLat) ? -20.3297 : lastLat;
        double lng = Double.isNaN(lastLng) ? -40.2925 : lastLng;
        return "<!doctype html><html><head>"+
            "<meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=yes'>"+
            "<link rel='stylesheet' href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'>"+
            "<style>html,body,#map{margin:0;width:100%;height:100%;background:#1c1f24} .leaflet-control-attribution{font-size:9px!important}</style>"+
            "</head><body><div id='map'></div>"+
            "<script src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'></script>"+
            "<script>var map=L.map('map',{zoomControl:false}).setView(["+lat+","+lng+"],17);"+
            "L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:20,attribution:'&copy; OpenStreetMap &copy; CARTO'}).addTo(map);"+
            "var marker=L.circleMarker(["+lat+","+lng+"],{radius:9,color:'#fff',weight:4,fillColor:'#4285f4',fillOpacity:1}).addTo(map);"+
            "var accuracy=L.circle(["+lat+","+lng+"],{radius:"+Math.max(3,lastAccuracy)+",color:'#4285f4',weight:1,fillOpacity:.10}).addTo(map);"+
            "window.setPos=function(a,b,c){marker.setLatLng([a,b]);accuracy.setLatLng([a,b]);accuracy.setRadius(Math.max(3,c));map.setView([a,b],18,{animate:true});};"+
            "window.recenter=function(){map.setView(marker.getLatLng(),18,{animate:true});};"+
            "</script></body></html>";
    }

    private WebView mapView() {
        mapReady = false;
        WebView w = new WebView(this);
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        w.setWebChromeClient(new WebChromeClient());
        w.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                mapReady = true;
                updateMapPosition();
            }
        });
        w.setBackgroundColor(0xff1c1f24);
        mapWebView = w;
        w.loadDataWithBaseURL("https://unpkg.com/", mapHtml(), "text/html", "UTF-8", null);
        return w;
    }

    private void updateMapPosition() {
        if (mapWebView == null || !mapReady || Double.isNaN(lastLat) || Double.isNaN(lastLng)) return;
        String js = String.format(Locale.US, "if(window.setPos){setPos(%f,%f,%f);}", lastLat, lastLng, lastAccuracy);
        mapWebView.evaluateJavascript(js, null);
    }

    private void recenterMap() {
        if (mapWebView != null && mapReady) mapWebView.evaluateJavascript("if(window.recenter){recenter();}", null);
    }

    private void openGoogleMaps() {
        if (Double.isNaN(lastLat) || Double.isNaN(lastLng)) {
            Toast.makeText(this, "Aguardando localização GPS", Toast.LENGTH_SHORT).show();
            return;
        }
        Uri u = Uri.parse(String.format(Locale.US, "https://www.google.com/maps/search/?api=1&query=%f,%f", lastLat, lastLng));
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, u);
            i.setPackage("com.google.android.apps.maps");
            startActivity(i);
        } catch (Exception e) {
            startActivity(new Intent(Intent.ACTION_VIEW, u));
        }
    }

    private TextView dragHandle() {
        TextView h = text("━━━━", 22, true);
        h.setTextColor(0xff555555);
        h.setGravity(Gravity.CENTER);
        return h;
    }

    private void makeDraggable(TextView h, LinearLayout sheet) {
        final float[] y = {0}, start = {0};
        sheet.post(() -> sheetMaxTranslation = Math.max(0, sheet.getHeight() - dp(135)));
        h.setOnTouchListener((v,e) -> {
            if (e.getAction() == MotionEvent.ACTION_DOWN) {
                y[0] = e.getRawY(); start[0] = sheet.getTranslationY(); return true;
            }
            if (e.getAction() == MotionEvent.ACTION_MOVE) {
                float t = start[0] + e.getRawY() - y[0];
                sheet.setTranslationY(Math.max(0, Math.min(sheetMaxTranslation, t)));
                return true;
            }
            if (e.getAction() == MotionEvent.ACTION_UP || e.getAction() == MotionEvent.ACTION_CANCEL) {
                float d = sheet.getTranslationY() > sheetMaxTranslation * .45f ? sheetMaxTranslation : 0;
                sheet.animate().translationY(d).setDuration(180).start();
                return true;
            }
            return false;
        });
    }

    private LinearLayout navItem(String icon, String label, boolean selected, Runnable action) {
        LinearLayout item = new LinearLayout(this);
        item.setOrientation(LinearLayout.VERTICAL);
        item.setGravity(Gravity.CENTER);
        item.setPadding(dp(4), dp(5), dp(4), dp(5));
        item.setBackground(selected ? rounded(CARD2, 24) : rounded(Color.TRANSPARENT, 24));
        TextView ic = text(icon, 20, true);
        ic.setGravity(Gravity.CENTER);
        ic.setTextColor(selected ? WHITE : MUTED);
        TextView lb = text(label, 11, selected);
        lb.setGravity(Gravity.CENTER);
        lb.setTextColor(selected ? WHITE : MUTED);
        lb.setSingleLine(true);
        item.addView(ic, new LinearLayout.LayoutParams(-1, dp(30)));
        item.addView(lb, new LinearLayout.LayoutParams(-1, dp(25)));
        item.setOnClickListener(v -> action.run());
        return item;
    }

    private LinearLayout bottomNav(boolean client, int selected) {
        LinearLayout nav = new LinearLayout(this);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        nav.setPadding(dp(8), dp(6), dp(8), dp(6));
        nav.setBackground(rounded(0xf4181818, 32));
        String[] icons = client ? new String[]{"⌂","▦","▣","●"} : new String[]{"⌂","◉","R$","●"};
        String[] labels = client ? new String[]{"Início","Opções","Atividade","Conta"} : new String[]{"Início","Chamadas","Ganhos","Conta"};
        for (int i=0;i<4;i++) {
            final int x = i;
            Runnable action = () -> {
                if (client) {
                    if (x==0) showClientHome(); else if (x==1) showClientOptions(); else if (x==2) showClientActivity(); else showClientAccount();
                } else {
                    if (x==0) showDriverHome(); else if (x==1) showDriverCalls(); else if (x==2) showDriverEarnings(); else showDriverAccount();
                }
            };
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(66), 1f);
            lp.setMargins(dp(4), 0, dp(4), 0);
            nav.addView(navItem(icons[i], labels[i], i==selected, action), lp);
        }
        return nav;
    }

    private Button optionCard(String icon, String label) {
        Button b = new Button(this);
        b.setAllCaps(false);
        b.setText(icon + "\n" + label);
        b.setTextColor(WHITE);
        b.setTextSize(17);
        b.setGravity(Gravity.CENTER);
        b.setBackground(rounded(CARD2, 22));
        b.setPadding(dp(10), dp(14), dp(10), dp(14));
        b.setOnClickListener(v -> Toast.makeText(this, label, Toast.LENGTH_SHORT).show());
        return b;
    }

    private LinearLayout optionRow(String i1, String l1, String i2, String l2) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams lp1 = new LinearLayout.LayoutParams(0, dp(150), 1f);
        lp1.setMargins(0, dp(7), dp(7), dp(7));
        LinearLayout.LayoutParams lp2 = new LinearLayout.LayoutParams(0, dp(150), 1f);
        lp2.setMargins(dp(7), dp(7), 0, dp(7));
        row.addView(optionCard(i1,l1), lp1);
        row.addView(optionCard(i2,l2), lp2);
        return row;
    }

    private void showRoleChooser() {
        role = "";
        stopGps();
        LinearLayout r = page();
        r.setGravity(Gravity.CENTER_HORIZONTAL);
        TextView logo = text("TSV", 44, true); logo.setTextColor(ACCENT);
        r.addView(logo);
        r.addView(text("Transporte Seguro Vix", 29, true));
        r.addView(muted("v2.2 • escolha como deseja entrar", 15));
        Button c = accentButton("Entrar como Cliente");
        Button d = button("Entrar como Motorista");
        Button a = button("Entrar como Gerência");
        c.setOnClickListener(v -> showLogin("client"));
        d.setOnClickListener(v -> showLogin("driver"));
        a.setOnClickListener(v -> showLogin("admin"));
        r.addView(c); r.addView(d); r.addView(a);
        setContentView(scroll(r));
    }

    private void showLogin(String r) {
        String title = r.equals("client") ? "Cliente" : r.equals("driver") ? "Motorista" : "Gerência";
        String email = r.equals("client") ? "cliente@motoristaseguro.app" : r.equals("driver") ? "motorista@motoristaseguro.app" : "admin@motoristaseguro.app";
        String pass = r.equals("client") ? "Cliente@2026!" : r.equals("driver") ? "Motorista@2026!" : "Admin@2026!";
        LinearLayout p = page();
        p.addView(text("Entrar como " + title, 31, true));
        p.addView(muted("Acesso de teste já preenchido", 15));
        EditText e = new EditText(this); e.setText(email); e.setTextColor(WHITE); e.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        EditText pw = new EditText(this); pw.setText(pass); pw.setTextColor(WHITE); pw.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);
        p.addView(e); p.addView(pw);
        Button enter = accentButton("Entrar");
        enter.setOnClickListener(v -> {
            if (!email.equalsIgnoreCase(e.getText().toString().trim()) || !pass.equals(pw.getText().toString())) {
                Toast.makeText(this, "Login inválido para este perfil", Toast.LENGTH_SHORT).show(); return;
            }
            role = r;
            if (!r.equals("admin")) startGps();
            if (r.equals("client")) showClientHome(); else if (r.equals("driver")) showDriverHome(); else showAdmin();
        });
        Button back = button("Voltar"); back.setOnClickListener(v -> showRoleChooser());
        p.addView(enter); p.addView(back);
        setContentView(scroll(p));
    }

    private void showClientHome() {
        role = "client";
        startGps();
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(BG);
        root.addView(mapView(), new FrameLayout.LayoutParams(-1,-1));

        Button gps = new Button(this);
        gps.setText("◎"); gps.setTextSize(25); gps.setTextColor(WHITE); gps.setBackground(rounded(0xee171717,30));
        gps.setOnClickListener(v -> { startGps(); recenterMap(); });
        FrameLayout.LayoutParams gp = new FrameLayout.LayoutParams(dp(58),dp(58),Gravity.TOP|Gravity.END);
        gp.setMargins(0,dp(20),dp(20),0); root.addView(gps,gp);

        Button gm = new Button(this);
        gm.setText("G"); gm.setTextSize(18); gm.setTextColor(WHITE); gm.setBackground(rounded(0xee171717,30));
        gm.setOnClickListener(v -> openGoogleMaps());
        FrameLayout.LayoutParams gmp = new FrameLayout.LayoutParams(dp(58),dp(58),Gravity.TOP|Gravity.START);
        gmp.setMargins(dp(20),dp(20),0,0); root.addView(gm,gmp);

        LinearLayout sheet = new LinearLayout(this);
        sheet.setOrientation(LinearLayout.VERTICAL);
        sheet.setPadding(dp(20),dp(4),dp(20),dp(16));
        sheet.setBackground(rounded(BG,28));
        TextView h = dragHandle(); sheet.addView(h);
        sheet.addView(text("Insira seu destino",28,true));
        sheet.addView(muted("Arraste para baixo para ver mais do mapa",14));
        Button search = button("▣   Para onde?");
        search.setGravity(Gravity.START|Gravity.CENTER_VERTICAL);
        search.setOnClickListener(v -> showPlanTrip());
        sheet.addView(search);
        gpsLabel = muted(gpsText(),13); sheet.addView(gpsLabel);
        sheet.addView(bottomNav(true,0));
        makeDraggable(h,sheet);
        FrameLayout.LayoutParams sp = new FrameLayout.LayoutParams(-1,dp(330),Gravity.BOTTOM);
        root.addView(sheet,sp);
        setContentView(root);
    }

    private void showPlanTrip() {
        LinearLayout p = page();
        p.addView(text("Planeje sua próxima viagem",29,true));
        p.addView(muted("Origem pelo GPS e destino desejado",14));
        p.addView(button("◷  Ir agora"));
        p.addView(button("●  Minha localização atual"));
        EditText d = new EditText(this); d.setHint("Para onde?"); d.setHintTextColor(MUTED); d.setTextColor(WHITE); d.setBackground(rounded(CARD2,18)); d.setPadding(dp(14),0,dp(14),0);
        p.addView(d,new LinearLayout.LayoutParams(-1,dp(58)));
        Button go = accentButton("Pesquisar destino");
        go.setOnClickListener(v -> { if (d.getText().toString().trim().isEmpty()) Toast.makeText(this,"Informe o destino",Toast.LENGTH_SHORT).show(); else { Toast.makeText(this,"Destino selecionado: "+d.getText(),Toast.LENGTH_LONG).show(); showClientHome(); } });
        p.addView(go);
        Button back = button("Voltar ao mapa"); back.setOnClickListener(v -> showClientHome()); p.addView(back);
        setContentView(scroll(p));
    }

    private void showClientOptions() {
        LinearLayout p = page();
        p.addView(text("Opções",34,true));
        p.addView(muted("Vá para onde quiser, peça o que precisar",17));
        p.addView(optionRow("🚗","Viagem","🕒","Agendar"));
        p.addView(optionRow("👩","Motorista Mulher","👥","Para terceiros"));
        p.addView(optionRow("🏢","Empresa","♿","Senior"));
        LinearLayout.LayoutParams navp = new LinearLayout.LayoutParams(-1,dp(78)); navp.setMargins(0,dp(24),0,0);
        p.addView(bottomNav(true,1), navp);
        setContentView(scroll(p));
    }

    private void showClientActivity() {
        LinearLayout p = page();
        p.addView(text("Atividade",34,true));
        p.addView(muted("Anteriores",18));
        LinearLayout c = page(); c.setPadding(dp(16),dp(14),dp(16),dp(14)); c.setBackground(rounded(CARD,22));
        c.addView(text("Av. Santa Leopoldina, nº 1200",21,true)); c.addView(muted("2 de jul. • 15:23",14)); c.addView(muted("R$ 19,83 • Parada: 1",14)); c.addView(button("☆ Avaliar"));
        p.addView(c);
        LinearLayout.LayoutParams navp = new LinearLayout.LayoutParams(-1,dp(78)); navp.setMargins(0,dp(24),0,0); p.addView(bottomNav(true,2),navp);
        setContentView(scroll(p));
    }

    private void showClientAccount() {
        LinearLayout p = page();
        p.addView(text("Cliente Teste",34,true));
        p.addView(muted("★ 5.0 • Conta de teste",15));
        String[] x = {"Ajuda","Carteira","Segurança","Mensagens","Dados pessoais","Meus veículos","Pagamentos","Configurações","Privacidade e localização"};
        for (String s : x) p.addView(button(s));
        Button out = button("Sair"); out.setOnClickListener(v -> showRoleChooser()); p.addView(out);
        LinearLayout.LayoutParams navp = new LinearLayout.LayoutParams(-1,dp(78)); navp.setMargins(0,dp(24),0,0); p.addView(bottomNav(true,3),navp);
        setContentView(scroll(p));
    }

    private void showDriverHome() {
        role = "driver"; startGps();
        FrameLayout root = new FrameLayout(this); root.setBackgroundColor(BG); root.addView(mapView(),new FrameLayout.LayoutParams(-1,-1));
        Button gps = new Button(this); gps.setText("◎"); gps.setTextColor(WHITE); gps.setTextSize(25); gps.setBackground(rounded(0xee171717,30)); gps.setOnClickListener(v -> recenterMap());
        FrameLayout.LayoutParams gp = new FrameLayout.LayoutParams(dp(58),dp(58),Gravity.TOP|Gravity.END); gp.setMargins(0,dp(20),dp(20),0); root.addView(gps,gp);
        LinearLayout sheet = new LinearLayout(this); sheet.setOrientation(LinearLayout.VERTICAL); sheet.setPadding(dp(20),dp(4),dp(20),dp(16)); sheet.setBackground(rounded(BG,28));
        TextView h = dragHandle(); sheet.addView(h); sheet.addView(text(driverOnline?"Você está online":"Você está offline",27,true)); gpsLabel=muted(gpsText(),13); sheet.addView(gpsLabel);
        Button on = driverOnline ? button("FICAR OFFLINE") : accentButton("FICAR ONLINE"); on.setOnClickListener(v -> {driverOnline=!driverOnline;showDriverHome();}); sheet.addView(on); sheet.addView(bottomNav(false,0)); makeDraggable(h,sheet);
        FrameLayout.LayoutParams sp = new FrameLayout.LayoutParams(-1,dp(270),Gravity.BOTTOM); root.addView(sheet,sp); setContentView(root);
    }

    private void showDriverCalls() {
        LinearLayout p=page(); p.addView(text("Chamadas",34,true)); p.addView(muted(driverOnline?"Você está disponível para novas solicitações":"Fique online para receber solicitações",16));
        LinearLayout c=page(); c.setPadding(dp(16),dp(14),dp(16),dp(14)); c.setBackground(rounded(CARD,22)); c.addView(text("Nova solicitação",23,true)); c.addView(text("R$ 38,70",29,true)); c.addView(muted("2,3 km até o cliente • 12,4 km de viagem",14));
        Button accept=accentButton("ACEITAR"); accept.setOnClickListener(v->Toast.makeText(this,"Corrida aceita",Toast.LENGTH_SHORT).show()); c.addView(accept); p.addView(c); p.addView(bottomNav(false,1)); setContentView(scroll(p));
    }

    private void showDriverEarnings() {
        LinearLayout p=page(); p.addView(text("Ganhos",34,true)); p.addView(text("R$ 184,20",31,true)); p.addView(muted("Hoje",15)); p.addView(button("Semana • R$ 1.084,50")); p.addView(button("Mês • R$ 4.420,80")); p.addView(bottomNav(false,2)); setContentView(scroll(p));
    }

    private void showDriverAccount() {
        LinearLayout p=page(); p.addView(text("Motorista Teste",34,true)); p.addView(muted("★ 5.0 • CNH B • EAR ativo • Aprovado",15));
        String[] x={"Dados pessoais","CNH","Documentos","Segurança","Avaliações","Configurações"}; for(String s:x)p.addView(button(s)); Button out=button("Sair"); out.setOnClickListener(v->showRoleChooser()); p.addView(out); p.addView(bottomNav(false,3)); setContentView(scroll(p));
    }

    private void showAdmin() {
        role="admin"; LinearLayout p=page(); p.addView(text("Gerência",34,true)); p.addView(muted("Painel operacional de teste • v2.2",15));
        String[] x={"Dashboard","Corridas","Motoristas","Clientes","Financeiro","Mapa","Relatórios","Configurações"}; for(String s:x)p.addView(button(s)); Button out=button("Sair"); out.setOnClickListener(v->showRoleChooser()); p.addView(out); setContentView(scroll(p));
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode,permissions,grantResults);
        if(requestCode==LOCATION_REQUEST && grantResults.length>0 && grantResults[0]==PackageManager.PERMISSION_GRANTED) {
            startGps();
            if(role.equals("client"))showClientHome(); else if(role.equals("driver"))showDriverHome();
        }
    }
}
