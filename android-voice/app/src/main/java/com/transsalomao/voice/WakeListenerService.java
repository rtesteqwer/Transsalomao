package com.transsalomao.voice;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Locale;

public class WakeListenerService extends Service {
    public static final String ACTION_START = "com.transsalomao.voice.START_WAKE_LISTENER";
    public static final String ACTION_STOP = "com.transsalomao.voice.STOP_WAKE_LISTENER";
    public static final String ACTION_PAUSE = "com.transsalomao.voice.PAUSE_WAKE_LISTENER";
    public static final String ACTION_RESUME = "com.transsalomao.voice.RESUME_WAKE_LISTENER";
    private static final String CHANNEL_ID = "salomao_wake_listener";
    private static final int NOTIFICATION_ID = 5047;
    private static final String PREFS = "salomao_voice_prefs";
    private static final String KEY_ENABLED = "wake_listener_enabled";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private SpeechRecognizer recognizer;
    private Intent recognizerIntent;
    private boolean listening;
    private boolean triggered;
    private boolean destroyed;
    private boolean suspended;
    private long restartGeneration;
    private static volatile boolean running;

    public static boolean isRunning() {
        return running;
    }

    public static boolean isEnabled(android.content.Context context) {
        return context.getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean(KEY_ENABLED, false);
    }

    public static void setEnabled(android.content.Context context, boolean enabled) {
        context.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(KEY_ENABLED, enabled).apply();
    }

    public static void start(android.content.Context context) {
        if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return;
        setEnabled(context, true);
        Intent i = new Intent(context, WakeListenerService.class).setAction(ACTION_START);
        try {
            if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(i);
            else context.startService(i);
        } catch (Exception ignored) {}
    }

    public static void stop(android.content.Context context) {
        setEnabled(context, false);
        Intent i = new Intent(context, WakeListenerService.class).setAction(ACTION_STOP);
        try { context.startService(i); } catch (Exception ignored) {
            try { context.stopService(new Intent(context, WakeListenerService.class)); } catch (Exception ignored2) {}
        }
    }

    public static void pauseForManualVoice(android.content.Context context) {
        if (!isEnabled(context)) return;
        Intent i = new Intent(context, WakeListenerService.class).setAction(ACTION_PAUSE);
        try { context.startService(i); } catch (Exception ignored) {}
    }

    public static void resumeAfterManualVoice(android.content.Context context) {
        if (!isEnabled(context)) return;
        Intent i = new Intent(context, WakeListenerService.class).setAction(ACTION_RESUME);
        try { context.startService(i); } catch (Exception ignored) {}
    }

    @Override
    public void onCreate() {
        super.onCreate();
        running = true;
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            setEnabled(this, false);
            suspended = true;
            restartGeneration++;
            if (recognizer != null) {
                try { recognizer.cancel(); } catch (Exception ignored) {}
            }
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }

        if (ACTION_PAUSE.equals(action)) {
            suspended = true;
            restartGeneration++;
            listening = false;
            if (recognizer != null) {
                try { recognizer.cancel(); } catch (Exception ignored) {}
            }
            return START_STICKY;
        }

