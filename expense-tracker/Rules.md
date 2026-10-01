# Rules for ExpenseTracker Android Development
1. Мова: Kotlin. UI: ТІЛЬКИ Jetpack Compose + Material 3. Жодного XML layout.
2. Архітектура: MVVM з односпрямованим потоком даних (UDF). Стан UI — через `StateFlow` / sealed `UiState`.
3. Навігація: тільки Type-Safe Navigation Compose 2.8+ з `@Serializable` маршрутами.
4. БД: Room (KSP), реактивні запити повертають `Flow`, записи — `suspend`.
5. Мережа: Retrofit + Gson (API НБУ). Помилки мережі не валять додаток: UI читає кеш з Room (Offline-First, Single Source of Truth).
6. Безпека: PIN-код та ліміт бюджету зберігати ТІЛЬКИ в EncryptedSharedPreferences (AES256-GCM). PIN зберігати як SHA-256 хеш.
7. У Compose спостерігати стан тільки через `collectAsStateWithLifecycle()`.
8. Бізнес-логіка (баланс, конвертація, валідація) — чисті функції в пакеті `domain`, без Android-залежностей.
9. Завжди пиши Unit-тести для кожної ViewModel та domain-логіки, використовуючи MockK + `StandardTestDispatcher`.
10. Обробляй помилки мережі через sealed class UiState.
11. Фінансові категорії та кольори — лише з `Category` (єдине джерело правди).
