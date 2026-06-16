package com.aimediatank.app;

import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.capacitor.voipcalls.AndroidAudioCleanup;
import com.capacitor.voipcalls.CallScreenPresentation;
import com.capacitor.voipcalls.CallVolumeState;
import com.capacitor.voipcalls.VoipConnectionService;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "AiMediaTank";
    private static final int CHROME_COLOR = Color.parseColor("#0a0a0b");

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applySystemBars();
        syncIncomingCallPresentation(getIntent());
        registerVoipPhoneAccountSafely();
    }

    @Override
    public void onResume() {
        super.onResume();
        applySystemBars();
        syncIncomingCallPresentation(getIntent());
        setVolumeControlStream(activeCallVolumeStream());
        AndroidAudioCleanup.resetIfIdle(this);
    }

    @Override
    public void onPause() {
        AndroidAudioCleanup.resetIfIdle(this);
        syncIncomingCallPresentation(getIntent());
        super.onPause();
    }

    private int activeCallVolumeStream() {
        if (CallVolumeState.voiceCallActive) {
            return AudioManager.STREAM_MUSIC;
        }
        if (CallVolumeState.ringActive) {
            return AudioManager.STREAM_RING;
        }
        return AudioManager.USE_DEFAULT_STREAM_TYPE;
    }

    /** During call/ring: hardware keys adjust the stream used for that audio. */
    private boolean adjustCallVolume(int keyCode) {
        if (!CallVolumeState.shouldAdjustMediaVolume()) {
            return false;
        }
        if (keyCode != KeyEvent.KEYCODE_VOLUME_UP && keyCode != KeyEvent.KEYCODE_VOLUME_DOWN) {
            return false;
        }
        int stream = activeCallVolumeStream();
        if (stream == AudioManager.USE_DEFAULT_STREAM_TYPE) {
            return false;
        }
        AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        int direction = keyCode == KeyEvent.KEYCODE_VOLUME_UP
            ? AudioManager.ADJUST_RAISE
            : AudioManager.ADJUST_LOWER;
        setVolumeControlStream(stream);
        am.adjustStreamVolume(stream, direction, AudioManager.FLAG_SHOW_UI);
        return true;
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_DOWN && adjustCallVolume(event.getKeyCode())) {
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    /** Black system bars; light (gray/white) status + nav icons on dark backgrounds. */
    private void applySystemBars() {
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, true);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            window.setStatusBarColor(CHROME_COLOR);
            window.setNavigationBarColor(CHROME_COLOR);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setNavigationBarContrastEnforced(true);
            window.setStatusBarContrastEnforced(true);
        }

        View decor = window.getDecorView();
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decor);
        if (controller != null) {
            controller.setAppearanceLightStatusBars(false);
            controller.setAppearanceLightNavigationBars(false);
            return;
        }

        int flags = decor.getSystemUiVisibility();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        decor.setSystemUiVisibility(flags);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        syncIncomingCallPresentation(intent);
    }

    private void syncIncomingCallPresentation(Intent intent) {
        if (CallVolumeState.shouldAdjustMediaVolume()) {
            applyActiveCallPresentation();
            return;
        }
        if (isVoiceIncomingIntent(intent)) {
            clearVoiceIncomingFromIntent();
        }
        CallScreenPresentation.clearIfIdle(this);
    }

    /** Lock-screen incoming UI while ringing — screen-on is handled in JS via wakeLock during calls. */
    private void applyActiveCallPresentation() {
        if (CallVolumeState.ringActive && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
    }

    /** Drop consumed voiceIncoming params so resume does not re-apply keep-screen-on. */
    private void clearVoiceIncomingFromIntent() {
        Intent current = getIntent();
        if (current == null) {
            return;
        }
        Uri data = current.getData();
        if (data == null || !"1".equals(data.getQueryParameter("voiceIncoming"))) {
            return;
        }
        Uri.Builder builder = data.buildUpon().clearQuery();
        for (String name : data.getQueryParameterNames()) {
            if ("voiceIncoming".equals(name) || "voiceAction".equals(name) || "callId".equals(name)) {
                continue;
            }
            String value = data.getQueryParameter(name);
            if (value != null) {
                builder.appendQueryParameter(name, value);
            }
        }
        Intent cleaned = new Intent(current);
        cleaned.setData(builder.build());
        setIntent(cleaned);
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
