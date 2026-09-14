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
        versionCode = 4
        versionName = "1.3"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
}
