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
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Space;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class MainActivity extends Activity implements LocationListener {
    private static final int LOCATION_REQUEST = 3101;
    private static final int BG = 0xff101011;
    private static final int CARD = 0xff1b1b1d;
    private static final int CARD2 = 0xff29292c;
    private static final int WHITE = 0xfff7f7f7;
    private static final int MUTED = 0xffa9a9ad;
    private static final int LINE = 0xff3a3a3d;
    private static final int ACCENT = 0xffc9ff35;
    private static final String RIDE_PREFS = "tsv_ride_v3";
    private static final String DRIVER_PREFS = "tsv_driver_v3";
    private static final String HISTORY_PREFS = "tsv_history_v3";

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

    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable pendingSearch;
    private Runnable pollRunnable;

    private static class PlaceSuggestion {
        final String label;
        final double lat;
        final double lng;
        PlaceSuggestion(String label, double lat, double lng) {
            this.label = label;
            this.lat = lat;
            this.lng = lng;
        }
    }

    private final BroadcastReceiver locationReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (!LocationForegroundService.ACTION_LOCATION.equals(intent.getAction())) return;
            applyLocation(
                intent.getDoubleExtra("lat", Double.NaN),
                intent.getDoubleExtra("lng", Double.NaN),
                intent.getFloatExtra("accuracy", 0f)
            );
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
            if (Build.VERSION.SDK_INT >= 33) {
                registerReceiver(locationReceiver, f, Context.RECEIVER_NOT_EXPORTED);
            } else {
                registerReceiver(locationReceiver, f);
            }
            receiverRegistered = true;
        }
        if (!role.isEmpty() && !role.equals("admin")) startDirectLocationUpdates();
    }

    @Override protected void onStop() {
        stopPolling();
        if (receiverRegistered) {
            try { unregisterReceiver(locationReceiver); } catch (Exception ignored) {}
            receiverRegistered = false;
        }
        stopDirectLocationUpdates();
        super.onStop();
    }

    @Override public void onLocationChanged(Location location) {
        if (location != null) {
            applyLocation(
                location.getLatitude(),
                location.getLongitude(),
                location.hasAccuracy() ? location.getAccuracy() : 0f
            );
        }
    }

    @Override public void onProviderEnabled(String provider) {}
    @Override public void onProviderDisabled(String provider) { refreshGps(); }
    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}

    private int dp(int n) {
        return (int) (n * getResources().getDisplayMetrics().density + 0.5f);
    }

    private GradientDrawable rounded(int color, int radius) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(radius));
        return g;
    }

    private GradientDrawable bordered(int color, int radius, int strokeColor) {
        GradientDrawable g = rounded(color, radius);
        g.setStroke(dp(1), strokeColor);
        return g;
    }

    private TextView text(String value, int size, boolean bold) {
        TextView v = new TextView(this);
        v.setText(value);
        v.setTextSize(size);
        v.setTextColor(WHITE);
        v.setPadding(0, dp(3), 0, dp(3));
        if (bold) v.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return v;
    }

    private TextView muted(String value, int size) {
        TextView v = text(value, size, false);
        v.setTextColor(MUTED);
        return v;
    }

    private Button button(String label) {
        Button b = new Button(this);
        b.setAllCaps(false);
        b.setText(label);
        b.setTextColor(WHITE);
        b.setTextSize(16);
        b.setGravity(Gravity.CENTER);
        b.setBackground(rounded(CARD2, 18));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(58));
        lp.setMargins(0, dp(7), 0, dp(7));
        b.setLayoutParams(lp);
        return b;
    }

    private Button primaryButton(String label) {
        Button b = button(label);
        b.setTextColor(Color.BLACK);
        b.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        b.setBackground(rounded(ACCENT, 18));
        return b;
    }

    private Button outlineButton(String label) {
        Button b = button(label);
        b.setBackground(bordered(BG, 18, LINE));
        return b;
    }

    private LinearLayout page() {
        LinearLayout p = new LinearLayout(this);
        p.setOrientation(LinearLayout.VERTICAL);
        p.setPadding(dp(22), dp(22), dp(22), dp(34));
        p.setBackgroundColor(BG);
        return p;
    }

    private ScrollView scroll(LinearLayout p) {
        ScrollView s = new ScrollView(this);
        s.setFillViewport(true);
        s.setBackgroundColor(BG);
        s.addView(p);
        return s;
    }

    private void gap(LinearLayout p, int h) {
        Space s = new Space(this);
        p.addView(s, new LinearLayout.LayoutParams(1, dp(h)));
    }

    private SharedPreferences ridePrefs() {
        return getSharedPreferences(RIDE_PREFS, MODE_PRIVATE);
    }

    private String rideStatus() {
        return ridePrefs().getString("status", "");
    }

    private boolean activeRide() {
        String s = rideStatus();
        return s.equals("searching") || s.equals("accepted") || s.equals("arriving")
            || s.equals("in_progress") || s.equals("completed");
    }

    private double rideDouble(String key, double fallback) {
        try {
            String value = ridePrefs().getString(key, null);
            return value == null ? fallback : Double.parseDouble(value);
        } catch (Exception e) {
            return fallback;
        }
    }

    private PlaceSuggestion rideDestination() {
        return new PlaceSuggestion(
            ridePrefs().getString("dest_name", "Destino"),
            rideDouble("dest_lat", lastLat),
            rideDouble("dest_lng", lastLng)
        );
    }

    private boolean driverOnline() {
        return getSharedPreferences(DRIVER_PREFS, MODE_PRIVATE).getBoolean("online", false);
    }

    private void setDriverOnline(boolean online) {
        getSharedPreferences(DRIVER_PREFS, MODE_PRIVATE).edit().putBoolean("online", online).apply();
    }

    private void stopPolling() {
        if (pollRunnable != null) handler.removeCallbacks(pollRunnable);
        pollRunnable = null;
    }

    private void pollRideStatus(String expected, Runnable changed) {
        stopPolling();
        pollRunnable = new Runnable() {
            @Override public void run() {
                if (!expected.equals(rideStatus())) {
                    changed.run();
                    return;
                }
                handler.postDelayed(this, 900);
            }
        };
        handler.postDelayed(pollRunnable, 900);
    }

    private void pollForDriverRequest() {
        stopPolling();
        pollRunnable = new Runnable() {
            @Override public void run() {
                if (driverOnline() && "searching".equals(rideStatus())) {
                    showDriverIncomingRide();
                    return;
                }
                handler.postDelayed(this, 900);
            }
        };
        handler.postDelayed(pollRunnable, 900);
    }

    private void loadLastLocation() {
        SharedPreferences p = getSharedPreferences(LocationForegroundService.PREFS, MODE_PRIVATE);
        try {
            String la = p.getString("lat", null);
            String ln = p.getString("lng", null);
            if (la != null && ln != null) {
                lastLat = Double.parseDouble(la);
                lastLng = Double.parseDouble(ln);
            }
            lastAccuracy = p.getFloat("accuracy", 0f);
        } catch (Exception ignored) {}
    }

    private void applyLocation(double lat, double lng, float accuracy) {
        if (Double.isNaN(lat) || Double.isNaN(lng)) return;
        lastLat = lat;
        lastLng = lng;
        lastAccuracy = accuracy;
        getSharedPreferences(LocationForegroundService.PREFS, MODE_PRIVATE)
            .edit()
            .putString("lat", Double.toString(lat))
            .putString("lng", Double.toString(lng))
            .putFloat("accuracy", accuracy)
            .apply();
        refreshGps();
        updateMapMarkerOnly();
    }

    private boolean locationEnabled() {
        try {
            if (Build.VERSION.SDK_INT >= 28) return locationManager.isLocationEnabled();
            return locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)
                || locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        } catch (Exception e) {
            return false;
        }
    }

    private String gpsText() {
        if (!locationEnabled()) return "GPS desligado";
        if (Double.isNaN(lastLat)) return "Localizando sua posição…";
        return String.format(Locale.US, "GPS • %.5f, %.5f • ±%.0f m", lastLat, lastLng, lastAccuracy);
    }

    private void refreshGps() {
        if (gpsLabel != null) gpsLabel.setText(gpsText());
    }

    private void startGps() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(
                new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION},
                LOCATION_REQUEST
            );
            return;
        }
        if (!locationEnabled()) {
            new AlertDialog.Builder(this)
                .setTitle("Ativar localização")
                .setMessage("Ative o GPS para usar o mapa e solicitar corridas.")
                .setPositiveButton("Abrir configurações", (d, w) ->
                    startActivity(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)))
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
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
            && checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) return;
        try {
            Location best = null;
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1200L, 0f, this);
                best = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            }
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 1800L, 0f, this);
                Location n = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
                if (best == null || (n != null && n.getTime() > best.getTime())) best = n;
            }
            directRegistered = true;
            if (best != null) onLocationChanged(best);
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

    private String mapHtml(double destLat, double destLng, boolean route) {
        double lat = Double.isNaN(lastLat) ? -20.3297 : lastLat;
        double lng = Double.isNaN(lastLng) ? -40.2925 : lastLng;
        double acc = Math.max(3, lastAccuracy);
        boolean hasDest = !Double.isNaN(destLat) && !Double.isNaN(destLng);
        String destJs = hasDest
            ? "var dest=L.circleMarker([" + destLat + "," + destLng + "],{radius:9,color:'#101011',weight:4,fillColor:'#c9ff35',fillOpacity:1}).addTo(map);"
            : "";
        String routeJs = hasDest && route
            ? "var line=L.polyline([[" + lat + "," + lng + "],[" + destLat + "," + destLng + "]],{color:'#161616',weight:5,opacity:.82}).addTo(map);map.fitBounds(line.getBounds(),{padding:[70,70]});"
            : "";
        return "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=yes'>"
            + "<link rel='stylesheet' href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'>"
            + "<style>html,body,#map{margin:0;width:100%;height:100%;background:#e9e9e9}.leaflet-control-attribution{font-size:8px!important}.leaflet-tile{filter:grayscale(1) contrast(.88) brightness(1.08)}</style>"
            + "</head><body><div id='map'></div>"
            + "<script src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'></script><script>"
            + "var map=L.map('map',{zoomControl:false,attributionControl:true}).setView([" + lat + "," + lng + "],17);"
            + "L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);"
            + "var me=L.circleMarker([" + lat + "," + lng + "],{radius:8,color:'#fff',weight:4,fillColor:'#2f80ed',fillOpacity:1}).addTo(map);"
            + "var accuracy=L.circle([" + lat + "," + lng + "],{radius:" + acc + ",color:'#2f80ed',weight:1,fillOpacity:.06}).addTo(map);"
            + destJs + routeJs
            + "window.setPos=function(a,b,c){me.setLatLng([a,b]);accuracy.setLatLng([a,b]);accuracy.setRadius(Math.max(3,c));};"
            + "window.recenter=function(){map.setView(me.getLatLng(),18,{animate:true});};"
            + "</script></body></html>";
    }

    private WebView mapView(double destLat, double destLng, boolean route) {
        mapReady = false;
        WebView w = new WebView(this);
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        w.setWebChromeClient(new WebChromeClient());
        w.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                mapReady = true;
                updateMapMarkerOnly();
            }
        });
        w.setBackgroundColor(0xffe9e9e9);
        mapWebView = w;
        w.loadDataWithBaseURL("https://unpkg.com/", mapHtml(destLat, destLng, route), "text/html", "UTF-8", null);
        return w;
    }

    private void updateMapMarkerOnly() {
        if (mapWebView == null || !mapReady || Double.isNaN(lastLat) || Double.isNaN(lastLng)) return;
        String js = String.format(
            Locale.US,
            "if(window.setPos){setPos(%f,%f,%f);}",
            lastLat, lastLng, lastAccuracy
        );
        mapWebView.evaluateJavascript(js, null);
    }

    private void recenterMap() {
        if (mapWebView != null && mapReady) {
            mapWebView.evaluateJavascript("if(window.recenter){recenter();}", null);
        }
    }

    private Button circleButton(String label) {
        Button b = new Button(this);
        b.setText(label);
        b.setTextSize(label.length() == 1 ? 19 : 15);
        b.setTextColor(WHITE);
        b.setAllCaps(false);
        b.setPadding(0, 0, 0, 0);
        b.setBackground(rounded(0xee151516, 30));
        return b;
    }

    private void addTopMapButtons(FrameLayout root) {
        Button profile = circleButton("G");
        profile.setOnClickListener(v -> showUserData());
        FrameLayout.LayoutParams pp = new FrameLayout.LayoutParams(dp(58), dp(58), Gravity.TOP | Gravity.START);
        pp.setMargins(dp(18), dp(18), 0, 0);
        root.addView(profile, pp);

        Button recenter = circleButton("◎");
        recenter.setTextSize(25);
        recenter.setOnClickListener(v -> {
            startGps();
            recenterMap();
        });
        FrameLayout.LayoutParams rp = new FrameLayout.LayoutParams(dp(58), dp(58), Gravity.TOP | Gravity.END);
        rp.setMargins(0, dp(18), dp(18), 0);
        root.addView(recenter, rp);
    }

    private LinearLayout bottomSheet() {
        LinearLayout s = new LinearLayout(this);
        s.setOrientation(LinearLayout.VERTICAL);
        s.setPadding(dp(22), dp(12), dp(22), dp(20));
        s.setBackground(rounded(BG, 30));
        TextView handle = text("━━━━", 20, true);
        handle.setTextColor(0xff5a5a5e);
        handle.setGravity(Gravity.CENTER);
        s.addView(handle, new LinearLayout.LayoutParams(-1, dp(30)));
        return s;
    }

    private void showMapWithSheet(WebView map, LinearLayout sheet, int sheetHeight) {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(BG);
        root.addView(map, new FrameLayout.LayoutParams(-1, -1));
        addTopMapButtons(root);
        FrameLayout.LayoutParams sp = new FrameLayout.LayoutParams(-1, dp(sheetHeight), Gravity.BOTTOM);
        root.addView(sheet, sp);
        setContentView(root);
    }

    private LinearLayout navItem(String icon, String label, boolean selected, Runnable action) {
        LinearLayout item = new LinearLayout(this);
        item.setOrientation(LinearLayout.VERTICAL);
        item.setGravity(Gravity.CENTER);
        TextView ic = text(icon, 21, true);
        ic.setGravity(Gravity.CENTER);
        ic.setTextColor(selected ? WHITE : MUTED);
        TextView lb = text(label, 10, selected);
        lb.setGravity(Gravity.CENTER);
        lb.setSingleLine(true);
        lb.setTextColor(selected ? WHITE : MUTED);
        item.addView(ic, new LinearLayout.LayoutParams(-1, dp(28)));
        item.addView(lb, new LinearLayout.LayoutParams(-1, dp(26)));
        item.setOnClickListener(v -> action.run());
        return item;
    }

    private LinearLayout bottomNav(boolean client, int selected) {
        LinearLayout nav = new LinearLayout(this);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        nav.setPadding(0, dp(5), 0, 0);
        String[] icons = client
            ? new String[]{"⌂", "◇", "▤", "⚙"}
            : new String[]{"⌂", "◉", "R$", "⚙"};
        String[] labels = client
            ? new String[]{"Início", "Serviços", "Atividade", "Configurações"}
            : new String[]{"Início", "Chamadas", "Ganhos", "Configurações"};
        for (int i = 0; i < 4; i++) {
            final int x = i;
            Runnable action = () -> {
                stopPolling();
                if (client) {
                    if (x == 0) showClientHome();
                    else if (x == 1) showClientServices();
                    else if (x == 2) showClientActivity();
                    else showClientAccount();
                } else {
                    if (x == 0) showDriverHome();
                    else if (x == 1) showDriverCalls();
                    else if (x == 2) showDriverEarnings();
                    else showDriverAccount();
                }
            };
            nav.addView(navItem(icons[i], labels[i], i == selected, action),
                new LinearLayout.LayoutParams(0, dp(60), 1f));
        }
        return nav;
    }

    private void showRoleChooser() {
        stopPolling();
        role = "";
        stopGps();
        LinearLayout p = page();
        gap(p, 52);
        TextView logo = text("TSV", 46, true);
        logo.setTextColor(ACCENT);
        p.addView(logo);
        p.addView(text("Transporte Seguro Vix", 30, true));
        p.addView(muted("Motorista seguro para dirigir o seu próprio veículo", 16));
        gap(p, 34);

        LinearLayout demo = new LinearLayout(this);
        demo.setOrientation(LinearLayout.VERTICAL);
        demo.setPadding(dp(18), dp(16), dp(18), dp(16));
        demo.setBackground(rounded(CARD, 22));
        demo.addView(text("Ambiente de teste", 18, true));
        demo.addView(muted("Cliente e motorista compartilham a mesma corrida neste aparelho.", 14));
        p.addView(demo);
        gap(p, 20);

        Button client = primaryButton("Entrar como Cliente");
        Button driver = button("Entrar como Motorista");
        Button admin = outlineButton("Entrar como Gerência");
        client.setOnClickListener(v -> showLogin("client"));
        driver.setOnClickListener(v -> showLogin("driver"));
        admin.setOnClickListener(v -> showLogin("admin"));
        p.addView(client);
        p.addView(driver);
        p.addView(admin);
        setContentView(scroll(p));
    }

    private void showLogin(String targetRole) {
        stopPolling();
        String title = targetRole.equals("client") ? "Cliente"
            : targetRole.equals("driver") ? "Motorista" : "Gerência";
        String email = targetRole.equals("client") ? "cliente@motoristaseguro.app"
            : targetRole.equals("driver") ? "motorista@motoristaseguro.app"
            : "admin@motoristaseguro.app";
        String pass = targetRole.equals("client") ? "Cliente@2026!"
            : targetRole.equals("driver") ? "Motorista@2026!"
            : "Admin@2026!";

        LinearLayout p = page();
        gap(p, 35);
        p.addView(text("Entrar como " + title, 31, true));
        p.addView(muted("Acesso de teste já preenchido", 15));
        gap(p, 22);

        EditText e = new EditText(this);
        e.setText(email);
        e.setTextColor(WHITE);
        e.setHintTextColor(MUTED);
        e.setSingleLine(true);
        e.setTextSize(17);
        e.setPadding(dp(16), 0, dp(16), 0);
        e.setBackground(rounded(CARD2, 16));
        e.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        p.addView(e, new LinearLayout.LayoutParams(-1, dp(62)));
        gap(p, 12);

        EditText pw = new EditText(this);
        pw.setText(pass);
        pw.setTextColor(WHITE);
        pw.setSingleLine(true);
        pw.setTextSize(17);
        pw.setPadding(dp(16), 0, dp(16), 0);
        pw.setBackground(rounded(CARD2, 16));
        pw.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        p.addView(pw, new LinearLayout.LayoutParams(-1, dp(62)));
        gap(p, 18);

        Button enter = primaryButton("Entrar");
        enter.setOnClickListener(v -> {
            if (!email.equalsIgnoreCase(e.getText().toString().trim()) || !pass.equals(pw.getText().toString())) {
                Toast.makeText(this, "Login inválido para este perfil", Toast.LENGTH_SHORT).show();
                return;
            }
            role = targetRole;
            if (!targetRole.equals("admin")) startGps();
            if (targetRole.equals("client")) {
                if (activeRide()) showClientRideStatus();
                else showClientHome();
            } else if (targetRole.equals("driver")) {
                String status = rideStatus();
                boolean ack = ridePrefs().getBoolean("driver_ack_completed", false);
                if (status.equals("accepted") || status.equals("arriving") || status.equals("in_progress")
                    || (status.equals("completed") && !ack)) showDriverActiveRide();
                else showDriverHome();
            } else {
                showAdmin();
            }
        });
        Button back = outlineButton("Voltar");
        back.setOnClickListener(v -> showRoleChooser());
        p.addView(enter);
        p.addView(back);
        setContentView(scroll(p));
    }

    private void showClientHome() {
        stopPolling();
        role = "client";
        startGps();

        if (activeRide() && !rideStatus().equals("completed")) {
            showClientRideStatus();
            return;
        }

        WebView map = mapView(Double.NaN, Double.NaN, false);
        LinearLayout sheet = bottomSheet();
        sheet.addView(text("Para onde você vai?", 27, true));
        sheet.addView(muted("Um motorista verificado vai até você e dirige o seu veículo.", 14));
        gap(sheet, 12);

        Button where = new Button(this);
        where.setAllCaps(false);
        where.setText("⌕   Para onde?");
        where.setTextSize(18);
        where.setTextColor(WHITE);
        where.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        where.setPadding(dp(18), 0, dp(18), 0);
        where.setBackground(rounded(CARD2, 18));
        where.setOnClickListener(v -> showPlanTrip());
        sheet.addView(where, new LinearLayout.LayoutParams(-1, dp(64)));

        LinearLayout quick = new LinearLayout(this);
        quick.setOrientation(LinearLayout.HORIZONTAL);
        Button home = button("⌂ Casa");
        Button work = button("□ Trabalho");
        home.setTextSize(14);
        work.setTextSize(14);
        home.setOnClickListener(v -> Toast.makeText(this, "Cadastre Casa em Configurações", Toast.LENGTH_SHORT).show());
        work.setOnClickListener(v -> Toast.makeText(this, "Cadastre Trabalho em Configurações", Toast.LENGTH_SHORT).show());
        LinearLayout.LayoutParams q1 = new LinearLayout.LayoutParams(0, dp(52), 1f);
        q1.setMargins(0, dp(8), dp(6), dp(4));
        LinearLayout.LayoutParams q2 = new LinearLayout.LayoutParams(0, dp(52), 1f);
        q2.setMargins(dp(6), dp(8), 0, dp(4));
        quick.addView(home, q1);
        quick.addView(work, q2);
        sheet.addView(quick);

        gpsLabel = muted(gpsText(), 12);
        sheet.addView(gpsLabel);
        sheet.addView(bottomNav(true, 0));
        showMapWithSheet(map, sheet, 365);
    }

    private void showPlanTrip() {
        stopPolling();
        LinearLayout p = page();
        p.addView(text("Escolha seu destino", 30, true));
        p.addView(muted("Digite um endereço, bairro ou estabelecimento.", 15));
        gap(p, 18);

        LinearLayout origin = new LinearLayout(this);
        origin.setOrientation(LinearLayout.VERTICAL);
        origin.setPadding(dp(16), dp(13), dp(16), dp(13));
        origin.setBackground(rounded(CARD, 18));
        origin.addView(muted("ORIGEM", 11));
        origin.addView(text("●  Minha localização atual", 17, true));
        p.addView(origin);
        gap(p, 12);

        EditText d = new EditText(this);
        d.setHint("Para onde?");
        d.setHintTextColor(MUTED);
        d.setTextColor(WHITE);
        d.setTextSize(19);
        d.setSingleLine(true);
        d.setPadding(dp(18), 0, dp(18), 0);
        d.setBackground(rounded(CARD2, 18));
        p.addView(d, new LinearLayout.LayoutParams(-1, dp(64)));

        TextView status = muted("Digite pelo menos 3 letras", 13);
        LinearLayout suggestions = new LinearLayout(this);
        suggestions.setOrientation(LinearLayout.VERTICAL);
        p.addView(status);
        p.addView(suggestions);

        d.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int st, int c, int a) {}
            @Override public void onTextChanged(CharSequence s, int st, int before, int count) {}
            @Override public void afterTextChanged(Editable e) {
                String q = e.toString().trim();
                if (pendingSearch != null) handler.removeCallbacks(pendingSearch);
                suggestions.removeAllViews();
                if (q.length() < 3) {
                    status.setText("Digite pelo menos 3 letras");
                    return;
                }
                status.setText("Buscando lugares próximos…");
                pendingSearch = () -> searchDestinations(q, suggestions, status);
                handler.postDelayed(pendingSearch, 550);
            }
        });

        gap(p, 12);
        Button back = outlineButton("Voltar");
        back.setOnClickListener(v -> showClientHome());
        p.addView(back);
        setContentView(scroll(p));
        d.requestFocus();
    }

    private String readUrl(String target) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(target).openConnection();
        c.setConnectTimeout(7500);
        c.setReadTimeout(7500);
        c.setRequestProperty("User-Agent", "TransporteSeguroVix/3.0 Android");
        c.setRequestProperty("Accept", "application/json");
        c.setRequestProperty("Accept-Language", "pt-BR,pt;q=0.9,en;q=0.7");
        int code = c.getResponseCode();
        if (code < 200 || code >= 300) throw new Exception("HTTP " + code);
        BufferedReader br = new BufferedReader(new InputStreamReader(c.getInputStream()));
        StringBuilder raw = new StringBuilder();
        String line;
        while ((line = br.readLine()) != null) raw.append(line);
        br.close();
        return raw.toString();
    }

    private void searchDestinations(String query, LinearLayout suggestions, TextView status) {
        new Thread(() -> {
            List<PlaceSuggestion> found = new ArrayList<>();
            boolean networkWorked = false;

            try {
                StringBuilder u = new StringBuilder("https://transportesegurovix.vercel.app/api/search?q=")
                    .append(URLEncoder.encode(query, "UTF-8"));
                if (!Double.isNaN(lastLat) && !Double.isNaN(lastLng)) {
                    u.append("&lat=").append(lastLat).append("&lon=").append(lastLng);
                }
                JSONObject root = new JSONObject(readUrl(u.toString()));
                networkWorked = true;
                JSONArray results = root.optJSONArray("results");
                if (results != null) {
                    for (int i = 0; i < results.length() && found.size() < 8; i++) {
                        JSONObject r = results.optJSONObject(i);
                        if (r == null) continue;
                        String label = r.optString("label", "").trim();
                        double lat = r.optDouble("lat", Double.NaN);
                        double lng = r.optDouble("lng", Double.NaN);
                        if (!label.isEmpty() && !Double.isNaN(lat) && !Double.isNaN(lng)) {
                            found.add(new PlaceSuggestion(label, lat, lng));
                        }
                    }
                }
            } catch (Exception ignored) {}

            if (found.isEmpty()) {
                try {
                    StringBuilder u = new StringBuilder("https://photon.komoot.io/api/?limit=8&q=")
                        .append(URLEncoder.encode(query, "UTF-8"));
                    if (!Double.isNaN(lastLat) && !Double.isNaN(lastLng)) {
                        u.append("&lat=").append(lastLat).append("&lon=").append(lastLng);
                    }
                    JSONObject root = new JSONObject(readUrl(u.toString()));
                    networkWorked = true;
                    JSONArray features = root.optJSONArray("features");
                    if (features != null) {
                        for (int i = 0; i < features.length() && found.size() < 8; i++) {
                            JSONObject f = features.optJSONObject(i);
                            if (f == null) continue;
                            JSONObject props = f.optJSONObject("properties");
                            JSONObject geo = f.optJSONObject("geometry");
                            JSONArray coords = geo == null ? null : geo.optJSONArray("coordinates");
                            if (props == null || coords == null || coords.length() < 2) continue;
                            String label = placeLabel(props);
                            if (!label.isEmpty()) {
                                found.add(new PlaceSuggestion(label, coords.optDouble(1), coords.optDouble(0)));
                            }
                        }
                    }
                } catch (Exception ignored) {}
            }

            final boolean worked = networkWorked;
            runOnUiThread(() -> renderSuggestions(found, suggestions, status, worked));
        }).start();
    }

    private String placeLabel(JSONObject p) {
        List<String> parts = new ArrayList<>();
        String name = p.optString("name", "").trim();
        String street = p.optString("street", "").trim();
        String house = p.optString("housenumber", "").trim();
        String city = p.optString("city", p.optString("district", p.optString("county", ""))).trim();
        String state = p.optString("state", "").trim();
        if (!name.isEmpty()) parts.add(name);
        if (!street.isEmpty() && !street.equalsIgnoreCase(name)) {
            parts.add(street + (house.isEmpty() ? "" : ", " + house));
        }
        if (!city.isEmpty()) parts.add(city);
        if (!state.isEmpty() && !state.equalsIgnoreCase(city)) parts.add(state);
        StringBuilder out = new StringBuilder();
        for (String x : parts) {
            if (out.length() > 0) out.append(" • ");
            out.append(x);
        }
        return out.toString();
    }

    private void renderSuggestions(List<PlaceSuggestion> found, LinearLayout suggestions, TextView status, boolean networkWorked) {
        suggestions.removeAllViews();
        if (found.isEmpty()) {
            status.setText(networkWorked
                ? "Nenhum resultado. Tente nome + bairro ou cidade."
                : "Falha na conexão com a busca. Verifique a internet.");
            return;
        }
        status.setText(found.size() + " sugestões");
        for (PlaceSuggestion s : found) {
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.VERTICAL);
            row.setPadding(dp(16), dp(12), dp(16), dp(12));
            row.setBackground(rounded(CARD, 18));
            TextView title = text("⌖  " + s.label, 16, true);
            row.addView(title);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
            lp.setMargins(0, dp(6), 0, dp(6));
            row.setLayoutParams(lp);
            row.setOnClickListener(v -> showDestinationPreview(s));
            suggestions.addView(row);
        }
    }

    private void showDestinationPreview(PlaceSuggestion dest) {
        stopPolling();
        WebView map = mapView(dest.lat, dest.lng, true);
        LinearLayout sheet = bottomSheet();
        sheet.addView(muted("DESTINO", 11));
        TextView destination = text(dest.label, 20, true);
        sheet.addView(destination);
        gap(sheet, 8);
        sheet.addView(muted("Confira o ponto no mapa antes de continuar.", 14));
        gap(sheet, 10);
        Button next = primaryButton("Escolher serviço");
        next.setOnClickListener(v -> showServiceSelection(dest));
        Button change = outlineButton("Alterar destino");
        change.setOnClickListener(v -> showPlanTrip());
        sheet.addView(next);
        sheet.addView(change);
        showMapWithSheet(map, sheet, 300);
    }

    private double distanceKm(double lat1, double lon1, double lat2, double lon2) {
        if (Double.isNaN(lat1) || Double.isNaN(lon1) || Double.isNaN(lat2) || Double.isNaN(lon2)) return 5.0;
        double r = 6371.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
            + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
            * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    private double baseFareFor(PlaceSuggestion dest) {
        double km = distanceKm(lastLat, lastLng, dest.lat, dest.lng);
        return Math.max(19.90, 14.90 + km * 2.65);
    }

    private LinearLayout serviceCard(String title, String subtitle, double price, boolean selected, Runnable tap) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(16), dp(15), dp(16), dp(15));
        row.setBackground(selected ? bordered(CARD2, 20, ACCENT) : rounded(CARD, 20));

        LinearLayout left = new LinearLayout(this);
        left.setOrientation(LinearLayout.VERTICAL);
        left.addView(text(title, 18, true));
        left.addView(muted(subtitle, 13));
        row.addView(left, new LinearLayout.LayoutParams(0, -2, 1f));

        TextView pr = text(String.format(Locale.US, "R$ %.2f", price).replace(".", ","), 17, true);
        pr.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        row.addView(pr, new LinearLayout.LayoutParams(dp(105), -1));
        row.setOnClickListener(v -> tap.run());
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(84));
        lp.setMargins(0, dp(6), 0, dp(6));
        row.setLayoutParams(lp);
        return row;
    }

    private void showServiceSelection(PlaceSuggestion dest) {
        stopPolling();
        final String[] selected = {"Seguro Econômico"};
        final double base = baseFareFor(dest);

        LinearLayout p = page();
        p.addView(text("Escolha o serviço", 29, true));
        p.addView(muted(dest.label, 14));
        gap(p, 14);

        LinearLayout list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        p.addView(list);

        Runnable render = new Runnable() {
            @Override public void run() {
                list.removeAllViews();
                list.addView(serviceCard(
                    "Seguro Econômico",
                    "Motorista verificado • melhor preço",
                    base,
                    selected[0].equals("Seguro Econômico"),
                    () -> { selected[0] = "Seguro Econômico"; run(); }
                ));
                list.addView(serviceCard(
                    "Seguro Conforto",
                    "Mais experiência e prioridade",
                    base * 1.18,
                    selected[0].equals("Seguro Conforto"),
                    () -> { selected[0] = "Seguro Conforto"; run(); }
                ));
                list.addView(serviceCard(
                    "Seguro Premium",
                    "Motoristas com avaliação superior",
                    base * 1.42,
                    selected[0].equals("Seguro Premium"),
                    () -> { selected[0] = "Seguro Premium"; run(); }
                ));
                list.addView(serviceCard(
                    "Motorista Mulher",
                    "Preferência por motorista mulher",
                    base * 1.12,
                    selected[0].equals("Motorista Mulher"),
                    () -> { selected[0] = "Motorista Mulher"; run(); }
                ));
            }
        };
        render.run();

        gap(p, 14);
        LinearLayout payment = new LinearLayout(this);
        payment.setOrientation(LinearLayout.VERTICAL);
        payment.setPadding(dp(16), dp(13), dp(16), dp(13));
        payment.setBackground(rounded(CARD, 18));
        payment.addView(muted("PAGAMENTO", 11));
        payment.addView(text("Pix  •  Dinheiro", 16, true));
        p.addView(payment);

        Button confirm = primaryButton("Confirmar corrida");
        confirm.setOnClickListener(v -> {
            double multiplier = selected[0].equals("Seguro Conforto") ? 1.18
                : selected[0].equals("Seguro Premium") ? 1.42
                : selected[0].equals("Motorista Mulher") ? 1.12 : 1.0;
            requestRide(dest, selected[0], base * multiplier);
        });
        Button back = outlineButton("Voltar");
        back.setOnClickListener(v -> showDestinationPreview(dest));
        p.addView(confirm);
        p.addView(back);
        setContentView(scroll(p));
    }

    private void requestRide(PlaceSuggestion dest, String service, double fare) {
        long now = System.currentTimeMillis();
        ridePrefs().edit()
            .clear()
            .putString("id", "TSV-" + now)
            .putString("status", "searching")
            .putString("client_name", "Cliente Teste")
            .putString("service", service)
            .putString("fare", String.format(Locale.US, "%.2f", fare))
            .putString("origin_lat", Double.toString(lastLat))
            .putString("origin_lng", Double.toString(lastLng))
            .putString("dest_name", dest.label)
            .putString("dest_lat", Double.toString(dest.lat))
            .putString("dest_lng", Double.toString(dest.lng))
            .putLong("created_at", now)
            .putLong("updated_at", now)
            .putBoolean("driver_ack_completed", false)
            .apply();
        showClientRideStatus();
    }

    private void updateRideStatus(String status) {
        ridePrefs().edit()
            .putString("status", status)
            .putLong("updated_at", System.currentTimeMillis())
            .apply();
    }

    private void showClientRideStatus() {
        stopPolling();
        role = "client";
        startGps();
        String status = rideStatus();
        if (status.isEmpty()) {
            showClientHome();
            return;
        }

        PlaceSuggestion dest = rideDestination();
        WebView map = mapView(dest.lat, dest.lng, true);
        LinearLayout sheet = bottomSheet();
        String service = ridePrefs().getString("service", "Seguro Econômico");
        String fare = ridePrefs().getString("fare", "0.00");

        if (status.equals("searching")) {
            sheet.addView(text("Procurando motorista…", 27, true));
            sheet.addView(muted("Estamos mostrando sua solicitação para motoristas disponíveis próximos.", 14));
            gap(sheet, 12);
            LinearLayout info = new LinearLayout(this);
            info.setOrientation(LinearLayout.VERTICAL);
            info.setPadding(dp(16), dp(13), dp(16), dp(13));
            info.setBackground(rounded(CARD, 18));
            info.addView(text(service, 17, true));
            info.addView(muted(dest.label, 13));
            sheet.addView(info);
            Button cancel = outlineButton("Cancelar solicitação");
            cancel.setOnClickListener(v -> {
                updateRideStatus("cancelled");
                ridePrefs().edit().clear().apply();
                showClientHome();
            });
            sheet.addView(cancel);
            sheet.addView(muted("Dica de teste: saia e entre como Motorista para aceitar esta corrida.", 12));
        } else if (status.equals("accepted")) {
            sheet.addView(text("Motorista a caminho", 27, true));
            sheet.addView(muted("Chegada estimada em 4 min", 14));
            gap(sheet, 10);
            addDriverIdentityCard(sheet);
            addClientContactActions(sheet);
        } else if (status.equals("arriving")) {
            sheet.addView(text("Seu motorista chegou", 27, true));
            sheet.addView(muted("Encontre o motorista e confirme o código antes de iniciar.", 14));
            gap(sheet, 10);
            addDriverIdentityCard(sheet);
            LinearLayout pin = new LinearLayout(this);
            pin.setOrientation(LinearLayout.VERTICAL);
            pin.setPadding(dp(16), dp(12), dp(16), dp(12));
            pin.setBackground(rounded(CARD, 18));
            pin.addView(muted("CÓDIGO DA CORRIDA", 11));
            pin.addView(text("4821", 27, true));
            sheet.addView(pin);
        } else if (status.equals("in_progress")) {
            sheet.addView(text("Viagem em andamento", 27, true));
            sheet.addView(muted("Destino: " + dest.label, 14));
            gap(sheet, 12);
            Button safety = button("Segurança e compartilhamento");
            safety.setOnClickListener(v -> showFeaturePage(
                "Segurança",
                "Compartilhe a viagem, consulte o código e acesse suporte durante a corrida.",
                this::showClientRideStatus
            ));
            sheet.addView(safety);
        } else if (status.equals("completed")) {
            sheet.addView(text("Você chegou", 28, true));
            sheet.addView(muted(dest.label, 14));
            gap(sheet, 10);
            sheet.addView(text("R$ " + fare.replace(".", ","), 24, true));
            sheet.addView(muted("Como foi sua experiência?", 14));
            LinearLayout stars = new LinearLayout(this);
            stars.setOrientation(LinearLayout.HORIZONTAL);
            for (int i = 1; i <= 5; i++) {
                final int rating = i;
                Button star = button("★");
                star.setTextSize(22);
                star.setOnClickListener(v -> finishClientRide(rating));
                LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(0, dp(54), 1f);
                sp.setMargins(dp(3), dp(6), dp(3), dp(6));
                stars.addView(star, sp);
            }
            sheet.addView(stars);
        } else {
            ridePrefs().edit().clear().apply();
            showClientHome();
            return;
        }

        sheet.addView(bottomNav(true, 0));
        int height = status.equals("completed") ? 430 : status.equals("searching") ? 425 : 445;
        showMapWithSheet(map, sheet, height);
        pollRideStatus(status, this::showClientRideStatus);
    }

    private void addDriverIdentityCard(LinearLayout sheet) {
        LinearLayout driver = new LinearLayout(this);
        driver.setOrientation(LinearLayout.VERTICAL);
        driver.setPadding(dp(16), dp(13), dp(16), dp(13));
        driver.setBackground(rounded(CARD, 18));
        driver.addView(text("Motorista Teste  •  ★ 5.0", 18, true));
        driver.addView(muted("CNH B • EAR ativo • identidade verificada", 13));
        sheet.addView(driver);
    }

    private void addClientContactActions(LinearLayout sheet) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        Button msg = button("Mensagem");
        Button call = button("Ligar");
        msg.setOnClickListener(v -> Toast.makeText(this, "Mensagens de teste", Toast.LENGTH_SHORT).show());
        call.setOnClickListener(v -> Toast.makeText(this, "Ligação protegida será habilitada no backend", Toast.LENGTH_SHORT).show());
        LinearLayout.LayoutParams a = new LinearLayout.LayoutParams(0, dp(56), 1f);
        a.setMargins(0, dp(6), dp(6), dp(6));
        LinearLayout.LayoutParams b = new LinearLayout.LayoutParams(0, dp(56), 1f);
        b.setMargins(dp(6), dp(6), 0, dp(6));
        row.addView(msg, a);
        row.addView(call, b);
        sheet.addView(row);
    }

    private void finishClientRide(int rating) {
        PlaceSuggestion dest = rideDestination();
        String fare = ridePrefs().getString("fare", "0.00");
        getSharedPreferences(HISTORY_PREFS, MODE_PRIVATE).edit()
            .putString("last_dest", dest.label)
            .putString("last_fare", fare)
            .putInt("last_rating", rating)
            .putLong("last_time", System.currentTimeMillis())
            .apply();
        ridePrefs().edit().clear().apply();
        Toast.makeText(this, "Obrigado pela avaliação!", Toast.LENGTH_SHORT).show();
        showClientHome();
    }

    private void showDriverHome() {
        stopPolling();
        role = "driver";
        startGps();

        String status = rideStatus();
        boolean ack = ridePrefs().getBoolean("driver_ack_completed", false);
        if (status.equals("accepted") || status.equals("arriving") || status.equals("in_progress")
            || (status.equals("completed") && !ack)) {
            showDriverActiveRide();
            return;
        }

        if (driverOnline() && status.equals("searching")) {
            showDriverIncomingRide();
            return;
        }

        WebView map = mapView(Double.NaN, Double.NaN, false);
        LinearLayout sheet = bottomSheet();
        if (driverOnline()) {
            sheet.addView(text("Você está online", 28, true));
            sheet.addView(muted("Procurando solicitações de clientes próximos…", 14));
            gap(sheet, 12);
            TextView pulse = text("●  Disponível para corridas", 16, true);
            pulse.setTextColor(ACCENT);
            sheet.addView(pulse);
            Button offline = outlineButton("Ficar offline");
            offline.setOnClickListener(v -> {
                setDriverOnline(false);
                showDriverHome();
            });
            sheet.addView(offline);
        } else {
            sheet.addView(text("Você está offline", 28, true));
            sheet.addView(muted("Fique online para receber solicitações de clientes.", 14));
            gap(sheet, 14);
            Button online = primaryButton("FICAR ONLINE");
            online.setOnClickListener(v -> {
                setDriverOnline(true);
                showDriverHome();
            });
            sheet.addView(online);
        }

        gpsLabel = muted(gpsText(), 12);
        sheet.addView(gpsLabel);
        sheet.addView(bottomNav(false, 0));
        showMapWithSheet(map, sheet, 350);
        if (driverOnline()) pollForDriverRequest();
    }

    private void showDriverIncomingRide() {
        stopPolling();
        if (!driverOnline() || !"searching".equals(rideStatus())) {
            showDriverHome();
            return;
        }

        PlaceSuggestion dest = rideDestination();
        WebView map = mapView(dest.lat, dest.lng, true);
        LinearLayout sheet = bottomSheet();
        String service = ridePrefs().getString("service", "Seguro Econômico");
        String fare = ridePrefs().getString("fare", "0.00");
        double tripKm = distanceKm(
            rideDouble("origin_lat", lastLat),
            rideDouble("origin_lng", lastLng),
            dest.lat, dest.lng
        );

        sheet.addView(muted("NOVA SOLICITAÇÃO", 11));
        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        TextView serviceTitle = text(service, 21, true);
        TextView price = text("R$ " + fare.replace(".", ","), 24, true);
        price.setGravity(Gravity.END);
        top.addView(serviceTitle, new LinearLayout.LayoutParams(0, -2, 1f));
        top.addView(price, new LinearLayout.LayoutParams(dp(135), -2));
        sheet.addView(top);
        sheet.addView(muted("Cliente Teste • ★ 5.0", 14));
        gap(sheet, 10);

        LinearLayout route = new LinearLayout(this);
        route.setOrientation(LinearLayout.VERTICAL);
        route.setPadding(dp(16), dp(13), dp(16), dp(13));
        route.setBackground(rounded(CARD, 18));
        route.addView(text("●  Buscar cliente", 16, true));
        route.addView(muted("2 min até o cliente", 13));
        gap(route, 5);
        route.addView(text("■  " + dest.label, 15, true));
        route.addView(muted(String.format(Locale.US, "%.1f km de viagem", tripKm), 13));
        sheet.addView(route);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        Button decline = outlineButton("Recusar");
        Button accept = primaryButton("ACEITAR");
        decline.setOnClickListener(v -> {
            Toast.makeText(this, "Solicitação ignorada por 10 segundos", Toast.LENGTH_SHORT).show();
            setDriverOnline(false);
            showDriverHome();
        });
        accept.setOnClickListener(v -> {
            ridePrefs().edit()
                .putString("status", "accepted")
                .putString("driver_name", "Motorista Teste")
                .putLong("updated_at", System.currentTimeMillis())
                .putBoolean("driver_ack_completed", false)
                .apply();
            showDriverActiveRide();
        });
        LinearLayout.LayoutParams l = new LinearLayout.LayoutParams(0, dp(58), 1f);
        l.setMargins(0, dp(8), dp(6), dp(4));
        LinearLayout.LayoutParams r = new LinearLayout.LayoutParams(0, dp(58), 1.5f);
        r.setMargins(dp(6), dp(8), 0, dp(4));
        actions.addView(decline, l);
        actions.addView(accept, r);
        sheet.addView(actions);

        showMapWithSheet(map, sheet, 455);
        pollRideStatus("searching", this::showDriverHome);
    }

    private void showDriverActiveRide() {
        stopPolling();
        String status = rideStatus();
        if (status.isEmpty()) {
            showDriverHome();
            return;
        }

        PlaceSuggestion dest = rideDestination();
        WebView map = mapView(dest.lat, dest.lng, true);
        LinearLayout sheet = bottomSheet();
        String fare = ridePrefs().getString("fare", "0.00");

        if (status.equals("accepted")) {
            sheet.addView(text("Buscar Cliente Teste", 27, true));
            sheet.addView(muted("Navegue até o cliente. A corrida só começa depois da confirmação.", 14));
            gap(sheet, 10);
            sheet.addView(text("●  Localização atual do cliente", 17, true));
            sheet.addView(muted("Destino depois da coleta: " + dest.label, 13));
            Button arrived = primaryButton("CHEGUEI");
            arrived.setOnClickListener(v -> {
                updateRideStatus("arriving");
                showDriverActiveRide();
            });
            sheet.addView(arrived);
        } else if (status.equals("arriving")) {
            sheet.addView(text("Aguardando o cliente", 27, true));
            sheet.addView(muted("Confirme o código antes de dirigir o veículo do cliente.", 14));
            gap(sheet, 12);
            LinearLayout pin = new LinearLayout(this);
            pin.setOrientation(LinearLayout.VERTICAL);
            pin.setPadding(dp(16), dp(12), dp(16), dp(12));
            pin.setBackground(rounded(CARD, 18));
            pin.addView(muted("CÓDIGO", 11));
            pin.addView(text("4821", 27, true));
            sheet.addView(pin);
            Button start = primaryButton("INICIAR VIAGEM");
            start.setOnClickListener(v -> {
                updateRideStatus("in_progress");
                showDriverActiveRide();
            });
            sheet.addView(start);
        } else if (status.equals("in_progress")) {
            sheet.addView(text("Em viagem", 27, true));
            sheet.addView(muted("Dirigindo o veículo do cliente", 14));
            gap(sheet, 10);
            sheet.addView(text("Destino", 13, false));
            sheet.addView(text(dest.label, 18, true));
            Button finish = primaryButton("FINALIZAR VIAGEM");
            finish.setOnClickListener(v -> {
                updateRideStatus("completed");
                showDriverActiveRide();
            });
            sheet.addView(finish);
        } else if (status.equals("completed")) {
            sheet.addView(text("Viagem concluída", 28, true));
            double f = 0;
            try { f = Double.parseDouble(fare); } catch (Exception ignored) {}
            sheet.addView(muted("Valor da viagem", 13));
            sheet.addView(text("R$ " + fare.replace(".", ","), 25, true));
            sheet.addView(muted("Seu ganho de teste: " + String.format(Locale.US, "R$ %.2f", f * 0.80).replace(".", ","), 14));
            Button done = primaryButton("CONCLUIR");
            done.setOnClickListener(v -> {
                ridePrefs().edit().putBoolean("driver_ack_completed", true).apply();
                showDriverHome();
            });
            sheet.addView(done);
        } else if (status.equals("searching")) {
            showDriverIncomingRide();
            return;
        } else {
            showDriverHome();
            return;
        }

        sheet.addView(bottomNav(false, 0));
        showMapWithSheet(map, sheet, status.equals("completed") ? 390 : 430);
        pollRideStatus(status, this::showDriverActiveRide);
    }

    private void showClientServices() {
        stopPolling();
        LinearLayout p = page();
        p.addView(text("Serviços", 32, true));
        p.addView(muted("Escolha como quer ser atendido.", 15));
        gap(p, 14);
        addServiceInfo(p, "Seguro Econômico", "Melhor preço para o dia a dia.");
        addServiceInfo(p, "Seguro Conforto", "Prioridade e motoristas mais experientes.");
        addServiceInfo(p, "Seguro Premium", "Atendimento premium e alta avaliação.");
        addServiceInfo(p, "Motorista Mulher", "Preferência por motorista mulher.");
        gap(p, 18);
        p.addView(bottomNav(true, 1));
        setContentView(scroll(p));
    }

    private void addServiceInfo(LinearLayout p, String title, String sub) {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setPadding(dp(17), dp(15), dp(17), dp(15));
        c.setBackground(rounded(CARD, 20));
        c.addView(text(title, 18, true));
        c.addView(muted(sub, 14));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, dp(6), 0, dp(6));
        p.addView(c, lp);
    }

    private void showClientActivity() {
        stopPolling();
        LinearLayout p = page();
        p.addView(text("Atividade", 32, true));
        p.addView(muted("Corridas recentes", 15));
        gap(p, 14);
        SharedPreferences h = getSharedPreferences(HISTORY_PREFS, MODE_PRIVATE);
        String dest = h.getString("last_dest", "");
        if (dest.isEmpty()) {
            p.addView(muted("Nenhuma corrida concluída ainda.", 16));
        } else {
            LinearLayout card = new LinearLayout(this);
            card.setOrientation(LinearLayout.VERTICAL);
            card.setPadding(dp(17), dp(15), dp(17), dp(15));
            card.setBackground(rounded(CARD, 20));
            card.addView(text(dest, 18, true));
            card.addView(muted("R$ " + h.getString("last_fare", "0.00").replace(".", ","), 14));
            card.addView(muted("Avaliação: " + h.getInt("last_rating", 5) + " estrelas", 14));
            p.addView(card);
        }
        gap(p, 20);
        p.addView(bottomNav(true, 2));
        setContentView(scroll(p));
    }

    private void showClientAccount() {
        stopPolling();
        LinearLayout p = page();
        p.addView(text("Configurações", 32, true));
        p.addView(text("Cliente Teste", 24, true));
        p.addView(muted("★ 5.0 • Conta de teste", 14));
        gap(p, 14);

        addFeatureButton(p, "Dados pessoais", "Nome, telefone, e-mail e dados da conta.", this::showClientAccount, true);
        addFeatureButton(p, "Meus veículos", "Cadastre os veículos que poderão ser conduzidos pelo motorista parceiro.", this::showClientAccount, false);
        addFeatureButton(p, "Pagamentos", "Pix, dinheiro e futuros métodos de pagamento.", this::showClientAccount, false);
        addFeatureButton(p, "Segurança", "PIN, compartilhamento de viagem e contatos de confiança.", this::showClientAccount, false);
        addFeatureButton(p, "Ajuda", "Central de ajuda e suporte.", this::showClientAccount, false);
        addFeatureButton(p, "Privacidade e localização", gpsText(), this::showClientAccount, false);

        Button out = outlineButton("Sair");
        out.setOnClickListener(v -> showRoleChooser());
        p.addView(out);
        p.addView(bottomNav(true, 3));
        setContentView(scroll(p));
    }

    private void showDriverCalls() {
        stopPolling();
        if (driverOnline() && "searching".equals(rideStatus())) {
            showDriverIncomingRide();
            return;
        }
        LinearLayout p = page();
        p.addView(text("Chamadas", 32, true));
        p.addView(muted(driverOnline() ? "Nenhuma solicitação nova neste momento." : "Fique online para receber solicitações.", 15));
        gap(p, 18);
        Button home = primaryButton(driverOnline() ? "Voltar ao mapa" : "Ficar online");
        home.setOnClickListener(v -> {
            if (!driverOnline()) setDriverOnline(true);
            showDriverHome();
        });
        p.addView(home);
        p.addView(bottomNav(false, 1));
        setContentView(scroll(p));
        if (driverOnline()) pollForDriverRequest();
    }

    private void showDriverEarnings() {
        stopPolling();
        LinearLayout p = page();
        p.addView(text("Ganhos", 32, true));
        p.addView(text("R$ 184,20", 31, true));
        p.addView(muted("Hoje • demonstração", 14));
        gap(p, 16);
        addServiceInfo(p, "Esta semana", "R$ 1.084,50");
        addServiceInfo(p, "Este mês", "R$ 4.420,80");
        p.addView(bottomNav(false, 2));
        setContentView(scroll(p));
    }

    private void showDriverAccount() {
        stopPolling();
        LinearLayout p = page();
        p.addView(text("Configurações", 32, true));
        p.addView(text("Motorista Teste", 24, true));
        p.addView(muted("★ 5.0 • CNH B • EAR ativo • Aprovado", 14));
        gap(p, 14);
        addFeatureButton(p, "Dados pessoais", "Perfil e informações de contato.", this::showDriverAccount, true);
        addFeatureButton(p, "CNH e documentos", "Categoria B • EAR ativo • documentos aprovados.", this::showDriverAccount, false);
        addFeatureButton(p, "Segurança", "PIN, emergência e suporte durante corridas.", this::showDriverAccount, false);
        addFeatureButton(p, "Avaliações", "Nota atual: 5.0.", this::showDriverAccount, false);
        addFeatureButton(p, "Preferências", "Notificações e disponibilidade.", this::showDriverAccount, false);
        Button out = outlineButton("Sair");
        out.setOnClickListener(v -> showRoleChooser());
        p.addView(out);
        p.addView(bottomNav(false, 3));
        setContentView(scroll(p));
    }

    private void addFeatureButton(LinearLayout p, String title, String body, Runnable back, boolean userData) {
        Button b = button(title);
        if (userData) b.setOnClickListener(v -> showUserData());
        else b.setOnClickListener(v -> showFeaturePage(title, body, back));
        p.addView(b);
    }

    private void showUserData() {
        stopPolling();
        LinearLayout p = page();
        boolean driver = role.equals("driver");
        p.addView(text("Dados do usuário", 32, true));
        p.addView(muted(driver ? "Perfil do motorista" : "Perfil do cliente", 15));
        gap(p, 16);
        addServiceInfo(p, "Nome", driver ? "Motorista Teste" : "Cliente Teste");
        addServiceInfo(p, "E-mail", driver ? "motorista@motoristaseguro.app" : "cliente@motoristaseguro.app");
        addServiceInfo(p, "Telefone", "Não informado");
        addServiceInfo(p, "Status", driver ? "Aprovado • CNH B • EAR ativo" : "Conta de teste • nota 5.0");
        Button back = primaryButton("Voltar");
        back.setOnClickListener(v -> {
            if (driver) showDriverHome(); else showClientHome();
        });
        p.addView(back);
        setContentView(scroll(p));
    }

    private void showFeaturePage(String title, String body, Runnable backAction) {
        stopPolling();
        LinearLayout p = page();
        p.addView(text(title, 32, true));
        p.addView(muted(body, 17));
        gap(p, 22);
        Button back = primaryButton("Voltar");
        back.setOnClickListener(v -> backAction.run());
        p.addView(back);
        setContentView(scroll(p));
    }

    private void showAdmin() {
        stopPolling();
        role = "admin";
        LinearLayout p = page();
        p.addView(text("Gerência", 32, true));
        p.addView(muted("Painel operacional • v3.0", 14));
        gap(p, 14);

        String status = rideStatus();
        LinearLayout live = new LinearLayout(this);
        live.setOrientation(LinearLayout.VERTICAL);
        live.setPadding(dp(17), dp(15), dp(17), dp(15));
        live.setBackground(rounded(CARD, 20));
        live.addView(text("Corrida de teste", 18, true));
        live.addView(muted(status.isEmpty() ? "Nenhuma corrida ativa" : "Status: " + status, 14));
        if (!status.isEmpty()) live.addView(muted(ridePrefs().getString("dest_name", ""), 13));
        p.addView(live);

        String[] items = {"Dashboard", "Corridas", "Motoristas", "Clientes", "Financeiro", "Mapa", "Relatórios", "Configurações"};
        for (String item : items) {
            Button b = button(item);
            b.setOnClickListener(v -> showFeaturePage(item, "Módulo de gerência: " + item, this::showAdmin));
            p.addView(b);
        }

        Button reset = outlineButton("Limpar corrida de teste");
        reset.setOnClickListener(v -> {
            ridePrefs().edit().clear().apply();
            Toast.makeText(this, "Corrida de teste removida", Toast.LENGTH_SHORT).show();
            showAdmin();
        });
        Button out = outlineButton("Sair");
        out.setOnClickListener(v -> showRoleChooser());
        p.addView(reset);
        p.addView(out);
        setContentView(scroll(p));
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == LOCATION_REQUEST && grantResults.length > 0
            && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            startGps();
            if (role.equals("client")) showClientHome();
            else if (role.equals("driver")) showDriverHome();
        }
    }
}
