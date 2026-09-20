package com.transsalomao.voice;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.view.Gravity;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Locale;

public class MainActivity extends Activity implements TextToSpeech.OnInitListener {
    private static final int AUDIO_PERMISSION_REQUEST = 1001;
    private static final String HOME_URL = "https://transsalomao.vercel.app/";

    private WebView webView;
    private SpeechRecognizer speechRecognizer;
    private Intent recognizerIntent;
    private TextToSpeech tts;
    private TextView status;
    private Button micButton;
    private Button continuousButton;
    private boolean listening = false;
    private boolean continuousListening = false;
    private boolean speechReady = false;
    private String pendingDangerousCommand = null;
    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        tts = new TextToSpeech(this, this);
        buildUi();
        configureWebView();
        configureSpeech();
        webView.loadUrl(HOME_URL);
    }

    private void buildUi() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.VERTICAL);
        top.setPadding(dp(12), dp(8), dp(12), dp(8));
        top.setBackgroundColor(0xDD101010);

        TextView title = new TextView(this);
        title.setText("TRANS SALOMÃO • COMANDO POR VOZ");
        title.setTextColor(Color.WHITE);
        title.setTextSize(14);
        title.setGravity(Gravity.CENTER);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        top.addView(title, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));

        status = new TextView(this);
        status.setText("Toque no microfone e fale um comando");
        status.setTextColor(0xFFDDDDDD);
        status.setTextSize(12);
        status.setGravity(Gravity.CENTER);
        top.addView(status, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));

        root.addView(top, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.TOP));

        LinearLayout controls = new LinearLayout(this);
        controls.setOrientation(LinearLayout.HORIZONTAL);
        controls.setGravity(Gravity.CENTER);
        controls.setPadding(dp(8), dp(6), dp(8), dp(12));
        controls.setBackgroundColor(0xDD101010);

        micButton = new Button(this);
        micButton.setText("🎤 OUVIR");
        micButton.setTextSize(16);
        micButton.setOnClickListener(v -> toggleListening());
        controls.addView(micButton, weightedParams());

        continuousButton = new Button(this);
        continuousButton.setText("CONTÍNUO: OFF");
        continuousButton.setTextSize(13);
        continuousButton.setOnClickListener(v -> toggleContinuousListening());
        controls.addView(continuousButton, weightedParams());

        Button homeButton = new Button(this);
        homeButton.setText("INÍCIO");
        homeButton.setOnClickListener(v -> webView.loadUrl(HOME_URL));
        controls.addView(homeButton, weightedParams());

        root.addView(controls, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM));

        setContentView(root);
    }

    private LinearLayout.LayoutParams weightedParams() {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, dp(52), 1f);
        p.setMargins(dp(3), 0, dp(3), 0);
        return p;
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " TransSalomaoVoiceApp/1.0");

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(new VoiceBridge(), "TransVoice");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String host = request.getUrl().getHost();
                if (host != null && (host.equals("transsalomao.vercel.app") || host.endsWith("vercel.app"))) {
                    return false;
                }
                startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl()));
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                status.setText("Site pronto • diga um comando");
            }
        });
    }

    private void configureSpeech() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            status.setText("Reconhecimento de voz indisponível neste aparelho");
            micButton.setEnabled(false);
            continuousButton.setEnabled(false);
            return;
        }

        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
        recognizerIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pt-BR");
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "pt-BR");
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());

        speechRecognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) {
                listening = true;
                status.setText("Ouvindo…");
                micButton.setText("■ PARAR");
            }

            @Override public void onBeginningOfSpeech() { status.setText("Pode falar…"); }
            @Override public void onRmsChanged(float rmsdB) { }
            @Override public void onBufferReceived(byte[] buffer) { }
            @Override public void onEndOfSpeech() { status.setText("Entendendo comando…"); }

            @Override public void onError(int error) {
                listening = false;
                micButton.setText("🎤 OUVIR");
                if (error != SpeechRecognizer.ERROR_CLIENT && error != SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                    status.setText("Não entendi. Tente novamente.");
                }
                restartContinuousIfNeeded(900);
            }

            @Override public void onResults(Bundle results) {
                listening = false;
                micButton.setText("🎤 OUVIR");
                ArrayList<String> texts = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (texts != null && !texts.isEmpty()) {
                    String command = texts.get(0);
                    status.setText("Você disse: " + command);
                    executeVoiceCommand(command);
                }
                restartContinuousIfNeeded(700);
            }

            @Override public void onPartialResults(Bundle partialResults) {
                ArrayList<String> texts = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (texts != null && !texts.isEmpty()) status.setText("Ouvindo: " + texts.get(0));
            }

            @Override public void onEvent(int eventType, Bundle params) { }
        });
    }

    private void toggleListening() {
        if (listening) {
            speechRecognizer.stopListening();
            listening = false;
            micButton.setText("🎤 OUVIR");
        } else {
            startListening();
        }
    }

    private void toggleContinuousListening() {
        continuousListening = !continuousListening;
        continuousButton.setText(continuousListening ? "CONTÍNUO: ON" : "CONTÍNUO: OFF");
        if (continuousListening) {
            speak("Escuta contínua ativada");
            startListening();
        } else {
            speak("Escuta contínua desativada");
            if (listening && speechRecognizer != null) speechRecognizer.stopListening();
        }
    }

    private void startListening() {
        if (speechRecognizer == null || listening) return;
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, AUDIO_PERMISSION_REQUEST);
            return;
        }
        try {
            speechRecognizer.startListening(recognizerIntent);
        } catch (Exception e) {
            status.setText("Erro ao iniciar microfone");
        }
    }

    private void restartContinuousIfNeeded(long delayMs) {
        if (!continuousListening) return;
        handler.postDelayed(() -> {
            if (continuousListening && !listening) startListening();
        }, delayMs);
    }

    private void executeVoiceCommand(String original) {
        final String command = normalize(original);
        if (command.isEmpty()) return;

        if (command.equals("confirmar") || command.equals("confirmo") || command.equals("pode confirmar")) {
            if (pendingDangerousCommand != null) {
                String approved = pendingDangerousCommand;
                pendingDangerousCommand = null;
                status.setText("Executando ação confirmada");
                executeSafeCommand(approved);
                speak("Ação confirmada");
            } else {
                speak("Não há ação aguardando confirmação");
            }
            return;
        }

        if (command.equals("cancelar") || command.equals("cancela")) {
            pendingDangerousCommand = null;
            speak("Ação cancelada");
            return;
        }

        if (isDangerous(command)) {
            pendingDangerousCommand = command;
            status.setText("Ação sensível aguardando confirmação");
            speak("Essa ação pode apagar ou excluir dados. Diga confirmar para executar, ou cancelar.");
            return;
        }

        executeSafeCommand(command);
    }

    private boolean isDangerous(String command) {
        return command.contains("apagar") || command.contains("excluir") || command.contains("deletar") ||
                command.contains("remover tudo") || command.contains("limpar tudo");
    }

    private void executeSafeCommand(String command) {
        if (command.equals("voltar") || command.equals("volte")) {
            if (webView.canGoBack()) webView.goBack();
            else webView.evaluateJavascript("history.back()", null);
            speak("Voltando");
            return;
        }

        if (command.contains("atualizar") || command.contains("recarregar")) {
            webView.reload();
            speak("Atualizando");
            return;
        }

        if (command.contains("pagina inicial") || command.equals("inicio") || command.equals("home")) {
            webView.loadUrl(HOME_URL);
            speak("Abrindo início");
            return;
        }

        if (command.contains("rolar para baixo") || command.contains("descer pagina") || command.equals("descer")) {
            webView.evaluateJavascript("window.scrollBy({top: Math.max(window.innerHeight*0.75,500), behavior:'smooth'});", null);
            return;
        }

        if (command.contains("rolar para cima") || command.contains("subir pagina") || command.equals("subir")) {
            webView.evaluateJavascript("window.scrollBy({top: -Math.max(window.innerHeight*0.75,500), behavior:'smooth'});", null);
            return;
        }

        if (command.startsWith("digitar ")) {
            setActiveField(command.substring("digitar ".length()).trim());
            return;
        }

        if ((command.startsWith("preencher ") || command.startsWith("preencha ")) && command.contains(" com ")) {
            String tmp = command.replaceFirst("^preencher ", "").replaceFirst("^preencha ", "");
            int idx = tmp.indexOf(" com ");
            if (idx > 0) {
                fillField(tmp.substring(0, idx).trim(), tmp.substring(idx + 5).trim());
                return;
            }
        }

        if (command.startsWith("selecionar ") || command.startsWith("selecione ")) {
            selectOption(command.replaceFirst("^selecionar ", "").replaceFirst("^selecione ", "").trim());
            return;
        }

        String target = command;
        if (target.startsWith("clicar em ")) target = target.substring("clicar em ".length());
        else if (target.startsWith("clique em ")) target = target.substring("clique em ".length());
        else if (target.startsWith("abrir ")) target = target.substring("abrir ".length());
        else if (target.startsWith("abra ")) target = target.substring("abra ".length());
        else if (target.startsWith("ir para ")) target = target.substring("ir para ".length());

        clickByText(target.trim());
    }

    private void clickByText(String target) {
        String t = js(target);
        String script = "(function(){" +
                "const n=s=>(s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().trim();" +
                "const q=n('" + t + "');" +
                "const all=[...document.querySelectorAll('button,a,[role=button],input[type=button],input[type=submit],[onclick],nav *')];" +
                "let exact=all.find(e=>n(e.innerText||e.value||e.getAttribute('aria-label'))===q);" +
                "let partial=all.find(e=>{const x=n(e.innerText||e.value||e.getAttribute('aria-label'));return x&&x.includes(q);});" +
                "let el=exact||partial;" +
                "if(el){el.scrollIntoView({block:'center',behavior:'smooth'});setTimeout(()=>el.click(),180);TransVoice.report('ok','Cliquei em '+q);return;}" +
                "const textEls=[...document.querySelectorAll('body *')].filter(e=>e.children.length===0);" +
                "let leaf=textEls.find(e=>n(e.innerText)===q)||textEls.find(e=>n(e.innerText).includes(q));" +
                "if(leaf){let c=leaf.closest('button,a,[role=button],[onclick]')||leaf;c.scrollIntoView({block:'center'});c.click();TransVoice.report('ok','Abri '+q);return;}" +
                "TransVoice.report('miss','Não achei '+q);" +
                "})();";
        webView.evaluateJavascript(script, null);
    }

    private void setActiveField(String value) {
        String v = js(value);
        webView.evaluateJavascript("(function(){const e=document.activeElement;if(e&&(e.tagName==='INPUT'||e.tagName==='TEXTAREA')){" +
                "e.value='" + v + "';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));TransVoice.report('ok','Texto preenchido');" +
                "}else{TransVoice.report('miss','Toque primeiro no campo que deseja preencher');}})();", null);
    }

    private void fillField(String field, String value) {
        String f = js(field);
        String v = js(value);
        String script = "(function(){" +
                "const n=s=>(s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().trim();" +
                "const q=n('" + f + "');const inputs=[...document.querySelectorAll('input,textarea')];" +
                "let el=inputs.find(i=>[i.name,i.id,i.placeholder,i.getAttribute('aria-label')].some(x=>n(x)===q));" +
                "if(!el){for(const l of document.querySelectorAll('label')){if(n(l.innerText).includes(q)){el=l.htmlFor?document.getElementById(l.htmlFor):l.querySelector('input,textarea');if(el)break;}}}" +
                "if(!el)el=inputs.find(i=>[i.name,i.id,i.placeholder,i.getAttribute('aria-label')].some(x=>n(x).includes(q)));" +
                "if(el){el.focus();el.value='" + v + "';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));TransVoice.report('ok','Campo '+q+' preenchido');}" +
                "else TransVoice.report('miss','Não achei o campo '+q);})();";
        webView.evaluateJavascript(script, null);
    }

    private void selectOption(String target) {
        String t = js(target);
        String script = "(function(){const n=s=>(s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().trim();const q=n('" + t + "');" +
                "for(const s of document.querySelectorAll('select')){const o=[...s.options].find(x=>n(x.textContent)===q)||[...s.options].find(x=>n(x.textContent).includes(q));" +
                "if(o){s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));TransVoice.report('ok','Selecionei '+q);return;}}" +
                "TransVoice.report('miss','Não achei a opção '+q);})();";
        webView.evaluateJavascript(script, null);
    }

    private String normalize(String s) {
        if (s == null) return "";
        String n = Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        return n.toLowerCase(new Locale("pt", "BR")).trim().replaceAll("\\s+", " ");
    }

    private String js(String value) {
        return value.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ").replace("\r", " ");
    }

    private void speak(String text) {
        if (tts != null && speechReady) tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "transsalomao");
    }

    @Override
    public void onInit(int statusCode) {
        if (statusCode == TextToSpeech.SUCCESS) {
            tts.setLanguage(new Locale("pt", "BR"));
            tts.setSpeechRate(1.0f);
            speechReady = true;
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == AUDIO_PERMISSION_REQUEST) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                startListening();
            } else {
                status.setText("Permita o microfone para usar comandos por voz");
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (speechRecognizer != null) speechRecognizer.destroy();
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        if (webView != null) webView.destroy();
        super.onDestroy();
    }

    public class VoiceBridge {
        @JavascriptInterface
        public void report(String type, String message) {
            runOnUiThread(() -> {
                status.setText(message);
                if ("miss".equals(type)) Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
                speak(message);
            });
        }
    }
}
