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
import android.view.MotionEvent;
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

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

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
    private boolean driverOnline = false;
    private double lastLat = Double.NaN;
    private double lastLng = Double.NaN;
    private float lastAccuracy = 0f;
    private WebView mapWebView;
    private TextView gpsLabel;
    private float sheetMaxTranslation;
    private final Handler searchHandler = new Handler(Looper.getMainLooper());
    private Runnable pendingSearch;

    private static class PlaceSuggestion {
        final String label;
        final double lat;
        final double lng;
        PlaceSuggestion(String label, double lat, double lng) { this.label = label; this.lat = lat; this.lng = lng; }
    }

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
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(locationReceiver, f, Context.RECEIVER_NOT_EXPORTED); else registerReceiver(locationReceiver, f);
            receiverRegistered = true;
        }
        if (!role.isEmpty() && !role.equals("admin")) startDirectLocationUpdates();
    }

    @Override protected void onStop() {
        if (receiverRegistered) { try { unregisterReceiver(locationReceiver); } catch (Exception ignored) {} receiverRegistered = false; }
        stopDirectLocationUpdates();
        super.onStop();
    }

    @Override public void onLocationChanged(Location location) {
        if (location != null) applyLocation(location.getLatitude(), location.getLongitude(), location.hasAccuracy() ? location.getAccuracy() : 0f);
    }
    @Override public void onProviderEnabled(String provider) {}
    @Override public void onProviderDisabled(String provider) { refreshGps(); }
    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}

    private int dp(int n) { return (int)(n * getResources().getDisplayMetrics().density + .5f); }
    private GradientDrawable rounded(int color, int radius) { GradientDrawable g = new GradientDrawable(); g.setColor(color); g.setCornerRadius(dp(radius)); return g; }
    private TextView text(String value, int size, boolean bold) { TextView v = new TextView(this); v.setText(value); v.setTextSize(size); v.setTextColor(WHITE); v.setPadding(dp(4),dp(5),dp(4),dp(5)); if (bold) v.setTypeface(Typeface.DEFAULT, Typeface.BOLD); return v; }
    private TextView muted(String value, int size) { TextView v = text(value,size,false); v.setTextColor(MUTED); return v; }
    private Button button(String label) { Button b = new Button(this); b.setAllCaps(false); b.setText(label); b.setTextColor(WHITE); b.setTextSize(16); b.setBackground(rounded(CARD2,18)); LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1,dp(56)); lp.setMargins(0,dp(6),0,dp(6)); b.setLayoutParams(lp); return b; }
    private Button accentButton(String label) { Button b = button(label); b.setTextColor(Color.BLACK); b.setTypeface(Typeface.DEFAULT,Typeface.BOLD); b.setBackground(rounded(ACCENT,18)); return b; }
    private LinearLayout page() { LinearLayout r = new LinearLayout(this); r.setOrientation(LinearLayout.VERTICAL); r.setPadding(dp(20),dp(24),dp(20),dp(32)); r.setBackgroundColor(BG); return r; }
    private ScrollView scroll(LinearLayout content) { ScrollView s = new ScrollView(this); s.setFillViewport(true); s.setBackgroundColor(BG); s.addView(content); return s; }

    private void loadLastLocation() {
        SharedPreferences p = getSharedPreferences(LocationForegroundService.PREFS,MODE_PRIVATE);
        try { String la=p.getString("lat",null), ln=p.getString("lng",null); if(la!=null&&ln!=null){lastLat=Double.parseDouble(la);lastLng=Double.parseDouble(ln);} lastAccuracy=p.getFloat("accuracy",0f); } catch(Exception ignored){}
    }
    private void applyLocation(double lat,double lng,float accuracy) {
        if(Double.isNaN(lat)||Double.isNaN(lng)) return;
        lastLat=lat;lastLng=lng;lastAccuracy=accuracy;
        getSharedPreferences(LocationForegroundService.PREFS,MODE_PRIVATE).edit().putString("lat",Double.toString(lat)).putString("lng",Double.toString(lng)).putFloat("accuracy",accuracy).apply();
        refreshGps(); updateMapMarkerOnly();
    }
    private boolean locationEnabled() { try { if(Build.VERSION.SDK_INT>=28) return locationManager.isLocationEnabled(); return locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)||locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER); } catch(Exception e){return false;} }
    private String gpsText() { if(!locationEnabled()) return "GPS desligado"; if(Double.isNaN(lastLat)) return "GPS ativo • localizando…"; return String.format(Locale.US,"GPS ao vivo • %.5f, %.5f • ±%.0f m",lastLat,lastLng,lastAccuracy); }
    private void refreshGps(){if(gpsLabel!=null)gpsLabel.setText(gpsText());}

    private void startGps() {
        if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},LOCATION_REQUEST);return;}
        if(!locationEnabled()){ new AlertDialog.Builder(this).setTitle("Ativar localização").setMessage("Ative o GPS para mostrar sua posição no mapa.").setPositiveButton("Abrir configurações",(d,w)->startActivity(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))).setNegativeButton("Agora não",null).show();return; }
        startDirectLocationUpdates(); Intent i=new Intent(this,LocationForegroundService.class); if(Build.VERSION.SDK_INT>=26)startForegroundService(i);else startService(i);
    }
    private void startDirectLocationUpdates(){
        if(directRegistered)return;
        if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED&&checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)!=PackageManager.PERMISSION_GRANTED)return;
        try{
            Location best=null;
            if(locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)){locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER,1000L,0f,this);best=locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);}
            if(locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)){locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER,1500L,0f,this);Location n=locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);if(best==null||(n!=null&&n.getTime()>best.getTime()))best=n;}
            directRegistered=true;if(best!=null)onLocationChanged(best);
        }catch(Exception ignored){}
    }
    private void stopDirectLocationUpdates(){if(!directRegistered)return;try{locationManager.removeUpdates(this);}catch(Exception ignored){}directRegistered=false;}
    private void stopGps(){stopDirectLocationUpdates();try{stopService(new Intent(this,LocationForegroundService.class));}catch(Exception ignored){}}

    private String mapHtml(){
        double lat=Double.isNaN(lastLat)?-20.3297:lastLat,lng=Double.isNaN(lastLng)?-40.2925:lastLng,acc=Math.max(3,lastAccuracy);
        return "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=yes'>"+
            "<link rel='stylesheet' href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'><style>html,body,#map{margin:0;width:100%;height:100%;background:#16191d}.leaflet-control-attribution{font-size:9px!important}</style></head><body><div id='map'></div>"+
            "<script src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'></script><script>var map=L.map('map',{zoomControl:false}).setView(["+lat+","+lng+"],17);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);"+
            "var marker=L.circleMarker(["+lat+","+lng+"],{radius:9,color:'#fff',weight:4,fillColor:'#4285f4',fillOpacity:1}).addTo(map);var accuracy=L.circle(["+lat+","+lng+"],{radius:"+acc+",color:'#4285f4',weight:1,fillOpacity:.08}).addTo(map);window.setPos=function(a,b,c){marker.setLatLng([a,b]);accuracy.setLatLng([a,b]);accuracy.setRadius(Math.max(3,c));};window.recenter=function(){map.setView(marker.getLatLng(),18,{animate:true});};</script></body></html>";
    }
    private WebView mapView(){
        mapReady=false;WebView w=new WebView(this);WebSettings s=w.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setDatabaseEnabled(true);s.setUseWideViewPort(true);s.setLoadWithOverviewMode(true);s.setBuiltInZoomControls(false);s.setDisplayZoomControls(false);
        w.setWebChromeClient(new WebChromeClient());w.setWebViewClient(new WebViewClient(){@Override public void onPageFinished(WebView view,String url){mapReady=true;updateMapMarkerOnly();}});w.setBackgroundColor(0xff16191d);mapWebView=w;w.loadDataWithBaseURL("https://unpkg.com/",mapHtml(),"text/html","UTF-8",null);return w;
    }
    private void updateMapMarkerOnly(){if(mapWebView==null||!mapReady||Double.isNaN(lastLat)||Double.isNaN(lastLng))return;String js=String.format(Locale.US,"if(window.setPos){setPos(%f,%f,%f);}",lastLat,lastLng,lastAccuracy);mapWebView.evaluateJavascript(js,null);}
    private void recenterMap(){if(mapWebView!=null&&mapReady)mapWebView.evaluateJavascript("if(window.recenter){recenter();}",null);}

    private TextView dragHandle(){TextView h=text("━━━━",22,true);h.setTextColor(0xff555555);h.setGravity(Gravity.CENTER);return h;}
    private void makeDraggable(TextView handle,LinearLayout sheet){final float[] down={0},start={0};sheet.post(()->sheetMaxTranslation=Math.max(0,sheet.getHeight()-dp(135)));handle.setOnTouchListener((v,e)->{if(e.getAction()==MotionEvent.ACTION_DOWN){down[0]=e.getRawY();start[0]=sheet.getTranslationY();return true;}if(e.getAction()==MotionEvent.ACTION_MOVE){float t=start[0]+e.getRawY()-down[0];sheet.setTranslationY(Math.max(0,Math.min(sheetMaxTranslation,t)));return true;}if(e.getAction()==MotionEvent.ACTION_UP||e.getAction()==MotionEvent.ACTION_CANCEL){float dest=sheet.getTranslationY()>sheetMaxTranslation*.45f?sheetMaxTranslation:0;sheet.animate().translationY(dest).setDuration(180).start();return true;}return false;});}

    private LinearLayout navItem(String icon,String label,boolean selected,Runnable action){LinearLayout item=new LinearLayout(this);item.setOrientation(LinearLayout.VERTICAL);item.setGravity(Gravity.CENTER);item.setPadding(dp(4),dp(5),dp(4),dp(5));item.setBackground(selected?rounded(CARD2,24):rounded(Color.TRANSPARENT,24));TextView ic=text(icon,19,true);ic.setGravity(Gravity.CENTER);ic.setTextColor(selected?WHITE:MUTED);TextView lb=text(label,10,selected);lb.setGravity(Gravity.CENTER);lb.setTextColor(selected?WHITE:MUTED);lb.setSingleLine(true);item.addView(ic,new LinearLayout.LayoutParams(-1,dp(29)));item.addView(lb,new LinearLayout.LayoutParams(-1,dp(25)));item.setOnClickListener(v->action.run());return item;}
    private LinearLayout bottomNav(boolean client,int selected){LinearLayout nav=new LinearLayout(this);nav.setOrientation(LinearLayout.HORIZONTAL);nav.setPadding(dp(8),dp(6),dp(8),dp(6));nav.setBackground(rounded(0xf4181818,32));String[] icons=client?new String[]{"⌂","▦","▣","⚙"}:new String[]{"⌂","◉","R$","⚙"};String[] labels=client?new String[]{"Início","Opções","Atividade","Configurações"}:new String[]{"Início","Chamadas","Ganhos","Configurações"};for(int i=0;i<4;i++){final int x=i;Runnable action=()->{if(client){if(x==0)showClientHome();else if(x==1)showClientOptions();else if(x==2)showClientActivity();else showClientAccount();}else{if(x==0)showDriverHome();else if(x==1)showDriverCalls();else if(x==2)showDriverEarnings();else showDriverAccount();}};LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,dp(66),1f);lp.setMargins(dp(5),0,dp(5),0);nav.addView(navItem(icons[i],labels[i],i==selected,action),lp);}return nav;}

    private Button optionCard(String icon,String label){Button b=new Button(this);b.setAllCaps(false);b.setText(icon+"\n"+label);b.setTextColor(WHITE);b.setTextSize(17);b.setGravity(Gravity.CENTER);b.setBackground(rounded(CARD2,22));b.setPadding(dp(10),dp(14),dp(10),dp(14));b.setOnClickListener(v->showFeaturePage(label,"Recurso selecionado: "+label,role.equals("driver")?this::showDriverHome:this::showClientHome));return b;}
    private LinearLayout optionRow(String i1,String l1,String i2,String l2){LinearLayout row=new LinearLayout(this);row.setOrientation(LinearLayout.HORIZONTAL);LinearLayout.LayoutParams left=new LinearLayout.LayoutParams(0,dp(150),1f);left.setMargins(0,dp(8),dp(8),dp(8));LinearLayout.LayoutParams right=new LinearLayout.LayoutParams(0,dp(150),1f);right.setMargins(dp(8),dp(8),0,dp(8));row.addView(optionCard(i1,l1),left);row.addView(optionCard(i2,l2),right);return row;}

    private void showRoleChooser(){role="";stopGps();LinearLayout p=page();p.setGravity(Gravity.CENTER_HORIZONTAL);TextView logo=text("TSV",44,true);logo.setTextColor(ACCENT);p.addView(logo);p.addView(text("Transporte Seguro Vix",29,true));p.addView(muted("v2.5 • busca de destino com sugestões",15));Button c=accentButton("Entrar como Cliente"),d=button("Entrar como Motorista"),a=button("Entrar como Gerência");c.setOnClickListener(v->showLogin("client"));d.setOnClickListener(v->showLogin("driver"));a.setOnClickListener(v->showLogin("admin"));p.addView(c);p.addView(d);p.addView(a);setContentView(scroll(p));}
    private void showLogin(String targetRole){String title=targetRole.equals("client")?"Cliente":targetRole.equals("driver")?"Motorista":"Gerência";String email=targetRole.equals("client")?"cliente@motoristaseguro.app":targetRole.equals("driver")?"motorista@motoristaseguro.app":"admin@motoristaseguro.app";String pass=targetRole.equals("client")?"Cliente@2026!":targetRole.equals("driver")?"Motorista@2026!":"Admin@2026!";LinearLayout p=page();p.addView(text("Entrar como "+title,31,true));p.addView(muted("Acesso de teste já preenchido",15));EditText e=new EditText(this);e.setText(email);e.setTextColor(WHITE);e.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);EditText pw=new EditText(this);pw.setText(pass);pw.setTextColor(WHITE);pw.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);p.addView(e);p.addView(pw);Button enter=accentButton("Entrar");enter.setOnClickListener(v->{if(!email.equalsIgnoreCase(e.getText().toString().trim())||!pass.equals(pw.getText().toString())){Toast.makeText(this,"Login inválido para este perfil",Toast.LENGTH_SHORT).show();return;}role=targetRole;if(!targetRole.equals("admin"))startGps();if(targetRole.equals("client"))showClientHome();else if(targetRole.equals("driver"))showDriverHome();else showAdmin();});Button back=button("Voltar");back.setOnClickListener(v->showRoleChooser());p.addView(enter);p.addView(back);setContentView(scroll(p));}

    private Button profileButton(){Button g=new Button(this);g.setText("G");g.setTextSize(18);g.setTextColor(WHITE);g.setBackground(rounded(0xee171717,30));g.setOnClickListener(v->showUserData());return g;}
    private void showClientHome(){
        role="client";startGps();FrameLayout root=new FrameLayout(this);root.setBackgroundColor(BG);root.addView(mapView(),new FrameLayout.LayoutParams(-1,-1));
        Button recenter=new Button(this);recenter.setText("◎");recenter.setTextSize(25);recenter.setTextColor(WHITE);recenter.setBackground(rounded(0xee171717,30));recenter.setOnClickListener(v->{startGps();recenterMap();});FrameLayout.LayoutParams rp=new FrameLayout.LayoutParams(dp(58),dp(58),Gravity.TOP|Gravity.END);rp.setMargins(0,dp(20),dp(20),0);root.addView(recenter,rp);
        FrameLayout.LayoutParams gp=new FrameLayout.LayoutParams(dp(58),dp(58),Gravity.TOP|Gravity.START);gp.setMargins(dp(20),dp(20),0,0);root.addView(profileButton(),gp);
        LinearLayout sheet=new LinearLayout(this);sheet.setOrientation(LinearLayout.VERTICAL);sheet.setPadding(dp(20),dp(4),dp(20),dp(16));sheet.setBackground(rounded(BG,28));TextView h=dragHandle();sheet.addView(h);sheet.addView(text("Insira seu destino",28,true));sheet.addView(muted("Digite um local para visualizar sugestões",14));
        SharedPreferences prefs=getSharedPreferences("trip",MODE_PRIVATE);String selected=prefs.getString("dest_name","");Button search=button(selected.isEmpty()?"▣   Para onde?":"▣   "+selected);search.setGravity(Gravity.START|Gravity.CENTER_VERTICAL);search.setOnClickListener(v->showPlanTrip());sheet.addView(search);gpsLabel=muted(gpsText(),13);sheet.addView(gpsLabel);sheet.addView(bottomNav(true,0));makeDraggable(h,sheet);FrameLayout.LayoutParams sp=new FrameLayout.LayoutParams(-1,dp(340),Gravity.BOTTOM);root.addView(sheet,sp);setContentView(root);
    }
    private void showDriverHome(){role="driver";startGps();FrameLayout root=new FrameLayout(this);root.setBackgroundColor(BG);root.addView(mapView(),new FrameLayout.LayoutParams(-1,-1));Button recenter=new Button(this);recenter.setText("◎");recenter.setTextColor(WHITE);recenter.setTextSize(25);recenter.setBackground(rounded(0xee171717,30));recenter.setOnClickListener(v->recenterMap());FrameLayout.LayoutParams rp=new FrameLayout.LayoutParams(dp(58),dp(58),Gravity.TOP|Gravity.END);rp.setMargins(0,dp(20),dp(20),0);root.addView(recenter,rp);FrameLayout.LayoutParams gp=new FrameLayout.LayoutParams(dp(58),dp(58),Gravity.TOP|Gravity.START);gp.setMargins(dp(20),dp(20),0,0);root.addView(profileButton(),gp);LinearLayout sheet=new LinearLayout(this);sheet.setOrientation(LinearLayout.VERTICAL);sheet.setPadding(dp(20),dp(4),dp(20),dp(16));sheet.setBackground(rounded(BG,28));TextView h=dragHandle();sheet.addView(h);sheet.addView(text(driverOnline?"Você está online":"Você está offline",27,true));gpsLabel=muted(gpsText(),13);sheet.addView(gpsLabel);Button online=driverOnline?button("FICAR OFFLINE"):accentButton("FICAR ONLINE");online.setOnClickListener(v->{driverOnline=!driverOnline;showDriverHome();});sheet.addView(online);sheet.addView(bottomNav(false,0));makeDraggable(h,sheet);FrameLayout.LayoutParams sp=new FrameLayout.LayoutParams(-1,dp(280),Gravity.BOTTOM);root.addView(sheet,sp);setContentView(root);}

    private void showUserData(){LinearLayout p=page();boolean driver=role.equals("driver");p.addView(text("Dados do usuário",34,true));p.addView(muted(driver?"Perfil do motorista":"Perfil do cliente",16));p.addView(button("Nome: "+(driver?"Motorista Teste":"Cliente Teste")));p.addView(button("E-mail: "+(driver?"motorista@motoristaseguro.app":"cliente@motoristaseguro.app")));p.addView(button("Telefone: não informado"));p.addView(button("Status: "+(driver?"Aprovado • CNH B • EAR ativo":"Conta de teste • nota 5.0")));p.addView(button("Localização: "+gpsText()));Button back=accentButton("Voltar ao mapa");back.setOnClickListener(v->{if(driver)showDriverHome();else showClientHome();});p.addView(back);setContentView(scroll(p));}

    private void showPlanTrip(){
        LinearLayout p=page();p.addView(text("Planeje sua próxima viagem",29,true));p.addView(muted("Digite o destino e escolha uma das sugestões",14));
        Button now=button("◷  Ir agora");now.setOnClickListener(v->Toast.makeText(this,"Viagem configurada para agora",Toast.LENGTH_SHORT).show());p.addView(now);
        Button origin=button("●  Minha localização atual");origin.setOnClickListener(v->Toast.makeText(this,gpsText(),Toast.LENGTH_LONG).show());p.addView(origin);
        EditText d=new EditText(this);d.setHint("Para onde?");d.setHintTextColor(MUTED);d.setTextColor(WHITE);d.setTextSize(19);d.setSingleLine(true);d.setBackground(rounded(CARD2,18));d.setPadding(dp(16),0,dp(16),0);p.addView(d,new LinearLayout.LayoutParams(-1,dp(62)));
        TextView status=muted("Digite pelo menos 3 letras",13);p.addView(status);
        LinearLayout suggestions=new LinearLayout(this);suggestions.setOrientation(LinearLayout.VERTICAL);p.addView(suggestions);
        d.addTextChangedListener(new TextWatcher(){public void beforeTextChanged(CharSequence s,int st,int c,int a){}public void onTextChanged(CharSequence s,int st,int before,int count){}public void afterTextChanged(Editable e){String q=e.toString().trim();if(pendingSearch!=null)searchHandler.removeCallbacks(pendingSearch);suggestions.removeAllViews();if(q.length()<3){status.setText("Digite pelo menos 3 letras");return;}status.setText("Buscando lugares…");pendingSearch=()->searchDestinations(q,suggestions,status);searchHandler.postDelayed(pendingSearch,450);}});
        Button back=button("Voltar ao mapa");back.setOnClickListener(v->showClientHome());p.addView(back);setContentView(scroll(p));d.requestFocus();
    }

    private void searchDestinations(String query, LinearLayout suggestions, TextView status){
        new Thread(()->{
            List<PlaceSuggestion> found=new ArrayList<>();
            try{
                StringBuilder u=new StringBuilder("https://photon.komoot.io/api/?limit=6&lang=pt&q=").append(URLEncoder.encode(query,"UTF-8"));
                if(!Double.isNaN(lastLat)&&!Double.isNaN(lastLng))u.append("&lat=").append(lastLat).append("&lon=").append(lastLng);
                HttpURLConnection c=(HttpURLConnection)new URL(u.toString()).openConnection();c.setConnectTimeout(7000);c.setReadTimeout(7000);c.setRequestProperty("User-Agent","TransporteSeguroVix/2.5 Android");
                BufferedReader br=new BufferedReader(new InputStreamReader(c.getInputStream()));StringBuilder raw=new StringBuilder();String line;while((line=br.readLine())!=null)raw.append(line);br.close();
                JSONArray features=new JSONObject(raw.toString()).optJSONArray("features");Set<String> seen=new LinkedHashSet<>();
                if(features!=null)for(int i=0;i<features.length();i++){
                    JSONObject f=features.optJSONObject(i);if(f==null)continue;JSONObject props=f.optJSONObject("properties");JSONObject geo=f.optJSONObject("geometry");if(props==null||geo==null)continue;JSONArray coords=geo.optJSONArray("coordinates");if(coords==null||coords.length()<2)continue;
                    String label=placeLabel(props);if(label.isEmpty()||seen.contains(label))continue;seen.add(label);found.add(new PlaceSuggestion(label,coords.optDouble(1),coords.optDouble(0)));
                }
            }catch(Exception ignored){}
            runOnUiThread(()->renderSuggestions(found,suggestions,status));
        }).start();
    }

    private String placeLabel(JSONObject p){
        List<String> parts=new ArrayList<>();String name=p.optString("name","").trim();String street=p.optString("street","").trim();String house=p.optString("housenumber","").trim();String city=p.optString("city",p.optString("district","")).trim();String state=p.optString("state","").trim();
        if(!name.isEmpty())parts.add(name);if(!street.isEmpty()&&!street.equalsIgnoreCase(name))parts.add(street+(house.isEmpty()?"":", "+house));if(!city.isEmpty())parts.add(city);if(!state.isEmpty()&&!state.equalsIgnoreCase(city))parts.add(state);
        StringBuilder out=new StringBuilder();for(String x:parts){if(out.length()>0)out.append(" • ");out.append(x);}return out.toString();
    }

    private void renderSuggestions(List<PlaceSuggestion> found,LinearLayout suggestions,TextView status){
        suggestions.removeAllViews();if(found.isEmpty()){status.setText("Nenhum destino encontrado. Continue digitando.");return;}status.setText(found.size()+" sugestões encontradas");
        for(PlaceSuggestion s:found){Button b=button("⌖  "+s.label);b.setGravity(Gravity.START|Gravity.CENTER_VERTICAL);b.setTextSize(15);b.setOnClickListener(v->showDestinationPreview(s));suggestions.addView(b);}
    }

    private void showDestinationPreview(PlaceSuggestion dest){
        FrameLayout root=new FrameLayout(this);root.setBackgroundColor(BG);WebView w=new WebView(this);WebSettings ws=w.getSettings();ws.setJavaScriptEnabled(true);ws.setDomStorageEnabled(true);w.setWebChromeClient(new WebChromeClient());w.setWebViewClient(new WebViewClient());w.setBackgroundColor(0xff16191d);w.loadDataWithBaseURL("https://unpkg.com/",destinationPreviewHtml(dest),"text/html","UTF-8",null);root.addView(w,new FrameLayout.LayoutParams(-1,-1));
        LinearLayout sheet=new LinearLayout(this);sheet.setOrientation(LinearLayout.VERTICAL);sheet.setPadding(dp(20),dp(12),dp(20),dp(18));sheet.setBackground(rounded(BG,28));sheet.addView(text("Pré-visualizar destino",25,true));sheet.addView(muted(dest.label,16));Button confirm=accentButton("Confirmar destino");confirm.setOnClickListener(v->{getSharedPreferences("trip",MODE_PRIVATE).edit().putString("dest_name",dest.label).putString("dest_lat",Double.toString(dest.lat)).putString("dest_lng",Double.toString(dest.lng)).apply();Toast.makeText(this,"Destino confirmado",Toast.LENGTH_SHORT).show();showClientHome();});sheet.addView(confirm);Button change=button("Voltar à busca");change.setOnClickListener(v->showPlanTrip());sheet.addView(change);FrameLayout.LayoutParams sp=new FrameLayout.LayoutParams(-1,dp(245),Gravity.BOTTOM);root.addView(sheet,sp);setContentView(root);
    }

    private String destinationPreviewHtml(PlaceSuggestion d){
        boolean hasOrigin=!Double.isNaN(lastLat)&&!Double.isNaN(lastLng);String origin=hasOrigin?("L.circleMarker(["+lastLat+","+lastLng+"],{radius:8,color:'#fff',weight:3,fillColor:'#4285f4',fillOpacity:1}).addTo(map);L.polyline([["+lastLat+","+lastLng+"],["+d.lat+","+d.lng+"]],{color:'#c9ff35',weight:4,opacity:.85}).addTo(map);map.fitBounds([["+lastLat+","+lastLng+"],["+d.lat+","+d.lng+"]],{padding:[45,45]});"):("map.setView(["+d.lat+","+d.lng+"],17);");
        return "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1'><link rel='stylesheet' href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'><style>html,body,#map{margin:0;width:100%;height:100%;background:#16191d}</style></head><body><div id='map'></div><script src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'></script><script>var map=L.map('map',{zoomControl:false});L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);L.circleMarker(["+d.lat+","+d.lng+"],{radius:10,color:'#fff',weight:3,fillColor:'#ff3b30',fillOpacity:1}).addTo(map);"+origin+"</script></body></html>";
    }

    private void showClientOptions(){LinearLayout p=page();p.addView(text("Opções",34,true));p.addView(muted("Vá para onde quiser, peça o que precisar",17));p.addView(optionRow("🚗","Viagem","🕒","Agendar"));p.addView(optionRow("👩","Motorista Mulher","👥","Para terceiros"));p.addView(optionRow("🏢","Empresa","♿","Senior"));LinearLayout.LayoutParams np=new LinearLayout.LayoutParams(-1,dp(80));np.setMargins(0,dp(24),0,0);p.addView(bottomNav(true,1),np);setContentView(scroll(p));}
    private void showClientActivity(){LinearLayout p=page();p.addView(text("Atividade",34,true));p.addView(muted("Anteriores",18));LinearLayout card=page();card.setPadding(dp(16),dp(14),dp(16),dp(14));card.setBackground(rounded(CARD,22));card.addView(text("Av. Santa Leopoldina, nº 1200",21,true));card.addView(muted("2 de jul. • 15:23",14));card.addView(muted("R$ 19,83 • Parada: 1",14));Button rate=button("☆ Avaliar");rate.setOnClickListener(v->showFeaturePage("Avaliar viagem","Selecione sua avaliação desta viagem.",this::showClientActivity));card.addView(rate);p.addView(card);p.addView(bottomNav(true,2));setContentView(scroll(p));}
    private void showClientAccount(){LinearLayout p=page();p.addView(text("Configurações",34,true));p.addView(text("Cliente Teste",28,true));p.addView(muted("★ 5.0 • Conta de teste",15));addFeatureButton(p,"Ajuda","Central de ajuda, dúvidas e suporte do Transporte Seguro Vix.",this::showClientAccount);addFeatureButton(p,"Carteira","Saldo: R$ 0,00\nMétodos de pagamento cadastrados: nenhum.",this::showClientAccount);addFeatureButton(p,"Segurança","Compartilhar viagem, contato de confiança, PIN e recursos de emergência.",this::showClientAccount);addFeatureButton(p,"Mensagens","Nenhuma mensagem nova no momento.",this::showClientAccount);Button dados=button("Dados pessoais");dados.setOnClickListener(v->showUserData());p.addView(dados);addFeatureButton(p,"Meus veículos","Nenhum veículo cadastrado neste perfil de teste.",this::showClientAccount);addFeatureButton(p,"Pagamentos","Configure Pix, dinheiro e futuros cartões.",this::showClientAccount);addFeatureButton(p,"Preferências","Notificações, aparência e preferências de viagem.",this::showClientAccount);addFeatureButton(p,"Privacidade e localização","Status atual: "+gpsText(),this::showClientAccount);Button out=button("Sair");out.setOnClickListener(v->showRoleChooser());p.addView(out);p.addView(bottomNav(true,3));setContentView(scroll(p));}
    private void showDriverCalls(){LinearLayout p=page();p.addView(text("Chamadas",34,true));p.addView(muted(driverOnline?"Você está disponível para novas solicitações":"Fique online para receber solicitações",16));LinearLayout card=page();card.setPadding(dp(16),dp(14),dp(16),dp(14));card.setBackground(rounded(CARD,22));card.addView(text("Nova solicitação",23,true));card.addView(text("R$ 38,70",29,true));card.addView(muted("2,3 km até o cliente • 12,4 km de viagem",14));Button accept=accentButton("ACEITAR");accept.setOnClickListener(v->showFeaturePage("Corrida aceita","Você aceitou a solicitação de teste.",this::showDriverCalls));card.addView(accept);p.addView(card);p.addView(bottomNav(false,1));setContentView(scroll(p));}
    private void showDriverEarnings(){LinearLayout p=page();p.addView(text("Ganhos",34,true));p.addView(text("R$ 184,20",31,true));p.addView(muted("Hoje",15));p.addView(button("Semana • R$ 1.084,50"));p.addView(button("Mês • R$ 4.420,80"));p.addView(bottomNav(false,2));setContentView(scroll(p));}
    private void showDriverAccount(){LinearLayout p=page();p.addView(text("Configurações",34,true));p.addView(text("Motorista Teste",28,true));p.addView(muted("★ 5.0 • CNH B • EAR ativo • Aprovado",15));Button dados=button("Dados pessoais");dados.setOnClickListener(v->showUserData());p.addView(dados);addFeatureButton(p,"CNH","Categoria B • EAR ativo.",this::showDriverAccount);addFeatureButton(p,"Documentos","Central de documentos do motorista.",this::showDriverAccount);addFeatureButton(p,"Segurança","PIN, emergência e suporte durante corridas.",this::showDriverAccount);addFeatureButton(p,"Avaliações","Nota atual: 5.0.",this::showDriverAccount);addFeatureButton(p,"Preferências","Notificações e preferências do motorista.",this::showDriverAccount);Button out=button("Sair");out.setOnClickListener(v->showRoleChooser());p.addView(out);p.addView(bottomNav(false,3));setContentView(scroll(p));}
    private void addFeatureButton(LinearLayout p,String title,String body,Runnable back){Button b=button(title);b.setOnClickListener(v->showFeaturePage(title,body,back));p.addView(b);}
    private void showFeaturePage(String title,String body,Runnable backAction){LinearLayout p=page();p.addView(text(title,32,true));p.addView(muted(body,17));Button back=accentButton("Voltar");back.setOnClickListener(v->backAction.run());p.addView(back);setContentView(scroll(p));}
    private void showAdmin(){role="admin";LinearLayout p=page();p.addView(text("Gerência",34,true));p.addView(muted("Painel operacional de teste • v2.5",15));String[] items={"Dashboard","Corridas","Motoristas","Clientes","Financeiro","Mapa","Relatórios","Configurações"};for(String item:items){Button b=button(item);b.setOnClickListener(v->showFeaturePage(((Button)v).getText().toString(),"Módulo de gerência: "+((Button)v).getText(),this::showAdmin));p.addView(b);}Button out=button("Sair");out.setOnClickListener(v->showRoleChooser());p.addView(out);setContentView(scroll(p));}

    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] grantResults){super.onRequestPermissionsResult(requestCode,permissions,grantResults);if(requestCode==LOCATION_REQUEST&&grantResults.length>0&&grantResults[0]==PackageManager.PERMISSION_GRANTED){startGps();if(role.equals("client"))showClientHome();else if(role.equals("driver"))showDriverHome();}}
}
