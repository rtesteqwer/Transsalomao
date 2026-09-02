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
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.webkit.WebResourceRequest;
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

    private boolean receiverRegistered = false;
    private TextView gpsStatusView;
    private WebView mapWebView;
    private LinearLayout currentSheet;
    private float sheetMaxTranslation = 0f;

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

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private GradientDrawable rounded(int color, float radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp((int) radiusDp));
        return g;
    }

    private TextView text(String value, int size, boolean bold) {
        TextView v = new TextView(this);
        v.setText(value);
        v.setTextSize(size);
        v.setTextColor(0xff151515);
        if (bold) v.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        v.setPadding(dp(4), dp(7), dp(4), dp(7));
        return v;
    }

    private Button button(String label) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(15);
        b.setPadding(dp(10), dp(10), dp(10), dp(10));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, dp(5), 0, dp(5));
        b.setLayoutParams(lp);
        return b;
    }

    private LinearLayout pageColumn() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(18), dp(24), dp(18), dp(28));
        root.setBackgroundColor(0xfff5f5f5);
        return root;
    }

    private ScrollView scroll(LinearLayout content) {
        ScrollView s = new ScrollView(this);
        s.setFillViewport(true);
        s.addView(content);
        return s;
    }

    private void header(LinearLayout root, String title, String sub) {
        root.addView(text(title, 28, true));
        TextView s = text(sub, 14, false);
        s.setTextColor(0xff666666);
        root.addView(s);
    }

    private String gpsSummary() {
        if (Double.isNaN(lastLat) || Double.isNaN(lastLng)) return "GPS: obtendo localização exata…";
        return String.format(Locale.US, "GPS AO VIVO • %.6f, %.6f • precisão ±%.0f m", lastLat, lastLng, lastAccuracy);
    }

    private void refreshGpsLabel() {
        if (gpsStatusView != null) gpsStatusView.setText(gpsSummary());
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

    private boolean movedEnough() {
        if (Double.isNaN(lastMapLat) || Double.isNaN(lastMapLng) || Double.isNaN(lastLat)) return true;
        double dx = (lastLat - lastMapLat) * 111000.0;
        double dy = (lastLng - lastMapLng) * 111000.0 * Math.cos(Math.toRadians(lastLat));
        return Math.sqrt(dx * dx + dy * dy) > 12.0;
    }

    private String googleMapEmbedUrl() {
        double lat = Double.isNaN(lastLat) ? -20.3297 : lastLat;
        double lng = Double.isNaN(lastLng) ? -40.2925 : lastLng;
        return String.format(Locale.US,
            "https://maps.google.com/maps?q=%f,%f&z=18&t=m&output=embed",
            lat, lng);
    }

    private boolean handleSpecialMapUrl(WebView view, String url) {
        if (url == null) return false;

        if (url.startsWith("intent://")) {
            try {
                Intent parsed = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                if (parsed.resolveActivity(getPackageManager()) != null) {
                    startActivity(parsed);
                    return true;
                }
                String fallback = parsed.getStringExtra("browser_fallback_url");
                if (fallback != null && (fallback.startsWith("https://") || fallback.startsWith("http://"))) {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(fallback)));
                    return true;
                }
            } catch (Exception ignored) {}
            refreshGoogleMap(true);
            return true;
        }

        if (url.startsWith("geo:") || url.startsWith("google.navigation:") || url.startsWith("market:")) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception e) {
                Toast.makeText(this, "Não foi possível abrir esse recurso do mapa.", Toast.LENGTH_SHORT).show();
            }
            return true;
        }

        if (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("about:")) {
            return true;
        }
        return false;
    }

    private WebView buildGoogleMapWebView() {
        WebView web = new WebView(this);
        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setLoadWithOverviewMode(true);
        ws.setUseWideViewPort(true);
        ws.setBuiltInZoomControls(false);
        ws.setDisplayZoomControls(false);
        ws.setUserAgentString("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36");
        web.setBackgroundColor(0xffe9e9e9);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleSpecialMapUrl(view, request.getUrl().toString());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleSpecialMapUrl(view, url);
            }
        });
        mapWebView = web;
        refreshGoogleMap(true);
        return web;
    }

    private void refreshGoogleMap(boolean force) {
        if (mapWebView == null) return;
        if (!force && !movedEnough()) return;
        mapWebView.loadUrl(googleMapEmbedUrl());
        if (!Double.isNaN(lastLat)) {
            lastMapLat = lastLat;
            lastMapLng = lastLng;
        }
    }

    private void startGpsTracking() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, LOCATION_REQUEST);
            return;
        }
        Intent service = new Intent(this, LocationForegroundService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(service);
        else startService(service);
    }

    private void stopGpsTracking() {
        try { stopService(new Intent(this, LocationForegroundService.class)); } catch (Exception ignored) {}
    }

    private void openCurrentLocationExternal() {
        if (Double.isNaN(lastLat) || Double.isNaN(lastLng)) {
            Toast.makeText(this, "Aguardando GPS…", Toast.LENGTH_SHORT).show();
            return;
        }
        Uri uri = Uri.parse(String.format(Locale.US,
            "https://www.google.com/maps/search/?api=1&query=%f,%f", lastLat, lastLng));
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, uri);
            i.setPackage("com.google.android.apps.maps");
            startActivity(i);
        } catch (Exception e) {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        }
    }

    private TextView dragHandle() {
        TextView handle = new TextView(this);
        handle.setText("━━━━");
        handle.setTextSize(24);
        handle.setGravity(Gravity.CENTER);
        handle.setTextColor(0xffb5b5b5);
        handle.setPadding(0, 0, 0, dp(2));
        return handle;
    }

    private void attachSheetDrag(TextView handle, LinearLayout sheet) {
        final float[] downY = new float[1];
        final float[] startTranslation = new float[1];

        sheet.post(() -> {
            sheetMaxTranslation = Math.max(0, sheet.getHeight() - dp(125));
        });

        handle.setOnTouchListener((v, event) -> {
            if (event.getAction() == MotionEvent.ACTION_DOWN) {
                downY[0] = event.getRawY();
                startTranslation[0] = sheet.getTranslationY();
                return true;
            }
            if (event.getAction() == MotionEvent.ACTION_MOVE) {
                float delta = event.getRawY() - downY[0];
                float target = startTranslation[0] + delta;
                target = Math.max(0, Math.min(sheetMaxTranslation, target));
                sheet.setTranslationY(target);
                return true;
            }
            if (event.getAction() == MotionEvent.ACTION_UP || event.getAction() == MotionEvent.ACTION_CANCEL) {
                float destination = sheet.getTranslationY() > sheetMaxTranslation * 0.45f ? sheetMaxTranslation : 0f;
                sheet.animate().translationY(destination).setDuration(180).start();
                return true;
            }
            return false;
        });

        handle.setOnClickListener(v -> {
            float destination = sheet.getTranslationY() < sheetMaxTranslation / 2f ? sheetMaxTranslation : 0f;
            sheet.animate().translationY(destination).setDuration(180).start();
        });
    }

    private Button overlayButton(String label) {
        Button b = new Button(this);
        b.setAllCaps(false);
        b.setText(label);
        b.setTextSize(16);
        b.setBackground(rounded(Color.WHITE, 24));
        b.setElevation(dp(7));
        return b;
    }

    private View buildQuickRow(boolean client) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        String[] names = client ? new String[]{"⌂\nCasa", "▣\nTrabalho", "＋\nOutro"} : new String[]{"▣\nViagens", "R$\nGanhos", "☻\nConta"};
        for (int i = 0; i < names.length; i++) {
            Button b = button(names[i]);
            b.setLayoutParams(new LinearLayout.LayoutParams(0, dp(88), 1));
            final int pos = i;
            if (client) {
                b.setOnClickListener(v -> {
                    if (pos == 0) requestRideWith("Casa");
                    else if (pos == 1) requestRideWith("Trabalho");
                    else requestRide();
                });
            } else {
                b.setOnClickListener(v -> {
                    if (pos == 0) showDriverTrips();
                    else if (pos == 1) showDriverEarnings();
                    else showAccount();
                });
            }
            row.addView(b);
        }
        return row;
    }

    private LinearLayout buildBottomNav(boolean client) {
        LinearLayout nav = new LinearLayout(this);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        nav.setPadding(dp(4), dp(2), dp(4), dp(2));
        nav.setBackground(rounded(0xff111111, 26));
        String[] labels = client ? new String[]{"⌂ Início", "▣ Viagens", "♡ Favoritos", "☻ Conta"}
                                 : new String[]{"⌂ Início", "▣ Viagens", "R$ Ganhos", "☻ Conta"};
        for (int i = 0; i < labels.length; i++) {
            Button b = new Button(this);
            b.setAllCaps(false);
            b.setText(labels[i]);
            b.setTextSize(11);
            b.setTextColor(Color.WHITE);
            b.setBackgroundColor(Color.TRANSPARENT);
            b.setLayoutParams(new LinearLayout.LayoutParams(0, dp(58), 1));
            final int pos = i;
            b.setOnClickListener(v -> {
                if (client) {
                    if (pos == 0) showClientHome();
                    else if (pos == 1) showClientTrips();
                    else if (pos == 2) showClientFavorites();
                    else showAccount();
                } else {
                    if (pos == 0) showDriverHome();
                    else if (pos == 1) showDriverTrips();
                    else if (pos == 2) showDriverEarnings();
                    else showAccount();
                }
            });
            nav.addView(b);
        }
        return nav;
    }

    private void showClientHome() {
        role = "client";
        startGpsTracking();
        currentSheet = null;
        mapWebView = null;

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xffeeeeee);
        WebView map = buildGoogleMapWebView();
        root.addView(map, new FrameLayout.LayoutParams(-1, -1));

        Button search = overlayButton("🔎  Para onde você vai?");
        search.setOnClickListener(v -> requestRide());
        FrameLayout.LayoutParams sp = new FrameLayout.LayoutParams(-1, dp(66));
        sp.setMargins(dp(18), dp(18), dp(18), 0);
        root.addView(search, sp);

        Button recenter = overlayButton("◎");
        recenter.setTextSize(25);
        recenter.setOnClickListener(v -> refreshGoogleMap(true));
        FrameLayout.LayoutParams rp = new FrameLayout.LayoutParams(dp(58), dp(58), Gravity.END | Gravity.TOP);
        rp.setMargins(0, dp(98), dp(18), 0);
        root.addView(recenter, rp);

        int sheetHeight = Math.min(dp(535), getResources().getDisplayMetrics().heightPixels - dp(115));
        LinearLayout sheet = new LinearLayout(this);
        sheet.setOrientation(LinearLayout.VERTICAL);
        sheet.setPadding(dp(18), 0, dp(18), dp(12));
        sheet.setBackground(rounded(Color.WHITE, 30));
        sheet.setElevation(dp(14));
        currentSheet = sheet;

        TextView handle = dragHandle();
        sheet.addView(handle, new LinearLayout.LayoutParams(-1, dp(36)));
        sheet.addView(text("Boa viagem, Cliente", 28, true));
        gpsStatusView = text(gpsSummary(), 13, true);
        gpsStatusView.setTextColor(0xff247044);
        sheet.addView(gpsStatusView);
        sheet.addView(buildQuickRow(true));

        Button myLocation = button("●  Minha localização\n     Atualizada pelo GPS em tempo real");
        myLocation.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        myLocation.setOnClickListener(v -> {
            refreshGoogleMap(true);
            openCurrentLocationExternal();
        });
        sheet.addView(myLocation);

        Button driver = button("🚗  Localização do motorista\n     Aguardando sincronização em tempo real");
        driver.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        driver.setOnClickListener(v -> Toast.makeText(this, "A posição do motorista será exibida aqui quando a sincronização entre aparelhos estiver ativa.", Toast.LENGTH_LONG).show());
        sheet.addView(driver);

        LinearLayout spacer = new LinearLayout(this);
        spacer.setLayoutParams(new LinearLayout.LayoutParams(-1, 0, 1));
        sheet.addView(spacer);
        sheet.addView(buildBottomNav(true));

        FrameLayout.LayoutParams sheetParams = new FrameLayout.LayoutParams(-1, sheetHeight, Gravity.BOTTOM);
        sheetParams.setMargins(0, 0, 0, 0);
        root.addView(sheet, sheetParams);
        attachSheetDrag(handle, sheet);
        setContentView(root);
    }

    private void showDriverHome() {
        role = "driver";
        startGpsTracking();
        currentSheet = null;
        mapWebView = null;

        FrameLayout root = new FrameLayout(this);
        WebView map = buildGoogleMapWebView();
        root.addView(map, new FrameLayout.LayoutParams(-1, -1));

        Button recenter = overlayButton("◎");
        recenter.setTextSize(25);
        recenter.setOnClickListener(v -> refreshGoogleMap(true));
        FrameLayout.LayoutParams rp = new FrameLayout.LayoutParams(dp(58), dp(58), Gravity.END | Gravity.TOP);
        rp.setMargins(0, dp(22), dp(18), 0);
        root.addView(recenter, rp);

        int sheetHeight = Math.min(dp(500), getResources().getDisplayMetrics().heightPixels - dp(110));
        LinearLayout sheet = new LinearLayout(this);
        sheet.setOrientation(LinearLayout.VERTICAL);
        sheet.setPadding(dp(18), 0, dp(18), dp(12));
        sheet.setBackground(rounded(Color.WHITE, 30));
        sheet.setElevation(dp(14));
        currentSheet = sheet;

        TextView handle = dragHandle();
        sheet.addView(handle, new LinearLayout.LayoutParams(-1, dp(36)));
        sheet.addView(text("Modo motorista", 28, true));
        gpsStatusView = text(gpsSummary(), 13, true);
        gpsStatusView.setTextColor(0xff247044);
        sheet.addView(gpsStatusView);

        Button online = button(driverOnline ? "🟢 Você está ONLINE — tocar para ficar Offline" : "⚫ Você está OFFLINE — tocar para ficar Online");
        online.setOnClickListener(v -> {
            driverOnline = !driverOnline;
            showDriverHome();
        });
        sheet.addView(online);

        if (driverOnline) {
            TextView call = text("Nova chamada de teste\nCliente Teste • Praia da Costa → Itapuã\nR$ 32,50", 17, true);
            sheet.addView(call);
            Button accept = button("Aceitar corrida");
            accept.setOnClickListener(v -> {
                driverTrips.add("Praia da Costa → Itapuã • concluída");
                driverEarnings += 26.00;
                showDriverTrips();
            });
            sheet.addView(accept);
        }

        sheet.addView(buildQuickRow(false));
        LinearLayout spacer = new LinearLayout(this);
        spacer.setLayoutParams(new LinearLayout.LayoutParams(-1, 0, 1));
        sheet.addView(spacer);
        sheet.addView(buildBottomNav(false));

        FrameLayout.LayoutParams sheetParams = new FrameLayout.LayoutParams(-1, sheetHeight, Gravity.BOTTOM);
        root.addView(sheet, sheetParams);
        attachSheetDrag(handle, sheet);
        setContentView(root);
    }

    private void showRoleChooser() {
        role = "";
        currentSheet = null;
        mapWebView = null;
        gpsStatusView = null;
        stopGpsTracking();

        LinearLayout root = pageColumn();
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.addView(text("TSV • Transporte Seguro Vix", 23, true));
        root.addView(text("Como você quer entrar?", 30, true));
        root.addView(text("Escolha uma área para continuar.", 15, false));

        Button c = button("👤 Entrar como Cliente");
        c.setOnClickListener(v -> showLogin("client"));
        Button d = button("🚗 Entrar como Motorista");
        d.setOnClickListener(v -> showLogin("driver"));
        Button a = button("🛡 Entrar como Gerência");
        a.setOnClickListener(v -> showLogin("admin"));
        root.addView(c); root.addView(d); root.addView(a);
        setContentView(scroll(root));
    }

    private void showLogin(String selectedRole) {
        String label = selectedRole.equals("client") ? "Cliente" : selectedRole.equals("driver") ? "Motorista" : "Gerência";
        String email = selectedRole.equals("client") ? "cliente@motoristaseguro.app" : selectedRole.equals("driver") ? "motorista@motoristaseguro.app" : "admin@motoristaseguro.app";
        String pass = selectedRole.equals("client") ? "Cliente@2026!" : selectedRole.equals("driver") ? "Motorista@2026!" : "Admin@2026!";

        LinearLayout root = pageColumn();
        header(root, "Entrar como " + label, "Conta de teste: " + email);
        EditText e = new EditText(this);
        e.setHint("E-mail");
        e.setText(email);
        e.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        EditText p = new EditText(this);
        p.setHint("Senha");
        p.setText(pass);
        p.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        Button enter = button("Entrar");
        enter.setOnClickListener(v -> {
            if (!e.getText().toString().trim().equalsIgnoreCase(email) || !p.getText().toString().equals(pass)) {
                Toast.makeText(this, "Login inválido", Toast.LENGTH_SHORT).show();
                return;
            }
            role = selectedRole;
            if (!selectedRole.equals("admin")) startGpsTracking();
            if (selectedRole.equals("client")) showClientHome();
            else if (selectedRole.equals("driver")) showDriverHome();
            else showAdminHome();
        });
        Button back = button("Voltar");
        back.setOnClickListener(v -> showRoleChooser());
        root.addView(e); root.addView(p); root.addView(enter); root.addView(back);
        setContentView(scroll(root));
    }

    private void requestRide() {
        EditText input = new EditText(this);
        input.setHint("Destino");
        input.setText("Praia da Costa, Vila Velha");
        new AlertDialog.Builder(this)
            .setTitle("Para onde você vai?")
            .setView(input)
            .setPositiveButton("Confirmar destino", (d, w) -> {
                String destination = input.getText().toString().trim();
                if (destination.isEmpty()) destination = "Destino informado";
                requestRideWith(destination);
            })
            .setNegativeButton("Cancelar", null)
            .show();
    }

    private void requestRideWith(String destination) {
        String origin = Double.isNaN(lastLat) ? "Minha localização" : String.format(Locale.US, "%.6f, %.6f", lastLat, lastLng);
        clientTrips.add(origin + " → " + destination + " • buscando motorista");
        Toast.makeText(this, "Destino selecionado: " + destination, Toast.LENGTH_SHORT).show();
        showClientTrips();
    }

    private void showClientTrips() {
        mapWebView = null;
        LinearLayout root = pageColumn();
        header(root, "Minhas viagens", "Solicitações e histórico");
        if (clientTrips.isEmpty()) root.addView(text("Nenhuma viagem ainda.", 16, false));
        for (String trip : clientTrips) root.addView(text("🚗 " + trip, 16, true));
        Button home = button("Voltar para o mapa"); home.setOnClickListener(v -> showClientHome()); root.addView(home);
        Button fav = button("Favoritos"); fav.setOnClickListener(v -> showClientFavorites()); root.addView(fav);
        Button account = button("Conta"); account.setOnClickListener(v -> showAccount()); root.addView(account);
        setContentView(scroll(root));
    }

    private void showClientFavorites() {
        mapWebView = null;
        LinearLayout root = pageColumn();
        header(root, "Favoritos", "Destinos rápidos");
        Button casa = button("⌂ Casa"); casa.setOnClickListener(v -> requestRideWith("Casa"));
        Button work = button("▣ Trabalho"); work.setOnClickListener(v -> requestRideWith("Trabalho"));
        Button add = button("＋ Adicionar favorito"); add.setOnClickListener(v -> Toast.makeText(this, "Favorito salvo em modo de teste", Toast.LENGTH_SHORT).show());
        Button home = button("Voltar para o mapa"); home.setOnClickListener(v -> showClientHome());
        root.addView(casa); root.addView(work); root.addView(add); root.addView(home);
        setContentView(scroll(root));
    }

    private void showDriverTrips() {
        mapWebView = null;
        LinearLayout root = pageColumn();
        header(root, "Viagens do motorista", "Corridas aceitas e concluídas");
        if (driverTrips.isEmpty()) root.addView(text("Nenhuma viagem ainda.", 16, false));
        for (String trip : driverTrips) root.addView(text("🚗 " + trip, 16, true));
        Button home = button("Voltar para o mapa"); home.setOnClickListener(v -> showDriverHome()); root.addView(home);
        setContentView(scroll(root));
    }

    private void showDriverEarnings() {
        mapWebView = null;
        LinearLayout root = pageColumn();
        header(root, "Ganhos", "Resumo financeiro");
        root.addView(text(String.format(Locale.getDefault(), "R$ %.2f", driverEarnings), 34, true));
        root.addView(text(driverTrips.size() + " viagem(ns) concluída(s)", 16, false));
        Button home = button("Voltar para o mapa"); home.setOnClickListener(v -> showDriverHome()); root.addView(home);
        setContentView(scroll(root));
    }

    private void showAccount() {
        mapWebView = null;
        LinearLayout root = pageColumn();
        String label = role.equals("client") ? "Cliente" : role.equals("driver") ? "Motorista" : "Gerência";
        header(root, "Minha conta", label + " • Transporte Seguro Vix");
        Button security = button("🛡 Central de segurança");
        security.setOnClickListener(v -> new AlertDialog.Builder(this)
            .setTitle("Central de segurança")
            .setMessage("Em emergência, ligue 190 ou 192. Durante uma corrida, compartilhe sua localização com alguém de confiança.")
            .setPositiveButton("OK", null).show());
        Button out = button("Sair da conta"); out.setOnClickListener(v -> showRoleChooser());
        Button back = button("Voltar"); back.setOnClickListener(v -> {
            if (role.equals("client")) showClientHome();
            else if (role.equals("driver")) showDriverHome();
            else showAdminHome();
        });
        root.addView(security); root.addView(out); root.addView(back);
        setContentView(scroll(root));
    }

    private void showAdminHome() {
        role = "admin";
        mapWebView = null;
        stopGpsTracking();
        LinearLayout root = pageColumn();
        header(root, "Painel da Gerência", "Controle do Transporte Seguro Vix");
        root.addView(text("Clientes: 1", 20, true));
        root.addView(text("Motoristas: 1", 20, true));
        root.addView(text("Motorista online: " + (driverOnline ? "Sim" : "Não"), 20, true));
        root.addView(text("Corridas: " + (clientTrips.size() + driverTrips.size()), 20, true));
        Button rides = button("Ver corridas");
        rides.setOnClickListener(v -> {
            StringBuilder msg = new StringBuilder();
            for (String s : clientTrips) msg.append("Cliente: ").append(s).append("\n");
            for (String s : driverTrips) msg.append("Motorista: ").append(s).append("\n");
            if (msg.length() == 0) msg.append("Nenhuma corrida registrada neste aparelho.");
            new AlertDialog.Builder(this).setTitle("Corridas").setMessage(msg.toString()).setPositiveButton("OK", null).show();
        });
        Button out = button("Sair"); out.setOnClickListener(v -> showRoleChooser());
        root.addView(rides); root.addView(out);
        setContentView(scroll(root));
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == LOCATION_REQUEST && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            startGpsTracking();
        }
    }

    @Override public void onBackPressed() {
        if (role.equals("client")) showClientHome();
        else if (role.equals("driver")) showDriverHome();
        else if (role.equals("admin")) showAdminHome();
        else showRoleChooser();
    }
}
