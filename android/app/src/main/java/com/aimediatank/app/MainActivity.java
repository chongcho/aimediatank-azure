package com.aimediatank.app;

import android.app.ActivityOptions;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.Display;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
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
        if (redirectIfSecondaryDisplay()) {
            return;
        }
        super.onCreate(savedInstanceState);
        applySystemBars();
        syncIncomingCallPresentation(getIntent());
        registerVoipPhoneAccountSafely();
    }

    @Override
    public void onResume() {
        if (redirectIfSecondaryDisplay()) {
            return;
        }
        super.onResume();
        applySystemBars();
        syncIncomingCallPresentation(getIntent());
        setVolumeControlStream(activeCallVolumeStream());
        AndroidAudioCleanup.resetIfIdle(this);
    }

    @Override
    public void onPause() {
        AndroidAudioCleanup.resetIfIdle(this);
        super.onPause();
    }

    private int activeCallVolumeStream() {
        if (CallVolumeState.voiceCallActive) {
            return AudioManager.STREAM_VOICE_CALL;
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

    /** Keep UI on the primary display only (foldables / simulated secondary displays). */
    private boolean redirectIfSecondaryDisplay() {
        Display display = resolveCurrentDisplay();
        if (display == null || display.getDisplayId() == Display.DEFAULT_DISPLAY) {
            return false;
        }
        Log.i(TAG, "Closing secondary display instance (displayId=" + display.getDisplayId() + ')');
        Intent relaunch = new Intent(this, MainActivity.class);
        Intent current = getIntent();
        if (current != null) {
            relaunch.setAction(current.getAction());
            relaunch.setData(current.getData());
            relaunch.putExtras(current);
        }
        relaunch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ActivityOptions options = ActivityOptions.makeBasic();
            options.setLaunchDisplayId(Display.DEFAULT_DISPLAY);
            startActivity(relaunch, options.toBundle());
        } else {
            startActivity(relaunch);
        }
        finishAndRemoveTask();
        return true;
    }

    private Display resolveCurrentDisplay() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return getDisplay();
        }
        Window window = getWindow();
        if (window == null) {
            return null;
        }
        View decor = window.getDecorView();
        return decor != null ? decor.getDisplay() : null;
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
        final boolean activeCallUi = CallVolumeState.shouldAdjustMediaVolume();
        final boolean incomingLaunch = isVoiceIncomingIntent(intent);

        if (activeCallUi || incomingLaunch) {
            applyIncomingCallPresentation();
            return;
        }
        // Stale voiceIncoming deep link after JS consumed the call — do not clear on launch.
        if (isVoiceIncomingIntent(getIntent())) {
            clearVoiceIncomingFromIntent();
        }
        CallScreenPresentation.clearIfIdle(this);
    }

    /** Lock-screen incoming + screen-on while ringing, in a call, or launching from FCM. */
    private void applyIncomingCallPresentation() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
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
