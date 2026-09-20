package com.transsalomao.voice;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.service.voice.VoiceInteractionService;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
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
import java.util.Set;

public class MainActivity extends Activity implements TextToSpeech.OnInitListener {
    private static final int AUDIO_PERMISSION_REQUEST = 1001;
    private static final String HOME_URL = "https://transsalomao.vercel.app/";

    private WebView webView;
    private SpeechRecognizer speechRecognizer;
    private Intent recognizerIntent;
    private TextToSpeech tts;
    private AssistantMemory memory;

    private TextView status;
    private TextView info;
    private Button micButton;
    private Button assistantButton;

    private boolean listening = false;
    private boolean speechReady = false;
    private boolean pageReady = false;

    private String pendingDangerousCommand;
    private String currentCommandKey;
    private String currentUtterance;
    private String currentTarget;
    private String lastFailedCommandKey;
    private String lastFailedUtterance;
    private long lastFailedAt;
    private String queuedAssistantCommand;

    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        memory = new AssistantMemory(this);
        tts = new TextToSpeech(this, this);
        buildUi();
        configureWebView();
        configureSpeech();

        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, AUDIO_PERMISSION_REQUEST);
        }

        handleAssistantIntent(getIntent());
        webView.loadUrl(HOME_URL);
        updateAssistantState();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleAssistantIntent(intent);
    }

    @Override
    protected void onResume() {
        super.onResume();
        updateAssistantState();
    }

    private void buildUi() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        webView = new WebView(this);
        FrameLayout.LayoutParams webParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT);
        webParams.topMargin = dp(92);
        webParams.bottomMargin = dp(70);
        root.addView(webView, webParams);

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.VERTICAL);
        top.setPadding(dp(14), dp(8), dp(14), dp(8));
        top.setBackgroundColor(0xFF101010);

        TextView title = new TextView(this);
        title.setText("SALOMÃO IA • TRANS SALOMÃO");
        title.setTextColor(Color.WHITE);
        title.setTextSize(17);
        title.setGravity(Gravity.CENTER);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        top.addView(title);

        info = new TextView(this);
        info.setTextColor(0xFFBDBDBD);
        info.setTextSize(11);
        info.setGravity(Gravity.CENTER);
        top.addView(info);

        status = new TextView(this);
        status.setText("Carregando o site…");
        status.setTextColor(0xFFFFFFFF);
        status.setTextSize(12);
        status.setGravity(Gravity.CENTER);
        top.addView(status);

        root.addView(top, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(92),
                Gravity.TOP));

        LinearLayout controls = new LinearLayout(this);
        controls.setOrientation(LinearLayout.HORIZONTAL);
        controls.setGravity(Gravity.CENTER);
        controls.setPadding(dp(5), dp(5), dp(5), dp(7));
        controls.setBackgroundColor(0xFF101010);

        micButton = makeButton("🎤 OUVIR");
        micButton.setOnClickListener(v -> toggleListening());
        controls.addView(micButton, weightedParams());

        assistantButton = makeButton("ATIVAR 24/7");
        assistantButton.setOnClickListener(v -> openAssistantSetup());
        controls.addView(assistantButton, weightedParams());

        Button memoryButton = makeButton("MEMÓRIA");
        memoryButton.setOnClickListener(v -> showMemory());
        controls.addView(memoryButton, weightedParams());

        Button homeButton = makeButton("INÍCIO");
        homeButton.setOnClickListener(v -> webView.loadUrl(HOME_URL));
        controls.addView(homeButton, weightedParams());

        root.addView(controls, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(70),
                Gravity.BOTTOM));

        setContentView(root);
    }

    private Button makeButton(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextSize(11);
        b.setAllCaps(false);
        return b;
    }

    private LinearLayout.LayoutParams weightedParams() {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, dp(54), 1f);
        p.setMargins(dp(2), 0, dp(2), 0);
        return p;
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private void configureWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " SalomaoAssistant/2.0");

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
                pageReady = true;
                injectLearningBridge();
                status.setText("Pronto • diga “Salomão” ou toque em OUVIR");
                updateAssistantState();
                if (queuedAssistantCommand != null && !queuedAssistantCommand.trim().isEmpty()) {
                    String q = queuedAssistantCommand;
                    queuedAssistantCommand = null;
                    handler.postDelayed(() -> executeVoiceCommand(q), 350);
                }
            }
        });
    }

    private void injectLearningBridge() {
        String js = "(function(){" +
                "if(window.__salomaoLearnInstalled)return;window.__salomaoLearnInstalled=true;" +
                "function vis(e){const r=e.getBoundingClientRect();return r.width>0&&r.height>0;}" +
                "function label(e){return ((e.innerText||e.value||e.getAttribute('aria-label')||e.title||'')+'').trim().replace(/\\s+/g,' ').slice(0,180);}" +
                "function sel(e){if(e.id)return '#'+CSS.escape(e.id);" +
                "for(const a of ['data-testid','data-test','name','aria-label']){const v=e.getAttribute&&e.getAttribute(a);if(v)return e.tagName.toLowerCase()+'['+a+'=\\"'+CSS.escape(v)+'\\"]';}" +
                "let p=[],n=e;while(n&&n.nodeType===1&&n!==document.body&&p.length<5){let x=n.tagName.toLowerCase();let i=1,s=n;while((s=s.previousElementSibling)){if(s.tagName===n.tagName)i++;}x+=':nth-of-type('+i+')';p.unshift(x);n=n.parentElement;}return p.join('>');}" +
                "document.addEventListener('click',function(ev){let e=ev.target&&ev.target.closest?ev.target.closest('button,a,[role=button],[role=tab],input[type=button],input[type=submit],[onclick]'):null;" +
                "if(!e||!vis(e))return;if(e.__salomaoVoiceClick&&Date.now()-e.__salomaoVoiceClick<1800)return;" +
                "try{TransVoice.manualClick(sel(e),label(e),location.pathname||'/');}catch(x){}},true);" +
                "})();";
        webView.evaluateJavascript(js, null);
    }

    private void configureSpeech() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            status.setText("O reconhecimento de voz não está disponível neste aparelho.");
            micButton.setEnabled(false);
            return;
        }

        try {
            if (android.os.Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(this)) {
                speechRecognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(this);
            } else {
                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
            }
        } catch (Exception e) {
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
        }

        recognizerIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pt-BR");
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "pt-BR");
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 4);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());

        speechRecognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) {
                listening = true;
                micButton.setText("■ PARAR");
                status.setText("Estou ouvindo…");
            }
            @Override public void onBeginningOfSpeech() { status.setText("Pode falar."); }
            @Override public void onRmsChanged(float rmsdB) {}
            @Override public void onBufferReceived(byte[] buffer) {}
            @Override public void onEndOfSpeech() { status.setText("Entendendo…"); }

            @Override public void onError(int error) {
                listening = false;
                micButton.setText("🎤 OUVIR");
                if (error != SpeechRecognizer.ERROR_CLIENT && error != SpeechRecognizer.ERROR_NO_MATCH) {
                    status.setText("Não consegui ouvir. Tente novamente.");
                }
            }

            @Override public void onResults(Bundle results) {
                listening = false;
                micButton.setText("🎤 OUVIR");
                ArrayList<String> texts = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (texts != null && !texts.isEmpty()) {
                    status.setText("Você: " + texts.get(0));
                    executeVoiceCommand(texts.get(0));
                }
            }

            @Override public void onPartialResults(Bundle partialResults) {
                ArrayList<String> texts = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (texts != null && !texts.isEmpty()) status.setText("Ouvindo: " + texts.get(0));
            }
            @Override public void onEvent(int eventType, Bundle params) {}
        });
    }

    private void handleAssistantIntent(Intent intent) {
        if (intent == null) return;
        boolean wake = intent.getBooleanExtra("assistant_wake", false);
        String command = intent.getStringExtra("assistant_command");
        if (command != null && !command.trim().isEmpty()) {
            if (pageReady) handler.postDelayed(() -> executeVoiceCommand(command), 250);
            else queuedAssistantCommand = command;
        } else if (wake) {
            handler.postDelayed(() -> {
                speak("Oi. Pode falar.");
                startListening();
            }, 450);
        }
        intent.removeExtra("assistant_wake");
        intent.removeExtra("assistant_command");
    }

    private void toggleListening() {
        if (listening) {
            try { speechRecognizer.stopListening(); } catch (Exception ignored) {}
            listening = false;
            micButton.setText("🎤 OUVIR");
        } else startListening();
    }

    private void startListening() {
        if (speechRecognizer == null || listening) return;
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, AUDIO_PERMISSION_REQUEST);
            return;
        }
        try { speechRecognizer.startListening(recognizerIntent); }
        catch (Exception e) { status.setText("Não consegui iniciar o microfone."); }
    }

    private void executeVoiceCommand(String original) {
        String command = normalize(original);
        command = command.replaceFirst("^salomao[ ,.:;!?-]*", "").trim();
        if (command.isEmpty()) {
            speak("Oi. Pode falar.");
            startListening();
            return;
        }

        if (isConfirmation(command)) {
            if (pendingDangerousCommand != null) {
                String approved = pendingDangerousCommand;
                pendingDangerousCommand = null;
                speak("Certo. Vou executar.");
                executeSafeCommand(approved, approved);
            } else speak("Não há nenhuma ação aguardando confirmação.");
            return;
        }

        if (command.equals("cancelar") || command.equals("cancela") || command.equals("nao")) {
            pendingDangerousCommand = null;
            speak("Tudo bem. Cancelei.");
            return;
        }

        if (isDangerous(command)) {
            pendingDangerousCommand = command;
            status.setText("Ação sensível aguardando confirmação");
            speak("Essa ação pode apagar dados. Diga confirmar para continuar.");
            memory.logCommand(original, command, "aguardando confirmação", false);
            return;
        }

        if (command.startsWith("lembre que ")) {
            rememberFact(command.substring("lembre que ".length()).trim(), original);
            return;
        }

        if (command.startsWith("o que voce lembra sobre ")) {
            String key = command.substring("o que voce lembra sobre ".length()).trim();
            String value = memory.recallFact(key);
            if (value == null) speak("Ainda não tenho nada salvo sobre " + key + ".");
            else speak("Eu lembro que " + key + " é " + value + ".");
            return;
        }

        executeSafeCommand(command, original);
    }

    private void rememberFact(String phrase, String original) {
        String[] separators = {" e ", " eh ", " = "};
        for (String sep : separators) {
            int i = phrase.indexOf(sep);
            if (i > 0 && i < phrase.length() - sep.length()) {
                String key = phrase.substring(0, i).trim();
                String value = phrase.substring(i + sep.length()).trim();
                memory.rememberFact(key, value);
                memory.logCommand(original, normalize(original), "memória: " + key, true);
                updateAssistantState();
                speak("Certo. Vou lembrar disso.");
                return;
            }
        }
        speak("Diga, por exemplo: lembre que meu conjunto principal é Volvo Klebersom.");
    }

    private boolean isConfirmation(String c) {
        return c.equals("confirmar") || c.equals("confirmo") || c.equals("pode confirmar") || c.equals("sim confirmar");
    }

    private boolean isDangerous(String c) {
        return c.contains("apagar") || c.contains("excluir") || c.contains("deletar") ||
                c.contains("remover tudo") || c.contains("limpar tudo");
    }

    private void executeSafeCommand(String command, String original) {
        if (command.equals("voltar") || command.equals("volte")) {
            if (webView.canGoBack()) webView.goBack(); else webView.evaluateJavascript("history.back()", null);
            memory.logCommand(original, command, "voltar", true);
            speak("Certo.");
            return;
        }
        if (command.contains("atualizar") || command.contains("recarregar")) {
            webView.reload();
            memory.logCommand(original, command, "atualizar", true);
            speak("Atualizando.");
            return;
        }
        if (command.equals("inicio") || command.equals("home") || command.contains("pagina inicial")) {
            webView.loadUrl(HOME_URL);
            memory.logCommand(original, command, "início", true);
            speak("Voltando para o início.");
            return;
        }
        if (command.contains("rolar para baixo") || command.equals("descer")) {
            webView.evaluateJavascript("window.scrollBy({top:Math.max(window.innerHeight*0.75,500),behavior:'smooth'});", null);
            memory.logCommand(original, command, "rolar para baixo", true);
            return;
        }
        if (command.contains("rolar para cima") || command.equals("subir")) {
            webView.evaluateJavascript("window.scrollBy({top:-Math.max(window.innerHeight*0.75,500),behavior:'smooth'});", null);
            memory.logCommand(original, command, "rolar para cima", true);
            return;
        }
        if (command.equals("mostrar memoria") || command.equals("abrir memoria") || command.equals("memoria")) {
            showMemory();
            return;
        }

        if (command.startsWith("digitar ")) {
            currentUtterance = original;
            currentCommandKey = "digitar:" + command.substring(8).trim();
            setActiveField(command.substring(8).trim());
            return;
        }

        if ((command.startsWith("preencher ") || command.startsWith("preencha ")) && command.contains(" com ")) {
            String tmp = command.replaceFirst("^preencher ", "").replaceFirst("^preencha ", "");
            int idx = tmp.indexOf(" com ");
            if (idx > 0) {
                currentUtterance = original;
                currentCommandKey = "preencher:" + tmp.substring(0, idx).trim();
                fillField(tmp.substring(0, idx).trim(), tmp.substring(idx + 5).trim());
                return;
            }
        }

        if (command.startsWith("selecionar ") || command.startsWith("selecione ")) {
            currentUtterance = original;
            currentCommandKey = "selecionar:" + command.replaceFirst("^selecionar ", "").replaceFirst("^selecione ", "").trim();
            selectOption(command.replaceFirst("^selecionar ", "").replaceFirst("^selecione ", "").trim());
            return;
        }

        currentUtterance = original;
        currentCommandKey = canonicalCommand(command);
        currentTarget = extractTarget(command);
        AssistantMemory.LearnedAction learned = memory.findAction(currentCommandKey, pageKey());
        if (learned != null) clickLearned(learned);
        else semanticClick(currentTarget);
    }

    private String canonicalCommand(String command) {
        return "abrir:" + canonicalTarget(extractTarget(command));
    }

    private String extractTarget(String command) {
        String t = command;
        String[] prefixes = {"clicar em ", "clique em ", "abrir ", "abra ", "ir para ", "entrar em ", "mostrar ", "mostre "};
        for (String p : prefixes) if (t.startsWith(p)) return t.substring(p.length()).trim();
        return t.trim();
    }

    private String canonicalTarget(String t) {
        t = normalize(t);
        if (t.equals("viagem")) return "viagens";
        if (t.equals("relatorio")) return "relatorios";
        if (t.equals("abastecimento") || t.equals("combustivel")) return "abastecimentos";
        if (t.equals("motorista")) return "motoristas";
        if (t.equals("carreta") || t.equals("conjunto de carreta")) return "conjuntos";
        if (t.equals("gerencia")) return "painel da gerencia";
        return t;
    }

    private String[] aliases(String target) {
        String t = canonicalTarget(target);
        if (t.equals("viagens")) return new String[]{"viagens", "registrar viagens", "lancar viagens"};
        if (t.equals("relatorios")) return new String[]{"relatorios", "relatorio"};
        if (t.equals("abastecimentos")) return new String[]{"abastecimentos", "abastecimento", "combustivel"};
        if (t.equals("motoristas")) return new String[]{"motoristas", "cadastro de motoristas"};
        if (t.equals("conjuntos")) return new String[]{"conjuntos", "carretas", "cadastro de carretas"};
        if (t.equals("painel da gerencia")) return new String[]{"painel da gerencia", "gerenciamento", "gerencia"};
        return new String[]{t};
    }

    private void clickLearned(AssistantMemory.LearnedAction learned) {
        String selector = js(learned.selector);
        String script = "(function(){const e=document.querySelector('" + selector + "');" +
                "if(!e){TransVoice.actionResult('learned_miss','','','');return;}" +
                "e.__salomaoVoiceClick=Date.now();e.scrollIntoView({block:'center',behavior:'smooth'});setTimeout(()=>e.click(),140);" +
                "TransVoice.actionResult('ok','" + js(currentCommandKey) + "','" + selector + "','" + js(learned.label) + "');})();";
        webView.evaluateJavascript(script, null);
    }

    private void semanticClick(String target) {
        String[] as = aliases(target);
        StringBuilder arr = new StringBuilder("[");
        for (int i = 0; i < as.length; i++) {
            if (i > 0) arr.append(",");
            arr.append("'").append(js(as[i])).append("'");
        }
        arr.append("]");
        String script = "(function(){" +
                "const n=s=>(s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().trim().replace(/\\s+/g,' ');" +
                "const qs=" + arr + ".map(n);" +
                "const label=e=>n(e.innerText||e.value||e.getAttribute('aria-label')||e.title||'');" +
                "const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&!e.disabled};" +
                "const sel=e=>{if(e.id)return '#'+CSS.escape(e.id);for(const a of ['data-testid','data-test','name','aria-label']){const v=e.getAttribute&&e.getAttribute(a);if(v)return e.tagName.toLowerCase()+'['+a+'=\\"'+CSS.escape(v)+'\\"]';}let p=[],x=e;while(x&&x.nodeType===1&&x!==document.body&&p.length<5){let z=x.tagName.toLowerCase(),i=1,s=x;while((s=s.previousElementSibling)){if(s.tagName===x.tagName)i++;}p.unshift(z+':nth-of-type('+i+')');x=x.parentElement;}return p.join('>');};" +
                "let all=[...document.querySelectorAll('button,a,[role=button],[role=tab],input[type=button],input[type=submit],[onclick]')].filter(vis);" +
                "let exact=all.filter(e=>qs.includes(label(e)));" +
                "let candidates=exact.length?exact:all.filter(e=>qs.some(q=>label(e).startsWith(q)||label(e).includes(q)));" +
                "candidates=[...new Set(candidates)];" +
                "if(candidates.length===1){const e=candidates[0],l=(e.innerText||e.value||e.getAttribute('aria-label')||e.title||'').trim().replace(/\\s+/g,' ');const s=sel(e);e.__salomaoVoiceClick=Date.now();e.scrollIntoView({block:'center',behavior:'smooth'});setTimeout(()=>e.click(),140);TransVoice.actionResult('ok','" + js(currentCommandKey) + "',s,l);return;}" +
                "if(candidates.length>1){const names=candidates.slice(0,4).map(e=>(e.innerText||e.value||e.getAttribute('aria-label')||e.title||'').trim()).join(' | ');TransVoice.actionResult('ambiguous','" + js(currentCommandKey) + "','',names);return;}" +
                "TransVoice.actionResult('miss','" + js(currentCommandKey) + "','','" + js(target) + "');})();";
        webView.evaluateJavascript(script, null);
    }

    private void setActiveField(String value) {
        String v = js(value);
        webView.evaluateJavascript("(function(){const e=document.activeElement;if(e&&(e.tagName==='INPUT'||e.tagName==='TEXTAREA')){" +
                "e.value='" + v + "';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));TransVoice.simpleResult('ok','Texto preenchido');" +
                "}else TransVoice.simpleResult('miss','Toque primeiro no campo que quer preencher');})();", null);
    }

    private void fillField(String field, String value) {
        String f = js(canonicalTarget(field)), v = js(value);
        String script = "(function(){const n=s=>(s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().trim();" +
                "const q=n('" + f + "'),all=[...document.querySelectorAll('input,textarea')];" +
                "let e=all.find(x=>[x.name,x.id,x.placeholder,x.getAttribute('aria-label')].some(y=>n(y)===q));" +
                "if(!e){for(const l of document.querySelectorAll('label')){if(n(l.innerText)===q||n(l.innerText).includes(q)){e=l.htmlFor?document.getElementById(l.htmlFor):l.querySelector('input,textarea');if(e)break;}}}" +
                "if(e){e.focus();e.value='" + v + "';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));TransVoice.simpleResult('ok','Campo preenchido');}" +
                "else TransVoice.simpleResult('miss','Não achei esse campo');})();";
        webView.evaluateJavascript(script, null);
    }

    private void selectOption(String target) {
        String t = js(canonicalTarget(target));
        String script = "(function(){const n=s=>(s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().trim();const q=n('" + t + "');" +
                "let hits=[];for(const s of document.querySelectorAll('select'))for(const o of s.options){if(n(o.textContent)===q)hits.push([s,o]);}" +
                "if(hits.length===1){const s=hits[0][0],o=hits[0][1];s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));TransVoice.simpleResult('ok','Opção selecionada');}" +
                "else TransVoice.simpleResult(hits.length>1?'ambiguous':'miss',hits.length>1?'Encontrei mais de uma opção com esse nome':'Não achei essa opção');})();";
        webView.evaluateJavascript(script, null);
    }

    private String pageKey() {
        String url = webView == null ? null : webView.getUrl();
        if (url == null) return "/";
        int q = url.indexOf('?'); if (q >= 0) url = url.substring(0, q);
        int h = url.indexOf('#'); if (h >= 0) url = url.substring(0, h);
        return url;
    }

    private void openAssistantSetup() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, AUDIO_PERMISSION_REQUEST);
            return;
        }
        if (isAssistantActive()) {
            speak("O modo vinte e quatro horas já está ativo. É só dizer Salomão.");
            return;
        }

        new AlertDialog.Builder(this)
                .setTitle("Ativar Salomão 24/7")
                .setMessage("Na próxima tela, escolha “Salomão IA” ou “Trans Salomão” como assistente de voz padrão. Depois disso o Android mantém o serviço do assistente disponível para a chamada “Salomão”.")
                .setNegativeButton("Agora não", null)
                .setPositiveButton("Abrir configurações", (d, w) -> {
                    try { startActivity(new Intent(Settings.ACTION_VOICE_INPUT_SETTINGS)); }
                    catch (ActivityNotFoundException e) { startActivity(new Intent(Settings.ACTION_SETTINGS)); }
                })
                .show();
    }

    private boolean isAssistantActive() {
        try {
            return VoiceInteractionService.isActiveService(this, new ComponentName(this, SalomaoVoiceService.class));
        } catch (Exception e) {
            return false;
        }
    }

    private void updateAssistantState() {
        boolean active = isAssistantActive();
        if (assistantButton != null) assistantButton.setText(active ? "24/7 ATIVO" : "ATIVAR 24/7");
        if (info != null) {
            info.setText("Chamada: “Salomão” • 24/7: " + (active ? "ATIVO" : "CONFIGURAR") +
                    " • Aprendeu " + memory.learnedCount() + " ações • " + memory.historyCount() + " comandos gravados");
        }
    }

    private void showMemory() {
        String body = "Ações aprendidas: " + memory.learnedCount() +
                "\nComandos gravados: " + memory.historyCount() +
                "\nFatos lembrados: " + memory.factsCount() +
                "\n\nÚltimos comandos:\n" + memory.recentSummary(12);
        new AlertDialog.Builder(this)
                .setTitle("Memória do Salomão")
                .setMessage(body)
                .setPositiveButton("Fechar", null)
                .show();
    }

    private String normalize(String s) {
        if (s == null) return "";
        return Normalizer.normalize(s, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase(new Locale("pt", "BR"))
                .trim()
                .replaceAll("\\s+", " ");
    }

    private String js(String value) {
        if (value == null) return "";
        return value.replace("\\", "\\\\")
                .replace("'", "\\'")
                .replace("\n", " ")
                .replace("\r", " ");
    }

    private void speak(String text) {
        status.setText("Salomão: " + text);
        if (tts != null && speechReady) tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "salomao");
    }

    private void speakDone(String label) {
        String clean = label == null || label.trim().isEmpty() ? currentTarget : label.trim();
        int pick = Math.abs((currentCommandKey == null ? clean : currentCommandKey).hashCode()) % 4;
        if (pick == 0) speak("Pronto. Abri " + clean + ".");
        else if (pick == 1) speak("Certo. Já estou em " + clean + ".");
        else if (pick == 2) speak("Feito. " + clean + " está aberto.");
        else speak("Ok. Indo para " + clean + ".");
    }

    @Override
    public void onInit(int statusCode) {
        if (statusCode != TextToSpeech.SUCCESS) return;
        Locale ptBR = new Locale("pt", "BR");
        tts.setLanguage(ptBR);
        tts.setSpeechRate(1.03f);
        tts.setPitch(1.02f);
        try {
            Voice best = null;
            Set<Voice> voices = tts.getVoices();
            if (voices != null) {
                for (Voice v : voices) {
                    if (!"pt".equals(v.getLocale().getLanguage())) continue;
                    if (best == null) best = v;
                    boolean br = "BR".equalsIgnoreCase(v.getLocale().getCountry());
                    boolean bestBr = "BR".equalsIgnoreCase(best.getLocale().getCountry());
                    if (br && !bestBr) best = v;
                    else if (br == bestBr && !v.isNetworkConnectionRequired() && best.isNetworkConnectionRequired()) best = v;
                    else if (br == bestBr && v.getQuality() > best.getQuality()) best = v;
                }
            }
            if (best != null) tts.setVoice(best);
        } catch (Exception ignored) {}
        speechReady = true;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == AUDIO_PERMISSION_REQUEST) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                speak("Microfone liberado.");
                updateAssistantState();
            } else status.setText("O microfone é necessário para chamar o Salomão.");
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
        if (tts != null) { tts.stop(); tts.shutdown(); }
        if (webView != null) webView.destroy();
        if (memory != null) memory.close();
        super.onDestroy();
    }

    public class VoiceBridge {
        @JavascriptInterface
        public void actionResult(String type, String commandKey, String selector, String label) {
            runOnUiThread(() -> {
                if ("learned_miss".equals(type)) {
                    semanticClick(currentTarget == null ? "" : currentTarget);
                    return;
                }
                if ("ok".equals(type)) {
                    String key = commandKey == null || commandKey.isEmpty() ? currentCommandKey : commandKey;
                    memory.learnAction(key, pageKey(), selector, label);
                    memory.logCommand(currentUtterance == null ? key : currentUtterance, key, label, true);
                    lastFailedCommandKey = null;
                    updateAssistantState();
                    speakDone(label);
                    return;
                }

                String key = commandKey == null || commandKey.isEmpty() ? currentCommandKey : commandKey;
                memory.logCommand(currentUtterance == null ? key : currentUtterance, key, type + ": " + label, false);
                lastFailedCommandKey = key;
                lastFailedUtterance = currentUtterance;
                lastFailedAt = System.currentTimeMillis();
                if ("ambiguous".equals(type)) {
                    status.setText("Encontrei mais de um alvo: " + label);
                    speak("Encontrei mais de um lugar parecido e não vou clicar no errado. Toque uma vez no botão correto e eu vou aprender.");
                } else {
                    status.setText("Não encontrei um alvo seguro para: " + currentTarget);
                    speak("Não achei um alvo seguro. Toque uma vez no lugar correto e eu vou aprender para a próxima.");
                }
                updateAssistantState();
            });
        }

        @JavascriptInterface
        public void manualClick(String selector, String label, String path) {
            runOnUiThread(() -> {
                if (lastFailedCommandKey == null || System.currentTimeMillis() - lastFailedAt > 45000) return;
                memory.learnAction(lastFailedCommandKey, pageKey(), selector, label);
                memory.logCommand(lastFailedUtterance == null ? lastFailedCommandKey : lastFailedUtterance,
                        lastFailedCommandKey, "aprendido manualmente: " + label, true);
                lastFailedCommandKey = null;
                lastFailedUtterance = null;
                updateAssistantState();
                speak("Aprendi. Da próxima vez eu vou direto nesse lugar.");
            });
        }

        @JavascriptInterface
        public void simpleResult(String type, String message) {
            runOnUiThread(() -> {
                boolean ok = "ok".equals(type);
                memory.logCommand(currentUtterance == null ? currentCommandKey : currentUtterance,
                        currentCommandKey == null ? "" : currentCommandKey, message, ok);
                updateAssistantState();
                if (ok) speak(message + ".");
                else speak(message + ".");
            });
        }
    }
}
