plugins {
    id("com.android.application")
}

android {
    namespace = "com.felipe.ia"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.felipe.ia"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "2.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
}
