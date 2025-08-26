// This is the root build.gradle.kts file for the Android part of your Flutter project.

plugins {
    // No plugins are needed here in the root build file for a standard Flutter project.
    // They are defined in the settings.gradle.kts file instead.
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

tasks.register("clean", Delete::class) {
    delete(rootProject.buildDir)
}


tasks.register("clean", Delete::class) {
    delete(rootProject.buildDir)
}
