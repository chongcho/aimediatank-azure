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
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.capacitor.voipcalls.AndroidAudioCleanup;
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
        if (CallVolumeState.shouldAdjustMediaVolume()) {
            setVolumeControlStream(AudioManager.STREAM_MUSIC);
        } else {
            setVolumeControlStream(AudioManager.USE_DEFAULT_STREAM_TYPE);
        }
        AndroidAudioCleanup.resetIfIdle(this);
    }

    @Override
    public void onPause() {
        AndroidAudioCleanup.resetIfIdle(this);
        super.onPause();
    }

    /** During call/ring only: hardware keys adjust media volume for WebView WebRTC. */
    private boolean adjustVoiceMediaVolume(int keyCode) {
        if (!CallVolumeState.shouldAdjustMediaVolume()) {
            return false;
        }
        if (keyCode != KeyEvent.KEYCODE_VOLUME_UP && keyCode != KeyEvent.KEYCODE_VOLUME_DOWN) {
            return false;
        }
        AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        int direction = keyCode == KeyEvent.KEYCODE_VOLUME_UP
            ? AudioManager.ADJUST_RAISE
            : AudioManager.ADJUST_LOWER;
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
        am.adjustStreamVolume(
            AudioManager.STREAM_MUSIC,
            direction,
            AudioManager.FLAG_SHOW_UI
        );
        return true;
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_DOWN && adjustVoiceMediaVolume(event.getKeyCode())) {
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
        // Only keep the screen on during an active ring or call — not from a stale voiceIncoming deep link.
        if (CallVolumeState.shouldAdjustMediaVolume()) {
            applyActiveCallPresentation();
            return;
        }
        if (isVoiceIncomingIntent(intent)) {
            clearVoiceIncomingFromIntent();
        }
        clearIncomingCallPresentation();
    }

    /** Lock-screen incoming UI + screen-on while ringing or in a call. */
    private void applyActiveCallPresentation() {
        if (CallVolumeState.ringActive && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON
        );
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

    private void clearIncomingCallPresentation() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(false);
            setTurnScreenOn(false);
        }
        getWindow().clearFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON
        );
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
