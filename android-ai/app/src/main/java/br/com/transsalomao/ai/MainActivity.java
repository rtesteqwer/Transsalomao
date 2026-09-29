package br.com.transsalomao.ai;

import android.Manifest;
import android.app.Activity;
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
import android.util.Base64;
import android.view.ViewGroup;
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
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

public class MainActivity extends Activity {
    private static final String HOME_URL = "https://transsalomao.vercel.app/trans-salomao-ia";
    private static final int FILE_CHOOSER_REQUEST = 7001;
    private static final int STORAGE_PERMISSION_REQUEST = 7002;

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraImageUri;

    private String pendingDownloadUrl;
    private String pendingDownloadUserAgent;
    private String pendingDownloadDisposition;
    private String pendingDownloadMime;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);

        WindowInsetsControllerCompat bars =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(false);
        bars.setAppearanceLightNavigationBars(false);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(11, 20, 26));

        // Mantém todo o site abaixo da câmera frontal/notch e fora das barras do sistema.
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            Insets safe = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars()
                            | WindowInsetsCompat.Type.displayCutout()
            );
            view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            return insets;
        });

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(11, 20, 26));
        root.addView(
                webView,
                new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                )
        );

        setContentView(root);
        ViewCompat.requestApplyInsets(root);

        configureWebView();

        if (savedInstanceState == null) {
            webView.loadUrl(HOME_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccess(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setUserAgentString(settings.getUserAgentString() + " TransSalomaoIA/1.0");

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");

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
                injectBlobDownloadBridge();
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
                openFileChooser(fileChooserParams);
                return true;
            }
        });

        webView.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
            if (url == null || url.startsWith("blob:") || url.startsWith("data:")) return;
            requestDownload(url, userAgent, contentDisposition, mimetype);
        });
    }

    private boolean handleNavigation(Uri uri) {
        String scheme = uri.getScheme();
        if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
            return false;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception ignored) {
            Toast.makeText(this, "Não foi possível abrir este link.", Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    private void openFileChooser(WebChromeClient.FileChooserParams params) {
        Intent fileIntent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        fileIntent.addCategory(Intent.CATEGORY_OPENABLE);

        String[] accepted = normalizeAcceptTypes(params.getAcceptTypes());
        if (accepted.length == 1) {
            fileIntent.setType(accepted[0]);
        } else {
            fileIntent.setType("*/*");
            if (accepted.length > 1) {
                fileIntent.putExtra(Intent.EXTRA_MIME_TYPES, accepted);
            }
        }

        boolean multiple = params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE;
        fileIntent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);

        ArrayList<Intent> extraIntents = new ArrayList<>();
        if (acceptsImages(accepted)) {
            Intent camera = createCameraIntent();
            if (camera != null) extraIntents.add(camera);
        }

        Intent chooser = Intent.createChooser(fileIntent, "Selecionar foto, PDF ou ZIP");
        if (!extraIntents.isEmpty()) {
            chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, extraIntents.toArray(new Intent[0]));
        }

        try {
            startActivityForResult(chooser, FILE_CHOOSER_REQUEST);
        } catch (Exception e) {
            if (fileCallback != null) {
                fileCallback.onReceiveValue(null);
                fileCallback = null;
            }
            Toast.makeText(this, "Nenhum seletor de arquivos disponível.", Toast.LENGTH_SHORT).show();
        }
    }

    private String[] normalizeAcceptTypes(String[] raw) {
        Set<String> types = new LinkedHashSet<>();
        if (raw != null) {
            for (String item : raw) {
                if (item == null) continue;
                for (String part : item.split(",")) {
                    String type = part.trim().toLowerCase(Locale.ROOT);
                    if (type.isEmpty()) continue;
                    if (".pdf".equals(type)) type = "application/pdf";
                    if (".zip".equals(type)) type = "application/zip";
                    if (".jpg".equals(type) || ".jpeg".equals(type) || ".png".equals(type) || ".webp".equals(type)) {
                        type = "image/*";
                    }
                    types.add(type);
                }
            }
        }
        return types.toArray(new String[0]);
    }

    private boolean acceptsImages(String[] types) {
        if (types.length == 0) return true;
        for (String type : types) {
            if ("*/*".equals(type) || type.startsWith("image/")) return true;
        }
        return false;
    }

    private Intent createCameraIntent() {
        Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        if (camera.resolveActivity(getPackageManager()) == null) return null;

        try {
            File pictures = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
            if (pictures == null) return null;
            File image = File.createTempFile("transsalomao_", ".jpg", pictures);
            cameraImageUri = FileProvider.getUriForFile(
                    this,
                    getPackageName() + ".fileprovider",
                    image
            );
            camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraImageUri);
            camera.addFlags(
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                            | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            );
            camera.setClipData(ClipData.newRawUri("Trans Salomão IA", cameraImageUri));
            return camera;
        } catch (Exception e) {
            cameraImageUri = null;
            return null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            Uri[] result = null;

            if (resultCode == RESULT_OK) {
                if (data != null && data.getClipData() != null) {
                    ClipData clip = data.getClipData();
                    ArrayList<Uri> uris = new ArrayList<>();
                    for (int i = 0; i < clip.getItemCount(); i++) {
                        Uri uri = clip.getItemAt(i).getUri();
                        if (uri != null) uris.add(uri);
                    }
                    result = uris.toArray(new Uri[0]);
                } else if (data != null && data.getData() != null) {
                    result = new Uri[]{data.getData()};
                } else if (cameraImageUri != null) {
                    result = new Uri[]{cameraImageUri};
                }
            }

            if (fileCallback != null) {
                fileCallback.onReceiveValue(result);
                fileCallback = null;
            }
            cameraImageUri = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    private void requestDownload(
            String url,
            String userAgent,
            String disposition,
            String mimeType
    ) {
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P
                && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED) {
            pendingDownloadUrl = url;
            pendingDownloadUserAgent = userAgent;
            pendingDownloadDisposition = disposition;
            pendingDownloadMime = mimeType;
            requestPermissions(
                    new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE},
                    STORAGE_PERMISSION_REQUEST
            );
            return;
        }
        startDownload(url, userAgent, disposition, mimeType);
    }

    private void startDownload(
            String url,
            String userAgent,
            String disposition,
            String mimeType
    ) {
        try {
            String fileName = URLUtil.guessFileName(url, disposition, mimeType);
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setTitle(fileName);
            request.setDescription("Baixando pelo Trans Salomão");
            request.setNotificationVisibility(
                    DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
            );
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(true);

            String cookie = CookieManager.getInstance().getCookie(url);
            if (cookie != null) request.addRequestHeader("Cookie", cookie);
            if (userAgent != null) request.addRequestHeader("User-Agent", userAgent);
            if (mimeType != null && !mimeType.isEmpty()) request.setMimeType(mimeType);

            request.setDestinationInExternalPublicDir(
                    Environment.DIRECTORY_DOWNLOADS,
                    fileName
            );

            DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            manager.enqueue(request);
            Toast.makeText(this, "Download iniciado.", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, "Não foi possível baixar o arquivo.", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            @NonNull String[] permissions,
            @NonNull int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == STORAGE_PERMISSION_REQUEST) {
            if (grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED
                    && pendingDownloadUrl != null) {
                startDownload(
                        pendingDownloadUrl,
                        pendingDownloadUserAgent,
                        pendingDownloadDisposition,
                        pendingDownloadMime
                );
            }
            pendingDownloadUrl = null;
            pendingDownloadUserAgent = null;
            pendingDownloadDisposition = null;
            pendingDownloadMime = null;
        }
    }

    private void injectBlobDownloadBridge() {
        String script = "(function(){"
                + "if(window.__tsAndroidBlobBridge)return;"
                + "window.__tsAndroidBlobBridge=true;"
                + "document.addEventListener('click',async function(ev){"
                + "var a=ev.target&&ev.target.closest?ev.target.closest('a[download]'):null;"
                + "if(!a||!a.href||a.href.indexOf('blob:')!==0)return;"
                + "ev.preventDefault();"
                + "try{"
                + "var r=await fetch(a.href);var b=await r.blob();var fr=new FileReader();"
                + "fr.onloadend=function(){AndroidBridge.saveDataUrl(a.download||'transsalomao',b.type||'',String(fr.result||''));};"
                + "fr.readAsDataURL(b);"
                + "}catch(e){}"
                + "},true);"
                + "})();";
        webView.evaluateJavascript(script, null);
    }

    private class AndroidBridge {
        @JavascriptInterface
        public void saveDataUrl(String fileName, String mimeType, String dataUrl) {
            if (dataUrl == null) return;
            int comma = dataUrl.indexOf(',');
            if (comma < 0) return;

            try {
                byte[] bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
                String safeName = sanitizeFileName(fileName, mimeType);
                saveBytesToDownloads(safeName, mimeType, bytes);
                runOnUiThread(() ->
                        Toast.makeText(
                                MainActivity.this,
                                "Arquivo salvo em Downloads.",
                                Toast.LENGTH_SHORT
                        ).show()
                );
            } catch (Exception e) {
                runOnUiThread(() ->
                        Toast.makeText(
                                MainActivity.this,
                                "Falha ao salvar o arquivo.",
                                Toast.LENGTH_SHORT
                        ).show()
                );
            }
        }
    }

    private String sanitizeFileName(String fileName, String mimeType) {
        String name = (fileName == null || fileName.trim().isEmpty())
                ? "transsalomao"
                : fileName.trim();
        name = name.replaceAll("[\\\\/:*?\"<>|]", "_");

        if (!name.contains(".") && mimeType != null && !mimeType.isEmpty()) {
            String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType);
            if (ext != null && !ext.isEmpty()) name += "." + ext;
        }
        return name;
    }

    private void saveBytesToDownloads(
            String fileName,
            String mimeType,
            byte[] bytes
    ) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
            values.put(
                    MediaStore.Downloads.MIME_TYPE,
                    (mimeType == null || mimeType.isEmpty())
                            ? "application/octet-stream"
                            : mimeType
            );
            values.put(
                    MediaStore.Downloads.RELATIVE_PATH,
                    Environment.DIRECTORY_DOWNLOADS
            );

            Uri item = getContentResolver().insert(
                    MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                    values
            );
            if (item == null) throw new IllegalStateException("download uri unavailable");

            try (OutputStream out = getContentResolver().openOutputStream(item)) {
                if (out == null) throw new IllegalStateException("download stream unavailable");
                out.write(bytes);
            }
        } else {
            if (checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                    != PackageManager.PERMISSION_GRANTED) {
                throw new SecurityException("storage permission required");
            }

            File dir = Environment.getExternalStoragePublicDirectory(
                    Environment.DIRECTORY_DOWNLOADS
            );
            if (!dir.exists() && !dir.mkdirs()) {
                throw new IllegalStateException("downloads folder unavailable");
            }
            try (OutputStream out = new FileOutputStream(new File(dir, fileName))) {
                out.write(bytes);
            }
        }
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        if (webView != null) webView.saveState(outState);
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

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.removeJavascriptInterface("AndroidBridge");
            webView.destroy();
        }
        super.onDestroy();
    }
}
