package com.aimediatank.app;

import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import com.capacitor.voipcalls.VoipConnectionService;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "AiMediaTank";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applySystemBars();
        applyIncomingCallPresentation(getIntent());
        registerVoipPhoneAccountSafely();
    }

    /** Keep status bar visible (time, network, battery) and match app chrome colors. */
    private void applySystemBars() {
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, true);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            int background = Color.parseColor("#0a0a0b");
            window.setStatusBarColor(background);
            window.setNavigationBarColor(background);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setNavigationBarContrastEnforced(false);
        }

        View decor = window.getDecorView();
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
