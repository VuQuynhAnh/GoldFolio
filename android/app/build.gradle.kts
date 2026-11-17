plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Khoá ký cố định lấy từ biến môi trường (GitHub Secrets) để bản mới cài đè được bản cũ.
// Không có thì ký bằng khoá debug: cài được, nhưng mỗi lần cập nhật phải gỡ app cũ trước.
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
