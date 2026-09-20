package com.transsalomao.voice;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.service.voice.VoiceInteractionSession;

public class AssistantSession extends VoiceInteractionSession {
    public AssistantSession(Context context) {
        super(context);
    }

    @Override
    public void onShow(Bundle args, int showFlags) {
        super.onShow(args, showFlags);
        Intent intent = new Intent(getContext(), MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (args != null) {
            intent.putExtra("assistant_wake", args.getBoolean("assistant_wake", true));
            String command = args.getString("assistant_command");
            if (command != null) intent.putExtra("assistant_command", command);
        } else {
            intent.putExtra("assistant_wake", true);
        }
        try {
            startVoiceActivity(intent);
        } catch (Exception e) {
            getContext().startActivity(intent);
        }
        finish();
    }
}
