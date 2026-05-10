# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# Rust (android_bridge.rs) が env.call_method() で文字列指定して呼び出す MainActivity のメソッド群。
# native 宣言ではないため proguard-wry.pro の native <methods> ルールでは保護されず、
# リリースビルドで難読化されると実行時に NoSuchMethodException でクラッシュする。
-keepclassmembers class com.natsuyasai.multicolumnx.MainActivity {
    public void launchAddAccount(java.lang.String);
    public void createColumnWebView(java.lang.String, java.lang.String, int, int, java.lang.String, boolean, java.lang.String);
    public void removeColumnWebView(java.lang.String);
    public void showColumnWebView(java.lang.String, int, int);
    public void hideColumnWebView(java.lang.String);
    public void evalInColumnWebView(java.lang.String, java.lang.String);
    public void createPopupWebView(java.lang.String, java.lang.String, java.lang.String, java.lang.String);
    public void removePopupWebView(java.lang.String);
    public void setAccountCookies(java.lang.String);
}