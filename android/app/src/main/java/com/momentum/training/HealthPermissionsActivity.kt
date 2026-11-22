package com.momentum.training

import android.app.Activity
import android.app.AlertDialog
import android.os.Bundle

class HealthPermissionsActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AlertDialog.Builder(this)
            .setTitle("Momentum and Health Connect")
            .setMessage(
                "Momentum reads weight, body fat, lean body mass and sleep to show trends alongside your training. " +
                    "When you select Sync now, Momentum copies the records you allow to your signed-in Momentum account. " +
                    "You can revoke access in Health Connect settings. To remove uploaded records, use Reset account in Momentum."
            )
            .setPositiveButton(android.R.string.ok) { _, _ -> finish() }
            .setOnCancelListener { finish() }
            .show()
    }
}
