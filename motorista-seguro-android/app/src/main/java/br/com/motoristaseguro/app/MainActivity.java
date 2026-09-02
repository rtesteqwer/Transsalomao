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
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
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

public class MainActivity extends Activity implements LocationListener {
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
    private boolean directLocationRegistered = false;
    private LocationManager locationManager;
    private TextView gpsStatusView;
    private TextView mapStateView;
    private WebView mapWebView;
    private float sheetMaxTranslation = 0f;

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
        getWindow().setStatusBarColor(0xff111111);
        getWindow().setNavigationBarColor(0xff111111);
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
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

    @Override public void onLocationChanged(Location location) {
        if (location == null) return;
        applyLocation(location.getLatitude(), location.getLongitude(), location.hasAccuracy() ? location.getAccuracy() : 0f);
    }

    @Override public void onProviderEnabled(String provider) {}
    @Override public void onProviderDisabled(String provider) { refreshGpsLabel(); }
    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}

    private void applyLocation(double lat, double lng, float accuracy) {
        if (Double.isNaN(lat) || Double.isNaN(lng)) return;
        lastLat = lat;
        lastLng = lng;
        lastAccuracy = accuracy;
        getSharedPreferences(LocationForegroundService.PREFS, MODE_PRIVATE).edit()
            .putString("lat", Double.toString(lat))
            .putString("lng", Double.toString(lng))
            .putFloat("accuracy", accuracy)
            .putLong("time", System.currentTimeMillis())
            .apply();
        refreshGpsLabel();
        refreshGoogleMap(false);
    }

    private int dp(int value) {
        return (int)(value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private GradientDrawable rounded(int color, int radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(radiusDp));
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
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, dp(5), 0, dp(5));
        b.setLayoutParams(lp);
        return b;
    }

    private Button overlayButton(String label) {
        Button b = new Button(this);
        b.setAllCaps(false);
        b.setText(label);
        b.setTextSize(16);
        b.setBackground(rounded(Color.WHITE, 24));
        b.setElevation(dp(8));
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

    private boolean isLocationEnabled() {
        try {
            if (Build.VERSION.SDK_INT >= 28) return locationManager.isLocationEnabled();
            return locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                   locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        } catch (Exception e) { return false; }
    }

    private String gpsSummary() {
        if (!isLocationEnabled()) return "GPS DESLIGADO • toque em Ativar GPS";
        if (Double.isNaN(lastLat) || Double.isNaN(lastLng)) return "GPS ATIVO • procurando sua localização…";
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
        return Math.sqrt(dx * dx + dy * dy) > 10.0;
    }

    private String mapHtml() {
        double lat = Double.isNaN(lastLat) ? -20.3297 : lastLat;
        double lng = Double.isNaN(lastLng) ? -40.2925 : lastLng;
        String src = String.format(Locale.US,
            "https://maps.google.com/maps?q=%f,%f&ll=%f,%f&z=18&t=m&output=embed",
            lat, lng, lat, lng);
        return "<!doctype html><html><head>" +
            "<meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=yes'>" +
            "<style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#e9ecef}" +
            "iframe{border:0;width:100%;height:100%;display:block}</style></head><body>" +
            "<iframe src='" + src + "' allowfullscreen loading='eager' referrerpolicy='no-referrer-when-downgrade'></iframe>" +
            "</body></html>";
    }

    private WebView buildGoogleMapWebView() {
        WebView web = new WebView(this);
        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setDatabaseEnabled(true);
        ws.setLoadWithOverviewMode(true);
        ws.setUseWideViewPort(true);
        ws.setBuiltInZoomControls(false);
        ws.setDisplayZoomControls(false);
        ws.setMediaPlaybackRequiresUserGesture(false);
        if (Build.VERSION.SDK_INT >= 21) ws.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        CookieManager.getInstance().setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= 21) CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        web.setBackgroundColor(0xffe9ecef);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleMapUrl(view, request.getUrl().toString());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleMapUrl(view, url);
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (mapStateView != null) mapStateView.setVisibility(View.GONE);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (Build.VERSION.SDK_INT >= 23 && req.isForMainFrame() && mapStateView != null) {
                    mapStateView.setText("Não foi possível carregar o Google Maps. Verifique sua internet e toque em Recarregar mapa.");
                    mapStateView.setVisibility(View.VISIBLE);
                }
            }
        });
        mapWebView = web;
        refreshGoogleMap(true);
        return web;
    }

    private boolean handleMapUrl(WebView view, String url) {
        if (url == null) return false;
        if (url.startsWith("intent://")) {
            try {
                Intent parsed = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                String fallback = parsed.getStringExtra("browser_fallback_url");
                if (fallback != null && fallback.startsWith("https://")) {
                    view.loadUrl(fallback);
                    return true;
                }
            } catch (Exception ignored) {}
            refreshGoogleMap(true);
            return true;
        }
        if (url.startsWith("geo:") || url.startsWith("google.navigation:")) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) {}
            return true;
        }
        if (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("about:")) return true;
        return false;
    }

    private void refreshGoogleMap(boolean force) {
        if (mapWebView == null) return;
        if (!force && !movedEnough()) return;
        if (mapStateView != null) {
            mapStateView.setText("Carregando Google Maps…");
            mapStateView.setVisibility(View.VISIBLE);
        }
        mapWebView.loadDataWithBaseURL("https://maps.google.com/", mapHtml(), "text/html", "UTF-8", null);
        if (!Double.isNaN(lastLat)) {
            lastMapLat = lastLat;
            lastMapLng = lastLng;
        }
    }

    private void startDirectLocationUpdates() {
        if (directLocationRegistered) return;
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) return;
        try {
            Location best = null;
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, this);
                best = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            }
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 1200L, 0f, this);
                Location n = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
                if (best == null || (n != null && n.getTime() > best.getTime())) best = n;
            }
            directLocationRegistered = true;
            if (best != null) onLocationChanged(best);
        } catch (Exception ignored) {}
    }

    private void stopDirectLocationUpdates() {
        if (!directLocationRegistered) return;
        try { locationManager.removeUpdates(this); } catch (Exception ignored) {}
        directLocationRegistered = false;
    }

    private void startGpsTracking() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, LOCATION_REQUEST);
            return;
        }
        if (!isLocationEnabled()) {
            new AlertDialog.Builder(this)
                .setTitle("Ativar GPS")
                .setMessage("O Transporte Seguro Vix precisa da localização do aparelho para mostrar sua posição no mapa.")
                .setPositiveButton("Ativar GPS", (d,w) -> startActivity(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)))
                .setNegativeButton("Agora não", null)
                .show();
            return;
        }
        startDirectLocationUpdates();
        Intent service = new Intent(this, LocationForegroundService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(service); else startService(service);
    }

    private void stopGpsTracking() {
        stopDirectLocationUpdates();
        try { stopService(new Intent(this, LocationForegroundService.class)); } catch (Exception ignored) {}
    }

    private TextView dragHandle() {
        TextView h = new TextView(this);
        h.setText("━━━━");
        h.setTextSize(24);
        h.setGravity(Gravity.CENTER);
        h.setTextColor(0xffa6a6a6);
        h.setPadding(0, 0, 0, dp(2));
        return h;
    }

    private void attachSheetDrag(TextView handle, LinearLayout sheet) {
        final float[] downY = new float[1];
        final float[] start = new float[1];
        sheet.post(() -> sheetMaxTranslation = Math.max(0, sheet.getHeight() - dp(130)));
        handle.setOnTouchListener((v,e) -> {
            if (e.getAction() == MotionEvent.ACTION_DOWN) {
                downY[0] = e.getRawY(); start[0] = sheet.getTranslationY(); return true;
            }
            if (e.getAction() == MotionEvent.ACTION_MOVE) {
                float target = start[0] + (e.getRawY() - downY[0]);
                sheet.setTranslationY(Math.max(0, Math.min(sheetMaxTranslation, target)));
                return true;
            }
            if (e.getAction() == MotionEvent.ACTION_UP || e.getAction() == MotionEvent.ACTION_CANCEL) {
                float dest = sheet.getTranslationY() > sheetMaxTranslation * .45f ? sheetMaxTranslation : 0f;
                sheet.animate().translationY(dest).setDuration(180).start();
                return true;
            }
            return false;
        });
        handle.setOnClickListener(v -> {
            float dest = sheet.getTranslationY() < sheetMaxTranslation / 2f ? sheetMaxTranslation : 0f;
            sheet.animate().translationY(dest).setDuration(180).start();
        });
    }

    private View buildQuickRow(boolean client) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        String[] names = client ? new String[]{"⌂\nCasa","▣\nTrabalho","＋\nOutro"} : new String[]{"▣\nViagens","R$\nGanhos","☻\nConta"};
        for (int i=0;i<3;i++) {
            Button b = button(names[i]);
            b.setLayoutParams(new LinearLayout.LayoutParams(0, dp(88), 1));
            final int pos=i;
            if (client) b.setOnClickListener(v -> { if(pos==0) requestRideWith("Casa"); else if(pos==1) requestRideWith("Trabalho"); else requestRide(); });
            else b.setOnClickListener(v -> { if(pos==0) showDriverTrips(); else if(pos==1) showDriverEarnings(); else showAccount(); });
            row.addView(b);
        }
        return row;
    }

    private LinearLayout buildBottomNav(boolean client) {
        LinearLayout nav = new LinearLayout(this);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        nav.setBackground(rounded(0xff111111, 26));
        String[] labels = client ? new String[]{"⌂ Início","▣ Viagens","♡ Favoritos","☻ Conta"} : new String[]{"⌂ Início","▣ Viagens","R$ Ganhos","☻ Conta"};
        for(int i=0;i<4;i++) {
            Button b=new Button(this); b.setAllCaps(false); b.setText(labels[i]); b.setTextSize(11); b.setTextColor(Color.WHITE); b.setBackgroundColor(Color.TRANSPARENT); b.setLayoutParams(new LinearLayout.LayoutParams(0,dp(58),1));
            final int p=i;
            b.setOnClickListener(v -> {
                if(client) { if(p==0) showClientHome(); else if(p==1) showClientTrips(); else if(p==2) showClientFavorites(); else showAccount(); }
                else { if(p==0) showDriverHome(); else if(p==1) showDriverTrips(); else if(p==2) showDriverEarnings(); else showAccount(); }
            });
            nav.addView(b);
        }
        return nav;
    }

    private void showClientHome() {
        role="client";
        startGpsTracking();
        mapWebView=null; mapStateView=null;
        FrameLayout root=new FrameLayout(this); root.setBackgroundColor(0xffe9ecef);
        WebView map=buildGoogleMapWebView(); root.addView(map,new FrameLayout.LayoutParams(-1,-1));

        mapStateView=text("Carregando Google Maps…",14,true); mapStateView.setGravity(Gravity.CENTER); mapStateView.setBackgroundColor(0xccffffff);
        FrameLayout.LayoutParams ms=new FrameLayout.LayoutParams(-1,dp(48),Gravity.TOP); ms.setMargins(dp(20),dp(92),dp(20),0); root.addView(mapStateView,ms);

        Button search=overlayButton("🔎  Para onde você vai?"); search.setOnClickListener(v->requestRide());
        FrameLayout.LayoutParams sp=new FrameLayout.LayoutParams(-1,dp(66),Gravity.TOP); sp.setMargins(dp(18),dp(18),dp(18),0); root.addView(search,sp);

        Button recenter=overlayButton("◎"); recenter.setTextSize(25); recenter.setOnClickListener(v->{ startGpsTracking(); refreshGoogleMap(true); });
        FrameLayout.LayoutParams rp=new FrameLayout.LayoutParams(dp(58),dp(58),Gravity.END|Gravity.TOP); rp.setMargins(0,dp(150),dp(18),0); root.addView(recenter,rp);

        Button reload=overlayButton("↻"); reload.setTextSize(22); reload.setOnClickListener(v->refreshGoogleMap(true));
        FrameLayout.LayoutParams rlp=new FrameLayout.LayoutParams(dp(58),dp(58),Gravity.END|Gravity.TOP); rlp.setMargins(0,dp(216),dp(18),0); root.addView(reload,rlp);

        LinearLayout sheet=new LinearLayout(this); sheet.setOrientation(LinearLayout.VERTICAL); sheet.setPadding(dp(18),0,dp(18),dp(14)); sheet.setBackground(rounded(Color.WHITE,30)); sheet.setElevation(dp(14));
        TextView handle=dragHandle(); sheet.addView(handle);
        sheet.addView(text("Boa viagem, Cliente",28,true));
        gpsStatusView=text(gpsSummary(),14,true); gpsStatusView.setTextColor(0xff166534); sheet.addView(gpsStatusView);
        Button activate=button("📍 Ativar / atualizar GPS"); activate.setOnClickListener(v->{startGpsTracking(); refreshGoogleMap(true);}); sheet.addView(activate);
        sheet.addView(buildQuickRow(true));
        sheet.addView(text("Localização do motorista",17,true));
        sheet.addView(text("Aparecerá no mesmo mapa quando a sincronização entre os aparelhos estiver conectada ao banco.",13,false));
        sheet.addView(buildBottomNav(true));
        FrameLayout.LayoutParams sh=new FrameLayout.LayoutParams(-1,dp(420),Gravity.BOTTOM); sh.setMargins(0,0,0,0); root.addView(sheet,sh); attachSheetDrag(handle,sheet);
        setContentView(root);
    }

    private void showDriverHome() {
        role="driver";
        startGpsTracking();
        mapWebView=null; mapStateView=null;
        FrameLayout root=new FrameLayout(this); root.setBackgroundColor(0xffe9ecef);
        WebView map=buildGoogleMapWebView(); root.addView(map,new FrameLayout.LayoutParams(-1,-1));
        mapStateView=text("Carregando Google Maps…",14,true); mapStateView.setGravity(Gravity.CENTER); mapStateView.setBackgroundColor(0xccffffff);
        FrameLayout.LayoutParams ms=new FrameLayout.LayoutParams(-1,dp(48),Gravity.TOP); ms.setMargins(dp(20),dp(18),dp(20),0); root.addView(mapStateView,ms);
        Button recenter=overlayButton("◎"); recenter.setTextSize(25); recenter.setOnClickListener(v->{startGpsTracking();refreshGoogleMap(true);}); FrameLayout.LayoutParams rp=new FrameLayout.LayoutParams(dp(58),dp(58),Gravity.END|Gravity.TOP); rp.setMargins(0,dp(80),dp(18),0); root.addView(recenter,rp);

        LinearLayout sheet=new LinearLayout(this); sheet.setOrientation(LinearLayout.VERTICAL); sheet.setPadding(dp(18),0,dp(18),dp(14)); sheet.setBackground(rounded(Color.WHITE,30)); sheet.setElevation(dp(14));
        TextView handle=dragHandle(); sheet.addView(handle);
        sheet.addView(text("Modo motorista",28,true));
        gpsStatusView=text(gpsSummary(),14,true); gpsStatusView.setTextColor(0xff166534); sheet.addView(gpsStatusView);
        Button on=button(driverOnline?"🟢 Ficar Offline":"⚫ Ficar Online"); on.setOnClickListener(v->{driverOnline=!driverOnline;showDriverHome();}); sheet.addView(on);
        if(driverOnline) {
            sheet.addView(text("Nova chamada de teste • Praia da Costa → Itapuã • R$ 32,50",16,true));
            Button a=button("Aceitar corrida"); a.setOnClickListener(v->{driverTrips.add("Praia da Costa → Itapuã • concluída");driverEarnings+=26;showDriverTrips();}); sheet.addView(a);
            Button r=button("Recusar"); r.setOnClickListener(v->Toast.makeText(this,"Chamada recusada",Toast.LENGTH_SHORT).show()); sheet.addView(r);
        }
        sheet.addView(buildQuickRow(false)); sheet.addView(buildBottomNav(false));
        FrameLayout.LayoutParams sh=new FrameLayout.LayoutParams(-1,dp(410),Gravity.BOTTOM); root.addView(sheet,sh); attachSheetDrag(handle,sheet);
        setContentView(root);
    }

    private void showRoleChooser() {
        role=""; stopGpsTracking(); mapWebView=null;
        LinearLayout root=pageColumn(); root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.addView(text("TSV • Transporte Seguro Vix",23,true)); root.addView(text("Como você quer entrar?",30,true));
        Button c=button("👤 Entrar como Cliente"); c.setOnClickListener(v->showLogin("client"));
        Button d=button("🚗 Entrar como Motorista"); d.setOnClickListener(v->showLogin("driver"));
        Button a=button("🛡 Entrar como Gerência"); a.setOnClickListener(v->showLogin("admin"));
        root.addView(c);root.addView(d);root.addView(a);setContentView(scroll(root));
    }

    private void showLogin(String r) {
        String label=r.equals("client")?"Cliente":r.equals("driver")?"Motorista":"Gerência";
        String email=r.equals("client")?"cliente@motoristaseguro.app":r.equals("driver")?"motorista@motoristaseguro.app":"admin@motoristaseguro.app";
        String pass=r.equals("client")?"Cliente@2026!":r.equals("driver")?"Motorista@2026!":"Admin@2026!";
        LinearLayout root=pageColumn(); header(root,"Entrar como "+label,"Conta de teste: "+email);
        EditText e=new EditText(this);e.setHint("E-mail");e.setText(email);e.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        EditText p=new EditText(this);p.setHint("Senha");p.setText(pass);p.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);
        Button enter=button("Entrar");enter.setOnClickListener(v->{if(!e.getText().toString().trim().equalsIgnoreCase(email)||!p.getText().toString().equals(pass)){Toast.makeText(this,"Login inválido",Toast.LENGTH_SHORT).show();return;}role=r;if(r.equals("client"))showClientHome();else if(r.equals("driver"))showDriverHome();else showAdminHome();});
        Button back=button("Voltar");back.setOnClickListener(v->showRoleChooser());root.addView(e);root.addView(p);root.addView(enter);root.addView(back);setContentView(scroll(root));
    }

    private void requestRide() {
        EditText i=new EditText(this);i.setHint("Destino");i.setText("Praia da Costa, Vila Velha");
        new AlertDialog.Builder(this).setTitle("Escolher destino").setView(i).setPositiveButton("Solicitar",(d,w)->requestRideWith(i.getText().toString().trim().isEmpty()?"Destino":i.getText().toString().trim())).setNegativeButton("Cancelar",null).show();
    }

    private void requestRideWith(String dest) { clientTrips.add("Minha localização → "+dest+" • buscando motorista");Toast.makeText(this,"Corrida solicitada",Toast.LENGTH_SHORT).show();showClientTrips(); }

    private void showClientTrips(){mapWebView=null;LinearLayout root=pageColumn();header(root,"Minhas viagens","Histórico e solicitações");if(clientTrips.isEmpty())root.addView(text("Nenhuma viagem ainda.",16,false));for(String x:clientTrips)root.addView(text("🚗 "+x,16,true));Button b=button("Voltar ao mapa");b.setOnClickListener(v->showClientHome());root.addView(b);setContentView(scroll(root));}
    private void showClientFavorites(){mapWebView=null;LinearLayout root=pageColumn();header(root,"Favoritos","Destinos rápidos");Button c=button("⌂ Casa");c.setOnClickListener(v->requestRideWith("Casa"));Button t=button("▣ Trabalho");t.setOnClickListener(v->requestRideWith("Trabalho"));Button b=button("Voltar ao mapa");b.setOnClickListener(v->showClientHome());root.addView(c);root.addView(t);root.addView(b);setContentView(scroll(root));}
    private void showDriverTrips(){mapWebView=null;LinearLayout root=pageColumn();header(root,"Viagens do motorista","Corridas aceitas e concluídas");if(driverTrips.isEmpty())root.addView(text("Nenhuma viagem ainda.",16,false));for(String x:driverTrips)root.addView(text("🚗 "+x,16,true));Button b=button("Voltar ao mapa");b.setOnClickListener(v->showDriverHome());root.addView(b);setContentView(scroll(root));}
    private void showDriverEarnings(){mapWebView=null;LinearLayout root=pageColumn();header(root,"Ganhos","Resumo financeiro");root.addView(text(String.format(Locale.getDefault(),"R$ %.2f",driverEarnings),34,true));root.addView(text(driverTrips.size()+" viagem(ns)",16,false));Button b=button("Voltar ao mapa");b.setOnClickListener(v->showDriverHome());root.addView(b);setContentView(scroll(root));}
    private void showAccount(){mapWebView=null;LinearLayout root=pageColumn();header(root,"Minha conta",role.equals("client")?"Cliente":"Motorista");Button gps=button("📍 Configurações do GPS");gps.setOnClickListener(v->startActivity(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)));root.addView(gps);Button out=button("Sair");out.setOnClickListener(v->showRoleChooser());root.addView(out);Button back=button("Voltar ao mapa");back.setOnClickListener(v->{if(role.equals("client"))showClientHome();else showDriverHome();});root.addView(back);setContentView(scroll(root));}
    private void showAdminHome(){mapWebView=null;LinearLayout root=pageColumn();header(root,"Painel da Gerência","Controle de clientes, motoristas e corridas");root.addView(text("Clientes: 1",20,true));root.addView(text("Motoristas: 1",20,true));root.addView(text("Corridas: "+(clientTrips.size()+driverTrips.size()),20,true));Button out=button("Sair");out.setOnClickListener(v->showRoleChooser());root.addView(out);setContentView(scroll(root));}

    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] grantResults){super.onRequestPermissionsResult(requestCode,permissions,grantResults);if(requestCode==LOCATION_REQUEST&&grantResults.length>0&&grantResults[0]==PackageManager.PERMISSION_GRANTED){startGpsTracking();if(role.equals("client"))showClientHome();else if(role.equals("driver"))showDriverHome();}}

    @Override protected void onResume(){super.onResume();if(!role.isEmpty()&&!role.equals("admin")&&checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED&&isLocationEnabled()){startDirectLocationUpdates();Intent service=new Intent(this,LocationForegroundService.class);if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.O)startForegroundService(service);else startService(service);refreshGpsLabel();refreshGoogleMap(true);}}

    @Override public void onBackPressed(){if(role.equals("client"))showClientHome();else if(role.equals("driver"))showDriverHome();else if(role.equals("admin"))showAdminHome();else showRoleChooser();}
}
