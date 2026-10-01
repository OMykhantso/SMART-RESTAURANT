package com.example.expensetracker.domain

enum class Currency(val code: String, val symbol: String) {
    UAH("UAH", "₴"),
    USD("USD", "$"),
    EUR("EUR", "€")
}
