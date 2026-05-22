buildscript {
  repositories {
    google()
    mavenCentral()
    gradlePluginPortal()
  }
  dependencies {
    classpath("com.android.tools.build:gradle:8.11.0")
    classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.25")
    classpath("org.jlleitschuh.gradle:ktlint-gradle:12.1.2")
  }
}

allprojects {
  repositories {
    google()
    mavenCentral()
  }
}

// ktlint は自プロジェクトの app モジュールのみに適用する
// Tauri が自動生成する generated/ ディレクトリは対象外とする
project(":app") {
  apply(plugin = "org.jlleitschuh.gradle.ktlint")
  configure<org.jlleitschuh.gradle.ktlint.KtlintExtension> {
    filter {
      exclude("**/generated/**")
    }
  }
}

tasks.register("clean").configure {
  delete("build")
}