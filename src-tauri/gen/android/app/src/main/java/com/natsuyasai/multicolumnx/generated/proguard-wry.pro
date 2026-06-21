# THIS FILE IS AUTO-GENERATED. DO NOT MODIFY!!

# Copyright 2020-2023 Tauri Programme within The Commons Conservancy
# SPDX-License-Identifier: Apache-2.0
# SPDX-License-Identifier: MIT

-keep class com.natsuyasai.multicolumnx.* {
  native <methods>;
}

-keep class com.natsuyasai.multicolumnx.WryActivity {
  public <init>(...);

  void setWebView(com.natsuyasai.multicolumnx.RustWebView);
  java.lang.Class getAppClass(...);
  java.lang.String getVersion();
  int startActivity(...);
}

-keep class com.natsuyasai.multicolumnx.Ipc {
  public <init>(...);

  @android.webkit.JavascriptInterface public <methods>;
}

-keep class com.natsuyasai.multicolumnx.RustWebView {
  public <init>(...);

  void loadUrlMainThread(...);
  void loadHTMLMainThread(...);
  void evalScript(...);
}

-keep class com.natsuyasai.multicolumnx.RustWebChromeClient,com.natsuyasai.multicolumnx.RustWebViewClient {
  public <init>(...);
}
