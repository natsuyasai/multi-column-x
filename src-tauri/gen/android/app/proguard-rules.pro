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

# tao (ndk_glue.rs) が env.call_method() で "getId" を文字列指定して呼び出す WryActivity のプロパティ。
# proguard-wry.pro の WryActivity の -keep ルールに含まれていないため、リリースビルドで
# 難読化されると ndk_glue.rs:393 の unwrap() が JavaException でパニックしてクラッシュする。
-keepclassmembers class com.natsuyasai.multicolumnx.WryActivity {
    public int getId();
    public void setId(int);
}

# Rust (android_bridge.rs) が env.call_method() で文字列指定して呼び出す MainActivity のメソッド群。
# native 宣言ではないため proguard-wry.pro の native <methods> ルールでは保護されず、
# リリースビルドで難読化されると実行時に NoSuchMethodException でクラッシュする。
-keepclassmembers class com.natsuyasai.multicolumnx.MainActivity {
    public void launchAddAccount(java.lang.String);
    public void launchReauthAccount(java.lang.String, java.lang.String);
    public void createColumnWebView(java.lang.String, java.lang.String, int, int, java.lang.String, boolean, java.lang.String);
    public void removeColumnWebView(java.lang.String);
    public void showColumnWebView(java.lang.String, int, int, int, int);
    public void hideColumnWebView(java.lang.String);
    public void evalInColumnWebView(java.lang.String, java.lang.String);
    public void createPopupWebView(java.lang.String, java.lang.String, java.lang.String, java.lang.String);
    public void removePopupWebView(java.lang.String);
    public void hidePopupWebView(java.lang.String);
    public boolean reshowPopupWebView(java.lang.String, java.lang.String);
    public void setAccountCookies(java.lang.String);
    public boolean isWebViewProfileSupported();
    public void launchComposeTweet();
    public void downloadAndInstallApk(java.lang.String, java.lang.String);
    public void saveDownloadedVideo(java.lang.String, java.lang.String, java.lang.String);
    public void notifyVideoDownloadStarted();
    public void notifyVideoDownloadProgress(int, int, long, long);
    public void notifyVideoDownloadFinished();
}

# popup_toolbar.ts が window.__mcxPopupBridge 経由で呼び出す JavascriptInterface メソッド。
# AGP デフォルトの @JavascriptInterface keep ルールに依存せず明示的に保護する。
-keepclassmembers class com.natsuyasai.multicolumnx.PopupSessionBridge {
    @android.webkit.JavascriptInterface <methods>;
}

# video_long_press_menu.ts が window.__mcxVideoDownloadBridge 経由で呼び出す JavascriptInterface メソッド。
# AGP デフォルトの @JavascriptInterface keep ルールに依存せず明示的に保護する。
-keepclassmembers class com.natsuyasai.multicolumnx.VideoDownloadRequestBridge {
    @android.webkit.JavascriptInterface <methods>;
}

# api_rate_limit_monitor.ts が window.__mcxApiRateLimitBridge 経由で呼び出す JavascriptInterface メソッド。
# AGP デフォルトの @JavascriptInterface keep ルールに依存せず明示的に保護する。
-keepclassmembers class com.natsuyasai.multicolumnx.ApiRateLimitBridge {
    @android.webkit.JavascriptInterface <methods>;
}

# wry (main_pipe.rs) が env.call_method() で呼び出す RustWebView のカスタムメソッド。
# proguard-wry.pro に記載がないため難読化されると実行時に NoSuchMethodException でクラッシュする。
-keepclassmembers class com.natsuyasai.multicolumnx.RustWebView {
    public void clearAllBrowsingData();
    public java.lang.String getCookies(java.lang.String);
}