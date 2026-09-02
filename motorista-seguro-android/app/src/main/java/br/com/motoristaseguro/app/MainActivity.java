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
import android.provider.Settings;
import android.text.InputType;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.webkit.CookieManager;
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

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class MainActivity extends Activity implements LocationListener {
    private static final int LOCATION_REQUEST = 3101;
    private static final int BG = 0xff141414;
    private static final int CARD = 0xff282828;
    private static final int CARD2 = 0xff343434;
    private static final int WHITE = 0xfff4f4f4;
    private static final int MUTED = 0xffb8b8b8;
    private static final int ACCENT = 0xffc9ff35;

    private String role = "";
    private boolean driverOnline = false;
    private double driverEarnings = 184.20;
    private final List<String> clientTrips = new ArrayList<>();
    private final List<String> driverTrips = new ArrayList<>();

    private double lastLat = Double.NaN;
    private double lastLng = Double.NaN;
    private float lastAccuracy = 0f;
    private LocationManager locationManager;
    private boolean directLocationRegistered = false;
    private boolean receiverRegistered = false;
    private WebView mapWebView;
    private TextView gpsLabel;
    private float sheetMaxTranslation = 0f;

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
        clientTrips.add("Av. Santa Leopoldina, 1200 • 2 de jul. • R$ 19,83");
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
    @Override public void onProviderEnabled(String p) {}
    @Override public void onProviderDisabled(String p) { refreshGps(); }
    @Override public void onStatusChanged(String p, int s, Bundle b) {}

    private int dp(int n) { return (int)(n * getResources().getDisplayMetrics().density + .5f); }

    private GradientDrawable bg(int color, int radius) {
        GradientDrawable g = new GradientDrawable(); g.setColor(color); g.setCornerRadius(dp(radius)); return g;
    }

    private TextView txt(String s, int sp, boolean bold) {
        TextView v = new TextView(this); v.setText(s); v.setTextSize(sp); v.setTextColor(WHITE); v.setPadding(dp(4),dp(5),dp(4),dp(5));
        if (bold) v.setTypeface(Typeface.DEFAULT, Typeface.BOLD); return v;
    }

    private TextView muted(String s, int sp) { TextView v=txt(s,sp,false); v.setTextColor(MUTED); return v; }

    private Button btn(String s) {
        Button b = new Button(this); b.setAllCaps(false); b.setText(s); b.setTextSize(15); b.setTextColor(WHITE); b.setBackground(bg(CARD2,18));
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,dp(54)); lp.setMargins(0,dp(5),0,dp(5)); b.setLayoutParams(lp); return b;
    }

    private Button accentBtn(String s) { Button b=btn(s); b.setTextColor(Color.BLACK); b.setBackground(bg(ACCENT,18)); b.setTypeface(Typeface.DEFAULT,Typeface.BOLD); return b; }

    private LinearLayout page() { LinearLayout r=new LinearLayout(this); r.setOrientation(LinearLayout.VERTICAL); r.setPadding(dp(20),dp(22),dp(20),dp(92)); r.setBackgroundColor(BG); return r; }
    private ScrollView scroll(LinearLayout c) { ScrollView s=new ScrollView(this); s.setFillViewport(true); s.setBackgroundColor(BG); s.addView(c); return s; }

    private LinearLayout card() { LinearLayout c=new LinearLayout(this); c.setOrientation(LinearLayout.VERTICAL); c.setPadding(dp(18),dp(16),dp(18),dp(16)); c.setBackground(bg(CARD,22)); LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2); lp.setMargins(0,dp(7),0,dp(7)); c.setLayoutParams(lp); return c; }

    private void loadLastLocation() {
        SharedPreferences p=getSharedPreferences(LocationForegroundService.PREFS,MODE_PRIVATE);
        try { String a=p.getString("lat",null), b=p.getString("lng",null); if(a!=null&&b!=null){lastLat=Double.parseDouble(a);lastLng=Double.parseDouble(b);} lastAccuracy=p.getFloat("accuracy",0f);} catch(Exception ignored){}
    }

    private void applyLocation(double lat,double lng,float accuracy){
        if(Double.isNaN(lat)||Double.isNaN(lng))return; lastLat=lat; lastLng=lng; lastAccuracy=accuracy;
        getSharedPreferences(LocationForegroundService.PREFS,MODE_PRIVATE).edit().putString("lat",Double.toString(lat)).putString("lng",Double.toString(lng)).putFloat("accuracy",accuracy).apply();
        refreshGps(); refreshMap();
    }

    private boolean locationEnabled(){try{if(Build.VERSION.SDK_INT>=28)return locationManager.isLocationEnabled();return locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)||locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);}catch(Exception e){return false;}}
    private String gpsText(){ if(!locationEnabled())return "GPS desligado"; if(Double.isNaN(lastLat))return "GPS ativo • localizando…"; return String.format(Locale.US,"GPS ao vivo • %.5f, %.5f • ±%.0f m",lastLat,lastLng,lastAccuracy); }
    private void refreshGps(){ if(gpsLabel!=null) gpsLabel.setText(gpsText()); }

    private void startGps(){
        if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},LOCATION_REQUEST);return;}
        if(!locationEnabled()){new AlertDialog.Builder(this).setTitle("Ativar localização").setMessage("Ative o GPS para mostrar sua posição no mapa.").setPositiveButton("Abrir configurações",(d,w)->startActivity(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))).setNegativeButton("Agora não",null).show();return;}
        startDirectLocationUpdates(); Intent i=new Intent(this,LocationForegroundService.class); if(Build.VERSION.SDK_INT>=26)startForegroundService(i);else startService(i);
    }

    private void startDirectLocationUpdates(){
        if(directLocationRegistered)return; if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED&&checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)!=PackageManager.PERMISSION_GRANTED)return;
        try{if(locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER))locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER,1000,0,this);if(locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER))locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER,1500,0,this);directLocationRegistered=true;}catch(Exception ignored){}
    }
    private void stopDirectLocationUpdates(){if(!directLocationRegistered)return;try{locationManager.removeUpdates(this);}catch(Exception ignored){}directLocationRegistered=false;}
    private void stopGps(){stopDirectLocationUpdates();try{stopService(new Intent(this,LocationForegroundService.class));}catch(Exception ignored){}}

    private String mapHtml(){
        double lat=Double.isNaN(lastLat)?-20.3297:lastLat, lng=Double.isNaN(lastLng)?-40.2925:lastLng;
        String src=String.format(Locale.US,"https://maps.google.com/maps?q=%f,%f&ll=%f,%f&z=17&t=m&output=embed",lat,lng,lat,lng);
        return "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'><style>html,body,iframe{margin:0;width:100%;height:100%;border:0;background:#30343f;overflow:hidden}iframe{filter:brightness(.72) contrast(1.12) saturate(.65)}</style></head><body><iframe src='"+src+"'></iframe></body></html>";
    }

    private WebView mapView(){
        WebView w=new WebView(this); WebSettings s=w.getSettings(); s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setUseWideViewPort(true);s.setLoadWithOverviewMode(true); CookieManager.getInstance().setAcceptCookie(true); if(Build.VERSION.SDK_INT>=21)CookieManager.getInstance().setAcceptThirdPartyCookies(w,true); w.setWebChromeClient(new WebChromeClient());w.setWebViewClient(new WebViewClient()); w.setBackgroundColor(0xff30343f); mapWebView=w; refreshMap(); return w;
    }
    private void refreshMap(){if(mapWebView!=null)mapWebView.loadDataWithBaseURL("https://maps.google.com/",mapHtml(),"text/html","UTF-8",null);}

    private TextView handle(){TextView h=txt("━━━━",22,true);h.setTextColor(0xff555555);h.setGravity(Gravity.CENTER);return h;}
    private void makeDraggable(TextView h,LinearLayout sheet){final float[] y={0},start={0};sheet.post(()->sheetMaxTranslation=Math.max(0,sheet.getHeight()-dp(125)));h.setOnTouchListener((v,e)->{if(e.getAction()==MotionEvent.ACTION_DOWN){y[0]=e.getRawY();start[0]=sheet.getTranslationY();return true;}if(e.getAction()==MotionEvent.ACTION_MOVE){float t=start[0]+e.getRawY()-y[0];sheet.setTranslationY(Math.max(0,Math.min(sheetMaxTranslation,t)));return true;}if(e.getAction()==MotionEvent.ACTION_UP){float d=sheet.getTranslationY()>sheetMaxTranslation*.45f?sheetMaxTranslation:0;sheet.animate().translationY(d).setDuration(180).start();return true;}return false;});}

    private void showRoleChooser(){ role=""; stopGps(); LinearLayout r=page(); r.setGravity(Gravity.CENTER_HORIZONTAL); TextView logo=txt("TSV",42,true);logo.setTextColor(ACCENT);r.addView(logo);r.addView(txt("Transporte Seguro Vix",29,true));r.addView(muted("Escolha como deseja entrar",16));Button c=accentBtn("Entrar como Cliente");Button d=btn("Entrar como Motorista");Button a=btn("Entrar como Gerência");c.setOnClickListener(v->showLogin("client"));d.setOnClickListener(v->showLogin("driver"));a.setOnClickListener(v->showLogin("admin"));r.addView(c);r.addView(d);r.addView(a);setContentView(scroll(r));}

    private void showLogin(String r){
        String title=r.equals("client")?"Cliente":r.equals("driver")?"Motorista":"Gerência";
        String email=r.equals("client")?"cliente@motoristaseguro.app":r.equals("driver")?"motorista@motoristaseguro.app":"admin@motoristaseguro.app";
        String pass=r.equals("client")?"Cliente@2026!":r.equals("driver")?"Motorista@2026!":"Admin@2026!";
        LinearLayout p=page();p.addView(txt("Entrar como "+title,32,true));p.addView(muted("Acesso de teste já preenchido",15));EditText e=new EditText(this);e.setText(email);e.setHint("E-mail");e.setTextColor(WHITE);e.setHintTextColor(MUTED);e.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);EditText pw=new EditText(this);pw.setText(pass);pw.setHint("Senha");pw.setTextColor(WHITE);pw.setHintTextColor(MUTED);pw.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);p.addView(e);p.addView(pw);Button enter=accentBtn("Entrar");enter.setOnClickListener(v->{if(!email.equalsIgnoreCase(e.getText().toString().trim())||!pass.equals(pw.getText().toString())){Toast.makeText(this,"Login inválido para este perfil",Toast.LENGTH_SHORT).show();return;}role=r;if(!r.equals("admin"))startGps();if(r.equals("client"))showClientHome();else if(r.equals("driver"))showDriverHome();else showAdmin();});Button back=btn("Voltar");back.setOnClickListener(v->showRoleChooser());p.addView(enter);p.addView(back);setContentView(scroll(p));
    }

    private LinearLayout bottomNav(boolean client,int selected){
        LinearLayout n=new LinearLayout(this);n.setOrientation(LinearLayout.HORIZONTAL);n.setPadding(dp(4),dp(2),dp(4),dp(2));n.setBackground(bg(0xee181818,34));String[] labs=client?new String[]{"⌂\nInício","▦\nOpções","▣\nAtividade","●\nConta"}:new String[]{"⌂\nInício","◉\nChamadas","R$\nGanhos","●\nConta"};for(int i=0;i<4;i++){Button b=new Button(this);b.setAllCaps(false);b.setText(labs[i]);b.setTextSize(11);b.setTextColor(i==selected?WHITE:MUTED);b.setBackground(i==selected?bg(CARD2,28):bg(Color.TRANSPARENT,28));b.setLayoutParams(new LinearLayout.LayoutParams(0,dp(64),1));final int x=i;b.setOnClickListener(v->{if(client){if(x==0)showClientHome();else if(x==1)showClientOptions();else if(x==2)showClientActivity();else showClientAccount();}else{if(x==0)showDriverHome();else if(x==1)showDriverCalls();else if(x==2)showDriverEarnings();else showDriverAccount();}});n.addView(b);}return n;
    }

    private void showClientHome(){
        role="client";startGps();FrameLayout root=new FrameLayout(this);root.setBackgroundColor(BG);root.addView(mapView(),new FrameLayout.LayoutParams(-1,-1));
        Button back=new Button(this);back.setText("←");back.setTextSize(28);back.setTextColor(WHITE);back.setBackground(bg(0xee171717,30));back.setOnClickListener(v->showRoleChooser());FrameLayout.LayoutParams bp=new FrameLayout.LayoutParams(dp(58),dp(58),Gravity.TOP|Gravity.START);bp.setMargins(dp(20),dp(20),0,0);root.addView(back,bp);
        Button gps=new Button(this);gps.setText("◎");gps.setTextSize(25);gps.setTextColor(WHITE);gps.setBackground(bg(0xee171717,30));gps.setOnClickListener(v->{startGps();refreshMap();});FrameLayout.LayoutParams gp=new FrameLayout.LayoutParams(dp(58),dp(58),Gravity.TOP|Gravity.END);gp.setMargins(0,dp(20),dp(20),0);root.addView(gps,gp);
        LinearLayout sheet=new LinearLayout(this);sheet.setOrientation(LinearLayout.VERTICAL);sheet.setPadding(dp(20),dp(4),dp(20),dp(18));sheet.setBackground(bg(BG,28));TextView h=handle();sheet.addView(h);sheet.addView(txt("Insira seu destino",28,true));sheet.addView(muted("Arraste o painel para ver mais do mapa",15));Button search=btn("▣   Para onde?");search.setGravity(Gravity.START|Gravity.CENTER_VERTICAL);search.setTextSize(18);search.setOnClickListener(v->showPlanTrip());sheet.addView(search);gpsLabel=muted(gpsText(),13);sheet.addView(gpsLabel);sheet.addView(bottomNav(true,0));makeDraggable(h,sheet);FrameLayout.LayoutParams sp=new FrameLayout.LayoutParams(-1,dp(330),Gravity.BOTTOM);root.addView(sheet,sp);setContentView(root);
    }

    private void showPlanTrip(){
        LinearLayout p=page();p.addView(txt("Planeje sua próxima viagem",31,true));LinearLayout chips=new LinearLayout(this);chips.setOrientation(LinearLayout.HORIZONTAL);Button now=btn("◷ Ir agora⌄");now.setLayoutParams(new LinearLayout.LayoutParams(0,dp(52),1));Button me=btn("● Para mim⌄");me.setLayoutParams(new LinearLayout.LayoutParams(0,dp(52),1));chips.addView(now);chips.addView(me);p.addView(chips);
        EditText origin=new EditText(this);origin.setText("Minha localização atual");origin.setTextColor(WHITE);origin.setHintTextColor(MUTED);origin.setBackground(bg(CARD,16));origin.setPadding(dp(16),0,dp(16),0);p.addView(origin,new LinearLayout.LayoutParams(-1,dp(58)));
        EditText dest=new EditText(this);dest.setHint("Para onde?");dest.setTextColor(WHITE);dest.setHintTextColor(MUTED);dest.setBackground(bg(CARD,16));dest.setPadding(dp(16),0,dp(16),0);LinearLayout.LayoutParams dl=new LinearLayout.LayoutParams(-1,dp(58));dl.setMargins(0,dp(8),0,dp(12));p.addView(dest,dl);
        p.addView(txt("Recentes",20,true));String[] recent={"Av. Santa Leopoldina, nº 1200","Shopping Praia da Costa","Rodoviária de Vitória-ES","Terminal Transcol de Campo Grande","Shopping Moxuara"};for(String x:recent){Button b=btn("◷  "+x);b.setGravity(Gravity.START|Gravity.CENTER_VERTICAL);b.setOnClickListener(v->{dest.setText(x);});p.addView(b);}Button confirm=accentBtn("Pesquisar destino");confirm.setOnClickListener(v->{String d=dest.getText().toString().trim();if(d.isEmpty()){Toast.makeText(this,"Informe o destino",Toast.LENGTH_SHORT).show();return;}showServiceChoice(d);});p.addView(confirm);Button back=btn("Voltar ao mapa");back.setOnClickListener(v->showClientHome());p.addView(back);setContentView(scroll(p));
    }

    private void showServiceChoice(String destination){
        LinearLayout p=page();p.addView(txt("Escolha sua viagem",30,true));p.addView(muted("Destino: "+destination,15));String[][] services={{"Seguro Econômico","R$ 29,90 • 4 min"},{"Seguro Conforto","R$ 36,50 • 6 min"},{"Seguro Premium","R$ 48,90 • 8 min"},{"Motorista Mulher","R$ 39,90 • quando disponível"}};for(String[] s:services){LinearLayout c=card();c.addView(txt(s[0],20,true));c.addView(muted(s[1],15));c.setOnClickListener(v->Toast.makeText(this,s[0]+" selecionado",Toast.LENGTH_SHORT).show());p.addView(c);}Button confirm=accentBtn("Confirmar Transporte Seguro");confirm.setOnClickListener(v->{clientTrips.add(destination+" • buscando motorista • R$ 29,90");showSearching(destination);});p.addView(confirm);setContentView(scroll(p));
    }

    private void showSearching(String d){LinearLayout p=page();p.addView(txt("Procurando motorista próximo…",28,true));p.addView(muted("Origem: sua localização atual",15));p.addView(muted("Destino: "+d,15));LinearLayout c=card();c.addView(txt("Buscando motoristas verificados",19,true));c.addView(muted("Você será avisado assim que um motorista aceitar.",15));p.addView(c);Button sim=accentBtn("Simular motorista encontrado");sim.setOnClickListener(v->showDriverFound(d));p.addView(sim);Button cancel=btn("Cancelar solicitação");cancel.setOnClickListener(v->showClientHome());p.addView(cancel);setContentView(scroll(p));}

    private void showDriverFound(String d){LinearLayout p=page();p.addView(txt("Motorista encontrado",30,true));LinearLayout c=card();c.addView(txt("Carlos • ★ 4,9",22,true));c.addView(muted("Honda Civic • ABC1D23",16));c.addView(txt("Chega em aproximadamente 4 min",18,true));p.addView(c);p.addView(muted("Destino: "+d,15));Button msg=btn("Mensagem");Button sec=btn("Segurança");Button done=accentBtn("Simular fim da viagem");done.setOnClickListener(v->showTripComplete(d));p.addView(msg);p.addView(sec);p.addView(done);setContentView(scroll(p));}
    private void showTripComplete(String d){LinearLayout p=page();p.addView(txt("Viagem concluída",32,true));p.addView(txt("R$ 29,90",38,true));p.addView(muted("Destino: "+d,15));p.addView(txt("Como foi sua viagem?",21,true));Button stars=btn("★ ★ ★ ★ ★");stars.setOnClickListener(v->Toast.makeText(this,"Avaliação registrada",Toast.LENGTH_SHORT).show());p.addView(stars);Button home=accentBtn("Voltar ao início");home.setOnClickListener(v->showClientHome());p.addView(home);setContentView(scroll(p));}

    private void showClientOptions(){LinearLayout p=page();p.addView(txt("Opções",38,true));p.addView(txt("Vá para onde quiser, peça o que precisar",23,true));String[] items={"🚗\nViagem","◷\nAgendar","♀\nMotorista Mulher","👪\nPara terceiros","▦\nEmpresa","♿\nSenior"};for(int row=0;row<2;row++){LinearLayout r=new LinearLayout(this);r.setOrientation(LinearLayout.HORIZONTAL);for(int col=0;col<3;col++){int i=row*3+col;Button b=btn(items[i]);b.setLayoutParams(new LinearLayout.LayoutParams(0,dp(130),1));final int x=i;b.setOnClickListener(v->{if(x==0)showPlanTrip();else Toast.makeText(this,"Opção preparada para a v2",Toast.LENGTH_SHORT).show();});r.addView(b);}p.addView(r);}FrameLayout wrap=new FrameLayout(this);wrap.addView(scroll(p));FrameLayout.LayoutParams np=new FrameLayout.LayoutParams(-1,dp(72),Gravity.BOTTOM);wrap.addView(bottomNav(true,1),np);setContentView(wrap);}

    private void showClientActivity(){LinearLayout p=page();p.addView(txt("Atividade",38,true));p.addView(txt("Anteriores",24,true));if(clientTrips.isEmpty())p.addView(muted("Nenhuma viagem ainda",16));for(String t:clientTrips){LinearLayout c=card();TextView map=txt("▰  Mini mapa da rota",18,true);map.setGravity(Gravity.CENTER);map.setBackground(bg(0xff3b404b,16));map.setPadding(dp(8),dp(45),dp(8),dp(45));c.addView(map);c.addView(txt(t,19,true));c.addView(muted("Viagem anterior",14));LinearLayout r=new LinearLayout(this);r.setOrientation(LinearLayout.HORIZONTAL);Button a=btn("☆ Avaliar");a.setLayoutParams(new LinearLayout.LayoutParams(0,dp(52),1));Button again=btn("↻ Reagendar");again.setLayoutParams(new LinearLayout.LayoutParams(0,dp(52),1));again.setOnClickListener(v->showPlanTrip());r.addView(a);r.addView(again);c.addView(r);p.addView(c);}FrameLayout wrap=new FrameLayout(this);wrap.addView(scroll(p));FrameLayout.LayoutParams np=new FrameLayout.LayoutParams(-1,dp(72),Gravity.BOTTOM);wrap.addView(bottomNav(true,2),np);setContentView(wrap);}

    private void showClientAccount(){LinearLayout p=page();LinearLayout top=new LinearLayout(this);top.setOrientation(LinearLayout.HORIZONTAL);LinearLayout names=new LinearLayout(this);names.setOrientation(LinearLayout.VERTICAL);names.addView(txt("Cliente Teste",36,true));names.addView(muted("★ 5.0   Conta de teste",15));top.addView(names,new LinearLayout.LayoutParams(0,-2,1));TextView avatar=txt("●",60,true);avatar.setGravity(Gravity.CENTER);top.addView(avatar,new LinearLayout.LayoutParams(dp(100),dp(100)));p.addView(top);String[] cards={"◉ Ajuda","▣ Carteira","⬡ Segurança","✉ Mensagens"};for(int i=0;i<2;i++){LinearLayout r=new LinearLayout(this);r.setOrientation(LinearLayout.HORIZONTAL);for(int j=0;j<2;j++){Button b=btn(cards[i*2+j]);b.setLayoutParams(new LinearLayout.LayoutParams(0,dp(92),1));r.addView(b);}p.addView(r);}String[] menu={"Dados pessoais","Meus veículos","Pagamentos","Configurações","Privacidade e localização"};for(String m:menu)p.addView(btn(m));Button out=btn("Sair");out.setOnClickListener(v->showRoleChooser());p.addView(out);FrameLayout wrap=new FrameLayout(this);wrap.addView(scroll(p));FrameLayout.LayoutParams np=new FrameLayout.LayoutParams(-1,dp(72),Gravity.BOTTOM);wrap.addView(bottomNav(true,3),np);setContentView(wrap);}

    private void showDriverHome(){role="driver";startGps();FrameLayout root=new FrameLayout(this);root.setBackgroundColor(BG);root.addView(mapView(),new FrameLayout.LayoutParams(-1,-1));LinearLayout top=new LinearLayout(this);top.setOrientation(LinearLayout.VERTICAL);top.setPadding(dp(14),dp(10),dp(14),dp(10));top.setBackground(bg(0xee151515,22));top.addView(txt(String.format(Locale.getDefault(),"R$ %.2f hoje",driverEarnings),23,true));top.addView(muted(driverOnline?"● ONLINE":"○ OFFLINE",14));FrameLayout.LayoutParams tp=new FrameLayout.LayoutParams(dp(220),-2,Gravity.TOP|Gravity.CENTER_HORIZONTAL);tp.setMargins(0,dp(20),0,0);root.addView(top,tp);LinearLayout sheet=new LinearLayout(this);sheet.setOrientation(LinearLayout.VERTICAL);sheet.setPadding(dp(20),dp(4),dp(20),dp(16));sheet.setBackground(bg(BG,28));TextView h=handle();sheet.addView(h);sheet.addView(txt("Modo motorista",28,true));gpsLabel=muted(gpsText(),13);sheet.addView(gpsLabel);Button online=driverOnline?btn("Ficar Offline"):accentBtn("FICAR ONLINE");online.setOnClickListener(v->{driverOnline=!driverOnline;showDriverHome();});sheet.addView(online);if(driverOnline){LinearLayout call=card();call.addView(txt("Nova solicitação • R$ 38,70",22,true));call.addView(muted("Felipe ★ 4,9",15));call.addView(muted("2,3 km • 6 min até o cliente",15));call.addView(muted("12,4 km • 24 min de viagem",15));Button accept=accentBtn("ACEITAR");accept.setOnClickListener(v->{driverTrips.add("Praia da Costa → Itapuã • R$ 38,70");driverEarnings+=31.0;Toast.makeText(this,"Corrida aceita",Toast.LENGTH_SHORT).show();showDriverCalls();});call.addView(accept);sheet.addView(call);}sheet.addView(bottomNav(false,0));makeDraggable(h,sheet);FrameLayout.LayoutParams sp=new FrameLayout.LayoutParams(-1,dp(driverOnline?430:280),Gravity.BOTTOM);root.addView(sheet,sp);setContentView(root);}

    private void showDriverCalls(){LinearLayout p=page();p.addView(txt("Chamadas",38,true));if(driverTrips.isEmpty()){LinearLayout c=card();c.addView(txt("Nenhuma corrida aceita ainda",20,true));c.addView(muted("Fique online para receber solicitações próximas.",15));p.addView(c);}for(String t:driverTrips){LinearLayout c=card();c.addView(txt(t,20,true));c.addView(muted("Corrida aceita/concluída",14));p.addView(c);}FrameLayout w=new FrameLayout(this);w.addView(scroll(p));FrameLayout.LayoutParams np=new FrameLayout.LayoutParams(-1,dp(72),Gravity.BOTTOM);w.addView(bottomNav(false,1),np);setContentView(w);}
    private void showDriverEarnings(){LinearLayout p=page();p.addView(txt("Ganhos",38,true));p.addView(txt(String.format(Locale.getDefault(),"R$ %.2f",driverEarnings),42,true));p.addView(muted("Hoje",15));LinearLayout c=card();c.addView(txt("Semana   R$ 1.084,50",20,true));c.addView(txt("Mês      R$ 4.420,80",20,true));c.addView(muted("Taxa da plataforma: 20% • valores demonstrativos",14));p.addView(c);FrameLayout w=new FrameLayout(this);w.addView(scroll(p));FrameLayout.LayoutParams np=new FrameLayout.LayoutParams(-1,dp(72),Gravity.BOTTOM);w.addView(bottomNav(false,2),np);setContentView(w);}
    private void showDriverAccount(){LinearLayout p=page();p.addView(txt("Motorista Teste",36,true));p.addView(muted("★ 5.0   ✓ CNH B   ✓ EAR   ✓ Aprovado",15));String[] m={"Dados pessoais","CNH e documentos","Segurança","Avaliações","Configurações"};for(String s:m)p.addView(btn(s));Button out=btn("Sair");out.setOnClickListener(v->showRoleChooser());p.addView(out);FrameLayout w=new FrameLayout(this);w.addView(scroll(p));FrameLayout.LayoutParams np=new FrameLayout.LayoutParams(-1,dp(72),Gravity.BOTTOM);w.addView(bottomNav(false,3),np);setContentView(w);}

    private void showAdmin(){role="admin";LinearLayout p=page();p.addView(txt("Painel da Gerência",36,true));p.addView(muted("Operação do Transporte Seguro Vix",15));String[][] stats={{"Motoristas online","1"},{"Corridas ativas","0"},{"Corridas hoje",Integer.toString(clientTrips.size()+driverTrips.size())},{"Comissão plataforma","20%"}};for(String[] s:stats){LinearLayout c=card();c.addView(muted(s[0],15));c.addView(txt(s[1],30,true));p.addView(c);}String[] m={"Mapa operacional","Corridas","Motoristas","Clientes","Financeiro","Relatórios","Configurações"};for(String s:m){Button b=btn(s);b.setOnClickListener(v->Toast.makeText(this,s+" • módulo v2",Toast.LENGTH_SHORT).show());p.addView(b);}Button out=btn("Sair");out.setOnClickListener(v->showRoleChooser());p.addView(out);setContentView(scroll(p));}

    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] results){super.onRequestPermissionsResult(requestCode,permissions,results);if(requestCode==LOCATION_REQUEST&&results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED){startGps();if(role.equals("client"))showClientHome();else if(role.equals("driver"))showDriverHome();}}

    @Override public void onBackPressed(){if(role.equals("client"))showClientHome();else if(role.equals("driver"))showDriverHome();else if(role.equals("admin"))showAdmin();else showRoleChooser();}
}
