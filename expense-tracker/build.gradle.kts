// Top-level build file
plugins {
    id("com.android.application") version "8.2.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.22" apply false
    // KSP для кодогенерації Room
    id("com.google.devtools.ksp") version "1.9.22-1.0.17" apply false
    // Серіалізація маршрутів Type-Safe Navigation
    id("org.jetbrains.kotlin.plugin.serialization") version "1.9.22" apply false
}
