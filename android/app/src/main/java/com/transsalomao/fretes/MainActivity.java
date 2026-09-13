package com.transsalomao.fretes;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://transsalomao.vercel.app/";
    private static final int FILE_CHOOSER_REQUEST = 9001;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUserAgentString(settings.getUserAgentString() + " TransSalomaoAndroid/1.2");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.setAcceptThirdPartyCookies(webView, true);
        }

        webView.addJavascriptInterface(new DownloadBridge(this), "TransSalomaoDownloads");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleNavigation(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleNavigation(Uri.parse(url));
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injectBlobDownloadSupport();
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                try {
                    Intent intent = params.createIntent();
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                    return true;
                } catch (Exception e) {
                    filePathCallback = null;
                    Toast.makeText(MainActivity.this, "Não foi possível abrir o seletor de arquivos.", Toast.LENGTH_LONG).show();
                    return false;
                }
            }
        });

        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (url == null) return;
            if (url.startsWith("blob:")) {
                requestBlobDownload(url, contentDisposition, mimeType);
                return;
            }
            if (!url.startsWith("https://") && !url.startsWith("http://")) return;

            try {
                String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                request.setMimeType(mimeType);
                request.addRequestHeader("User-Agent", userAgent);
                String cookie = CookieManager.getInstance().getCookie(url);
                if (cookie != null) request.addRequestHeader("Cookie", cookie);
                request.setTitle(fileName);
                request.setDescription("Download Trans Salomão");
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
                DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                manager.enqueue(request);
                Toast.makeText(MainActivity.this, "Download iniciado.", Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                openExternal(Uri.parse(url));
            }
        });

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else if (isOnline()) {
            webView.loadUrl(APP_URL);
        } else {
            webView.loadDataWithBaseURL(null,
                    "<html><body style='font-family:sans-serif;padding:24px'><h2>Trans Salomão</h2><p>Sem conexão com a internet.</p><p>Conecte-se e abra o aplicativo novamente.</p></body></html>",
                    "text/html", "UTF-8", null);
        }
    }

    private boolean handleNavigation(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme();
        String host = uri.getHost();

        if ("https".equalsIgnoreCase(scheme) && host != null &&
                (host.equals("transsalomao.vercel.app") || host.endsWith("-transsalomao.vercel.app"))) {
            return false;
        }

        if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme) ||
                "mailto".equalsIgnoreCase(scheme) || "tel".equalsIgnoreCase(scheme) ||
                "whatsapp".equalsIgnoreCase(scheme)) {
            openExternal(uri);
            return true;
        }
        return false;
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception e) {
            Toast.makeText(this, "Não foi possível abrir este link.", Toast.LENGTH_SHORT).show();
        }
    }

    private void injectBlobDownloadSupport() {
        String js = "(function(){" +
                "if(window.__tsBlobBridgeInstalled)return;window.__tsBlobBridgeInstalled=true;" +
                "document.addEventListener('click',function(ev){" +
                "var el=ev.target;while(el&&el.tagName!=='A')el=el.parentElement;" +
                "if(!el||!el.href||el.href.indexOf('blob:')!==0)return;" +
                "ev.preventDefault();" +
                "fetch(el.href).then(function(r){return r.blob();}).then(function(blob){" +
                "var reader=new FileReader();reader.onloadend=function(){" +
                "var data=String(reader.result||'');var comma=data.indexOf(',');" +
                "if(comma<0)return;var name=el.download||'trans-salomao-arquivo';" +
                "window.TransSalomaoDownloads.saveBase64(name,blob.type||'application/octet-stream',data.substring(comma+1));" +
                "};reader.readAsDataURL(blob);" +
                "}).catch(function(){window.location.href=el.href;});" +
                "},true);" +
                "})();";
        webView.evaluateJavascript(js, null);
    }

    private void requestBlobDownload(String blobUrl, String contentDisposition, String mimeType) {
        String safeUrl = blobUrl.replace("\\", "\\\\").replace("'", "\\'");
        String fileName = URLUtil.guessFileName("download", contentDisposition, mimeType);
        String safeName = fileName.replace("\\", "\\\\").replace("'", "\\'");
        String js = "fetch('" + safeUrl + "').then(r=>r.blob()).then(b=>{const x=new FileReader();x.onloadend=()=>{const d=String(x.result||'');const i=d.indexOf(',');if(i>=0)TransSalomaoDownloads.saveBase64('" + safeName + "',b.type||'application/octet-stream',d.substring(i+1));};x.readAsDataURL(b);});";
        webView.evaluateJavascript(js, null);
    }

    private boolean isOnline() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            Network network = cm.getActiveNetwork();
            if (network == null) return false;
            NetworkCapabilities caps = cm.getNetworkCapabilities(network);
            return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (Exception e) {
            return true;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || filePathCallback == null) return;
        Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        filePathCallback.onReceiveValue(result);
        filePathCallback = null;
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.removeJavascriptInterface("TransSalomaoDownloads");
            webView.destroy();
        }
        super.onDestroy();
    }

    public static final class DownloadBridge {
        private final Activity activity;

        DownloadBridge(Activity activity) {
            this.activity = activity;
        }

        @JavascriptInterface
        public void saveBase64(String requestedName, String mimeType, String base64Data) {
            if (base64Data == null || base64Data.length() > 80_000_000) {
                activity.runOnUiThread(() -> Toast.makeText(activity, "Arquivo grande demais para download pelo aplicativo.", Toast.LENGTH_LONG).show());
                return;
            }

            String fileName = sanitizeFileName(requestedName, mimeType);
            try {
                byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    android.content.ContentValues values = new android.content.ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
                    values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType == null ? "application/octet-stream" : mimeType);
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri uri = activity.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) throw new IllegalStateException("Falha ao criar arquivo");
                    try (OutputStream out = activity.getContentResolver().openOutputStream(uri)) {
                        if (out == null) throw new IllegalStateException("Falha ao abrir arquivo");
                        out.write(bytes);
                    }
                } else {
                    File dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (dir == null) throw new IllegalStateException("Pasta de downloads indisponível");
                    File file = new File(dir, fileName);
                    try (OutputStream out = new FileOutputStream(file)) {
                        out.write(bytes);
                    }
                }
                activity.runOnUiThread(() -> Toast.makeText(activity, "Arquivo salvo em Downloads: " + fileName, Toast.LENGTH_LONG).show());
            } catch (Exception e) {
                activity.runOnUiThread(() -> Toast.makeText(activity, "Não foi possível salvar o arquivo.", Toast.LENGTH_LONG).show());
            }
        }

        private static String sanitizeFileName(String requestedName, String mimeType) {
            String name = requestedName == null || requestedName.trim().isEmpty() ? "trans-salomao-arquivo" : requestedName.trim();
            name = name.replaceAll("[\\\\/:*?\"<>|]", "_");
            if (!name.contains(".")) {
                String extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType);
                if (extension != null && !extension.isEmpty()) name += "." + extension;
            }
            return name;
        }
    }
}
