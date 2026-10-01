package com.example.expensetracker.data.remote

import com.example.expensetracker.BuildConfig
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.GET
import retrofit2.http.Query

/** Відповідь API НБУ: [{"r030":840,"txt":"Долар США","rate":41.2,"cc":"USD","exchangedate":"01.10.2026"}] */
data class NbuRateDto(
    val cc: String,
    val rate: Double,
    val exchangedate: String
)

interface NbuApi {
    @GET("NBUStatService/v1/statdirectory/exchange?json")
    suspend fun getRate(@Query("valcode") code: String): List<NbuRateDto>
}

object NetworkClient {
    val api: NbuApi by lazy {
        val client = OkHttpClient.Builder()
            .apply {
                if (BuildConfig.DEBUG) {
                    addInterceptor(HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC })
                }
            }
            .build()
        Retrofit.Builder()
            .baseUrl("https://bank.gov.ua/")
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(NbuApi::class.java)
    }
}
