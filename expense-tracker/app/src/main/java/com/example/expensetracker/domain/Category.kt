package com.example.expensetracker.domain

import androidx.compose.ui.graphics.Color

/** Єдине джерело правди для фінансових категорій (назва, емодзі, колір). */
enum class Category(val label: String, val emoji: String, val color: Color) {
    FOOD("Їжа", "🍔", Color(0xFFFF8A65)),
    TRANSPORT("Транспорт", "🚌", Color(0xFF4FC3F7)),
    HOUSING("Житло", "🏠", Color(0xFFBA68C8)),
    ENTERTAINMENT("Розваги", "🎮", Color(0xFFFFD54F)),
    HEALTH("Здоров'я", "💊", Color(0xFF81C784)),
    OTHER("Інше", "📦", Color(0xFF90A4AE));

    companion object {
        fun fromName(name: String?): Category? = entries.firstOrNull { it.name == name }
        fun fromNameOrOther(name: String): Category = fromName(name) ?: OTHER
    }
}
