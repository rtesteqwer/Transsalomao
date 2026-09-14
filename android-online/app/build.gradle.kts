plugins {
    id("com.android.application")
}

android {
    namespace = "com.transsalomao.online"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.transsalomao.online"
        minSdk = 26
        targetSdk = 35
        versionCode = 6
        versionName = "1.5"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
}
