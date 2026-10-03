package com.felipe.ia;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.text.InputType;
import android.util.Base64;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.HttpAuthHandler;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;

public class MainActivity extends Activity {
    private static final String START_URL = "https://felipe-ia.vercel.app/";
    private static final String APP_HOST = "felipe-ia.vercel.app";
    private static final int STORAGE_REQUEST = 42;
    private static final int FILE_CHOOSER_REQUEST = 43;
    private static final int WEB_PERMISSION_REQUEST = 44;

    private WebView webView;
    private ProgressBar progress;
    private ValueCallback<Uri[]> fileChooserCallback;
    private Uri cameraImageUri;
    private PermissionRequest pendingWebPermissionRequest;
    private String[] pendingWebResources;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.rgb(11, 18, 32));
        getWindow().setNavigationBarColor(Color.rgb(11, 18, 32));

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
                checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, STORAGE_REQUEST);
        }

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(11, 18, 32));

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
        settings.setUserAgentString(settings.getUserAgentString() + " FelipeIAApp/1.0");

        webView.addJavascriptInterface(new NativeDownloadBridge(), "FelipeIADownload");

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

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> filePathCallback,
                                             FileChooserParams fileChooserParams) {
                if (fileChooserCallback != null) {
                    fileChooserCallback.onReceiveValue(null);
                }
                fileChooserCallback = filePathCallback;
                cameraImageUri = null;

                Intent pickerIntent;
                try {
                    pickerIntent = fileChooserParams.createIntent();
                } catch (Exception error) {
                    pickerIntent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    pickerIntent.addCategory(Intent.CATEGORY_OPENABLE);
                    pickerIntent.setType("*/*");
                }

                if (fileChooserParams.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) {
                    pickerIntent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }
                pickerIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                if (fileChooserParams.isCaptureEnabled()) {
                    Intent cameraIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    if (cameraIntent.resolveActivity(getPackageManager()) != null) {
                        try {
                            ContentValues values = new ContentValues();
                            values.put(MediaStore.Images.Media.DISPLAY_NAME,
                                    "felipe_ia_" + System.currentTimeMillis() + ".jpg");
                            values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                            cameraImageUri = getContentResolver().insert(
                                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                            if (cameraImageUri != null) {
                                cameraIntent.putExtra(MediaStore.EXTRA_OUTPUT, cameraImageUri);
                                cameraIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION |
                                        Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                                startActivityForResult(cameraIntent, FILE_CHOOSER_REQUEST);
                                return true;
                            }
                        } catch (Exception ignored) {
                            cameraImageUri = null;
                        }
                    }
                }

                try {
                    startActivityForResult(pickerIntent, FILE_CHOOSER_REQUEST);
                    return true;
                } catch (Exception error) {
                    fileChooserCallback.onReceiveValue(null);
                    fileChooserCallback = null;
                    Toast.makeText(MainActivity.this,
                            "Não foi possível abrir a câmera ou os arquivos.",
                            Toast.LENGTH_LONG).show();
                    return false;
                }
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> handleWebPermissionRequest(request));
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
                String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();

                if ("https".equals(scheme) && APP_HOST.equals(host)) {
                    return false;
                }

                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                }
                return true;
            }

            @Override
            public void onReceivedHttpAuthRequest(WebView view, HttpAuthHandler handler,
                                                  String host, String realm) {
                runOnUiThread(() -> showHttpAuthDialog(handler, host, realm));
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                installBlobDownloadBridge(view);
            }
        });

        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition,
                                        String mimetype, long contentLength) {
                if (url == null || url.isEmpty()) return;

                if (url.startsWith("blob:")) {
                    String guessedName = URLUtil.guessFileName(url, contentDisposition, mimetype);
                    if (guessedName == null || guessedName.trim().isEmpty() || !guessedName.contains(".")) {
                        guessedName = mimeToDefaultName(mimetype);
                    }
                    final String js = "window.__FIA_SAVE_BLOB && window.__FIA_SAVE_BLOB(" +
                            JSONObject.quote(url) + "," +
                            JSONObject.quote(guessedName) + "," +
                            JSONObject.quote(mimetype == null ? "application/octet-stream" : mimetype) + ");";
                    webView.evaluateJavascript(js, null);
                    return;
                }

                if (url.startsWith("data:")) return;

                try {
                    String fileName = sanitizeFileName(URLUtil.guessFileName(url, contentDisposition, mimetype));
                    DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                    request.addRequestHeader("User-Agent", userAgent);
                    String cookies = CookieManager.getInstance().getCookie(url);
                    if (cookies != null) request.addRequestHeader("Cookie", cookies);
                    if (mimetype != null && !mimetype.isEmpty()) request.setMimeType(mimetype);
                    request.setTitle(fileName);
                    request.setDescription("Arquivo Felipe IA");
                    request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
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

    private void showHttpAuthDialog(HttpAuthHandler handler, String host, String realm) {
        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        int pad = (int) (20 * getResources().getDisplayMetrics().density);
        container.setPadding(pad, pad / 2, pad, 0);

        EditText login = new EditText(this);
        login.setHint("Login");
        login.setSingleLine(true);

        EditText password = new EditText(this);
        password.setHint("Senha");
        password.setSingleLine(true);
        password.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);

        container.addView(login);
        container.addView(password);

        new AlertDialog.Builder(this)
                .setTitle("Acesso Felipe IA")
                .setMessage("Entre com o login do site.")
                .setView(container)
                .setPositiveButton("Entrar", (dialog, which) ->
                        handler.proceed(login.getText().toString(), password.getText().toString()))
                .setNegativeButton("Cancelar", (dialog, which) -> handler.cancel())
                .setOnCancelListener(dialog -> handler.cancel())
                .show();
    }

    private void handleWebPermissionRequest(PermissionRequest request) {
        Uri origin = request.getOrigin();
        String host = origin == null || origin.getHost() == null ? "" : origin.getHost().toLowerCase();
        if (!APP_HOST.equals(host)) {
            request.deny();
            return;
        }

        ArrayList<String> androidPermissions = new ArrayList<>();
        ArrayList<String> grantResources = new ArrayList<>();

        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                grantResources.add(resource);
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    androidPermissions.add(Manifest.permission.RECORD_AUDIO);
                }
            } else if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) {
                grantResources.add(resource);
                if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                    androidPermissions.add(Manifest.permission.CAMERA);
                }
            }
        }

        if (grantResources.isEmpty()) {
            request.deny();
            return;
        }

        pendingWebPermissionRequest = request;
        pendingWebResources = grantResources.toArray(new String[0]);

        if (androidPermissions.isEmpty()) {
            request.grant(pendingWebResources);
            pendingWebPermissionRequest = null;
            pendingWebResources = null;
        } else {
            requestPermissions(androidPermissions.toArray(new String[0]), WEB_PERMISSION_REQUEST);
        }
    }

    private String mimeToDefaultName(String mime) {
        if (mime != null && mime.contains("pdf")) return "felipe-ia.pdf";
        if (mime != null && mime.contains("spreadsheet")) return "felipe-ia.xlsx";
        if (mime != null && mime.contains("csv")) return "felipe-ia.csv";
        return "felipe-ia-arquivo.bin";
    }

    private String sanitizeFileName(String name) {
        String value = name == null ? "felipe-ia-arquivo" : name.trim();
        value = value.replaceAll("[\\/:*?\"<>|\\p{Cntrl}]", "_");
        if (value.isEmpty()) value = "felipe-ia-arquivo";
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
                        values.put(MediaStore.Downloads.IS_PENDING, 1);

                        pendingUri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                        if (pendingUri == null) throw new IllegalStateException("Falha ao criar arquivo");

                        try (OutputStream output = getContentResolver().openOutputStream(pendingUri)) {
                            if (output == null) throw new IllegalStateException("Falha ao abrir arquivo");
                            output.write(bytes);
                            output.flush();
                        }

                        ContentValues ready = new ContentValues();
                        ready.put(MediaStore.Downloads.IS_PENDING, 0);
                        getContentResolver().update(pendingUri, ready, null, null);
                    } else {
                        File downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                        if (!downloads.exists() && !downloads.mkdirs()) {
                            throw new IllegalStateException("Pasta Downloads indisponível");
                        }
                        File outputFile = new File(downloads, safeName);
                        try (FileOutputStream output = new FileOutputStream(outputFile)) {
                            output.write(bytes);
                            output.flush();
                        }
                    }

                    runOnUiThread(() -> Toast.makeText(
                            MainActivity.this,
                            "Download concluído: " + safeName,
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
                            "Erro ao salvar arquivo.",
                            Toast.LENGTH_LONG
                    ).show());
                }
            }).start();
        }
    }

    private void installBlobDownloadBridge(WebView view) {
        final String js =
                "(function(){" +
                "if(window.__FIA_NATIVE_DOWNLOAD_V1)return;window.__FIA_NATIVE_DOWNLOAD_V1=true;" +
                "var blobMap=new Map();" +
                "var originalCreate=URL.createObjectURL.bind(URL);" +
                "var originalRevoke=URL.revokeObjectURL.bind(URL);" +
                "URL.createObjectURL=function(value){var url=originalCreate(value);try{if(value instanceof Blob)blobMap.set(url,value);}catch(e){}return url;};" +
                "URL.revokeObjectURL=function(url){setTimeout(function(){try{blobMap.delete(url);originalRevoke(url);}catch(e){}},5000);};" +
                "window.__FIA_SAVE_BLOB=function(url,name,fallbackMime){" +
                "var direct=blobMap.get(url);var promise=direct?Promise.resolve(direct):fetch(url).then(function(r){return r.blob();});" +
                "promise.then(function(blob){" +
                "var reader=new FileReader();" +
                "reader.onloadend=function(){try{var result=String(reader.result||'');var comma=result.indexOf(',');var b64=comma>=0?result.slice(comma+1):result;var type=blob.type||fallbackMime||'application/octet-stream';window.FelipeIADownload.saveBase64(name||'felipe-ia-arquivo.bin',type,b64);}catch(e){}};" +
                "reader.readAsDataURL(blob);" +
                "}).catch(function(){});" +
                "};" +
                "var nativeClick=HTMLAnchorElement.prototype.click;" +
                "HTMLAnchorElement.prototype.click=function(){var href=String(this.href||'');if(href.indexOf('blob:')===0){window.__FIA_SAVE_BLOB(href,this.download||'',this.type||'');return;}return nativeClick.call(this);};" +
                "})();";
        view.evaluateJavascript(js, null);
    }

    @Override
    protected void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode == WEB_PERMISSION_REQUEST && pendingWebPermissionRequest != null) {
            ArrayList<String> allowed = new ArrayList<>();
            for (String resource : pendingWebResources == null ? new String[0] : pendingWebResources) {
                if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource) &&
                        checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    allowed.add(resource);
                } else if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource) &&
                        checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                    allowed.add(resource);
                }
            }

            if (allowed.isEmpty()) {
                pendingWebPermissionRequest.deny();
            } else {
                pendingWebPermissionRequest.grant(allowed.toArray(new String[0]));
            }
            pendingWebPermissionRequest = null;
            pendingWebResources = null;
            return;
        }
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            Uri[] result = null;
            if (resultCode == RESULT_OK) {
                if (data != null) {
                    ClipData clipData = data.getClipData();
                    if (clipData != null && clipData.getItemCount() > 0) {
                        int count = clipData.getItemCount();
                        result = new Uri[count];
                        for (int index = 0; index < count; index++) {
                            result[index] = clipData.getItemAt(index).getUri();
                        }
                    } else if (data.getData() != null) {
                        result = new Uri[]{data.getData()};
                    } else {
                        result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
                    }
                } else if (cameraImageUri != null) {
                    result = new Uri[]{cameraImageUri};
                }
            }

            if (resultCode != RESULT_OK && cameraImageUri != null) {
                try {
                    getContentResolver().delete(cameraImageUri, null, null);
                } catch (Exception ignored) {
                }
            }

            if (fileChooserCallback != null) {
                fileChooserCallback.onReceiveValue(result);
                fileChooserCallback = null;
            }
            cameraImageUri = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
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
