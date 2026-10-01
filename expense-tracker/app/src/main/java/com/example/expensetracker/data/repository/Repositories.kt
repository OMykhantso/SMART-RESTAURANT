package com.example.expensetracker.data.repository

import com.example.expensetracker.data.local.CategoryTotal
import com.example.expensetracker.data.local.ExpenseDao
import com.example.expensetracker.data.local.ExpenseEntity
import com.example.expensetracker.data.local.RateDao
import com.example.expensetracker.data.remote.NbuApi
import com.example.expensetracker.domain.Currency
import com.example.expensetracker.domain.MonthRange
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import com.example.expensetracker.data.local.RateEntity

class ExpenseRepository(
    private val dao: ExpenseDao,
    private val clock: () -> Long = System::currentTimeMillis
) {
    fun observeExpenses(category: String?): Flow<List<ExpenseEntity>> = dao.observeExpenses(category)

    fun observeRecent(limit: Int): Flow<List<ExpenseEntity>> = dao.observeRecent(limit)

    fun observeMonthTotal(): Flow<Double> {
        val range = MonthRange.of(clock())
        return dao.observeTotal(range.start, range.end)
    }

    fun observeMonthCategoryTotals(): Flow<List<CategoryTotal>> {
        val range = MonthRange.of(clock())
        return dao.observeCategoryTotals(range.start, range.end)
    }

    suspend fun add(amount: Double, category: String, note: String) {
        dao.insert(ExpenseEntity(amount = amount, category = category, timestamp = clock(), note = note.trim()))
    }

    suspend fun addAll(items: List<ExpenseEntity>) = dao.insertAll(items)

    suspend fun delete(expense: ExpenseEntity) = dao.delete(expense)
}

/** Offline-First: UI читає курси лише з Room, мережа лише оновлює кеш. */
class RatesRepository(
    private val api: NbuApi,
    private val dao: RateDao,
    private val clock: () -> Long = System::currentTimeMillis
) {
    val rates: Flow<List<RateEntity>> = dao.observeAll()

    val ratesMap: Flow<Map<String, Double>> = rates.map { list -> list.associate { it.code to it.rateToUah } }

    /** @return true, якщо курси оновлено; false — мережа недоступна, лишається кеш. */
    suspend fun refresh(): Boolean = try {
        val fresh = listOf(Currency.USD, Currency.EUR).mapNotNull { currency ->
            api.getRate(currency.code).firstOrNull()?.takeIf { it.rate > 0 }?.let {
                RateEntity(currency.code, it.rate, it.exchangedate, clock())
            }
        }
        if (fresh.isNotEmpty()) dao.upsertAll(fresh)
        fresh.isNotEmpty()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        false
    }
}
