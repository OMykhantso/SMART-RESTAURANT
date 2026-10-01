package com.example.expensetracker.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.expensetracker.data.local.CategoryTotal
import com.example.expensetracker.data.local.ExpenseEntity
import com.example.expensetracker.data.repository.ExpenseRepository
import com.example.expensetracker.data.repository.RatesRepository
import com.example.expensetracker.data.security.SecureStorage
import com.example.expensetracker.domain.AmountParser
import com.example.expensetracker.domain.BalanceCalculator
import com.example.expensetracker.domain.BudgetValidator
import com.example.expensetracker.domain.Category
import com.example.expensetracker.domain.Currency
import com.example.expensetracker.domain.CurrencyConverter
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

@Suppress("UNCHECKED_CAST")
fun <T : ViewModel> factoryOf(create: () -> T) = object : ViewModelProvider.Factory {
    override fun <V : ViewModel> create(modelClass: Class<V>): V = create() as V
}

// ---------------------------------------------------------------- Home

sealed interface HomeUiState {
    data object Loading : HomeUiState
    data class Success(
        val spent: Double,
        val limit: Double,
        val remaining: Double,
        val progress: Float,
        val currency: Currency,
        /** Залишок у вибраній валюті; null — курс ще не завантажено (офлайн без кешу). */
        val remainingConverted: Double?,
        val rates: Map<String, Double>,
        val ratesUpdatedAt: Long?,
        val recent: List<ExpenseEntity>
    ) : HomeUiState
}

class HomeViewModel(
    expenses: ExpenseRepository,
    private val rates: RatesRepository,
    secure: SecureStorage
) : ViewModel() {
    private val currency = MutableStateFlow(Currency.UAH)

    val uiState: StateFlow<HomeUiState> = combine(
        expenses.observeMonthTotal(),
        expenses.observeRecent(5),
        secure.budgetLimit,
        rates.rates,
        currency
    ) { spent, recent, limit, rateList, cur ->
        val map = rateList.associate { it.code to it.rateToUah }
        val remaining = BalanceCalculator.remaining(limit, spent)
        HomeUiState.Success(
            spent = spent,
            limit = limit,
            remaining = remaining,
            progress = BalanceCalculator.progress(limit, spent),
            currency = cur,
            remainingConverted = CurrencyConverter.fromUah(remaining, cur, map),
            rates = map,
            ratesUpdatedAt = rateList.maxOfOrNull { it.updatedAt },
            recent = recent
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), HomeUiState.Loading)

    init {
        refreshRates()
    }

    fun selectCurrency(value: Currency) {
        currency.value = value
    }

    fun refreshRates() {
        viewModelScope.launch { rates.refresh() }
    }
}

// ---------------------------------------------------------------- Add expense

data class AddExpenseForm(
    val amount: String = "",
    val category: Category = Category.FOOD,
    val note: String = "",
    val error: String? = null,
    val saved: Boolean = false
)

data class AddExpenseUiState(
    val form: AddExpenseForm = AddExpenseForm(),
    val remaining: Double = 0.0,
    val willExceedBudget: Boolean = false
)

class AddExpenseViewModel(
    private val repository: ExpenseRepository,
    secure: SecureStorage
) : ViewModel() {
    private val form = MutableStateFlow(AddExpenseForm())

    val uiState: StateFlow<AddExpenseUiState> = combine(
        form, repository.observeMonthTotal(), secure.budgetLimit
    ) { f, spent, limit ->
        val amount = AmountParser.parse(f.amount)
        AddExpenseUiState(
            form = f,
            remaining = BalanceCalculator.remaining(limit, spent),
            willExceedBudget = amount != null && BudgetValidator.exceeds(limit, spent, amount)
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), AddExpenseUiState())

    fun onAmountChange(text: String) {
        if (AmountParser.isValidInput(text)) form.update { it.copy(amount = text, error = null) }
    }

    fun onCategoryChange(category: Category) = form.update { it.copy(category = category) }

    fun onNoteChange(note: String) = form.update { it.copy(note = note.take(100)) }

    fun save() {
        val current = form.value
        val amount = AmountParser.parse(current.amount)
        if (amount == null) {
            form.update { it.copy(error = "Введіть суму більше 0") }
            return
        }
        viewModelScope.launch {
            repository.add(amount, current.category.name, current.note)
            form.update { it.copy(saved = true) }
        }
    }
}

