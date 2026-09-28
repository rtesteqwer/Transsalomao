package br.com.transsalomao.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.Set;

import android.graphics.drawable.GradientDrawable;

public class MainActivity extends Activity {
    private static final String HOME = "https://transsalomao.vercel.app/";
    private static final String AI_URL = "https://transsalomao.vercel.app/salomao-ia";
    private static final int FILE_CHOOSER_REQUEST = 7001;

    private static final int BG = Color.rgb(5, 11, 18);
    private static final int SURFACE = Color.rgb(12, 24, 37);
    private static final int SURFACE_2 = Color.rgb(17, 31, 47);
    private static final int BORDER = Color.rgb(38, 57, 76);
    private static final int TEXT = Color.rgb(245, 248, 252);
    private static final int MUTED = Color.rgb(154, 174, 199);
    private static final int BLUE = Color.rgb(45, 151, 255);
    private static final int GREEN = Color.rgb(62, 224, 145);

    private FrameLayout content;
    private View dashboard;
    private LinearLayout browserContainer;
    private WebView webView;
    private TextView browserTitle;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingWebsiteTab = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);

        LinearLayout shell = new LinearLayout(this);
        shell.setOrientation(LinearLayout.VERTICAL);
        shell.setBackgroundColor(BG);

        content = new FrameLayout(this);
        shell.addView(content, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        dashboard = buildDashboard();
        browserContainer = buildBrowser();

        content.addView(dashboard, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        content.addView(browserContainer, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        shell.addView(buildBottomNavigation(), new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(70)));

        setContentView(shell);
        showDashboard();
    }

    private View buildDashboard() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(BG);

        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(dp(18), dp(18), dp(18), dp(28));
        scroll.addView(page, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        LinearLayout header = row();
        LinearLayout brand = new LinearLayout(this);
        brand.setOrientation(LinearLayout.VERTICAL);
        brand.addView(label("Trans Salomão", 26, TEXT, true));
        brand.addView(label("Salomão IA", 15, MUTED, false));
        header.addView(brand, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        TextView avatar = pill("FB", 17, TEXT, SURFACE_2);
        avatar.setGravity(Gravity.CENTER);
        header.addView(avatar, new LinearLayout.LayoutParams(dp(48), dp(48)));
        page.addView(header);

        TextView greeting = label("Boa noite, Felipe 👋", 28, TEXT, true);
        LinearLayout.LayoutParams gp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        gp.topMargin = dp(28);
        page.addView(greeting, gp);
        page.addView(label("Tudo certo com a operação? Acesse os módulos ou fale com a Salomão IA.", 15, MUTED, false));

        TextView section = label("Acesso rápido", 17, TEXT, true);
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        sp.topMargin = dp(24);
        sp.bottomMargin = dp(10);
        page.addView(section, sp);

        page.addView(cardRow(
                actionCard("Painel gerencial", "Faturamento, lucro e desempenho", "PAINEL"),
                actionCard("Caixa", "Pendências e fechamento", "CAIXA")));
        page.addView(cardRow(
                actionCard("Viagens", "Lançar, editar e conferir", "VIAGENS"),
                actionCard("Abastecimentos", "Tickets, fotos e custos", "ABASTECIMENTOS")));
        page.addView(cardRow(
                actionCard("Despesas", "Adiantamentos e gastos", "DESPESAS"),
                actionCard("Salomão IA", "Comandos, documentos e análises", "IA")));

        LinearLayout aiCard = verticalCard();
        LinearLayout.LayoutParams aip = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        aip.topMargin = dp(16);
        page.addView(aiCard, aip);

        LinearLayout aiHead = row();
        TextView bot = pill("✦", 24, BLUE, Color.rgb(9, 32, 56));
        bot.setGravity(Gravity.CENTER);
        aiHead.addView(bot, new LinearLayout.LayoutParams(dp(52), dp(52)));
        LinearLayout aiTitles = new LinearLayout(this);
        aiTitles.setOrientation(LinearLayout.VERTICAL);
        aiTitles.setPadding(dp(12), 0, 0, 0);
        aiTitles.addView(label("Salomão IA", 22, TEXT, true));
        aiTitles.addView(label("Sua IA operacional da Trans Salomão", 14, MUTED, false));
        aiHead.addView(aiTitles, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        aiCard.addView(aiHead);

        TextView aiMessage = label("Como posso ajudar hoje? Posso abrir módulos, ler tickets, conferir abastecimentos, consultar motoristas e apoiar a operação.", 16, TEXT, false);
        aiMessage.setPadding(dp(14), dp(14), dp(14), dp(14));
        aiMessage.setBackground(roundRect(SURFACE_2, BORDER, 18));
        LinearLayout.LayoutParams amp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        amp.topMargin = dp(14);
        aiCard.addView(aiMessage, amp);

        aiCard.addView(quickRow(
                quick("Lançar viagem", "VIAGENS"),
                quick("Conferir abastecimento", "ABASTECIMENTOS")));
        aiCard.addView(quickRow(
                quick("Adicionar adiantamento", "DESPESAS"),
                quick("Ver relatórios", "PAINEL")));
        aiCard.addView(quickRow(
                quick("Ler ticket com IA", "IA"),
                quick("Pesquisar motorista", "PAINEL")));

        LinearLayout composer = row();
        composer.setGravity(Gravity.CENTER_VERTICAL);
        composer.setPadding(dp(12), dp(6), dp(8), dp(6));
        composer.setBackground(roundRect(SURFACE_2, BORDER, 24));
        LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(58));
        cp.topMargin = dp(14);
        aiCard.addView(composer, cp);

        EditText input = new EditText(this);
        input.setHint("Digite sua mensagem...");
        input.setHintTextColor(MUTED);
        input.setTextColor(TEXT);
        input.setTextSize(15);
        input.setSingleLine(false);
        input.setMaxLines(2);
        input.setBackgroundColor(Color.TRANSPARENT);
        input.setPadding(dp(4), 0, dp(8), 0);
        composer.addView(input, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f));

        TextView send = pill("↑", 25, Color.WHITE, BLUE);
        send.setGravity(Gravity.CENTER);
        send.setOnClickListener(v -> {
            String message = input.getText().toString().trim();
            openSection("IA");
            if (!message.isEmpty()) {
                pendingWebsiteTab = null;
                webView.postDelayed(() -> injectAssistantMessage(message), 1800);
            }
        });
        composer.addView(send, new LinearLayout.LayoutParams(dp(46), dp(46)));

        LinearLayout statusCard = verticalCard();
        LinearLayout.LayoutParams stp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        stp.topMargin = dp(16);
        page.addView(statusCard, stp);
        statusCard.addView(label("Sistema conectado", 17, TEXT, true));
        statusCard.addView(label("Os dados reais continuam sendo carregados do transsalomao.vercel.app. O APK funciona como central rápida e mantém o sistema existente.", 14, MUTED, false));

        TextView openSystem = button("Abrir sistema completo");
        LinearLayout.LayoutParams osp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(50));
        osp.topMargin = dp(12);
        statusCard.addView(openSystem, osp);
        openSystem.setOnClickListener(v -> openSection("PAINEL"));

        return scroll;
    }

    private LinearLayout buildBrowser() {
        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        container.setBackgroundColor(BG);

        LinearLayout toolbar = row();
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(14), dp(8), dp(10), dp(8));
        toolbar.setBackgroundColor(SURFACE);

        TextView home = toolbarButton("⌂");
        home.setOnClickListener(v -> showDashboard());
        toolbar.addView(home, new LinearLayout.LayoutParams(dp(46), dp(46)));

        browserTitle = label("Trans Salomão", 17, TEXT, true);
        browserTitle.setPadding(dp(8), 0, 0, 0);
        toolbar.addView(browserTitle, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        TextView refresh = toolbarButton("↻");
        toolbar.addView(refresh, new LinearLayout.LayoutParams(dp(46), dp(46)));

        container.addView(toolbar, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(62)));

        webView = new WebView(this);
        setupWebView();
        container.addView(webView, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        refresh.setOnClickListener(v -> webView.reload());
        return container;
    }

    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
                    view.loadUrl(uri.toString());
                    return true;
                }
                try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) {}
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                applyCleanWebTheme(view);
                if (pendingWebsiteTab != null) {
                    String section = pendingWebsiteTab;
                    pendingWebsiteTab = null;
                    view.postDelayed(() -> clickWebsiteTab(section), 500);
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams
            ) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = filePathCallback;

                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);

                String[] accepted = fileChooserParams.getAcceptTypes();
                Set<String> mimeTypes = new LinkedHashSet<>();
                if (accepted != null) {
                    for (String type : accepted) {
                        if (type == null || type.trim().isEmpty()) continue;
                        String clean = type.trim();
                        if (clean.startsWith(".")) {
                            if (".pdf".equalsIgnoreCase(clean)) mimeTypes.add("application/pdf");
                            continue;
                        }
                        mimeTypes.add(clean);
                    }
                }
                if (mimeTypes.isEmpty()) mimeTypes.add("*/*");

                if (mimeTypes.size() == 1) {
                    intent.setType(mimeTypes.iterator().next());
                } else {
                    intent.setType("*/*");
                    intent.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes.toArray(new String[0]));
                }

                boolean multiple = fileChooserParams.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE;
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);

                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                    return true;
                } catch (Exception error) {
                    fileCallback = null;
                    return false;
                }
            }
        });
    }

    private View buildBottomNavigation() {
        LinearLayout nav = new LinearLayout(this);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        nav.setGravity(Gravity.CENTER);
        nav.setPadding(dp(4), dp(6), dp(4), dp(6));
        nav.setBackgroundColor(Color.rgb(6, 15, 24));

        String[][] items = {
                {"Painel", "HOME"}, {"Caixa", "CAIXA"}, {"Viagens", "VIAGENS"},
                {"Abastec.", "ABASTECIMENTOS"}, {"Despesas", "DESPESAS"}, {"IA", "IA"}
        };
        for (String[] item : items) {
            TextView tv = label(item[0], 12, MUTED, false);
            tv.setGravity(Gravity.CENTER);
            tv.setPadding(dp(2), 0, dp(2), 0);
            tv.setOnClickListener(v -> {
                String key = (String) v.getTag();
                if ("HOME".equals(key)) showDashboard(); else openSection(key);
            });
            tv.setTag(item[1]);
            nav.addView(tv, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f));
        }
        return nav;
    }

    private void showDashboard() {
        dashboard.setVisibility(View.VISIBLE);
        browserContainer.setVisibility(View.GONE);
    }

    private void openSection(String section) {
        dashboard.setVisibility(View.GONE);
        browserContainer.setVisibility(View.VISIBLE);
        browserTitle.setText(sectionTitle(section));

        if ("IA".equals(section)) {
            pendingWebsiteTab = null;
            webView.loadUrl(AI_URL);
            return;
        }

        pendingWebsiteTab = section;
        webView.loadUrl(HOME);
    }

    private String sectionTitle(String section) {
        switch (section) {
            case "CAIXA": return "Caixa";
            case "VIAGENS": return "Viagens";
            case "ABASTECIMENTOS": return "Abastecimentos";
            case "DESPESAS": return "Despesas";
            case "IA": return "Salomão IA";
            default: return "Painel da Gerência";
        }
    }

    private void applyCleanWebTheme(WebView view) {
        String js = "(function(){"
                + "var id='transsalomao-apk-clean-theme';"
                + "var old=document.getElementById(id);if(old)old.remove();"
                + "var css='"
                + "html,body{background:#050b12!important;color:#f5f8fc!important;}"
                + "body{padding-bottom:8px!important;}"
                + "header,nav,footer{display:none!important;}"
                + "main{background:#050b12!important;color:#f5f8fc!important;min-height:100vh!important;padding-top:8px!important;}"
                + ".bg-white,[class*=bg-white],[class*=bg-gray-50],[class*=bg-slate-50]{background:#0c1825!important;color:#f5f8fc!important;}"
                + "[class*=border-gray],[class*=border-slate]{border-color:#26394c!important;}"
                + "[class*=text-gray-9],[class*=text-slate-9],[class*=text-gray-8],[class*=text-slate-8]{color:#f5f8fc!important;}"
                + "[class*=text-gray-7],[class*=text-slate-7],[class*=text-gray-6],[class*=text-slate-6],[class*=text-gray-5],[class*=text-slate-5]{color:#9aaec7!important;}"
                + "input,select,textarea{background:#111f2f!important;color:#f5f8fc!important;border:1px solid #26394c!important;border-radius:14px!important;}"
                + "input::placeholder,textarea::placeholder{color:#7890aa!important;}"
                + "button{border-radius:14px!important;}"
                + "table,thead,tbody,tr,td,th{background-color:transparent!important;color:inherit!important;border-color:#26394c!important;}"
                + "section,article,[class*=rounded]{border-color:#26394c!important;}"
                + "[class*=shadow]{box-shadow:0 10px 30px rgba(0,0,0,.24)!important;}"
                + "a{color:#4da8ff!important;}"
                + "*{scrollbar-color:#31465d #050b12;}"
                + "';"
                + "var s=document.createElement('style');s.id=id;s.textContent=css;document.head.appendChild(s);"
                + "var all=[].slice.call(document.querySelectorAll('body *'));"
                + "all.forEach(function(el){"
                + "var t=(el.innerText||'').replace(/\\s+/g,' ').trim().toLowerCase();"
                + "var cs=getComputedStyle(el);"
                + "if((cs.position==='fixed'||cs.position==='sticky')"
                + "&&(t.indexOf('início')>=0||t.indexOf('inicio')>=0)"
                + "&&t.indexOf('caixa')>=0&&t.indexOf('viagens')>=0){el.style.display='none';}"
                + "});"
                + "return 'clean-theme-applied';"
                + "})();";
        view.evaluateJavascript(js, null);
    }

    private void clickWebsiteTab(String section) {
        String text = sectionTitle(section).replace("Painel da Gerência", "Painel");
        String safe = text.replace("'", "\\'");
        String js = "(function(){"
                + "var q='" + safe + "'.toLowerCase();"
                + "var els=[].slice.call(document.querySelectorAll('button,a,[role=button]'));"
                + "var el=els.find(function(x){return (x.innerText||x.textContent||'').trim().toLowerCase()===q;})"
                + "||els.find(function(x){return (x.innerText||x.textContent||'').trim().toLowerCase().indexOf(q)>=0;});"
                + "if(el){el.click();return 'clicked';}return 'not-found';"
                + "})();";
        webView.evaluateJavascript(js, null);
    }

    private void injectAssistantMessage(String message) {
        String safe = message.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ");
        String js = "(function(){"
                + "var el=document.querySelector('textarea')||document.querySelector('input[type=text]')||document.querySelector('[contenteditable=true]');"
                + "if(!el)return 'not-found';"
                + "el.focus();"
                + "if('value' in el){el.value='" + safe + "';}else{el.innerText='" + safe + "';}"
                + "el.dispatchEvent(new Event('input',{bubbles:true}));"
                + "return 'filled';"
                + "})();";
        webView.evaluateJavascript(js, null);
    }

    private View actionCard(String title, String subtitle, String section) {
        LinearLayout card = verticalCard();
        card.setMinimumHeight(dp(116));
        card.addView(label(title, 17, TEXT, true));
        TextView sub = label(subtitle, 13, MUTED, false);
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        sp.topMargin = dp(6);
        card.addView(sub, sp);
        TextView open = label("Abrir  ›", 13, BLUE, true);
        LinearLayout.LayoutParams op = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        op.topMargin = dp(12);
        card.addView(open, op);
        card.setOnClickListener(v -> openSection(section));
        return card;
    }

    private LinearLayout cardRow(View left, View right) {
        LinearLayout row = row();
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        lp.setMargins(0, 0, dp(6), dp(10));
        row.addView(left, lp);
        LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        rp.setMargins(dp(6), 0, 0, dp(10));
        row.addView(right, rp);
        return row;
    }

    private TextView quick(String text, String section) {
        TextView v = label(text + "  ›", 13, TEXT, true);
        v.setGravity(Gravity.CENTER_VERTICAL);
        v.setPadding(dp(12), dp(11), dp(10), dp(11));
        v.setBackground(roundRect(SURFACE_2, BORDER, 15));
        v.setOnClickListener(x -> openSection(section));
        return v;
    }

    private LinearLayout quickRow(View left, View right) {
        LinearLayout row = row();
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(52), 1f);
        lp.setMargins(0, dp(10), dp(5), 0);
        row.addView(left, lp);
        LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(0, dp(52), 1f);
        rp.setMargins(dp(5), dp(10), 0, 0);
        row.addView(right, rp);
        return row;
    }

    private LinearLayout verticalCard() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(16), dp(16), dp(16), dp(16));
        card.setBackground(roundRect(SURFACE, BORDER, 22));
        return card;
    }

    private LinearLayout row() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        return row;
    }

    private TextView label(String text, int size, int color, boolean bold) {
        TextView v = new TextView(this);
        v.setText(text);
        v.setTextColor(color);
        v.setTextSize(size);
        v.setLineSpacing(0, 1.08f);
        if (bold) v.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return v;
    }

    private TextView pill(String text, int size, int color, int background) {
        TextView v = label(text, size, color, true);
        v.setPadding(dp(12), dp(8), dp(12), dp(8));
        v.setBackground(roundRect(background, BORDER, 24));
        return v;
    }

    private TextView button(String text) {
        TextView v = label(text, 15, Color.WHITE, true);
        v.setGravity(Gravity.CENTER);
        v.setBackground(roundRect(BLUE, BLUE, 18));
        return v;
    }

    private TextView toolbarButton(String text) {
        TextView v = label(text, 23, TEXT, false);
        v.setGravity(Gravity.CENTER);
        v.setBackground(roundRect(SURFACE_2, BORDER, 20));
        return v;
    }

    private GradientDrawable roundRect(int fill, int stroke, int radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(fill);
        g.setCornerRadius(dp(radiusDp));
        g.setStroke(dp(1), stroke);
        return g;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null) {
                ClipData clip = data.getClipData();
                if (clip != null) {
                    ArrayList<Uri> uris = new ArrayList<>();
                    for (int i = 0; i < clip.getItemCount(); i++) {
                        Uri uri = clip.getItemAt(i).getUri();
                        if (uri != null) uris.add(uri);
                    }
                    result = uris.toArray(new Uri[0]);
                } else if (data.getData() != null) {
                    result = new Uri[]{data.getData()};
                }
            }
            if (fileCallback != null) {
                fileCallback.onReceiveValue(result);
                fileCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (browserContainer.getVisibility() == View.VISIBLE) {
            if (webView != null && webView.canGoBack()) {
                webView.goBack();
            } else {
                showDashboard();
            }
        } else {
            super.onBackPressed();
        }
    }
}
