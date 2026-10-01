package com.example.expensetracker.domain

import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit

/** Розбір суми з поля вводу. Повертає null, якщо сума некоректна або <= 0. */
object AmountParser {
    private const val MAX_AMOUNT = 1_000_000_000.0

    fun parse(text: String): Double? {
        val value = text.trim().replace(',', '.').toDoubleOrNull() ?: return null
        return if (value.isFinite() && value > 0.0 && value < MAX_AMOUNT) value else null
    }

    /** Дозволяє лише цифри та один роздільник з не більше ніж 2 знаками після нього. */
    fun isValidInput(text: String): Boolean = Regex("""^\d{0,9}([.,]\d{0,2})?$""").matches(text)
}

object BalanceCalculator {
    /** Залишок бюджету (може бути від'ємним при перевищенні). */
    fun remaining(limit: Double, spent: Double): Double = limit - spent

    /** Частка витраченого бюджету у діапазоні 0..1. Для нульового ліміту — 0 (або 1, якщо є витрати). */
    fun progress(limit: Double, spent: Double): Float {
        if (limit <= 0.0) return if (spent > 0.0) 1f else 0f
        return (spent / limit).coerceIn(0.0, 1.0).toFloat()
    }
}

object BudgetValidator {
    /** Чи призведе нова витрата до перевищення місячного ліміту. */
    fun exceeds(limit: Double, spent: Double, newAmount: Double): Boolean =
        limit > 0.0 && spent + newAmount > limit
}

object CurrencyConverter {
    /**
     * Конвертує суму з гривень у вибрану валюту за курсом (скільки грн за 1 одиницю валюти).
     * Повертає null, якщо курс невідомий або нульовий/від'ємний.
     */
    fun fromUah(amountUah: Double, currency: Currency, ratesToUah: Map<String, Double>): Double? {
        if (currency == Currency.UAH) return amountUah
        val rate = ratesToUah[currency.code] ?: return null
        if (rate <= 0.0 || !rate.isFinite()) return null
        return amountUah / rate
    }
}

/** Межі поточного місяця у мілісекундах: [start, end). */
data class MonthRange(val start: Long, val end: Long) {
    companion object {
        fun of(nowMillis: Long, zone: ZoneId = ZoneId.systemDefault()): MonthRange {
            val first = Instant.ofEpochMilli(nowMillis).atZone(zone).toLocalDate().withDayOfMonth(1)
            val start = first.atStartOfDay(zone).toInstant().toEpochMilli()
            val end = first.plusMonths(1).atStartOfDay(zone).toInstant().toEpochMilli()
            return MonthRange(start, end)
        }
    }
}

object ReminderTime {
    /** Скільки мілісекунд лишилось до найближчого [hour]:[minute] (завтра, якщо час сьогодні вже минув). */
    fun millisUntilNext(now: LocalDateTime, hour: Int, minute: Int): Long {
        var target = now.toLocalDate().atTime(hour, minute)
        if (!target.isAfter(now)) target = target.plusDays(1)
        return ChronoUnit.MILLIS.between(now, target)
    }

    fun millisUntilNext(hour: Int, minute: Int): Long =
        millisUntilNext(ZonedDateTime.now().toLocalDateTime(), hour, minute)
}