// ---------------------------------------------------------------- History / analytics

data class HistoryUiState(
    val category: Category? = null,
    val items: List<ExpenseEntity> = emptyList(),
    val total: Double = 0.0,
    val hasMore: Boolean = false,
    val monthTotals: List<CategoryTotal> = emptyList()
)

class HistoryViewModel(
    private val repository: ExpenseRepository,
    initialCategory: String?
) : ViewModel() {
    private val category = MutableStateFlow(Category.fromName(initialCategory))
    private val visibleCount = MutableStateFlow(PAGE_SIZE)

    @OptIn(ExperimentalCoroutinesApi::class)
    private val expenses = category.flatMapLatest { repository.observeExpenses(it?.name) }

    val uiState: StateFlow<HistoryUiState> = combine(
        category, expenses, visibleCount, repository.observeMonthCategoryTotals()
    ) { cat, all, count, totals ->
        HistoryUiState(
            category = cat,
            items = all.take(count),
            total = all.sumOf { it.amount },
            hasMore = all.size > count,
            monthTotals = totals
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), HistoryUiState())

    fun selectCategory(value: Category?) {
        category.value = value
        visibleCount.value = PAGE_SIZE
    }

    /** Пагінація (Infinite Scroll): підвантажуємо наступну порцію. */
    fun loadMore() = visibleCount.update { it + PAGE_SIZE }

    fun delete(expense: ExpenseEntity) {
        viewModelScope.launch { repository.delete(expense) }
    }

    companion object {
        const val PAGE_SIZE = 20
    }
}

// ---------------------------------------------------------------- Settings

data class SettingsUiState(
    val limit: Double = 0.0,
    val hasPin: Boolean = false,
    val ratesUpdatedAt: Long? = null,
    val message: String? = null
)

class SettingsViewModel(
    private val secure: SecureStorage,
    private val rates: RatesRepository,
    private val expenses: ExpenseRepository
) : ViewModel() {
    private val hasPin = MutableStateFlow(secure.hasPin())
    private val message = MutableStateFlow<String?>(null)

    val uiState: StateFlow<SettingsUiState> = combine(
        secure.budgetLimit, hasPin, rates.rates, message
    ) { limit, pin, rateList, msg ->
        SettingsUiState(limit, pin, rateList.maxOfOrNull { it.updatedAt }, msg)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), SettingsUiState())

    fun saveLimit(text: String) {
        val value = AmountParser.parse(text)
        if (value == null) {
            message.value = "Ліміт має бути більше 0"
        } else {
            secure.setBudgetLimit(value)
            message.value = "Ліміт збережено"
        }
    }

    fun setPin(pin: String) {
        if (pin.length == 4 && pin.all { it.isDigit() }) {
            secure.setPin(pin)
            hasPin.value = true
            message.value = "PIN встановлено"
        } else {
            message.value = "PIN має складатися з 4 цифр"
        }
    }

    fun clearPin() {
        secure.clearPin()
        hasPin.value = false
        message.value = "PIN вимкнено"
    }

    fun refreshRates() {
        viewModelScope.launch {
            message.value = if (rates.refresh()) "Курси оновлено" else "Немає мережі — використано кеш"
        }
    }

    fun seedDemoData() {
        viewModelScope.launch {
            val now = System.currentTimeMillis()
            val day = 24L * 60 * 60 * 1000
            val demo = listOf(
                Triple(Category.FOOD, 245.50, "Продукти"),
                Triple(Category.TRANSPORT, 60.0, "Метро"),
                Triple(Category.HOUSING, 5200.0, "Оренда"),
                Triple(Category.ENTERTAINMENT, 380.0, "Кіно"),
                Triple(Category.HEALTH, 410.0, "Аптека"),
                Triple(Category.FOOD, 129.9, "Кава"),
                Triple(Category.OTHER, 99.0, "Підписка")
            ).mapIndexed { i, (cat, amount, note) ->
                ExpenseEntity(amount = amount, category = cat.name, timestamp = now - i * day / 4, note = note)
            }
            expenses.addAll(demo)
            message.value = "Демо-дані додано"
        }
    }
}
