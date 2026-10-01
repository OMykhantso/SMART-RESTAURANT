package com.example.expensetracker

import android.app.Application
import android.content.Context
import androidx.room.Room
import androidx.work.ExistingPeriodicWorkPolicy
import com.example.expensetracker.data.local.AppDatabase
import com.example.expensetracker.data.remote.NetworkClient
import com.example.expensetracker.data.repository.ExpenseRepository
import com.example.expensetracker.data.repository.RatesRepository
import com.example.expensetracker.data.security.SecureStorage
import com.example.expensetracker.work.NotificationHelper
import com.example.expensetracker.work.ReminderScheduler

/** Проста ручна DI: єдине місце створення залежностей. */
class AppContainer(context: Context) {
    private val db = Room.databaseBuilder(context, AppDatabase::class.java, "expenses.db").build()
    val secure = SecureStorage(context)
    val expenses = ExpenseRepository(db.expenseDao())
    val rates = RatesRepository(NetworkClient.api, db.rateDao())
}

class ExpenseTrackerApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        NotificationHelper.createChannel(this)
        ReminderScheduler.schedule(this, ExistingPeriodicWorkPolicy.KEEP)
    }
}
