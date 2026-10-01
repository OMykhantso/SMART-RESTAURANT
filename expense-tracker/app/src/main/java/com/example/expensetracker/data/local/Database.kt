package com.example.expensetracker.data.local

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Delete
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "expenses")
data class ExpenseEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val amount: Double,
    val category: String,
    val timestamp: Long,
    val note: String = ""
)

/** Результат агрегації: сума витрат за категорією. */
data class CategoryTotal(val category: String, val total: Double)

@Entity(tableName = "currency_rates")
data class RateEntity(
    @PrimaryKey val code: String,
    val rateToUah: Double,
    val exchangeDate: String,
    val updatedAt: Long
)

@Dao
interface ExpenseDao {
    @Query(
        "SELECT * FROM expenses WHERE (:category IS NULL OR category = :category) " +
            "ORDER BY timestamp DESC, id DESC"
    )
    fun observeExpenses(category: String?): Flow<List<ExpenseEntity>>

    @Query("SELECT * FROM expenses ORDER BY timestamp DESC, id DESC LIMIT :limit")
    fun observeRecent(limit: Int): Flow<List<ExpenseEntity>>

    @Query("SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE timestamp >= :from AND timestamp < :to")
    fun observeTotal(from: Long, to: Long): Flow<Double>

    /** Агрегація витрат за період із групуванням за категоріями. */
    @Query(
        "SELECT category, SUM(amount) AS total FROM expenses " +
            "WHERE timestamp >= :from AND timestamp < :to GROUP BY category ORDER BY total DESC"
    )
    fun observeCategoryTotals(from: Long, to: Long): Flow<List<CategoryTotal>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(expense: ExpenseEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(expenses: List<ExpenseEntity>)

    @Delete
    suspend fun delete(expense: ExpenseEntity)
}

@Dao
interface RateDao {
    @Query("SELECT * FROM currency_rates")
    fun observeAll(): Flow<List<RateEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(rates: List<RateEntity>)
}

@Database(entities = [ExpenseEntity::class, RateEntity::class], version = 1, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun expenseDao(): ExpenseDao
    abstract fun rateDao(): RateDao
}
