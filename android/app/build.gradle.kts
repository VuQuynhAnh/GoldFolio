plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Khoá ký cố định (android/release-key.p12, CI tạo một lần, khoá bằng Secret ANDROID_KEYSTORE_PASSWORD)
// để bản mới cài đè được bản cũ. Không có thì ký bằng khoá debug: mỗi bản mới phải gỡ app cũ.
val releaseKeystore = System.getenv("ANDROID_KEYSTORE_FILE")?.let { file(it) }?.takeIf { it.exists() }

android {
    namespace = "app.goldfolio.widget"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.goldfolio.widget"
        minSdk = 26
        targetSdk = 35
        // CI truyền số lần build để mỗi bản mới có versionCode lớn hơn
        versionCode = (System.getenv("VERSION_CODE") ?: "1").toInt()
        versionName = "1.0.${System.getenv("VERSION_CODE") ?: "0"}"
    }

    signingConfigs {
        if (releaseKeystore != null) {
            create("release") {
                storeFile = releaseKeystore
                storeType = "pkcs12"
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (releaseKeystore != null) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}
