package com.transsalomao.voice;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.res.ColorStateList;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.net.Uri;
import android.provider.Settings;
import android.service.voice.VoiceInteractionService;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.text.InputType;
import android.text.Editable;
import android.text.TextWatcher;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.WindowInsets;
import android.view.WindowInsetsAnimation;
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
import java.io.ByteArrayOutputStream;
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
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class MainActivity extends Activity implements TextToSpeech.OnInitListener {
    private static final int AUDIO_PERMISSION_REQUEST = 1001;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 1002;
    private static final int ZIP_PICK_REQUEST = 1601;
    private static final int MAX_ZIP_IMAGES = 40;
    private static final int MAX_ZIP_ENTRY_BYTES = 12 * 1024 * 1024;
    private static final String HOME_URL = "https://transsalomao.vercel.app/";
    private static final String ASSISTANT_URL = HOME_URL + "api/assistant";
    private static final String AUTH_URL = HOME_URL + "api/assistant/auth";
    private static final String DOCUMENT_INTAKE_URL = HOME_URL + "api/assistant/document-intake";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final ArrayList<AssistantMemory.ChatMessage> chatHistory = new ArrayList<>();

    private AssistantMemory memory;
    private SecureTokenStore tokenStore;
    private String assistantToken;

    private WebView webView;
    private ScrollView chatScroll;
    private LinearLayout chatMessages;
    private LinearLayout composer;
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
    private boolean processingArchive;
    private String queuedVoiceCommand;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setSoftInputMode(
                WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING
                        | WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
        }
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
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == ZIP_PICK_REQUEST && resultCode == RESULT_OK && data != null && data.getData() != null) {
            processZipArchive(data.getData());
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        updateAssistantState();
        ensureIndependentAccess(false);
        if (!showingSite) checkServerState();
    }

    private void installSystemAndKeyboardInsets(View root) {
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                applySafeInsets(v, insets);
                return insets;
            });

            root.setWindowInsetsAnimationCallback(new WindowInsetsAnimation.Callback(
                    WindowInsetsAnimation.Callback.DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
                @Override
                public WindowInsets onProgress(
                        WindowInsets insets,
                        java.util.List<WindowInsetsAnimation> runningAnimations) {
                    applySafeInsets(root, insets);
                    return insets;
                }

                @Override
                public void onEnd(WindowInsetsAnimation animation) {
                    super.onEnd(animation);
                    if (input != null && input.hasFocus()) {
                        handler.postDelayed(MainActivity.this::scrollBottom, 60);
                    }
                }
            });
            root.post(root::requestApplyInsets);
        } else {
            int statusId = getResources().getIdentifier("status_bar_height", "dimen", "android");
            int statusTop = statusId > 0 ? getResources().getDimensionPixelSize(statusId) : 0;
            root.setPadding(0, statusTop, 0, 0);
        }
    }

    private void applySafeInsets(View root, WindowInsets insets) {
        if (android.os.Build.VERSION.SDK_INT < 30 || insets == null) return;

        android.graphics.Insets bars = insets.getInsets(
                WindowInsets.Type.statusBars()
                        | WindowInsets.Type.navigationBars()
                        | WindowInsets.Type.displayCutout());
        android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());

        // O topo é protegido da câmera/notch. Nunca aplicamos a altura do teclado
        // como padding da tela inteira.
        int top = Math.max(0, bars.top);
        if (root.getPaddingTop() != top) {
            root.setPadding(0, top, 0, 0);
        }

        // Apenas a barra de digitação acompanha o teclado.
        if (composer != null) {
            int keyboardLift = Math.max(0, ime.bottom - bars.bottom);
            composer.setTranslationY(-keyboardLift);

            ViewGroup.LayoutParams raw = composer.getLayoutParams();
            if (raw instanceof LinearLayout.LayoutParams) {
                LinearLayout.LayoutParams lp = (LinearLayout.LayoutParams) raw;
                if (lp.bottomMargin != bars.bottom) {
                    lp.bottomMargin = bars.bottom;
                    composer.setLayoutParams(lp);
                }
            }
        }

        if (input != null && input.hasFocus() && ime.bottom > 0) {
            handler.removeCallbacks(scrollForKeyboard);
            handler.postDelayed(scrollForKeyboard, 45);
        }
    }

    private final Runnable scrollForKeyboard = () -> {
        if (chatScroll != null) chatScroll.fullScroll(View.FOCUS_DOWN);
    };

    private void buildUi() {
        getWindow().setStatusBarColor(0xFF0B141A);
        getWindow().setNavigationBarColor(0xFF0B141A);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(0xFF0B141A);
        installSystemAndKeyboardInsets(root);

        // Cabeçalho inspirado no WhatsApp: avatar, nome, estado online e acesso rápido.
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.VERTICAL);
        header.setPadding(dp(12), dp(8), dp(12), dp(6));
        header.setBackgroundColor(0xFF111B21);

        LinearLayout identityRow = new LinearLayout(this);
        identityRow.setOrientation(LinearLayout.HORIZONTAL);
        identityRow.setGravity(Gravity.CENTER_VERTICAL);

        TextView avatar = new TextView(this);
        avatar.setText("🚛");
        avatar.setTextSize(24);
        avatar.setGravity(Gravity.CENTER);
        avatar.setBackground(roundRectStroke(0xFF172A33, 0xFF00A884, dp(28), dp(1)));
        LinearLayout.LayoutParams avatarParams = new LinearLayout.LayoutParams(dp(56), dp(56));
        avatarParams.setMargins(0, 0, dp(10), 0);
        identityRow.addView(avatar, avatarParams);

        LinearLayout identity = new LinearLayout(this);
        identity.setOrientation(LinearLayout.VERTICAL);

        TextView title = new TextView(this);
        title.setText("SALOMÃO IA  ✓");
        title.setTextColor(Color.WHITE);
        title.setTextSize(20);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        identity.addView(title);

        modeInfo = new TextView(this);
        modeInfo.setText("Agente operacional • GPT-5.6 Sol");
        modeInfo.setTextColor(0xFFB7C3C9);
        modeInfo.setTextSize(11.5f);
        identity.addView(modeInfo);

        status = new TextView(this);
        status.setText("Online • Conectando ao Trans Salomão…");
        status.setTextColor(0xFF00A884);
        status.setTextSize(11.5f);
        identity.addView(status);

        identityRow.addView(identity, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        header.addView(identityRow);

        LinearLayout tabs = new LinearLayout(this);
        tabs.setOrientation(LinearLayout.HORIZONTAL);
        tabs.setPadding(0, dp(8), 0, 0);
        tabs.setGravity(Gravity.CENTER_VERTICAL);

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
            if (WakeListenerService.isEnabled(this)) {
                WakeListenerService.stop(this);
                handler.postDelayed(this::updateAssistantState, 250);
                Toast.makeText(this, "24/7 desativado.", Toast.LENGTH_SHORT).show();
            }
            return true;
        });
        tabs.addView(assistantButton, tabParams());

        header.addView(tabs, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48)));
        root.addView(header, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        // Cartão de conexão acima da conversa.
        LinearLayout connectedCard = new LinearLayout(this);
        connectedCard.setOrientation(LinearLayout.HORIZONTAL);
        connectedCard.setGravity(Gravity.CENTER_VERTICAL);
        connectedCard.setPadding(dp(14), dp(10), dp(14), dp(10));
        connectedCard.setBackground(roundRectStroke(0xFF18252D, 0xFF263A43, dp(14), dp(1)));

        TextView connectedIcon = new TextView(this);
        connectedIcon.setText("▥");
        connectedIcon.setTextSize(22);
        connectedIcon.setTextColor(0xFF00A884);
        connectedIcon.setGravity(Gravity.CENTER);
        connectedCard.addView(connectedIcon, new LinearLayout.LayoutParams(dp(36), dp(36)));

        LinearLayout connectedText = new LinearLayout(this);
        connectedText.setOrientation(LinearLayout.VERTICAL);
        TextView connectedTitle = new TextView(this);
        connectedTitle.setText("Conectado ao Trans Salomão");
        connectedTitle.setTextColor(Color.WHITE);
        connectedTitle.setTextSize(13.5f);
        connectedTitle.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        connectedText.addView(connectedTitle);
        TextView connectedSub = new TextView(this);
        connectedSub.setText("Consultas, lançamentos, relatórios e comandos operacionais.");
        connectedSub.setTextColor(0xFF9FB0B8);
        connectedSub.setTextSize(11.5f);
        connectedText.addView(connectedSub);
        connectedCard.addView(connectedText, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        LinearLayout.LayoutParams connectedParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        connectedParams.setMargins(dp(10), dp(8), dp(10), dp(6));
        root.addView(connectedCard, connectedParams);

        FrameLayout content = new FrameLayout(this);
        root.addView(content, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        chatScroll = new ScrollView(this);
        chatScroll.setFillViewport(true);
        chatScroll.setBackgroundColor(0xFF0B141A);
        chatMessages = new LinearLayout(this);
        chatMessages.setOrientation(LinearLayout.VERTICAL);
        chatMessages.setPadding(dp(10), dp(10), dp(10), dp(18));
        chatScroll.addView(chatMessages, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        content.addView(chatScroll, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        webView = new WebView(this);
        webView.setVisibility(View.GONE);
        content.addView(webView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // Composer no padrão WhatsApp.
        composer = new LinearLayout(this);
        composer.setOrientation(LinearLayout.HORIZONTAL);
        composer.setGravity(Gravity.CENTER_VERTICAL);
        composer.setPadding(dp(8), dp(6), dp(8), dp(8));
        composer.setBackgroundColor(0xFF0B141A);

        Button quick = smallButton("＋");
        quick.setTextSize(22);
        quick.setOnClickListener(v -> {
            new AlertDialog.Builder(this)
                    .setTitle("Ações rápidas")
                    .setItems(new String[]{
                            "📦 Adicionar ZIP e reconhecer fotos",
                            "Lançar viagem",
                            "Consultar motorista",
                            "Abastecimentos",
                            "Despesas",
                            "Relatórios",
                            "Abrir site"
                    }, (dialog, which) -> {
                        if (which == 0) {
                            openZipPicker();
                            return;
                        }
                        if (which == 6) {
                            showSite();
                            return;
                        }
                        String[] prompts = new String[]{
                                "Quero lançar uma viagem",
                                "Quero consultar um motorista",
                                "Quero consultar abastecimentos",
                                "Quero consultar despesas",
                                "Quero ver os relatórios"
                        };
                        input.setText(prompts[which - 1]);
                        input.setSelection(input.getText().length());
                    }).show();
        });
        composer.addView(quick, new LinearLayout.LayoutParams(dp(46), dp(52)));

        input = new EditText(this);
        input.setHint("Digite sua mensagem…");
        input.setHintTextColor(Color.rgb(134, 150, 160));
        input.setTextColor(Color.WHITE);
        input.setTextSize(15f);
        input.setAlpha(1f);
        input.setEnabled(true);
        input.setFocusable(true);
        input.setFocusableInTouchMode(true);
        input.setCursorVisible(true);
        input.setSingleLine(false);
        input.setMaxLines(4);
        input.setGravity(Gravity.CENTER_VERTICAL | Gravity.START);
        input.setIncludeFontPadding(false);
        input.setInputType(InputType.TYPE_CLASS_TEXT
                | InputType.TYPE_TEXT_FLAG_MULTI_LINE
                | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        input.setPadding(dp(14), dp(8), dp(14), dp(8));
        input.setBackground(roundRect(0xFF202C33, dp(24)));
        if (android.os.Build.VERSION.SDK_INT >= 29) {
            GradientDrawable cursor = roundRect(Color.WHITE, dp(1));
            input.setTextCursorDrawable(cursor);
        }
        if (android.os.Build.VERSION.SDK_INT >= 21) {
            input.setBackgroundTintList((ColorStateList) null);
        }
        input.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence text, int start, int before, int count) {
                input.setTextColor(Color.WHITE);
                input.setAlpha(1f);
                input.invalidate();
            }
            @Override public void afterTextChanged(Editable editable) {}
        });
        input.setOnFocusChangeListener((v, hasFocus) -> {
            if (hasFocus) {
                input.setTextColor(Color.WHITE);
                input.setCursorVisible(true);
                handler.postDelayed(this::scrollBottom, 180);
                handler.postDelayed(this::scrollBottom, 420);
            }
        });
        LinearLayout.LayoutParams inputParams = new LinearLayout.LayoutParams(0, dp(52), 1f);
        inputParams.setMargins(dp(5), 0, dp(5), 0);
        composer.addView(input, inputParams);

        micButton = smallButton("🎤");
        micButton.setTextSize(18);
        micButton.setBackground(roundRect(0xFF202C33, dp(26)));
        micButton.setOnClickListener(v -> toggleListening());
        LinearLayout.LayoutParams micParams = new LinearLayout.LayoutParams(dp(52), dp(52));
        micParams.setMargins(0, 0, dp(5), 0);
        composer.addView(micButton, micParams);

        Button send = smallButton("➤");
        send.setTextSize(19);
        send.setBackground(roundRect(0xFF00A884, dp(26)));
        send.setOnClickListener(v -> sendTyped());
        composer.addView(send, new LinearLayout.LayoutParams(dp(52), dp(52)));

        root.addView(composer, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(68)));

        setContentView(root);
        setTabVisuals();
    }

    private Button smallButton(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextSize(10.5f);
        b.setTextColor(0xFFE9EDEF);
        b.setGravity(Gravity.CENTER);
        b.setPadding(dp(5), 0, dp(5), 0);
        b.setMinWidth(0);
        b.setMinimumWidth(0);
        b.setMinHeight(0);
        b.setMinimumHeight(0);
        b.setBackground(roundRectStroke(0xFF202C33, 0xFF2A3942, dp(18), dp(1)));
        return b;
    }

    private LinearLayout.LayoutParams tabParams() {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, dp(40), 1f);
        p.setMargins(dp(2), 0, dp(2), 0);
        return p;
    }

    private GradientDrawable roundRect(int color, int radius) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(radius);
        return d;
    }

    private GradientDrawable roundRectStroke(int color, int strokeColor, int radius, int strokeWidth) {
        GradientDrawable d = roundRect(color, radius);
        d.setStroke(strokeWidth, strokeColor);
        return d;
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private void openZipPicker() {
        if (processingArchive) {
            Toast.makeText(this, "Já estou analisando um ZIP.", Toast.LENGTH_SHORT).show();
            return;
        }
        Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        picker.addCategory(Intent.CATEGORY_OPENABLE);
        picker.setType("application/zip");
        picker.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                "application/zip",
                "application/x-zip-compressed",
                "application/octet-stream"
        });
        try {
            startActivityForResult(picker, ZIP_PICK_REQUEST);
        } catch (Exception e) {
            Toast.makeText(this, "Não encontrei um seletor de arquivos ZIP.", Toast.LENGTH_LONG).show();
        }
    }

    private void processZipArchive(Uri uri) {
        if (processingArchive || uri == null) return;
        processingArchive = true;
        showChat();
        status.setText("Lendo ZIP e reconhecendo documentos…");
        addChatMessage("assistant",
                "📦 Recebi o ZIP. Vou abrir as imagens, ler os dados e separar cada documento em Viagem, Abastecimento, Adiantamento, Mecânica, Despesa ou Revisar.",
                true);

        network.execute(() -> {
            ArrayList<String> summaries = new ArrayList<>();
            int images = 0;
            int analyzed = 0;
            int failed = 0;

            try (InputStream raw = getContentResolver().openInputStream(uri);
                 ZipInputStream zip = raw == null ? null : new ZipInputStream(raw)) {
                if (zip == null) throw new IllegalArgumentException("Não consegui abrir o ZIP.");

                ZipEntry entry;
                while ((entry = zip.getNextEntry()) != null) {
                    if (entry.isDirectory()) {
                        zip.closeEntry();
                        continue;
                    }
                    String name = safeZipEntryName(entry.getName());
                    if (!isImageArchiveEntry(name)) {
                        zip.closeEntry();
                        continue;
                    }
                    images += 1;
                    if (images > MAX_ZIP_IMAGES) {
                        summaries.add("⚠ O ZIP possui mais de " + MAX_ZIP_IMAGES + " imagens. Analisei somente as primeiras " + MAX_ZIP_IMAGES + ".");
                        break;
                    }
                    if (entry.getSize() > MAX_ZIP_ENTRY_BYTES) {
                        failed += 1;
                        summaries.add("⚠ " + name + " — imagem grande demais para análise.");
                        zip.closeEntry();
                        continue;
                    }

                    try {
                        byte[] bytes = readZipImage(zip, MAX_ZIP_ENTRY_BYTES);
                        PreparedImage prepared = prepareImageForVision(bytes);
                        if (prepared == null) {
                            failed += 1;
                            summaries.add("⚠ " + name + " — formato de imagem não reconhecido.");
                            continue;
                        }

                        JSONObject response = callDocumentIntake(name, prepared);
                        analyzed += 1;
                        summaries.add(formatDocumentAnalysis(name, response));

                        if (summaries.size() >= 6) {
                            ArrayList<String> batch = new ArrayList<>(summaries);
                            summaries.clear();
                            runOnUiThread(() -> addChatMessage("assistant", joinSummaries(batch), true));
                        }
                    } catch (Exception itemError) {
                        failed += 1;
                        summaries.add("⚠ " + name + " — " + safeArchiveError(itemError));
                    } finally {
                        try { zip.closeEntry(); } catch (Exception ignored) {}
                    }
                }
            } catch (Exception e) {
                final String message = safeArchiveError(e);
                runOnUiThread(() -> addChatMessage("assistant",
                        "Não consegui concluir a leitura do ZIP: " + message + " Nenhum documento foi lançado automaticamente.",
                        true));
            } finally {
                if (!summaries.isEmpty()) {
                    ArrayList<String> batch = new ArrayList<>(summaries);
                    runOnUiThread(() -> addChatMessage("assistant", joinSummaries(batch), true));
                }
                final int imageCount = images;
                final int successCount = analyzed;
                final int failCount = failed;
                runOnUiThread(() -> {
                    processingArchive = false;
                    status.setText("Online • Conectado ao Trans Salomão");
                    if (imageCount == 0) {
                        addChatMessage("assistant",
                                "Não encontrei fotos compatíveis dentro do ZIP. Use JPG, JPEG, PNG, WEBP, HEIC ou HEIF.",
                                true);
                    } else {
                        addChatMessage("assistant",
                                "✅ ZIP analisado: " + successCount + " documento(s) reconhecido(s)"
                                        + (failCount > 0 ? " e " + failCount + " que precisam de revisão." : ".")
                                        + "\nOs itens marcados como prontos têm dados suficientes para o módulo indicado; os demais mostram exatamente o que falta.",
                                true);
                    }
                });
            }
        });
    }

    private String joinSummaries(List<String> rows) {
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < rows.size(); i++) {
            if (i > 0) out.append("\n\n");
            out.append(rows.get(i));
        }
        return out.toString();
    }

    private String safeZipEntryName(String value) {
        if (value == null || value.trim().isEmpty()) return "imagem";
        String normalized = value.replace('\\', '/');
        int slash = normalized.lastIndexOf('/');
        String name = slash >= 0 ? normalized.substring(slash + 1) : normalized;
        return name.length() > 120 ? name.substring(name.length() - 120) : name;
    }

    private boolean isImageArchiveEntry(String name) {
        String n = name == null ? "" : name.toLowerCase(Locale.ROOT);
        return n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".png")
                || n.endsWith(".webp") || n.endsWith(".heic") || n.endsWith(".heif");
    }

    private byte[] readZipImage(ZipInputStream zip, int maxBytes) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int total = 0;
        int read;
        while ((read = zip.read(buffer)) != -1) {
            total += read;
            if (total > maxBytes) throw new IllegalArgumentException("imagem excede o limite de 12 MB");
            out.write(buffer, 0, read);
        }
        return out.toByteArray();
    }

    private PreparedImage prepareImageForVision(byte[] bytes) {
        if (bytes == null || bytes.length == 0) return null;
        Bitmap source = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        if (source == null) return null;

        Bitmap image = source;
        int width = source.getWidth();
        int height = source.getHeight();
        int max = Math.max(width, height);
        if (max > 2000) {
            float ratio = 2000f / max;
            int w = Math.max(1, Math.round(width * ratio));
            int h = Math.max(1, Math.round(height * ratio));
            image = Bitmap.createScaledBitmap(source, w, h, true);
        }

        byte[] encoded = compressJpeg(image, 88);
        if (encoded.length > 2_700_000) encoded = compressJpeg(image, 76);
        if (encoded.length > 3_500_000) encoded = compressJpeg(image, 64);

        if (image != source) image.recycle();
        source.recycle();

        return new PreparedImage("image/jpeg", Base64.encodeToString(encoded, Base64.NO_WRAP));
    }

    private byte[] compressJpeg(Bitmap image, int quality) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        image.compress(Bitmap.CompressFormat.JPEG, quality, out);
        return out.toByteArray();
    }

    private JSONObject callDocumentIntake(String fileName, PreparedImage prepared) throws Exception {
        HttpURLConnection c = openJsonConnection(DOCUMENT_INTAKE_URL, "POST");
        applyAssistantAuth(c);
        c.setRequestProperty("X-Salomao-App", "1");

        JSONObject body = new JSONObject();
        body.put("fileName", fileName);
        body.put("mime", prepared.mime);
        body.put("imageBase64", prepared.base64);
        writeJson(c, body);

        int code = c.getResponseCode();
        String raw = readAll(code >= 400 ? c.getErrorStream() : c.getInputStream());
        JSONObject response = raw.isEmpty() ? new JSONObject() : new JSONObject(raw);
        if (code < 200 || code >= 300) {
            String message = response.optString("message", "Falha na leitura visual.");
            throw new IllegalArgumentException(message);
        }
        return response;
    }

    private String formatDocumentAnalysis(String fileName, JSONObject response) {
        JSONObject r = response.optJSONObject("result");
        JSONObject routing = response.optJSONObject("routing");
        if (r == null || routing == null) return "⚠ " + fileName + " — leitura inválida.";

        String category = r.optString("category", "desconhecido");
        String target = routing.optString("target", "Revisar");
        int confidence = (int) Math.round(r.optDouble("confidence", 0) * 100);
        boolean ready = routing.optBoolean("readyToLaunch", false);

        StringBuilder b = new StringBuilder();
        b.append("📄 ").append(fileName).append("\n");
        b.append("→ ").append(categoryLabel(category)).append(" • ").append(target)
                .append(" • confiança ").append(confidence).append("%");

        ArrayList<String> details = new ArrayList<>();
        addDetail(details, "Data", jsonText(r, "date"));
        addDetail(details, "Motorista", firstNonEmpty(jsonText(r, "driver_name"), jsonText(r, "recipient_name")));
        String plates = firstNonEmpty(jsonText(r, "tractor_plate"), jsonText(r, "trailer_plate"));
        addDetail(details, "Placa", plates);

        if ("abastecimento".equals(category)) {
            addNumberDetail(details, "Litros", r, "liters", " L", 3);
            addMoneyDetail(details, "Preço/L", r, "price_per_liter");
            addMoneyDetail(details, "Total", r, "amount_total");
            addDetail(details, "Posto", firstNonEmpty(jsonText(r, "station"), jsonText(r, "supplier")));
        } else if ("viagem".equals(category)) {
            addDetail(details, "Ticket", jsonText(r, "ticket_number"));
            if (!r.isNull("net_weight_kg")) {
                double tons = r.optDouble("net_weight_kg", 0) / 1000.0;
                details.add("Peso " + String.format(new Locale("pt", "BR"), "%.3f t", tons));
            }
            addDetail(details, "Cliente", jsonText(r, "client"));
            addDetail(details, "Origem", jsonText(r, "origin"));
            addDetail(details, "Destino", jsonText(r, "destination"));
        } else {
            addMoneyDetail(details, "Valor", r, "amount_total");
            addDetail(details, "Fornecedor", jsonText(r, "supplier"));
            addDetail(details, "Descrição", jsonText(r, "description"));
        }

        if (!details.isEmpty()) b.append("\n").append(String.join(" • ", details));

        JSONArray missing = routing.optJSONArray("missingFields");
        if (ready) {
            b.append("\n✅ Dados suficientes para o lançamento no módulo indicado.");
        } else if (missing != null && missing.length() > 0) {
            ArrayList<String> fields = new ArrayList<>();
            for (int i = 0; i < missing.length(); i++) fields.add(missing.optString(i));
            b.append("\n⚠ Revisar antes de lançar. Falta: ").append(String.join(", ", fields)).append(".");
        } else {
            b.append("\n⚠ Revisar antes de lançar.");
        }
        return b.toString();
    }

    private String categoryLabel(String category) {
        if ("viagem".equals(category)) return "Viagem";
        if ("abastecimento".equals(category)) return "Abastecimento";
        if ("adiantamento".equals(category)) return "Adiantamento";
        if ("mecanica".equals(category)) return "Mecânica";
        if ("despesa".equals(category)) return "Despesa";
        return "Revisar";
    }

    private String jsonText(JSONObject object, String key) {
        if (object == null || object.isNull(key)) return "";
        String value = object.optString(key, "").trim();
        return "null".equalsIgnoreCase(value) ? "" : value;
    }

    private String firstNonEmpty(String a, String b) {
        return a != null && !a.trim().isEmpty() ? a.trim() : (b == null ? "" : b.trim());
    }

    private void addDetail(List<String> rows, String label, String value) {
        if (value != null && !value.trim().isEmpty()) rows.add(label + " " + value.trim());
    }

    private void addMoneyDetail(List<String> rows, String label, JSONObject object, String key) {
        if (object == null || object.isNull(key)) return;
        double value = object.optDouble(key, Double.NaN);
        if (!Double.isNaN(value) && value > 0) {
            rows.add(label + " " + String.format(new Locale("pt", "BR"), "R$ %.2f", value));
        }
    }

    private void addNumberDetail(List<String> rows, String label, JSONObject object, String key, String suffix, int decimals) {
        if (object == null || object.isNull(key)) return;
        double value = object.optDouble(key, Double.NaN);
        if (!Double.isNaN(value) && value > 0) {
            String format = decimals == 3 ? "%.3f" : "%.2f";
            rows.add(label + " " + String.format(new Locale("pt", "BR"), format, value) + suffix);
        }
    }

    private String safeArchiveError(Exception error) {
        String m = error == null ? "" : error.getMessage();
        return m == null || m.trim().isEmpty() ? "não foi possível analisar este arquivo" : m;
    }

    private static class PreparedImage {
        final String mime;
        final String base64;

        PreparedImage(String mime, String base64) {
            this.mime = mime;
            this.base64 = base64;
        }
    }

    private void configureWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " SalomaoAssistant/5.3.2");
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
                        if (!showingSite && !asking) status.setText("Online • Conectado ao Trans Salomão");
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
        v.setText(formatChatText(content));
        v.setTextSize(14.5f);
        v.setTextColor(0xFFE9EDEF);
        v.setLineSpacing(0, 1.12f);
        v.setPadding(dp(12), dp(9), dp(12), dp(9));

        boolean user = "user".equals(role);
        v.setBackground(roundRect(user ? 0xFF005C4B : 0xFF202C33, dp(14)));

        int maxWidth = (int) (getResources().getDisplayMetrics().widthPixels * (user ? 0.82f : 0.90f));
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                maxWidth,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        p.gravity = user ? Gravity.END : Gravity.START;
        p.setMargins(user ? dp(42) : dp(2), dp(4), user ? dp(2) : dp(30), dp(4));
        v.setLayoutParams(p);
        v.setTextIsSelectable(true);
        return v;
    }

    private CharSequence formatChatText(String content) {
        String source = content == null ? "" : content;
        ArrayList<int[]> boldRanges = new ArrayList<>();
        StringBuilder clean = new StringBuilder();
        int cursor = 0;
        while (cursor < source.length()) {
            int open = source.indexOf("**", cursor);
            if (open < 0) {
                clean.append(source.substring(cursor));
                break;
            }
            clean.append(source.substring(cursor, open));
            int close = source.indexOf("**", open + 2);
            if (close < 0) {
                clean.append(source.substring(open));
                break;
            }
            int start = clean.length();
            clean.append(source, open + 2, close);
            boldRanges.add(new int[]{start, clean.length()});
            cursor = close + 2;
        }

        android.text.SpannableString styled = new android.text.SpannableString(clean.toString());
        for (int[] range : boldRanges) {
            if (range[0] < range[1]) {
                styled.setSpan(
                        new android.text.style.StyleSpan(Typeface.BOLD),
                        range[0],
                        range[1],
                        android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            }
        }
        return styled;
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
        status.setText("Site aberto • conectado ao Trans Salomão");
    }

    private void setTabVisuals() {
        if (chatButton == null || siteButton == null) return;
        chatButton.setBackground(roundRectStroke(!showingSite ? 0xFF005C4B : 0xFF202C33,
                !showingSite ? 0xFF00A884 : 0xFF2A3942, dp(18), dp(1)));
        siteButton.setBackground(roundRectStroke(showingSite ? 0xFF005C4B : 0xFF202C33,
                showingSite ? 0xFF00A884 : 0xFF2A3942, dp(18), dp(1)));
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
            @Override public void onError(int error) {
                listening = false;
                micButton.setText("🎤");
                WakeListenerService.resumeAfterManualVoice(MainActivity.this);
                if (!asking) status.setText("Não entendi. Tente de novo.");
            }
            @Override public void onResults(Bundle results) {
                listening = false;
                micButton.setText("🎤");
                handler.postDelayed(() -> WakeListenerService.resumeAfterManualVoice(MainActivity.this), 1800);
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
            WakeListenerService.resumeAfterManualVoice(this);
        } else {
            startListening();
        }
    }

    private void startListening() {
        if (speechRecognizer == null || listening) return;
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, AUDIO_PERMISSION_REQUEST);
            return;
        }

        // O 24/7 e o botão manual não podem segurar o microfone ao mesmo tempo.
        WakeListenerService.pauseForManualVoice(this);
        status.setText("Preparando microfone…");

        handler.postDelayed(() -> {
            if (speechRecognizer == null || listening) return;
            try {
                speechRecognizer.startListening(recognizerIntent);
            } catch (Exception e) {
                WakeListenerService.resumeAfterManualVoice(this);
                status.setText("Não consegui iniciar o microfone.");
            }
        }, WakeListenerService.isEnabled(this) ? 650 : 50);
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
        // Um toque no mesmo botão desliga o modo 24/7.
        if (WakeListenerService.isEnabled(this)) {
            WakeListenerService.stop(this);
            handler.postDelayed(this::updateAssistantState, 300);
            status.setText("24/7 desativado");
            Toast.makeText(this, "Escuta em segundo plano desativada.", Toast.LENGTH_SHORT).show();
            return;
        }

        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            WakeListenerService.setEnabled(this, true);
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, AUDIO_PERMISSION_REQUEST);
            return;
        }

        if (android.os.Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);
        }

        if (isAssistantActive()) {
            WakeListenerService.start(this);
            handler.postDelayed(this::updateAssistantState, 250);
            status.setText("24/7 ativo");
            Toast.makeText(this,
                    "Salomão 24/7 ativado. Toque novamente em 24/7 para desligar.",
                    Toast.LENGTH_LONG).show();
            return;
        }

        WakeListenerService.setEnabled(this, true);
        new AlertDialog.Builder(this)
                .setTitle("Ativar Salomão 24/7")
                .setMessage("Escolha Salomão IA como assistente digital padrão. Depois volte ao app e toque em 24/7. Para desligar, basta tocar no mesmo botão novamente.")
                .setNegativeButton("Cancelar", (d, w) -> WakeListenerService.setEnabled(this, false))
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
        if (tts != null && speechReady) tts.speak(spoken, TextToSpeech.QUEUE_FLUSH, null, "salomao-v532");
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
