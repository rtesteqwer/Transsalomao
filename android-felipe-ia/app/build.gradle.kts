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
        versionCode = 3
        versionName = "2.1"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
}
