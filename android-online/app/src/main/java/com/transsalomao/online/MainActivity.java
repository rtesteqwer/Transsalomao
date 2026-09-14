package com.transsalomao.online;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends Activity {
    private static final String START_URL = "https://transsalomao.vercel.app/";
    private WebView webView;
    private ProgressBar progress;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.rgb(7, 17, 31));
        getWindow().setNavigationBarColor(Color.rgb(7, 17, 31));

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(7, 17, 31));

        webView = new WebView(this);
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);

        FrameLayout.LayoutParams webParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        );
        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                6
        );

        root.addView(webView, webParams);
        root.addView(progress, progressParams);
        setContentView(root);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setTextZoom(100);
        settings.setUserAgentString(settings.getUserAgentString() + " TransSalomaoApp/1.4");

        // Bridge usado somente para salvar relatórios gerados em memória (blob:),
        // como o Excel colorido e PDFs. O DownloadManager do Android não aceita blob:.
        webView.addJavascriptInterface(new NativeDownloadBridge(), "TransSalomaoDownload");

        webView.setVerticalScrollBarEnabled(true);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);
        webView.setOverScrollMode(View.OVER_SCROLL_ALWAYS);
        webView.setNestedScrollingEnabled(true);
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progress.setProgress(newProgress);
                progress.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
                if ("https".equalsIgnoreCase(uri.getScheme()) &&
                        (host.equals("transsalomao.vercel.app") || host.equals("transsalomao.onrender.com"))) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                installScrollFix(view);
                installBlobDownloadBridge(view);
            }
        });

        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition,
                                        String mimetype, long contentLength) {
                if (url == null || url.isEmpty()) return;

                // Arquivos Excel/PDF criados pelo navegador chegam como blob:.
                // Nunca envie blob: ao DownloadManager nem ao navegador externo.
                if (url.startsWith("blob:")) {
                    String guessedName = URLUtil.guessFileName(url, contentDisposition, mimetype);
                    if (guessedName == null || guessedName.trim().isEmpty() || !guessedName.contains(".")) {
                        guessedName = mimeToDefaultName(mimetype);
                    }
                    final String js = "window.__TS_SAVE_BLOB && window.__TS_SAVE_BLOB(" +
                            JSONObject.quote(url) + "," +
                            JSONObject.quote(guessedName) + "," +
                            JSONObject.quote(mimetype == null ? "application/octet-stream" : mimetype) + ");";
                    webView.evaluateJavascript(js, null);
                    return;
                }

                if (url.startsWith("data:")) {
                    return;
                }

                try {
                    String fileName = URLUtil.guessFileName(url, contentDisposition, mimetype);
                    DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                    request.addRequestHeader("User-Agent", userAgent);
                    String cookies = CookieManager.getInstance().getCookie(url);
                    if (cookies != null) request.addRequestHeader("Cookie", cookies);
                    if (mimetype != null && !mimetype.isEmpty()) request.setMimeType(mimetype);
                    request.setTitle(fileName);
                    request.setDescription("Relatório Trans Salomão");
                    request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    request.setDestinationInExternalPublicDir(
                            Environment.DIRECTORY_DOWNLOADS,
                            "TransSalomao/" + sanitizeFileName(fileName)
                    );
                    DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                    manager.enqueue(request);
                } catch (Exception error) {
                    runOnUiThread(() -> Toast.makeText(
                            MainActivity.this,
                            "Não foi possível baixar o arquivo.",
                            Toast.LENGTH_LONG
                    ).show());
                }
            }
        });

        if (savedInstanceState == null) {
            webView.loadUrl(START_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private String mimeToDefaultName(String mime) {
        if (mime != null && mime.contains("spreadsheetml")) return "relatorio-trans-salomao.xlsx";
        if (mime != null && mime.contains("pdf")) return "relatorio-trans-salomao.pdf";
        if (mime != null && mime.contains("csv")) return "relatorio-trans-salomao.csv";
        return "relatorio-trans-salomao.bin";
    }

    private String sanitizeFileName(String name) {
        String value = name == null ? "relatorio-trans-salomao" : name.trim();
        value = value.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
        if (value.isEmpty()) value = "relatorio-trans-salomao";
        return value;
    }

    private final class NativeDownloadBridge {
        @JavascriptInterface
        public void saveBase64(String fileName, String mimeType, String base64Data) {
            new Thread(() -> {
                Uri pendingUri = null;
                try {
                    String safeName = sanitizeFileName(fileName);
                    String safeMime = (mimeType == null || mimeType.trim().isEmpty())
                            ? "application/octet-stream"
                            : mimeType;
                    byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        ContentValues values = new ContentValues();
                        values.put(MediaStore.Downloads.DISPLAY_NAME, safeName);
                        values.put(MediaStore.Downloads.MIME_TYPE, safeMime);
                        values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/TransSalomao");
                        values.put(MediaStore.Downloads.IS_PENDING, 1);

                        pendingUri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                        if (pendingUri == null) throw new IllegalStateException("Não foi possível criar o arquivo");

                        try (OutputStream output = getContentResolver().openOutputStream(pendingUri)) {
                            if (output == null) throw new IllegalStateException("Não foi possível abrir o arquivo");
                            output.write(bytes);
                            output.flush();
                        }

                        ContentValues ready = new ContentValues();
                        ready.put(MediaStore.Downloads.IS_PENDING, 0);
                        getContentResolver().update(pendingUri, ready, null, null);
                    } else {
                        File base = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                        if (base == null) throw new IllegalStateException("Pasta Downloads indisponível");
                        File dir = new File(base, "TransSalomao");
                        if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Não foi possível criar a pasta");
                        File outputFile = new File(dir, safeName);
                        try (FileOutputStream output = new FileOutputStream(outputFile)) {
                            output.write(bytes);
                            output.flush();
                        }
                    }

                    runOnUiThread(() -> Toast.makeText(
                            MainActivity.this,
                            "Relatório salvo em Downloads/TransSalomao",
                            Toast.LENGTH_LONG
                    ).show());
                } catch (Exception error) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && pendingUri != null) {
                        try {
                            getContentResolver().delete(pendingUri, null, null);
                        } catch (Exception ignored) {
                        }
                    }
                    runOnUiThread(() -> Toast.makeText(
                            MainActivity.this,
                            "Erro ao salvar relatório. Tente novamente.",
                            Toast.LENGTH_LONG
                    ).show());
                }
            }).start();
        }
    }

    private void installBlobDownloadBridge(WebView view) {
        final String js =
                "(function(){" +
                "if(window.__TS_NATIVE_DOWNLOAD_V14)return;window.__TS_NATIVE_DOWNLOAD_V14=true;" +
                "var blobMap=new Map();" +
                "var originalCreate=URL.createObjectURL.bind(URL);" +
                "var originalRevoke=URL.revokeObjectURL.bind(URL);" +
                "URL.createObjectURL=function(value){var url=originalCreate(value);try{if(value instanceof Blob)blobMap.set(url,value);}catch(e){}return url;};" +
                "URL.revokeObjectURL=function(url){setTimeout(function(){try{blobMap.delete(url);originalRevoke(url);}catch(e){}},5000);};" +
                "function defaultName(type){if((type||'').indexOf('spreadsheetml')>=0)return 'relatorio-fretes-trans-salomao.xlsx';if((type||'').indexOf('pdf')>=0)return 'relatorio-trans-salomao.pdf';return 'relatorio-trans-salomao.bin';}" +
                "window.__TS_SAVE_BLOB=function(url,name,fallbackMime){" +
                "var direct=blobMap.get(url);var promise=direct?Promise.resolve(direct):fetch(url).then(function(r){return r.blob();});" +
                "promise.then(function(blob){" +
                "var reader=new FileReader();" +
                "reader.onloadend=function(){try{var result=String(reader.result||'');var comma=result.indexOf(',');var b64=comma>=0?result.slice(comma+1):result;var type=blob.type||fallbackMime||'application/octet-stream';var filename=name||defaultName(type);window.TransSalomaoDownload.saveBase64(filename,type,b64);}catch(e){}};" +
                "reader.readAsDataURL(blob);" +
                "}).catch(function(){});" +
                "};" +
                "var nativeClick=HTMLAnchorElement.prototype.click;" +
                "HTMLAnchorElement.prototype.click=function(){var href=String(this.href||'');if(href.indexOf('blob:')===0){window.__TS_SAVE_BLOB(href,this.download||'',this.type||'');return;}return nativeClick.call(this);};" +
                "})();";
        view.evaluateJavascript(js, null);
    }

    private void installScrollFix(WebView view) {
        final String js =
                "(function(){" +
                "if(window.__TS_SCROLL_FIX_V13)return;window.__TS_SCROLL_FIX_V13=true;" +
                "function enforce(){" +
                "var h=document.documentElement,b=document.body;" +
                "if(h){h.style.setProperty('overflow-y','auto','important');h.style.setProperty('overflow-x','hidden','important');h.style.setProperty('height','auto','important');h.style.setProperty('max-height','none','important');h.style.setProperty('touch-action','pan-y pinch-zoom','important');h.style.setProperty('overscroll-behavior-y','auto','important');}" +
                "if(b){b.style.setProperty('overflow-y','auto','important');b.style.setProperty('overflow-x','hidden','important');b.style.setProperty('height','auto','important');b.style.setProperty('max-height','none','important');b.style.setProperty('touch-action','pan-y pinch-zoom','important');b.style.setProperty('overscroll-behavior-y','auto','important');}" +
                "document.querySelectorAll('main').forEach(function(m){m.style.setProperty('height','auto','important');m.style.setProperty('max-height','none','important');m.style.setProperty('touch-action','pan-y pinch-zoom','important');});" +
                "}" +
                "function scrollerFor(t){" +
                "var e=(t&&t.nodeType===1)?t:t&&t.parentElement;" +
                "while(e&&e!==document.body&&e!==document.documentElement){" +
                "var c=getComputedStyle(e),oy=c.overflowY;" +
                "if((oy==='auto'||oy==='scroll')&&e.scrollHeight>e.clientHeight+2)return e;" +
                "e=e.parentElement;" +
                "}" +
                "return document.scrollingElement||document.documentElement;" +
                "}" +
                "var lastY=null,lastX=null;" +
                "document.addEventListener('touchstart',function(ev){if(ev.touches.length!==1)return;lastY=ev.touches[0].clientY;lastX=ev.touches[0].clientX;},{passive:true,capture:true});" +
                "document.addEventListener('touchmove',function(ev){" +
                "if(ev.touches.length!==1||lastY===null)return;" +
                "var y=ev.touches[0].clientY,x=ev.touches[0].clientX,dy=lastY-y,dx=lastX-x;" +
                "if(Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>0.5){" +
                "var s=scrollerFor(ev.target),before=s.scrollTop;s.scrollTop=before+dy;" +
                "if(s.scrollTop!==before)ev.preventDefault();" +
                "}" +
                "lastY=y;lastX=x;" +
                "},{passive:false,capture:true});" +
                "document.addEventListener('touchend',function(){lastY=null;lastX=null;},{passive:true,capture:true});" +
                "document.addEventListener('touchcancel',function(){lastY=null;lastX=null;},{passive:true,capture:true});" +
                "enforce();setTimeout(enforce,250);setTimeout(enforce,1000);setTimeout(enforce,2500);" +
                "new MutationObserver(function(){enforce();}).observe(document.documentElement,{childList:true,subtree:true});" +
                "})();";
        view.evaluateJavascript(js, null);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
