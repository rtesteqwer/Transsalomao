package com.transsalomao.voice;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
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
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends Activity implements TextToSpeech.OnInitListener {
    private static final int AUDIO_PERMISSION_REQUEST = 1001;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 1002;
    private static final String HOME_URL = "https://transsalomao.vercel.app/";
    private static final String ASSISTANT_URL = HOME_URL + "api/assistant";
    private static final String AUTH_URL = HOME_URL + "api/assistant/auth";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final ArrayList<AssistantMemory.ChatMessage> chatHistory = new ArrayList<>();

    private AssistantMemory memory;
    private SecureTokenStore tokenStore;
    private String assistantToken;

    private WebView webView;
    private ScrollView chatScroll;
    private LinearLayout chatMessages;
    private EditText input;
    private TextView status;
    private TextView modeInfo;
    private Button micButton;
    private Button chatButton;
    private Button siteButton;
    private Button assistantButton;
    private Button accessButton;

    private SpeechRecognizer speechRecognizer;
    private Intent recognizerIntent;
    private TextToSpeech tts;
    private boolean listening;
    private boolean speechReady;
    private boolean asking;
    private boolean showingSite;
    private boolean siteLoaded;
    private boolean accessChecking;
    private String queuedVoiceCommand;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        memory = new AssistantMemory(this);
        tokenStore = new SecureTokenStore(this);
        assistantToken = tokenStore.load();
        tts = new TextToSpeech(this, this);

        buildUi();
        configureWebView();
        configureSpeech();
        restoreChat();

        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, AUDIO_PERMISSION_REQUEST);
        } else if (android.os.Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);
        }

        webView.loadUrl(HOME_URL);
        handleAssistantIntent(getIntent());
        updateAssistantState();
        ensureIndependentAccess(false);
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
        ensureIndependentAccess(false);
        if (!showingSite) checkServerState();
    }

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(0xFF0B0B0C);

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.VERTICAL);
        header.setPadding(dp(16), dp(10), dp(16), dp(8));
        header.setBackgroundColor(0xFF111214);

        TextView title = new TextView(this);
        title.setText("SALOMÃO IA");
        title.setTextColor(Color.WHITE);
        title.setTextSize(21);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setGravity(Gravity.CENTER_HORIZONTAL);
        header.addView(title);

        modeInfo = new TextView(this);
        modeInfo.setText("Agente operacional • Trans Salomão");
        modeInfo.setTextColor(0xFFAAAAAA);
        modeInfo.setTextSize(11);
        modeInfo.setGravity(Gravity.CENTER_HORIZONTAL);
        header.addView(modeInfo);

        status = new TextView(this);
        status.setText("Conectando ao sistema…");
        status.setTextColor(0xFFE0E0E0);
        status.setTextSize(12);
        status.setGravity(Gravity.CENTER_HORIZONTAL);
        header.addView(status);
        root.addView(header, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(86)));

        LinearLayout tabs = new LinearLayout(this);
        tabs.setOrientation(LinearLayout.HORIZONTAL);
        tabs.setPadding(dp(5), dp(4), dp(5), dp(4));
        tabs.setBackgroundColor(0xFF111214);

        chatButton = smallButton("💬 Chat");
        chatButton.setOnClickListener(v -> showChat());
        tabs.addView(chatButton, tabParams());

        siteButton = smallButton("🌐 Site");
        siteButton.setOnClickListener(v -> showSite());
        tabs.addView(siteButton, tabParams());

        accessButton = smallButton("🔐 Acesso");
        accessButton.setOnClickListener(v -> ensureIndependentAccess(true));
        accessButton.setOnLongClickListener(v -> {
            revokeIndependentAccess();
            return true;
        });
        tabs.addView(accessButton, tabParams());

        assistantButton = smallButton("🎙 24/7");
        assistantButton.setOnClickListener(v -> openAssistantSetup());
        assistantButton.setOnLongClickListener(v -> {
            WakeListenerService.stop(this);
            updateAssistantState();
            Toast.makeText(this, "Escuta em segundo plano desativada.", Toast.LENGTH_SHORT).show();
            return true;
        });
        tabs.addView(assistantButton, tabParams());

        root.addView(tabs, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(54)));

        FrameLayout content = new FrameLayout(this);
        root.addView(content, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        chatScroll = new ScrollView(this);
        chatScroll.setFillViewport(true);
        chatScroll.setBackgroundColor(0xFF0B0B0C);
        chatMessages = new LinearLayout(this);
        chatMessages.setOrientation(LinearLayout.VERTICAL);
        chatMessages.setPadding(dp(12), dp(14), dp(12), dp(20));
        chatScroll.addView(chatMessages, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        content.addView(chatScroll, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        webView = new WebView(this);
        webView.setVisibility(View.GONE);
        content.addView(webView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout composer = new LinearLayout(this);
        composer.setOrientation(LinearLayout.HORIZONTAL);
        composer.setGravity(Gravity.CENTER_VERTICAL);
        composer.setPadding(dp(8), dp(7), dp(8), dp(8));
        composer.setBackgroundColor(0xFF111214);

        input = new EditText(this);
        input.setHint("Peça dados ou mande executar uma função…");
        input.setHintTextColor(0xFF777777);
        input.setTextColor(Color.WHITE);
        input.setTextSize(14);
        input.setSingleLine(false);
        input.setMaxLines(3);
        input.setPadding(dp(12), dp(8), dp(12), dp(8));
        input.setBackground(roundRect(0xFF1D1F22, dp(18)));
        composer.addView(input, new LinearLayout.LayoutParams(0, dp(54), 1f));

        micButton = smallButton("🎤");
        micButton.setTextSize(20);
        micButton.setOnClickListener(v -> toggleListening());
        LinearLayout.LayoutParams icon = new LinearLayout.LayoutParams(dp(54), dp(54));
        icon.setMargins(dp(5), 0, dp(3), 0);
        composer.addView(micButton, icon);

        Button send = smallButton("➤");
        send.setTextSize(20);
        send.setOnClickListener(v -> sendTyped());
        composer.addView(send, new LinearLayout.LayoutParams(dp(54), dp(54)));
        root.addView(composer, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(70)));

        setContentView(root);
        setTabVisuals();
    }

    private Button smallButton(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextSize(11);
        b.setTextColor(Color.WHITE);
        b.setBackground(roundRect(0xFF25272A, dp(12)));
        return b;
    }

    private LinearLayout.LayoutParams tabParams() {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, dp(44), 1f);
        p.setMargins(dp(2), 0, dp(2), 0);
        return p;
    }

    private GradientDrawable roundRect(int color, int radius) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(radius);
        return d;
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
        s.setUserAgentString(s.getUserAgentString() + " SalomaoAssistant/5.0");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String host = request.getUrl().getHost();
                if (host != null && (host.equals("transsalomao.vercel.app") || host.endsWith("vercel.app"))) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl())); } catch (Exception ignored) {}
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                siteLoaded = true;
                CookieManager.getInstance().flush();
                ensureIndependentAccess(false);
                if (showingSite) status.setText("Site conectado • o acesso do assistente é separado e seguro");
            }
        });
    }

    private void restoreChat() {
        List<AssistantMemory.ChatMessage> saved = memory.recentChat(35);
        chatHistory.clear();
        chatHistory.addAll(saved);
        if (saved.isEmpty()) addAssistantWelcome();
        else for (AssistantMemory.ChatMessage m : saved) addBubble(m.role, m.content, false);
    }

    private void addAssistantWelcome() {
        addBubble("assistant",
                "Olá. Posso ficar disponível em segundo plano: ative 24/7 e me chame por “Salomão” mesmo fora do app. Também posso buscar dados reais e executar funções autorizadas do Trans Salomão. Para apagar dados, eu exijo confirmação explícita.",
                false);
    }

    private void sendTyped() {
        String text = input.getText().toString().trim();
        if (text.isEmpty()) return;
        input.setText("");
        askAssistant(text, false);
    }

    private void askAssistant(String text, boolean speakAnswer) {
        if (asking) {
            Toast.makeText(this, "Ainda estou respondendo a pergunta anterior.", Toast.LENGTH_SHORT).show();
            return;
        }

        String clean = text == null ? "" : text.trim();
        clean = clean.replaceFirst("(?i)^salom[aã]o[ ,.:;!?-]*", "").trim();
        if (clean.isEmpty()) {
            speak("Oi. Pode falar.");
            startListening();
            return;
        }

        if (clean.equalsIgnoreCase("abrir site") || clean.equalsIgnoreCase("site")) {
            showSite();
            if (speakAnswer) speak("Abrindo o site.");
            return;
        }
        if (clean.equalsIgnoreCase("abrir chat") || clean.equalsIgnoreCase("chat")) {
            showChat();
            if (speakAnswer) speak("Voltando para o chat.");
            return;
        }

        final ArrayList<AssistantMemory.ChatMessage> prior = new ArrayList<>(chatHistory);
        addChatMessage("user", clean, true);
        asking = true;
        status.setText("Entendendo a intenção…");
        addTypingBubble();

        final String question = clean;
        network.execute(() -> {
            AssistantResponse result;
            try {
                result = callAssistant(question, prior);
            } catch (Exception e) {
                result = new AssistantResponse(false, "erro", "Não consegui acessar o sistema agora. " + safeError(e), false);
            }
            final AssistantResponse response = result;
            runOnUiThread(() -> {
                removeTypingBubble();
                asking = false;
                addChatMessage("assistant", response.answer, true);
                if (response.loginRequired) {
                    status.setText("Ative o acesso independente");
                    if (speakAnswer) speak("Preciso autenticar o acesso do assistente.");
                    ensureIndependentAccess(true);
                } else {
                    status.setText(response.ok ? "Pronto" : "Falha na operação");
                    String mode = "gpt".equals(response.mode) ? "GPT-5.6 Sol" :
                            "action-router".equals(response.mode) ? "Ação direta" : "modo local";
                    modeInfo.setText("Agente operacional • " + mode);
                    if (speakAnswer) speak(response.answer);
                }
            });
        });
    }

    private AssistantResponse callAssistant(String message, List<AssistantMemory.ChatMessage> prior) throws Exception {
        HttpURLConnection c = openJsonConnection(ASSISTANT_URL, "POST");
        applyAssistantAuth(c);
        c.setRequestProperty("X-Salomao-App", "1");

        JSONObject body = new JSONObject();
        body.put("message", message);
        JSONArray history = new JSONArray();
        int start = Math.max(0, prior.size() - 18);
        for (int i = start; i < prior.size(); i++) {
            AssistantMemory.ChatMessage m = prior.get(i);
            JSONObject row = new JSONObject();
            row.put("role", "assistant".equals(m.role) ? "assistant" : "user");
            row.put("content", m.content);
            history.put(row);
        }
        body.put("history", history);
        writeJson(c, body);

        int code = c.getResponseCode();
        String raw = readAll(code >= 400 ? c.getErrorStream() : c.getInputStream());
        JSONObject json = raw.isEmpty() ? new JSONObject() : new JSONObject(raw);
        String answer = json.optString("answer",
                code == 401 ? "O acesso independente ainda não foi autenticado." : "O servidor não retornou uma resposta.");
        String mode = json.optString("mode", "local");
        return new AssistantResponse(code >= 200 && code < 300, mode, answer,
                code == 401 || "LOGIN_REQUIRED".equals(json.optString("code")));
    }

    private HttpURLConnection openJsonConnection(String url, String method) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(15000);
        c.setReadTimeout(60000);
        c.setRequestProperty("Accept", "application/json");
        if (!"GET".equals(method)) {
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        }
        return c;
    }

    private void applyAssistantAuth(HttpURLConnection c) {
        if (assistantToken != null && !assistantToken.isEmpty()) {
            c.setRequestProperty("Authorization", "Bearer " + assistantToken);
        }
        String cookie = CookieManager.getInstance().getCookie(HOME_URL);
        if (cookie != null && !cookie.isEmpty()) c.setRequestProperty("Cookie", cookie);
    }

    private void writeJson(HttpURLConnection c, JSONObject body) throws Exception {
        byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
        try (OutputStream os = c.getOutputStream()) { os.write(payload); }
    }

    private String readAll(InputStream input) throws Exception {
        if (input == null) return "";
        StringBuilder b = new StringBuilder();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) b.append(line).append('\n');
        }
        return b.toString().trim();
    }

    private void ensureIndependentAccess(boolean interactive) {
        if (accessChecking) return;
        accessChecking = true;
        network.execute(() -> {
            try {
                if (assistantToken != null && !assistantToken.isEmpty()) {
                    HttpURLConnection check = openJsonConnection(AUTH_URL, "GET");
                    check.setRequestProperty("Authorization", "Bearer " + assistantToken);
                    if (check.getResponseCode() == 200) {
                        String raw = readAll(check.getInputStream());
                        JSONObject json = raw.isEmpty() ? new JSONObject() : new JSONObject(raw);
                        String username = json.optString("username", "Gerência");
                        runOnUiThread(() -> setAccessReady(username));
                        return;
                    }
                    tokenStore.clear();
                    assistantToken = null;
                }

                String cookie = CookieManager.getInstance().getCookie(HOME_URL);
                if (cookie != null && !cookie.isEmpty()) {
                    HttpURLConnection pair = openJsonConnection(AUTH_URL, "POST");
                    pair.setRequestProperty("Cookie", cookie);
                    JSONObject body = new JSONObject();
                    body.put("action", "pair");
                    body.put("deviceLabel", android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL);
                    writeJson(pair, body);
                    if (pair.getResponseCode() == 200) {
                        JSONObject json = new JSONObject(readAll(pair.getInputStream()));
                        String token = json.optString("token", "");
                        if (!token.isEmpty()) {
                            assistantToken = token;
                            tokenStore.save(token);
                            String username = json.optString("username", "Gerência");
                            runOnUiThread(() -> setAccessReady(username));
                            return;
                        }
                    }
                }

                runOnUiThread(() -> {
                    setAccessMissing();
                    if (interactive) showCredentialDialog();
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    setAccessMissing();
                    if (interactive) Toast.makeText(this, safeError(e), Toast.LENGTH_LONG).show();
                });
            } finally {
                accessChecking = false;
            }
        });
    }

    private void showCredentialDialog() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(18), dp(4), dp(18), 0);

        EditText username = new EditText(this);
        username.setHint("Login");
        username.setText("Felipe");
        username.setSingleLine(true);
        box.addView(username);

        EditText password = new EditText(this);
        password.setHint("Senha");
        password.setSingleLine(true);
        password.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        box.addView(password);

        TextView note = new TextView(this);
        note.setText("A senha é enviada apenas por HTTPS para autenticar uma vez. O APK guarda somente um token criptografado pelo Android Keystore.");
        note.setTextSize(12);
        note.setPadding(0, dp(8), 0, 0);
        box.addView(note);

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Acesso independente")
                .setView(box)
                .setNegativeButton("Cancelar", null)
                .setPositiveButton("Entrar e salvar acesso", null)
                .create();

        dialog.setOnShowListener(v -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(btn -> {
            String u = username.getText().toString().trim();
            String p = password.getText().toString();
            if (u.isEmpty() || p.isEmpty()) {
                Toast.makeText(this, "Informe login e senha.", Toast.LENGTH_SHORT).show();
                return;
            }
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
            status.setText("Autenticando acesso…");
            network.execute(() -> {
                try {
                    HttpURLConnection c = openJsonConnection(AUTH_URL, "POST");
                    JSONObject body = new JSONObject();
                    body.put("action", "login");
                    body.put("username", u);
                    body.put("password", p);
                    body.put("deviceLabel", android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL);
                    writeJson(c, body);
                    int code = c.getResponseCode();
                    String raw = readAll(code >= 400 ? c.getErrorStream() : c.getInputStream());
                    JSONObject json = raw.isEmpty() ? new JSONObject() : new JSONObject(raw);
                    if (code != 200) throw new IllegalArgumentException("Login ou senha inválidos.");
                    String token = json.optString("token", "");
                    if (token.isEmpty()) throw new IllegalStateException("O servidor não retornou o token.");
                    assistantToken = token;
                    tokenStore.save(token);
                    String savedUser = json.optString("username", u);
                    runOnUiThread(() -> {
                        password.setText("");
                        dialog.dismiss();
                        setAccessReady(savedUser);
                        Toast.makeText(this, "Acesso independente salvo com segurança.", Toast.LENGTH_SHORT).show();
                        checkServerState();
                    });
                } catch (Exception e) {
                    runOnUiThread(() -> {
                        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);
                        status.setText("Não foi possível autenticar");
                        Toast.makeText(this, safeError(e), Toast.LENGTH_LONG).show();
                    });
                }
            });
        }));
        dialog.show();
    }

    private void revokeIndependentAccess() {
        final String token = assistantToken;
        assistantToken = null;
        tokenStore.clear();
        setAccessMissing();
        if (token == null || token.isEmpty()) return;
        network.execute(() -> {
            try {
                HttpURLConnection c = openJsonConnection(AUTH_URL, "DELETE");
                c.setRequestProperty("Authorization", "Bearer " + token);
                c.getResponseCode();
            } catch (Exception ignored) {}
        });
        Toast.makeText(this, "Acesso independente removido deste aparelho.", Toast.LENGTH_SHORT).show();
    }

    private void setAccessReady(String username) {
        if (accessButton != null) accessButton.setText("🔐 " + username + " ✓");
        if (!showingSite && !asking) status.setText("Acesso independente ativo");
    }

    private void setAccessMissing() {
        if (accessButton != null) accessButton.setText("🔐 Acesso");
        if (!showingSite && !asking) status.setText("Toque em Acesso para autenticar");
    }

    private void checkServerState() {
        network.execute(() -> {
            try {
                HttpURLConnection c = openJsonConnection(ASSISTANT_URL, "GET");
                applyAssistantAuth(c);
                int code = c.getResponseCode();
                String raw = readAll(code >= 400 ? c.getErrorStream() : c.getInputStream());
                JSONObject json = raw.isEmpty() ? new JSONObject() : new JSONObject(raw);
                boolean configured = json.optBoolean("aiConfigured", false);
                String username = json.optString("username", "");
                runOnUiThread(() -> {
                    if (code == 200) {
                        if (!username.isEmpty()) setAccessReady(username);
                        modeInfo.setText(configured ? "Agente operacional • GPT-5.6 Sol" : "Agente operacional • roteador local");
                        if (!showingSite && !asking) status.setText("Conectado ao Trans Salomão");
                    } else if (!showingSite && !asking) {
                        setAccessMissing();
                    }
                });
            } catch (Exception ignored) {}
        });
    }

    private TextView typingBubble;

    private void addTypingBubble() {
        typingBubble = makeBubble("assistant", "Analisando intenção e sistema…");
        chatMessages.addView(typingBubble);
        scrollBottom();
    }

    private void removeTypingBubble() {
        if (typingBubble != null) {
            chatMessages.removeView(typingBubble);
            typingBubble = null;
        }
    }

    private String redactLocalSecrets(String content) {
        if (content == null) return "";
        Pattern p = Pattern.compile("(?i)(senha\\s*(?:é|e|:|=)?\\s*)([^\\s,;]+)");
        Matcher m = p.matcher(content);
        return m.replaceAll("$1••••••");
    }

    private void addChatMessage(String role, String content, boolean persist) {
        String safe = "user".equals(role) ? redactLocalSecrets(content) : content;
        AssistantMemory.ChatMessage m = new AssistantMemory.ChatMessage(role, safe, System.currentTimeMillis());
        chatHistory.add(m);
        while (chatHistory.size() > 60) chatHistory.remove(0);
        if (persist) memory.addChat(role, safe);
        addBubble(role, safe, true);
    }

    private void addBubble(String role, String content, boolean scroll) {
        TextView bubble = makeBubble(role, content);
        chatMessages.addView(bubble);
        if (scroll) scrollBottom();
    }

    private TextView makeBubble(String role, String content) {
        TextView v = new TextView(this);
        v.setText(content);
        v.setTextSize(15);
        v.setTextColor(Color.WHITE);
        v.setLineSpacing(0, 1.08f);
        v.setPadding(dp(14), dp(11), dp(14), dp(11));
        boolean user = "user".equals(role);
        v.setBackground(roundRect(user ? 0xFF255BC7 : 0xFF202226, dp(16)));
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                user ? (int)(getResources().getDisplayMetrics().widthPixels * 0.78f) : ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        p.gravity = user ? Gravity.END : Gravity.START;
        p.setMargins(user ? dp(46) : 0, dp(5), user ? 0 : dp(20), dp(5));
        v.setLayoutParams(p);
        return v;
    }

    private void scrollBottom() {
        handler.postDelayed(() -> chatScroll.fullScroll(View.FOCUS_DOWN), 100);
    }

    private void showChat() {
        showingSite = false;
        webView.setVisibility(View.GONE);
        chatScroll.setVisibility(View.VISIBLE);
        setTabVisuals();
        checkServerState();
    }

    private void showSite() {
        showingSite = true;
        chatScroll.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        setTabVisuals();
        if (!siteLoaded) webView.loadUrl(HOME_URL);
        status.setText("Site aberto • você pode usar o login normal da Gerência");
    }

    private void setTabVisuals() {
        if (chatButton == null || siteButton == null) return;
        chatButton.setBackground(roundRect(!showingSite ? 0xFF255BC7 : 0xFF25272A, dp(12)));
        siteButton.setBackground(roundRect(showingSite ? 0xFF255BC7 : 0xFF25272A, dp(12)));
    }

    private void configureSpeech() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            status.setText("Reconhecimento de voz indisponível neste aparelho.");
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
            @Override public void onReadyForSpeech(Bundle params) { listening = true; micButton.setText("■"); status.setText("Estou ouvindo…"); }
            @Override public void onBeginningOfSpeech() { status.setText("Pode falar."); }
            @Override public void onRmsChanged(float rmsdB) {}
            @Override public void onBufferReceived(byte[] buffer) {}
            @Override public void onEndOfSpeech() { status.setText("Entendendo…"); }
            @Override public void onError(int error) { listening = false; micButton.setText("🎤"); if (!asking) status.setText("Não entendi. Tente de novo."); }
            @Override public void onResults(Bundle results) {
                listening = false;
                micButton.setText("🎤");
                ArrayList<String> texts = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (texts != null && !texts.isEmpty()) {
                    showChat();
                    askAssistant(texts.get(0), true);
                }
            }
            @Override public void onPartialResults(Bundle partialResults) {
                ArrayList<String> texts = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (texts != null && !texts.isEmpty()) status.setText("Ouvindo: " + texts.get(0));
            }
            @Override public void onEvent(int eventType, Bundle params) {}
        });
    }

    private void toggleListening() {
        if (listening) {
            try { speechRecognizer.stopListening(); } catch (Exception ignored) {}
            listening = false;
            micButton.setText("🎤");
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

    private void handleAssistantIntent(Intent intent) {
        if (intent == null) return;
        boolean wake = intent.getBooleanExtra("assistant_wake", false);
        String command = intent.getStringExtra("assistant_command");
        if (command != null && !command.trim().isEmpty()) {
            queuedVoiceCommand = command;
            showChat();
            handler.postDelayed(() -> {
                if (queuedVoiceCommand != null) {
                    String q = queuedVoiceCommand;
                    queuedVoiceCommand = null;
                    askAssistant(q, true);
                }
            }, 450);
        } else if (wake) {
            showChat();
            handler.postDelayed(() -> { speak("Oi. Pode falar."); startListening(); }, 350);
        }
        intent.removeExtra("assistant_wake");
        intent.removeExtra("assistant_command");
    }

    private void openAssistantSetup() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            WakeListenerService.setEnabled(this, true);
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, AUDIO_PERMISSION_REQUEST);
            return;
        }

        if (android.os.Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);
        }

        WakeListenerService.setEnabled(this, true);

        if (isAssistantActive()) {
            WakeListenerService.start(this);
            updateAssistantState();
            Toast.makeText(this,
                    "Salomão 24/7 ativado. Pode sair do app e chamar “Salomão”.",
                    Toast.LENGTH_LONG).show();
            return;
        }

        new AlertDialog.Builder(this)
                .setTitle("Ativar Salomão 24/7")
                .setMessage("Para o Android permitir que eu fique disponível em segundo plano, escolha Salomão IA como assistente digital padrão. Depois volte ao app e toque novamente em 24/7. A escuta ativa fica indicada por uma notificação permanente.")
                .setNegativeButton("Cancelar", null)
                .setPositiveButton("Abrir configurações", (d, w) -> {
                    try { startActivity(new Intent(Settings.ACTION_VOICE_INPUT_SETTINGS)); }
                    catch (ActivityNotFoundException e) { startActivity(new Intent(Settings.ACTION_SETTINGS)); }
                }).show();
    }

    private boolean isAssistantActive() {
        try { return VoiceInteractionService.isActiveService(this, new ComponentName(this, SalomaoVoiceService.class)); }
        catch (Exception e) { return false; }
    }

    private void updateAssistantState() {
        boolean assistantActive = isAssistantActive();
        boolean wakeEnabled = WakeListenerService.isEnabled(this);

        if (assistantActive && wakeEnabled
                && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
                && !WakeListenerService.isRunning()) {
            WakeListenerService.start(this);
        }

        if (assistantButton != null) {
            if (assistantActive && wakeEnabled) assistantButton.setText("🎙 24/7 ✓");
            else if (assistantActive) assistantButton.setText("🎙 ATIVAR");
            else assistantButton.setText("🎙 24/7");
        }
        if (accessButton != null && assistantToken != null && !assistantToken.isEmpty()) {
            accessButton.setText("🔐 Acesso ✓");
        }
    }

    private void speak(String text) {
        if (text == null || text.trim().isEmpty()) return;
        String spoken = text.length() > 1800 ? text.substring(0, 1800) : text;
        if (tts != null && speechReady) tts.speak(spoken, TextToSpeech.QUEUE_FLUSH, null, "salomao-v5");
    }

    @Override
    public void onInit(int code) {
        if (code != TextToSpeech.SUCCESS) return;
        Locale ptBR = new Locale("pt", "BR");
        tts.setLanguage(ptBR);
        tts.setSpeechRate(1.04f);
        tts.setPitch(1.01f);
        try {
            Voice best = null;
            Set<Voice> voices = tts.getVoices();
            if (voices != null) for (Voice v : voices) {
                if (!"pt".equals(v.getLocale().getLanguage())) continue;
                if (best == null) best = v;
                boolean br = "BR".equalsIgnoreCase(v.getLocale().getCountry());
                boolean bestBr = best != null && "BR".equalsIgnoreCase(best.getLocale().getCountry());
                if (br && !bestBr) best = v;
                else if (br == bestBr && !v.isNetworkConnectionRequired() && best.isNetworkConnectionRequired()) best = v;
                else if (br == bestBr && v.getQuality() > best.getQuality()) best = v;
            }
            if (best != null) tts.setVoice(best);
        } catch (Exception ignored) {}
        speechReady = true;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == AUDIO_PERMISSION_REQUEST
                && grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            status.setText("Microfone liberado");
            if (WakeListenerService.isEnabled(this) && isAssistantActive()) {
                WakeListenerService.start(this);
            }
            if (android.os.Build.VERSION.SDK_INT >= 33
                    && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);
            }
            updateAssistantState();
        }

        if (requestCode == NOTIFICATION_PERMISSION_REQUEST) {
            updateAssistantState();
        }
    }

    @Override
    public void onBackPressed() {
        if (showingSite) {
            if (webView.canGoBack()) webView.goBack();
            else showChat();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        network.shutdownNow();
        if (speechRecognizer != null) speechRecognizer.destroy();
        if (tts != null) { tts.stop(); tts.shutdown(); }
        if (webView != null) webView.destroy();
        if (memory != null) memory.close();
        super.onDestroy();
    }

    private String safeError(Exception e) {
        String m = e.getMessage();
        return m == null || m.trim().isEmpty() ? "Verifique a internet e tente novamente." : m;
    }

    private static class AssistantResponse {
        final boolean ok;
        final String mode;
        final String answer;
        final boolean loginRequired;

        AssistantResponse(boolean ok, String mode, String answer, boolean loginRequired) {
            this.ok = ok;
            this.mode = mode;
            this.answer = answer;
            this.loginRequired = loginRequired;
        }
    }
}
