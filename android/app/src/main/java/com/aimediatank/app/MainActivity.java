package com.aimediatank.app;

import android.content.Intent;
import android.graphics.Color;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import com.capacitor.voipcalls.VoipConnectionService;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "AiMediaTank";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applyAppSystemBarColors();
        applyIncomingCallPresentation(getIntent());
        registerVoipPhoneAccountSafely();
    }

    /** Match system navigation/status bars to app background (#0a0a0b). */
    private void applyAppSystemBarColors() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
            return;
        }
        Window window = getWindow();
        int background = Color.parseColor("#0a0a0b");
        window.setNavigationBarColor(background);
        window.setStatusBarColor(background);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setNavigationBarContrastEnforced(false);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            int flags = window.getDecorView().getSystemUiVisibility();
            flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            window.getDecorView().setSystemUiVisibility(flags);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        applyIncomingCallPresentation(intent);
    }

    /** Show incoming-call WebView over lock screen when launched from FCM / ConnectionService. */
    private void applyIncomingCallPresentation(Intent intent) {
        if (!isVoiceIncomingIntent(intent)) {
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON
        );
        boostIncomingCallAudio();
    }

    /** WebView ringtone uses media stream; ConnectionService uses ring stream — lift both for incoming calls. */
    private void boostIncomingCallAudio() {
        AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
        if (am == null) {
            return;
        }
        try {
            am.setMode(AudioManager.MODE_RINGTONE);
            int maxRing = am.getStreamMaxVolume(AudioManager.STREAM_RING);
            if (maxRing > 0) {
                am.setStreamVolume(AudioManager.STREAM_RING, maxRing, 0);
            }
            int maxMedia = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            int targetMedia = (int) Math.ceil(maxMedia * 0.9f);
            if (maxMedia > 0 && am.getStreamVolume(AudioManager.STREAM_MUSIC) < targetMedia) {
                am.setStreamVolume(AudioManager.STREAM_MUSIC, targetMedia, 0);
            }
        } catch (Exception e) {
            Log.w(TAG, "Incoming call audio boost skipped", e);
        }
    }

    private static boolean isVoiceIncomingIntent(Intent intent) {
        if (intent == null) {
            return false;
        }
        Uri data = intent.getData();
        if (data == null) {
            return false;
        }
        return "aimediatank.com".equals(data.getHost())
            && "1".equals(data.getQueryParameter("voiceIncoming"));
    }

    /** ConnectionService account; must not crash app launch if telecom rejects it. */
    private void registerVoipPhoneAccountSafely() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        try {
            VoipConnectionService.Companion.registerPhoneAccount(this);
        } catch (Exception e) {
            Log.w(TAG, "Phone account registration skipped", e);
        }
    }
}
