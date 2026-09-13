package com.transsalomao.app;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ContentValues;
import android.content.Context;
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
import android.webkit.MimeTypeMap;
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
    private static final String HOME_URL = "https://transteste.onrender.com/";
    private static final int FILE_CHOOSER_REQUEST = 1201;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.rgb(7, 17, 31));
        getWindow().setNavigationBarColor(Color.rgb(7, 17, 31));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            getWindow().getDecorView().setSystemUiVisibility(0);
        }

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(7, 17, 31));
        setContentView(webView);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.setAcceptThirdPartyCookies(webView, true);
        }

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }

        webView.addJavascriptInterface(new AndroidDownloads(this), "AndroidDownloads");

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
                CookieManager.getInstance().flush();
                injectBlobDownloadBridge(view);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallbackNew, FileChooserParams fileChooserParams) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = filePathCallbackNew;
                try {
                    Intent intent = fileChooserParams.createIntent();
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                    return true;
                } catch (Exception error) {
                    filePathCallback = null;
                    Toast.makeText(MainActivity.this, "Não foi possível abrir os arquivos.", Toast.LENGTH_SHORT).show();
                    return false;
                }
            }
        });

        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
                if (url != null && url.startsWith("blob:")) {
                    downloadBlobUrl(url, contentDisposition);
                    return;
                }
                downloadHttpUrl(url, userAgent, contentDisposition, mimeType);
            }
        });

        if (savedInstanceState == null) {
            webView.loadUrl(HOME_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private boolean handleNavigation(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme();
        String host = uri.getHost();

        if (("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))
                && host != null && host.equalsIgnoreCase("transteste.onrender.com")) {
            return false;
        }

        try {
            Intent external = new Intent(Intent.ACTION_VIEW, uri);
            startActivity(external);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private void injectBlobDownloadBridge(WebView view) {
        String script = "(function(){"
                + "if(window.__transSalomaoDownloadBridge)return;"
                + "window.__transSalomaoDownloadBridge=true;"
                + "document.addEventListener('click',async function(e){"
                + "var a=e.target&&e.target.closest?e.target.closest('a[download]'):null;"
                + "if(!a||!a.href||!a.href.startsWith('blob:'))return;"
                + "e.preventDefault();"
                + "try{var r=await fetch(a.href);var b=await r.blob();var fr=new FileReader();"
                + "fr.onloadend=function(){AndroidDownloads.saveBase64File(fr.result,a.download||'arquivo');};"
                + "fr.readAsDataURL(b);}catch(err){console.error(err);}} ,true);"
                + "})();";
        view.evaluateJavascript(script, null);
    }

    private void downloadBlobUrl(String blobUrl, String contentDisposition) {
        String safeUrl = blobUrl.replace("\\", "\\\\").replace("'", "\\'");
        String fileName = guessFileName(contentDisposition, null);
        String safeFileName = fileName.replace("\\", "\\\\").replace("'", "\\'");
        String script = "(async function(){try{var r=await fetch('" + safeUrl + "');var b=await r.blob();var fr=new FileReader();"
                + "fr.onloadend=function(){AndroidDownloads.saveBase64File(fr.result,'" + safeFileName + "');};"
                + "fr.readAsDataURL(b);}catch(e){console.error(e);}})();";
        webView.evaluateJavascript(script, null);
    }

    private void downloadHttpUrl(String url, String userAgent, String contentDisposition, String mimeType) {
        if (url == null || url.isEmpty()) return;
        try {
            String fileName = guessFileName(contentDisposition, mimeType);
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setMimeType(mimeType);
            request.addRequestHeader("User-Agent", userAgent == null ? "TransSalomao" : userAgent);
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) request.addRequestHeader("Cookie", cookies);
            request.setTitle(fileName);
            request.setDescription("Baixando arquivo da Trans Salomão");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
            DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            manager.enqueue(request);
            Toast.makeText(this, "Download iniciado.", Toast.LENGTH_SHORT).show();
        } catch (Exception error) {
            Toast.makeText(this, "Não foi possível baixar o arquivo.", Toast.LENGTH_LONG).show();
        }
    }

    private String guessFileName(String contentDisposition, String mimeType) {
        if (contentDisposition != null) {
            String marker = "filename=";
            int index = contentDisposition.toLowerCase().indexOf(marker);
            if (index >= 0) {
                String name = contentDisposition.substring(index + marker.length()).replace("\"", "").trim();
                int semicolon = name.indexOf(';');
                if (semicolon >= 0) name = name.substring(0, semicolon);
                if (!name.isEmpty()) return sanitizeFileName(name);
            }
        }
        String extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType);
        return "TransSalomao_" + System.currentTimeMillis() + (extension == null ? "" : "." + extension);
    }

    private static String sanitizeFileName(String name) {
        return name.replaceAll("[\\\\/:*?\"<>|]", "_");
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && filePathCallback != null) {
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                results = new Uri[]{data.getData()};
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    private static class AndroidDownloads {
        private final Context context;

        AndroidDownloads(Context context) {
            this.context = context.getApplicationContext();
        }

        @JavascriptInterface
        public void saveBase64File(String dataUrl, String requestedName) {
            try {
                int comma = dataUrl.indexOf(',');
                if (comma < 0) throw new IllegalArgumentException("base64 inválido");
                String header = dataUrl.substring(0, comma);
                String encoded = dataUrl.substring(comma + 1);
                String mimeType = "application/octet-stream";
                if (header.startsWith("data:") && header.contains(";")) {
                    mimeType = header.substring(5, header.indexOf(';'));
                }

                byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
                String fileName = sanitizeFileName(requestedName == null || requestedName.trim().isEmpty()
                        ? defaultNameForMime(mimeType)
                        : requestedName.trim());

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
                    values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                    values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/TransSalomao");
                    values.put(MediaStore.Downloads.IS_PENDING, 1);
                    Uri uri = context.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) throw new IllegalStateException("Não foi possível criar o arquivo");
                    try (OutputStream out = context.getContentResolver().openOutputStream(uri)) {
                        if (out == null) throw new IllegalStateException("Não foi possível abrir o arquivo");
                        out.write(bytes);
                    }
                    values.clear();
                    values.put(MediaStore.Downloads.IS_PENDING, 0);
                    context.getContentResolver().update(uri, values, null, null);
                } else {
                    File dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (dir == null) throw new IllegalStateException("Pasta de downloads indisponível");
                    File folder = new File(dir, "TransSalomao");
                    if (!folder.exists() && !folder.mkdirs()) throw new IllegalStateException("Não foi possível criar a pasta");
                    try (FileOutputStream out = new FileOutputStream(new File(folder, fileName))) {
                        out.write(bytes);
                    }
                }

                Toast.makeText(context, "Arquivo salvo em Downloads/TransSalomao", Toast.LENGTH_LONG).show();
            } catch (Exception error) {
                Toast.makeText(context, "Falha ao salvar o arquivo.", Toast.LENGTH_LONG).show();
            }
        }

        private static String defaultNameForMime(String mimeType) {
            if ("application/pdf".equals(mimeType)) return "Relatorio_TransSalomao.pdf";
            if (mimeType != null && mimeType.contains("spreadsheet")) return "Relatorio_TransSalomao.xlsx";
            return "Arquivo_TransSalomao_" + System.currentTimeMillis();
        }
    }
}
