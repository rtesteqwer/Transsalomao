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

        final int appBackground = Color.rgb(11, 18, 32);
        getWindow().setStatusBarColor(appBackground);
        getWindow().setNavigationBarColor(appBackground);
        getWindow().getDecorView().setBackgroundColor(appBackground);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            android.view.WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.setSystemBarsAppearance(
                        0,
                        android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS |
                                android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
                );
            }
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
                checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, STORAGE_REQUEST);
        }

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(11, 18, 32));

        webView = new WebView(this);
        webView.setBackgroundColor(appBackground);
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setBackgroundColor(appBackground);
        progress.setVisibility(View.GONE);

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
                installMobileUiFixes(view);
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


    private void installMobileUiFixes(WebView view) {
        final String js =
                "(function(){" +
                "if(window.__FIA_MOBILE_UI_V5){try{window.__FIA_MOBILE_UI_V5.refresh();}catch(e){}return;}" +
                "var api={};window.__FIA_MOBILE_UI_V5=api;" +
                "function norm(v){return String(v||'').replace(/\\\\s+/g,' ').trim();}" +
                "function text(el){return norm(el&&el.textContent);}" +
                "function ensureViewport(){" +
                "var meta=document.querySelector('meta[name=viewport]');" +
                "if(!meta){meta=document.createElement('meta');meta.name='viewport';(document.head||document.documentElement).appendChild(meta);}" +
                "meta.setAttribute('content','width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover');" +
                "document.documentElement.setAttribute('data-fia-native-app','1');" +
                "try{document.documentElement.style.background='#0b1220';document.body.style.background='#0b1220';}catch(e){}" +
                "}" +
                "function addStyle(){" +
                "if(document.getElementById('fia-mobile-ui-v5-style'))return;" +
                "var st=document.createElement('style');st.id='fia-mobile-ui-v5-style';" +
                "st.textContent=" +
                "'html,body{margin:0!important;padding:0!important;width:100%!important;max-width:100%!important;background:#0b1220!important;overflow-x:hidden!important;}'+ " +
                "'html{height:100%!important;-webkit-text-size-adjust:100%;}'+ " +
                "'body{min-height:100vh!important;min-height:100dvh!important;min-height:-webkit-fill-available!important;}'+ " +
                "'body>div:first-child{max-width:100vw!important;}'+ " +
                "'img,video,canvas{max-width:100%;height:auto;}'+ " +
                "'pre{max-width:100%;overflow-x:auto;}'+ " +
                "'input,textarea,select{max-width:100%;}'+ " +
                "'[data-fia-sidebar=\\\"1\\\"]{transition:transform .22s ease!important;will-change:transform!important;}'+ " +
                "'[data-fia-sidebar=\\\"1\\\"].fia-native-closed{transform:translateX(-110%)!important;pointer-events:none!important;}'+ " +
                "'#fia-native-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.34);z-index:2147483000;opacity:1;transition:opacity .18s ease;}'+ " +
                "'#fia-native-backdrop.fia-hidden{opacity:0;pointer-events:none;}'+ " +
                "'#fia-native-close{position:absolute;right:12px;top:max(12px,env(safe-area-inset-top));z-index:2147483646;width:40px;height:40px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:rgba(25,25,25,.88);color:#fff;font-size:26px;line-height:36px;text-align:center;padding:0;box-shadow:none;}'+ " +
                "'#fia-native-close:active{transform:scale(.96);}'+ " +
                "'@media(max-width:900px){html,body{width:100vw!important;min-width:0!important;}[data-fia-sidebar=\\\"1\\\"]{position:fixed!important;left:0!important;top:0!important;bottom:0!important;height:100vh!important;height:100dvh!important;width:min(86vw,340px)!important;max-width:340px!important;padding-top:max(8px,env(safe-area-inset-top))!important;padding-bottom:max(8px,env(safe-area-inset-bottom))!important;}button,[role=button],a,input,textarea,select{touch-action:manipulation;}textarea,input,select{font-size:16px!important;}}'+ " +
                "'@media(min-width:901px){#fia-native-backdrop,#fia-native-close{display:none!important;}}';" +
                "(document.head||document.documentElement).appendChild(st);" +
                "}" +
                "function removeTopBlank(){" +
                "if(!document.body)return;var kids=document.body.children;" +
                "for(var i=0;i<Math.min(kids.length,4);i++){var el=kids[i];if(!el||el.id==='fia-native-backdrop')continue;" +
                "var r=el.getBoundingClientRect(),cs=getComputedStyle(el),t=text(el);" +
                "var bg=String(cs.backgroundColor||'').replace(/\\s+/g,'');" +
                "var white=(bg==='rgb(255,255,255)'||bg==='rgba(255,255,255,1)');" +
                "if(r.top<=1&&r.height>0&&r.height<=64&&t.length===0&&white){el.style.display='none';}" +
                "}" +
                "}" +
                "function fixCodex(){" +
                "var nodes=document.querySelectorAll('button,a,[role=button]');" +
                "for(var i=0;i<nodes.length;i++){" +
                "var el=nodes[i],raw=text(el);if(!/codex/i.test(raw))continue;" +
                "var kids=el.querySelectorAll('svg,span,i');" +
                "for(var k=0;k<kids.length;k++){var kt=text(kids[k]);if(kids[k].tagName==='SVG'||/^<\\\\s*\\\\/\\\\s*>$/.test(kt)||/^<\\\\s*>$/.test(kt)){kids[k].style.display='none';}}" +
                "for(var n=0;n<el.childNodes.length;n++){var node=el.childNodes[n];if(node.nodeType===3){node.nodeValue=String(node.nodeValue||'').replace(/<\\\\s*\\\\/\\\\s*>/g,'').replace(/<\\\\s*>/g,'');}}" +
                "var after=text(el);if(/^<\\\\s*\\\\/\\\\s*>\\\\s*codex$/i.test(after)||/^<\\\\s*>\\\\s*codex$/i.test(after)){el.textContent='Codex';}" +
                "}" +
                "}" +
                "function findSidebar(){" +
                "var all=document.querySelectorAll('aside,nav,section,div');var list=[];" +
                "for(var i=0;i<all.length;i++){var el=all[i],t=text(el);if(!/Conversas/i.test(t)||!/Limpar conversas/i.test(t))continue;" +
                "var r=el.getBoundingClientRect();if(r.width<220||r.width>Math.max(620,window.innerWidth*.94)||r.height<window.innerHeight*.55||r.left>60)continue;" +
                "list.push({el:el,area:r.width*r.height});}" +
                "list.sort(function(a,b){return a.area-b.area;});return list.length?list[0].el:null;" +
                "}" +
                "function ensureBackdrop(){" +
                "var b=document.getElementById('fia-native-backdrop');if(b)return b;" +
                "b=document.createElement('div');b.id='fia-native-backdrop';b.className='fia-hidden';" +
                "b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();closeSmart();},true);" +
                "document.body.appendChild(b);return b;" +
                "}" +
                "function visible(drawer){if(!drawer)return false;var r=drawer.getBoundingClientRect(),cs=getComputedStyle(drawer);return cs.display!=='none'&&cs.visibility!=='hidden'&&r.right>30&&r.width>150;}" +
                "function findToggle(drawer){" +
                "var nodes=document.querySelectorAll('button,[role=button]');" +
                "for(var i=0;i<nodes.length;i++){var el=nodes[i];if(drawer&&drawer.contains(el))continue;var a=norm(el.getAttribute('aria-label')).toLowerCase();var tt=text(el);" +
                "if(a.indexOf('menu')>=0||a.indexOf('sidebar')>=0||a.indexOf('conversa')>=0||tt==='☰'||tt==='☷'||tt==='≡')return el;}" +
                "return null;" +
                "}" +
                "function forceClose(drawer){if(!drawer)return;drawer.classList.add('fia-native-closed');var b=ensureBackdrop();b.classList.add('fia-hidden');}" +
                "function syncBackdrop(drawer){var b=ensureBackdrop();if(window.innerWidth<=900&&visible(drawer)&&!drawer.classList.contains('fia-native-closed'))b.classList.remove('fia-hidden');else b.classList.add('fia-hidden');}" +
                "function closeSmart(){" +
                "var drawer=findSidebar();if(!drawer)return;var toggle=findToggle(drawer);" +
                "if(toggle&&!drawer.classList.contains('fia-native-closed')){try{toggle.click();}catch(e){}}" +
                "setTimeout(function(){var d=findSidebar()||drawer;if(visible(d))forceClose(d);else syncBackdrop(d);},80);" +
                "}" +
                "api.close=closeSmart;" +
                "function installDrawer(){" +
                "var drawer=findSidebar();if(!drawer)return;drawer.setAttribute('data-fia-sidebar','1');" +
                "var zi=parseInt(getComputedStyle(drawer).zIndex||'0',10);if(!isFinite(zi)||zi<2147483001)drawer.style.zIndex='2147483001';" +
                "if(getComputedStyle(drawer).position==='static')drawer.style.position='fixed';" +
                "var close=drawer.querySelector('#fia-native-close');if(!close){close=document.createElement('button');close.id='fia-native-close';close.type='button';close.setAttribute('aria-label','Fechar menu');close.textContent='×';close.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();closeSmart();},true);drawer.appendChild(close);}" +
                "if(!drawer.__fiaClick){drawer.__fiaClick=true;drawer.addEventListener('click',function(e){" +
                "var hit=e.target&&e.target.closest?e.target.closest('button,a,[role=button]'):null;if(!hit||hit.id==='fia-native-close')return;" +
                "var tt=text(hit);if(/Nova conversa/i.test(tt)||(!/Tema|Limpar conversas|Codex|Felipe IA/i.test(tt)&&tt.length>0)){setTimeout(closeSmart,40);}" +
                "},false);" +
                "var sx=0;drawer.addEventListener('touchstart',function(e){if(e.touches&&e.touches[0])sx=e.touches[0].clientX;},{passive:true});" +
                "drawer.addEventListener('touchend',function(e){if(e.changedTouches&&e.changedTouches[0]&&sx-e.changedTouches[0].clientX>65)closeSmart();},{passive:true});}" +
                "syncBackdrop(drawer);" +
                "}" +
                "function hookToggle(){" +
                "var drawer=findSidebar();var toggle=findToggle(drawer);if(!toggle||toggle.__fiaToggle)return;toggle.__fiaToggle=true;" +
                "toggle.addEventListener('click',function(){setTimeout(function(){var d=findSidebar();if(d){d.classList.remove('fia-native-closed');syncBackdrop(d);}},120);},false);" +
                "}" +
                "api.refresh=function(){try{ensureViewport();addStyle();removeTopBlank();fixCodex();installDrawer();hookToggle();}catch(e){}};" +
                "api.refresh();" +
                "var queued=false;var mo=new MutationObserver(function(){if(queued)return;queued=true;setTimeout(function(){queued=false;api.refresh();},80);});" +
                "mo.observe(document.documentElement,{childList:true,subtree:true,characterData:true});" +
                "window.addEventListener('resize',function(){setTimeout(api.refresh,60);});" +
                "window.addEventListener('orientationchange',function(){setTimeout(api.refresh,160);});" +
                "})();";
        view.evaluateJavascript(js, null);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
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
