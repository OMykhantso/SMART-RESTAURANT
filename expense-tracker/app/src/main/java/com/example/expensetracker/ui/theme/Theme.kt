package com.example.expensetracker.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkColors = darkColorScheme(
    primary = Color(0xFF4ADE80),
    onPrimary = Color(0xFF00391A),
    primaryContainer = Color(0xFF14532D),
    onPrimaryContainer = Color(0xFFBBF7D0),
    secondary = Color(0xFF7DD3FC),
    background = Color(0xFF0F1512),
    onBackground = Color(0xFFE2E8E4),
    surface = Color(0xFF161D19),
    onSurface = Color(0xFFE2E8E4),
    surfaceVariant = Color(0xFF212B26),
    onSurfaceVariant = Color(0xFFA7B5AD),
    error = Color(0xFFFF6B6B)
)

private val LightColors = lightColorScheme(
    primary = Color(0xFF16A34A),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFBBF7D0),
    onPrimaryContainer = Color(0xFF052E16),
    secondary = Color(0xFF0369A1),
    background = Color(0xFFF6FAF7),
    surface = Color.White,
    surfaceVariant = Color(0xFFE5EEE8),
    error = Color(0xFFDC2626)
)

@Composable
fun ExpenseTrackerTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (dark) DarkColors else LightColors, content = content)
}
