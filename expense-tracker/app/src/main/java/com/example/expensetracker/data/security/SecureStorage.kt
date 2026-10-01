package com.example.expensetracker.data.security

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.security.MessageDigest

/** Зашифроване сховище (AES256-GCM, Android Keystore) для PIN-коду та місячного ліміту бюджету. */
class SecureStorage(context: Context) {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        "expense_secure_prefs",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    private val _budgetLimit = MutableStateFlow(
        prefs.getString(KEY_LIMIT, null)?.toDoubleOrNull() ?: DEFAULT_LIMIT
    )
    val budgetLimit: StateFlow<Double> = _budgetLimit.asStateFlow()

    fun setBudgetLimit(value: Double) {
        prefs.edit().putString(KEY_LIMIT, value.toString()).apply()
        _budgetLimit.value = value
    }

    fun hasPin(): Boolean = prefs.contains(KEY_PIN)

    fun setPin(pin: String) {
        prefs.edit().putString(KEY_PIN, hash(pin)).apply()
    }

    fun verifyPin(pin: String): Boolean = prefs.getString(KEY_PIN, null) == hash(pin)

    fun clearPin() {
        prefs.edit().remove(KEY_PIN).apply()
    }

    private fun hash(pin: String): String =
        MessageDigest.getInstance("SHA-256").digest("expense:$pin".toByteArray())
            .joinToString("") { "%02x".format(it) }

    companion object {
        private const val KEY_LIMIT = "BUDGET_LIMIT"
        private const val KEY_PIN = "PIN_HASH"
        const val DEFAULT_LIMIT = 20_000.0
    }
}
