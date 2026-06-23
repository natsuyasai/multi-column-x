import java.io.FileInputStream
import java.util.Properties

plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
  id("rust")
}

val tauriProperties =
  Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
      propFile.inputStream().use { load(it) }
    }
  }

android {
  compileSdk = 36
  namespace = "com.natsuyasai.multicolumnx"
  defaultConfig {
    manifestPlaceholders["usesCleartextTraffic"] = "false"
    applicationId = "com.natsuyasai.multicolumnx"
    minSdk = 24
    targetSdk = 36
    versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
    versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
  }
  signingConfigs {
    create("release") {
      // keystore.properties は gitignore されており CI/デバッグ環境には存在しない。
      // 無い場合は署名設定を空のままにする（unit test や debug ビルドは署名不要のため
      // 構成時に null キャストで落ちないようにする）。リリース署名は本ファイルが存在する
      // 環境（ローカル/リリースCI でSecretsからキーストアとPropertiesを復元）でのみ適用される。
      val keystorePropertiesFile = rootProject.file("keystore.properties")
      if (keystorePropertiesFile.exists()) {
        val keystoreProperties = Properties()
        keystoreProperties.load(FileInputStream(keystorePropertiesFile))
        keyAlias = keystoreProperties["keyAlias"] as String
        keyPassword = keystoreProperties["password"] as String
        storeFile = file(keystoreProperties["storeFile"] as String)
        storePassword = keystoreProperties["password"] as String
      }
    }
  }
  buildTypes {
    getByName("debug") {
      manifestPlaceholders["usesCleartextTraffic"] = "true"
      isDebuggable = true
      isJniDebuggable = true
      isMinifyEnabled = false
      packaging {
        jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
        jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
        jniLibs.keepDebugSymbols.add("*/x86/*.so")
        jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
      }
    }
    getByName("release") {
      isMinifyEnabled = true
      signingConfig = signingConfigs.getByName("release")
      proguardFiles(
        *fileTree(".") { include("**/*.pro") }
          .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
          .toList().toTypedArray(),
      )
    }
  }
  kotlinOptions {
    jvmTarget = "1.8"
  }
  buildFeatures {
    buildConfig = true
  }
  testOptions {
    // unit test で android.util.Log 等の android.jar スタブを no-op として扱う
    unitTests.isReturnDefaultValues = true
  }
}

rust {
  rootDirRel = "../../../"
}

dependencies {
  implementation("androidx.webkit:webkit:1.14.0")
  implementation("androidx.appcompat:appcompat:1.7.1")
  implementation("androidx.activity:activity-ktx:1.10.1")
  implementation("com.google.android.material:material:1.12.0")
  implementation("androidx.lifecycle:lifecycle-process:2.10.0")
  testImplementation("junit:junit:4.13.2")
  // mockito-kotlin 5.x は JVM 11 ビルドのため、jvmTarget 1.8 と互換の 4.x を使う。
  // mockito-core は Java 21 ランタイム対応のため 5.x へ上書き
  // （5.x は inline mock maker が既定で、MotionEvent 等の final クラスをモックできる）。
  testImplementation("org.mockito.kotlin:mockito-kotlin:4.1.0")
  testImplementation("org.mockito:mockito-core:5.18.0")
  // プロパティベーステスト。kotest 5.x は jvmTarget 1.8 互換。JUnit4 の @Test 内から
  // runBlocking 経由で forAll/checkAll を呼ぶ（kotest のテストランナーは使わない）。
  testImplementation("io.kotest:kotest-property:5.9.1")
  androidTestImplementation("androidx.test.ext:junit:1.1.4")
  androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")