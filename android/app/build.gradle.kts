plugins {
    id("com.android.application")
}

android {
    namespace = "com.transsalomao.fretes"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.transsalomao.fretes"
        minSdk = 23
        targetSdk = 35
        versionCode = 2
        versionName = "1.1"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
