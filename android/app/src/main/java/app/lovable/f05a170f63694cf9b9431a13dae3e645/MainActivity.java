package app.lovable.f05a170f63694cf9b9431a13dae3e645;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import app.lovable.f05a170f63694cf9b9431a13dae3e645.guardian.GuardianPlugin;
import app.lovable.f05a170f63694cf9b9431a13dae3e645.antitheft.AntiTheftPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GuardianPlugin.class);
        registerPlugin(AntiTheftPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
