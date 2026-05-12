allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

// AGP 8.x namespace workaround: auto-assign namespace for plugins that haven't declared it
subprojects {
    afterEvaluate {
        if (project.hasProperty("android")) {
            try {
                val androidExt = project.extensions.getByName("android")
                if (androidExt is com.android.build.gradle.BaseExtension) {
                    if (androidExt.namespace == null) {
                        androidExt.namespace = "com.example.${project.name.replace("-", "_")}"
                    }
                }
            } catch (_: Exception) {
                // Plugin not using BaseExtension, skip
            }
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}