package com.transsalomao.online;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.view.MotionEvent;
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
    private TouchScrollWebView webView;
    private ProgressBar progress;

    /**
     * WebView with a native vertical-scroll fallback.
     * Some Android System WebView builds can fail to pan a page when a site mixes
     * dvh/standalone-PWA CSS. We let WebView handle the gesture first and only
     * apply scrollBy when that MOVE event did not change the viewport at all.
     */
    private static final class TouchScrollWebView extends WebView {
        private float lastY = Float.NaN;

        TouchScrollWebView(Context context) {
            super(context);
        }

        @Override
        public boolean onTouchEvent(MotionEvent event) {
            final int action = event.getActionMasked();

            if (action == MotionEvent.ACTION_DOWN) {
                lastY = event.getY();
                if (getParent() != null) getParent().requestDisallowInterceptTouchEvent(true);
            }

            final int before = getScrollY();
            final boolean handled = super.onTouchEvent(event);

            if (action == MotionEvent.ACTION_MOVE) {
                final float currentY = event.getY();
                if (!Float.isNaN(lastY)) {
                    final float delta = lastY - currentY;
                    final int after = getScrollY();

                    // Fallback only when native WebView did not move for this gesture event.
                    if (Math.abs(delta) >= 1f && after == before) {
                        final int direction = delta > 0 ? 1 : -1;
                        if (canScrollVertically(direction)) {
                            scrollBy(0, Math.round(delta));
                        }
                    }
                }
                lastY = currentY;
                if (getParent() != null) getParent().requestDisallowInterceptTouchEvent(true);
            } else if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) {
                lastY = Float.NaN;
                if (getParent() != null) getParent().requestDisallowInterceptTouchEvent(false);
            }

            // Keep the complete gesture sequence inside this WebView.
            return handled || true;
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.rgb(7, 17, 31));
        getWindow().setNavigationBarColor(Color.rgb(7, 17, 31));

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(7, 17, 31));

        webView = new TouchScrollWebView(this);
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
        settings.setUserAgentString(settings.getUserAgentString() + " TransSalomaoApp/1.2");

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
                forceScrollableDocument(view);
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

    private void forceScrollableDocument(WebView view) {
        final String js =
                "(function(){" +
                "function fix(){" +
                "var h=document.documentElement,b=document.body,s=document.scrollingElement||h;" +
                "if(h){h.style.setProperty('overflow-y','auto','important');h.style.setProperty('height','auto','important');h.style.setProperty('min-height','100%','important');h.style.setProperty('touch-action','auto','important');}" +
                "if(b){b.style.setProperty('overflow-y','auto','important');b.style.setProperty('height','auto','important');b.style.setProperty('min-height','100%','important');b.style.setProperty('touch-action','auto','important');}" +
                "if(s){s.style.setProperty('overflow-y','auto','important');s.style.setProperty('touch-action','auto','important');}" +
                "}" +
                "fix();setTimeout(fix,250);setTimeout(fix,1000);setTimeout(fix,2500);" +
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
