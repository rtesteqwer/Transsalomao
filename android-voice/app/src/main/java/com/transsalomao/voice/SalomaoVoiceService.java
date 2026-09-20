package com.transsalomao.voice;

import android.Manifest;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.service.voice.VoiceInteractionService;

import java.lang.ref.WeakReference;

public class SalomaoVoiceService extends VoiceInteractionService {
    private static WeakReference<SalomaoVoiceService> current = new WeakReference<>(null);

    @Override
    public void onReady() {
        super.onReady();
        current = new WeakReference<>(this);
        if (!isActiveService(this, new ComponentName(this, SalomaoVoiceService.class))) return;

        // Se o usuário já ativou o modo 24/7, o próprio assistente do sistema
        // retoma o listener depois que o Android restaura o VoiceInteractionService.
        if (WakeListenerService.isEnabled(this)
                && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            WakeListenerService.start(this);
        }
    }

    public static void dispatchWake(Context context, String command) {
        SalomaoVoiceService service = current.get();
        Bundle args = new Bundle();
        args.putBoolean("assistant_wake", true);
        if (command != null && !command.trim().isEmpty()) {
            args.putString("assistant_command", command.trim());
        }

        if (service != null) {
            try {
                if (isActiveService(service, new ComponentName(service, SalomaoVoiceService.class))) {
                    service.showSession(args, 0);
                    return;
                }
            } catch (Exception ignored) {}
        }

        // Fallback para aparelhos/OEMs que atrasem a recriação do serviço de voz.
        Intent intent = new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra("assistant_wake", true);
        if (command != null && !command.trim().isEmpty()) {
            intent.putExtra("assistant_command", command.trim());
        }
        try { context.startActivity(intent); } catch (Exception ignored) {}
    }

    @Override
    public void onLaunchVoiceAssistFromKeyguard() {
        Bundle args = new Bundle();
        args.putBoolean("assistant_wake", true);
        try { showSession(args, 0); } catch (Exception ignored) {}
    }

    @Override
    public void onShutdown() {
        SalomaoVoiceService instance = current.get();
        if (instance == this) current.clear();

        // Se deixamos de ser o assistente padrão, encerramos a captura de microfone.
        if (!isActiveService(this, new ComponentName(this, SalomaoVoiceService.class))) {
            WakeListenerService.stop(this);
        }
        super.onShutdown();
    }

    @Override
    public void onDestroy() {
        SalomaoVoiceService instance = current.get();
        if (instance == this) current.clear();
        super.onDestroy();
    }
}
