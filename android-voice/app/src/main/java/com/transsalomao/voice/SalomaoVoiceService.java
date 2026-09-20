package com.transsalomao.voice;

import android.content.ComponentName;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.service.voice.VoiceInteractionService;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Locale;

public class SalomaoVoiceService extends VoiceInteractionService {
    private SpeechRecognizer recognizer;
    private Intent recognizerIntent;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean listening = false;
    private boolean triggered = false;

    @Override
    public void onReady() {
        super.onReady();
        if (!isActiveService(this, new ComponentName(this, SalomaoVoiceService.class))) return;
        prepareRecognizer();
        startWakeListening(500);
    }

    private void prepareRecognizer() {
        if (recognizer != null || !SpeechRecognizer.isRecognitionAvailable(this)) return;
        try {
            if (android.os.Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(this)) {
                recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(this);
            } else {
                recognizer = SpeechRecognizer.createSpeechRecognizer(this);
            }
        } catch (Exception e) {
            recognizer = SpeechRecognizer.createSpeechRecognizer(this);
        }

        recognizerIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pt-BR");
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "pt-BR");
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());

        recognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) { listening = true; triggered = false; }
            @Override public void onBeginningOfSpeech() {}
            @Override public void onRmsChanged(float rmsdB) {}
            @Override public void onBufferReceived(byte[] buffer) {}
            @Override public void onEndOfSpeech() {}

            @Override public void onError(int error) {
                listening = false;
                startWakeListening(error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY ? 1500 : 650);
            }

            @Override public void onResults(Bundle results) {
                listening = false;
                ArrayList<String> list = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (!triggered && list != null) {
                    for (String text : list) {
                        if (detectWake(text)) break;
                    }
                }
                startWakeListening(triggered ? 3500 : 500);
            }

            @Override public void onPartialResults(Bundle partialResults) {
                if (triggered) return;
                ArrayList<String> list = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (list != null) {
                    for (String text : list) {
                        if (detectWake(text)) {
                            try { recognizer.stopListening(); } catch (Exception ignored) {}
                            break;
                        }
                    }
                }
            }
            @Override public void onEvent(int eventType, Bundle params) {}
        });
    }

    private boolean detectWake(String raw) {
        String n = normalize(raw);
        int pos = n.indexOf("salomao");
        if (pos < 0) return false;
        triggered = true;
        String after = n.substring(pos + "salomao".length()).trim()
                .replaceFirst("^[,.:;!?]+", "").trim();
        Bundle args = new Bundle();
        args.putBoolean("assistant_wake", true);
        if (!after.isEmpty()) args.putString("assistant_command", after);
        try {
            showSession(args, 0);
        } catch (Exception ignored) {}
        return true;
    }

    private void startWakeListening(long delay) {
        handler.postDelayed(() -> {
            if (recognizer == null || listening) return;
            if (!isActiveService(this, new ComponentName(this, SalomaoVoiceService.class))) return;
            try { recognizer.startListening(recognizerIntent); }
            catch (Exception e) { startWakeListening(1500); }
        }, delay);
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
    public void onShutdown() {
        handler.removeCallbacksAndMessages(null);
        if (recognizer != null) {
            try { recognizer.destroy(); } catch (Exception ignored) {}
            recognizer = null;
        }
        super.onShutdown();
    }
}
