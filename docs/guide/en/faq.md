# FAQ and Troubleshooting

## Can I use it as a TweetDeck alternative?

Yes. Multi Column X is a **TweetDeck alternative** that shows multiple accounts and columns side by side, like TweetDeck (now X Pro). You can line up Home, Notifications, Search, Lists and more as columns, and set auto-refresh and muted words per column. It is a separate app from TweetDeck / X Pro, so the screens and features are not identical. See [Getting started](./) for details.

## A column is blank or the display is broken

In App settings (`Ctrl+,`) → "General" → "WebView", press **"Recreate all WebViews"** to recreate all columns in turn (your settings are kept). See [App-wide settings](./settings#app-wide-settings) for details. For an individual column, you can also try **⟳ (Reload page)** in the column header.

## I got logged out (the cookie became invalid)

In Manage accounts (`Ctrl+Shift+A`), press **"Re-authenticate"** for the account and log in again. See [Adding an Account](./accounts) for details.

## A warning appears during installation

Multi Column X is not code-signed for the OS, so a warning may appear. In Windows SmartScreen, you can continue with "More info" → "Run anyway". See [Installation](./install) for details.

## Auto-reload does not work or has stopped

Auto-reload is skipped while you are scrolling. You can also enable or disable auto-reload and set its interval for each column. See [Using Columns](./columns#auto-reload) and [Column Settings](./columns#per-column-settings) for details.

## The "API" button on the toolbar is not shown

"Enable the API usage monitor" in the "General" tab of the app settings may be turned off. See [First Launch and Screen Layout](./screen) for details.

## Videos do not play on Linux

The AppImage version does not bundle the H.264 video decoder. In App settings (`Ctrl+,`) → "General" → "Video playback (Linux)", press **"Enable H.264"** to get the required decoder (a restart is required for it to take effect). For the deb version, or if you install the decoder yourself, install your distribution's GStreamer plugins (such as `gstreamer1.0-plugins-bad` and `gstreamer1.0-libav`). See [Settings](./settings) for details.

## The AppImage does not start on Linux

Check that the AppImage has execute permission (`chmod +x MultiColumnX_*.AppImage`). The install script sets the execute permission and registers the app in the application menu in one step. See [Installation](./install#using-the-install-script-appimage) for details.

## I want to update the Linux deb version to a newer version

The deb version does not support in-app updates. Download the new `.deb` and install it over the existing one. See [Updating the App](./update) for details.

## I want to know whether a feature works in my environment

[Supported Environments and Features](./environments) summarizes what is supported on Windows, Linux, and Android.

## The "Extensions" tab is not shown in the settings

Extension management is available on Windows only. It is not shown on Linux or Android. See [Extensions](./settings#extensions-advanced) for details.

## An extension I added does not work

Check that the extension is "Enabled" in the list and that it does not show "Not found". After adding or enabling an extension, all columns are reloaded automatically. Extensions that depend on Chrome-specific features may have some features that do not work. See [Extensions](./settings#extensions-advanced) for details.

## I want to carry my settings over to another device

Export a backup file from the "Backup" tab in the app settings and restore it on the new device. Login information is not included, so add your accounts on the new device first. See [Backup and restore](./settings#backup-and-restore-advanced) for details.

## I dismissed the notification about a new version

You can check manually at any time with **"Check for updates"** in App settings (`Ctrl+,`) → "General" → "About the app". See [Updating the App](./update) for details.
