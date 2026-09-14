package com.transsalomao.online;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;

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
        settings.setUserAgentString(settings.getUserAgentString() + " TransSalomaoApp/1.3");

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
            }
        });

        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition,
                                        String mimetype, long contentLength) {
                try {
                    DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                    request.addRequestHeader("User-Agent", userAgent);
                    String cookies = CookieManager.getInstance().getCookie(url);
                    if (cookies != null) request.addRequestHeader("Cookie", cookies);
                    request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "TransSalomao-relatorio");
                    DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                    manager.enqueue(request);
                } catch (Exception ignored) {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                }
            }
        });

        if (savedInstanceState == null) {
            webView.loadUrl(START_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
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
