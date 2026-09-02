package br.com.motoristaseguro.app;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://transportesegurovix-transsalomao.vercel.app/";
    private static final int LOCATION_REQUEST = 3001;
    private WebView webView;
    private String selectedUserId = null;
    private String pendingGeoOrigin;
    private GeolocationPermissions.Callback pendingGeoCallback;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xff111111);
        getWindow().setNavigationBarColor(0xff111111);
        showRoleChooser();
    }

    private TextView title(String text, int size) {
        TextView v = new TextView(this);
        v.setText(text);
        v.setTextColor(Color.rgb(20,20,20));
        v.setTextSize(size);
        v.setGravity(Gravity.CENTER_HORIZONTAL);
        v.setPadding(0, 16, 0, 16);
        return v;
    }

    private Button action(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextSize(17);
        b.setAllCaps(false);
        b.setPadding(20, 14, 20, 14);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.setMargins(0, 8, 0, 8);
        b.setLayoutParams(lp);
        return b;
    }

    private LinearLayout baseLayout() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(28, 42, 28, 42);
        root.setBackgroundColor(0xfff6f6f6);
        return root;
    }

    private void showRoleChooser() {
        selectedUserId = null;
        LinearLayout root = baseLayout();
        TextView brand = title("TSV  Transporte Seguro Vix", 22);
        brand.setTextColor(0xff111111);
        TextView h = title("Como você quer entrar?", 30);
        TextView sub = title("Escolha seu perfil para abrir a área correta.", 15);
        sub.setTextColor(0xff666666);

        Button client = action("👤  Entrar como Cliente");
        client.setOnClickListener(v -> showLogin("client"));
        Button driver = action("🚗  Entrar como Motorista");
        driver.setOnClickListener(v -> showLogin("driver"));
        Button admin = action("🛡  Entrar como Gerência");
        admin.setOnClickListener(v -> showLogin("admin"));

        root.addView(brand);
        root.addView(h);
        root.addView(sub);
        root.addView(client);
        root.addView(driver);
        root.addView(admin);
        setContentView(root);
    }

    private void showLogin(String role) {
        LinearLayout root = baseLayout();
        String label = role.equals("client") ? "Cliente" : role.equals("driver") ? "Motorista" : "Gerência";
        String email = role.equals("client") ? "cliente@motoristaseguro.app" : role.equals("driver") ? "motorista@motoristaseguro.app" : "admin@motoristaseguro.app";
        String pass = role.equals("client") ? "Cliente@2026!" : role.equals("driver") ? "Motorista@2026!" : "Admin@2026!";
        String id = role.equals("client") ? "cli_demo" : role.equals("driver") ? "drv_demo" : "adm";

        root.addView(title("Transporte Seguro Vix", 20));
        root.addView(title("Entrar como " + label, 28));
        TextView demo = title("Login de teste\n" + email + "\n" + pass, 14);
        demo.setTextColor(0xff555555);
        root.addView(demo);

        EditText e = new EditText(this);
        e.setHint("E-mail");
        e.setText(email);
        e.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        EditText p = new EditText(this);
        p.setHint("Senha");
        p.setText(pass);
        p.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        Button enter = action("Entrar");
        Button back = action("Voltar");

        enter.setOnClickListener(v -> {
            if (!e.getText().toString().trim().equalsIgnoreCase(email) || !p.getText().toString().equals(pass)) {
                Toast.makeText(this, "Login inválido para a área de " + label, Toast.LENGTH_SHORT).show();
                return;
            }
            selectedUserId = id;
            openApp();
        });
        back.setOnClickListener(v -> showRoleChooser());

        root.addView(e);
        root.addView(p);
        root.addView(enter);
        root.addView(back);
        setContentView(root);
    }

    private void openApp() {
        webView = new WebView(this);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString() + " TransporteSeguroVixAndroid/0.6");

        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                String sid = selectedUserId == null ? "" : selectedUserId;
                String js = "(function(){try{" +
                    "var k='msdb5',s='mss5';var d=JSON.parse(localStorage.getItem(k)||'null')||{u:[],v:[],c:[],rt:[]};" +
                    "function up(o){var i=d.u.findIndex(function(x){return x.id===o.id||x.e===o.e});if(i>=0)d.u[i]=Object.assign(d.u[i],o);else d.u.push(o);}" +
                    "up({id:'adm',n:'Gerência Transporte Seguro Vix',e:'admin@motoristaseguro.app',p:'Admin@2026!',r:'admin'});" +
                    "up({id:'cli_demo',n:'Cliente Teste',e:'cliente@motoristaseguro.app',p:'Cliente@2026!',r:'client',cpf:'00000000000',phone:'(27) 99999-0001'});" +
                    "up({id:'drv_demo',n:'Motorista Teste',e:'motorista@motoristaseguro.app',p:'Motorista@2026!',r:'driver',cpf:'11111111111',phone:'(27) 99999-0002',cnh:'12345678900',cat:'B',exp:'2030-12-31',ear:true,ap:'approved',on:false,lat:null,lng:null});" +
                    "if(!d.v.some(function(x){return x.id==='veh_demo'}))d.v.push({id:'veh_demo',cid:'cli_demo',pl:'ABC1D23',mo:'Veículo de Teste',cat:'B'});" +
                    "localStorage.setItem(k,JSON.stringify(d));localStorage.setItem(s,'" + sid + "');location.hash='dash';if(typeof render==='function')render();" +
                    "}catch(e){console.log(e)}})();";
                view.evaluateJavascript(js, null);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false);
                } else {
                    pendingGeoOrigin = origin;
                    pendingGeoCallback = callback;
                    requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, LOCATION_REQUEST);
                }
            }
        });
        setContentView(webView);
        webView.loadUrl(APP_URL);
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == LOCATION_REQUEST && pendingGeoCallback != null) {
            boolean ok = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            pendingGeoCallback.invoke(pendingGeoOrigin, ok, false);
            pendingGeoCallback = null;
            pendingGeoOrigin = null;
        }
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.getParent() != null) {
            if (webView.canGoBack()) webView.goBack(); else showRoleChooser();
        } else {
            showRoleChooser();
        }
    }
}
