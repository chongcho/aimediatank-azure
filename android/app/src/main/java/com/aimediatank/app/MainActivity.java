package com.aimediatank.app;

import android.os.Bundle;
import com.capacitor.voipcalls.VoipConnectionService;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        VoipConnectionService.Companion.registerPhoneAccount(this);
    }
}