        if (ACTION_RESUME.equals(action)) {
            suspended = false;
            triggered = false;
            listening = false;
            scheduleStart(900);
            return START_STICKY;
        }

        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            setEnabled(this, false);
            stopSelf();
            return START_NOT_STICKY;
        }

        setEnabled(this, true);
        suspended = false;
        startForegroundCompat();
        prepareRecognizer();
        scheduleStart(300);
        return START_STICKY;
    }

    private void startForegroundCompat() {
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private Notification buildNotification() {
        Intent openIntent = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent open = PendingIntent.getActivity(
                this, 1, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent stopIntent = new Intent(this, WakeListenerService.class).setAction(ACTION_STOP);
        PendingIntent stop = PendingIntent.getService(
                this, 2, stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new Notification.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setContentTitle("Salomão IA")
                .setContentText("Escutando “Salomão” em segundo plano")
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(Notification.CATEGORY_SERVICE)
                .setContentIntent(open)
                .addAction(new Notification.Action.Builder(null, "Abrir", open).build())
                .addAction(new Notification.Action.Builder(null, "Parar escuta", stop).build())
                .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Escuta do Salomão IA",
                NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Mantém a palavra-chave “Salomão” disponível em segundo plano.");
        channel.setShowBadge(false);
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.createNotificationChannel(channel);
    }

    private void prepareRecognizer() {
        if (recognizer != null || destroyed || !SpeechRecognizer.isRecognitionAvailable(this)) return;

        try {
            if (Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(this)) {
                recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(this);
            } else {
                recognizer = SpeechRecognizer.createSpeechRecognizer(this);
            }
        } catch (Exception e) {
            try { recognizer = SpeechRecognizer.createSpeechRecognizer(this); }
            catch (Exception ignored) { recognizer = null; }
        }

        if (recognizer == null) return;

        recognizerIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pt-BR");
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "pt-BR");
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 4);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 600000L);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 600000L);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 600000L);

        recognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) {
                listening = true;
                triggered = false;
            }
            @Override public void onBeginningOfSpeech() {}
            @Override public void onRmsChanged(float rmsdB) {}
            @Override public void onBufferReceived(byte[] buffer) {}
            @Override public void onEndOfSpeech() {}

            @Override public void onError(int error) {
                listening = false;
                if (destroyed || suspended || !isEnabled(WakeListenerService.this)) return;
                long delay = error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY ? 1800 : 700;
                scheduleStart(delay);
            }

            @Override public void onResults(Bundle results) {
                listening = false;
                ArrayList<String> list = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (!triggered && list != null) {
                    for (String text : list) {
                        if (detectWake(text)) break;
                    }
                }
                if (!destroyed && !suspended && isEnabled(WakeListenerService.this)) {
                    scheduleStart(triggered ? 3200 : 450);
                }
            }

            @Override public void onPartialResults(Bundle partialResults) {
                if (triggered) return;
                ArrayList<String> list = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (list == null) return;
                for (String text : list) {
                    if (detectWake(text)) {
                        try { recognizer.stopListening(); } catch (Exception ignored) {}
                        break;
                    }
                }
            }

            @Override public void onEvent(int eventType, Bundle params) {}
        });
    }

    private boolean detectWake(String raw) {
        String normalized = normalize(raw);
        int pos = normalized.indexOf("salomao");
        if (pos < 0 || triggered) return false;

        triggered = true;
        listening = false;

        String command = normalized.substring(pos + "salomao".length()).trim()
                .replaceFirst("^[,.:;!?-]+", "").trim();

        SalomaoVoiceService.dispatchWake(this, command);
        return true;
    }

    private void scheduleStart(long delayMs) {
        final long generation = ++restartGeneration;
        handler.postDelayed(() -> {
            if (destroyed || suspended || generation != restartGeneration || !isEnabled(WakeListenerService.this)) return;
            if (recognizer == null) prepareRecognizer();
            if (recognizer == null || listening) return;
            try {
                recognizer.startListening(recognizerIntent);
            } catch (Exception e) {
                listening = false;
                scheduleStart(1800);
            }
        }, delayMs);
    }

    private String normalize(String s) {
        if (s == null) return "";
        return Normalizer.normalize(s, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase(new Locale("pt", "BR"))
                .trim()
                .replaceAll("\\s+", " ");
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // O serviço em primeiro plano continua ativo mesmo quando a interface é removida dos recentes.
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        destroyed = true;
        running = false;
        listening = false;
        handler.removeCallbacksAndMessages(null);
        if (recognizer != null) {
            try { recognizer.cancel(); } catch (Exception ignored) {}
            try { recognizer.destroy(); } catch (Exception ignored) {}
            recognizer = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
