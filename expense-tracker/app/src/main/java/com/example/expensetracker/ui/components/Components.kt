package com.example.expensetracker.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.background
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import com.example.expensetracker.data.local.CategoryTotal
import com.example.expensetracker.domain.Category
import com.example.expensetracker.domain.Currency
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

object Format {
    private val dateFmt = DateTimeFormatter.ofPattern("dd.MM HH:mm")

    fun money(amount: Double, currency: Currency = Currency.UAH): String =
        String.format(Locale.US, "%,.2f %s", amount, currency.symbol).replace(',', ' ')

    fun date(millis: Long): String =
        dateFmt.format(Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault()))
}

/** Кругова діаграма розподілу витрат за категоріями + легенда. */
@Composable
fun CategoryPieChart(totals: List<CategoryTotal>, modifier: Modifier = Modifier) {
    val sum = totals.sumOf { it.total }
    if (sum <= 0.0) {
        Text("Поки що немає витрат за цей місяць", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = modifier)
        return
    }
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        Canvas(modifier = Modifier.size(140.dp)) {
            val stroke = 28.dp.toPx()
            val inset = stroke / 2
            var start = -90f
            totals.forEach { t ->
                val sweep = (t.total / sum * 360.0).toFloat()
                drawArc(
                    color = Category.fromNameOrOther(t.category).color,
                    startAngle = start,
                    sweepAngle = sweep,
                    useCenter = false,
                    topLeft = Offset(inset, inset),
                    size = Size(size.width - stroke, size.height - stroke),
                    style = Stroke(width = stroke)
                )
                start += sweep
            }
        }
        Spacer(Modifier.width(16.dp))
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            totals.forEach { t ->
                val cat = Category.fromNameOrOther(t.category)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(10.dp).background(cat.color, CircleShape))
                    Text(
                        "  ${cat.label}: ${Format.money(t.total)} (${(t.total / sum * 100).toInt()}%)",
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        }
    }
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(text, style = MaterialTheme.typography.titleMedium, modifier = modifier.padding(vertical = 8.dp))
}
