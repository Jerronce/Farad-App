@echo off
"C:\\android-sdk-temp\\cmake\\3.22.1\\bin\\cmake.exe" ^
  "-HC:\\Users\\Jeremiah Adedurin\\OneDrive - University of the People\\Documents\\Farad-App-main\\.tooling\\flutter\\packages\\flutter_tools\\gradle\\src\\main\\groovy" ^
  "-DCMAKE_SYSTEM_NAME=Android" ^
  "-DCMAKE_EXPORT_COMPILE_COMMANDS=ON" ^
  "-DCMAKE_SYSTEM_VERSION=23" ^
  "-DANDROID_PLATFORM=android-23" ^
  "-DANDROID_ABI=x86" ^
  "-DCMAKE_ANDROID_ARCH_ABI=x86" ^
  "-DANDROID_NDK=C:\\android-sdk-temp\\ndk\\27.0.12077973" ^
  "-DCMAKE_ANDROID_NDK=C:\\android-sdk-temp\\ndk\\27.0.12077973" ^
  "-DCMAKE_TOOLCHAIN_FILE=C:\\android-sdk-temp\\ndk\\27.0.12077973\\build\\cmake\\android.toolchain.cmake" ^
  "-DCMAKE_MAKE_PROGRAM=C:\\android-sdk-temp\\cmake\\3.22.1\\bin\\ninja.exe" ^
  "-DCMAKE_LIBRARY_OUTPUT_DIRECTORY=C:\\Users\\Jeremiah Adedurin\\OneDrive - University of the People\\Documents\\Farad-App-main\\android\\app\\build\\intermediates\\cxx\\RelWithDebInfo\\53w6v4g5\\obj\\x86" ^
  "-DCMAKE_RUNTIME_OUTPUT_DIRECTORY=C:\\Users\\Jeremiah Adedurin\\OneDrive - University of the People\\Documents\\Farad-App-main\\android\\app\\build\\intermediates\\cxx\\RelWithDebInfo\\53w6v4g5\\obj\\x86" ^
  "-DCMAKE_BUILD_TYPE=RelWithDebInfo" ^
  "-BC:\\Users\\Jeremiah Adedurin\\OneDrive - University of the People\\Documents\\Farad-App-main\\android\\app\\.cxx\\RelWithDebInfo\\53w6v4g5\\x86" ^
  -GNinja ^
  -Wno-dev ^
  --no-warn-unused-cli
