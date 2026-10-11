# Supported Environments and Features

Multi Column X supports Windows, Linux, and Android. Because the available features differ by environment, this page summarizes what is supported where.

- ○ … Available
- × … Not available (not supported)
- － … Not needed in that environment, or an equivalent is possible by other means (see the notes)
- △ … Available with some conditions (see the notes)

## Installation and updates

| Feature                            | Windows | Linux | Android | Notes                                                                    |
| ---------------------------------- | :-----: | :---: | :-----: | ------------------------------------------------------------------------ |
| Distribution format                |    ○    |   ○   |    ○    | Windows: `.exe` / Linux: AppImage, deb / Android: `.apk`                 |
| In-app updates of the app itself   |    ○    |   △   |    ○    | On Linux, only the AppImage version. The deb version is updated manually |
| Automatic update check (at launch) |    ○    |   ○   |    ○    | A manual "Check for updates" is also available in all environments       |

See [Installation](./install) and [Updating the App](./update) for details.

## Screen and operation

| Feature                            | Windows | Linux | Android | Notes                                                                                                                                                                              |
| ---------------------------------- | :-----: | :---: | :-----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toolbar / tab bar operation        |    ○    |   ○   |    ○    | On desktop you use the toolbar at the top of the screen; on Android you use the tab bar at the bottom                                                                              |
| Switching and moving columns       |    ○    |   ○   |    ○    | On desktop you use the column list on the toolbar; on Android you switch with tabs                                                                                                 |
| Swipe to switch columns            |   －    |  －   |    ○    | Not needed on desktop, because multiple columns are shown side by side                                                                                                             |
| Keyboard shortcuts                 |    ○    |   ○   |   －    | Not needed on Android, where operation is mainly through the screen                                                                                                                |
| Showing multiple columns at once   |    ○    |   ○   |    ○    | Desktop always shows multiple columns side by side. On Android, wide screens (landscape, tablets, etc.) can show 2 to 6 columns depending on the settings (supported devices only) |
| Reordering columns                 |    ○    |   ○   |    ○    | On desktop, drag on the toolbar; on Android, use ▲ / ▼ on the "Column layout" tab                                                                                                  |
| Collapsing / expanding the toolbar |    ○    |   ○   |   －    | Android has no toolbar (you can open and close the tab bar menu)                                                                                                                   |

## Accounts and columns

| Feature                                              | Windows | Linux | Android | Notes                                      |
| ---------------------------------------------------- | :-----: | :---: | :-----: | ------------------------------------------ |
| Multiple accounts (independent login per account)    |    ○    |   ○   |    ○    | [Accounts](./accounts)                     |
| Showing and auto-reloading multiple columns at once  |    ○    |   ○   |    ○    | [Columns](./columns)                       |
| Per-column settings (muted words, image blur, etc.)  |    ○    |   ○   |    ○    |                                            |
| Grid layout (vertical and horizontal cell placement) |    ○    |   ○   |    ×    | On Android, you can only change the order  |
| Specifying column width (px)                         |    ○    |   ○   |   －    | On Android, columns fit the screen width   |
| External URL columns                                 |    ○    |   ○   |    ○    |                                            |
| Desktop notifications for new posts (column setting) |    ○    |   ○   |    ×    | Notifications are not available on Android |

## Popups and posting

| Feature                            | Windows | Linux | Android | Notes                                                                                                   |
| ---------------------------------- | :-----: | :---: | :-----: | ------------------------------------------------------------------------------------------------------- |
| Popup display of images and videos |    ○    |   ○   |    ○    |                                                                                                         |
| Popup display of any URL           |    ○    |   ○   |    ○    |                                                                                                         |
| Compose post window                |    ○    |   ○   |    ○    |                                                                                                         |
| "Launch the X app to post"         |   －    |  －   |    ○    | Desktop uses the in-app compose screen. On Android, set it with "Posting (Android)" in the app settings |
| Downloading videos                 |    ○    |   ○   |    ○    | On desktop, from the popup toolbar; on Android, from the long-press menu on a video                     |
| Closing popups with the Esc key    |    ○    |   ○   |   －    | Popups in separate windows exist only on desktop (the "Popup windows" setting is also desktop only)     |

## Settings and data

| Feature                                          | Windows | Linux | Android | Notes                                                                                                         |
| ------------------------------------------------ | :-----: | :---: | :-----: | ------------------------------------------------------------------------------------------------------------- |
| App-wide settings (General, Column layout)       |    ○    |   ○   |    ○    | [Settings](./settings)                                                                                        |
| Presets (saving and loading layouts)             |    ○    |   ○   |    ×    |                                                                                                               |
| Browser extensions (Chrome / Edge)               |    ○    |   ×   |    ×    | Windows only                                                                                                  |
| Backup and restore                               |    ○    |   ○   |    ○    | Login information (cookies) is not included                                                                   |
| Video playback settings (VA-API, enabling H.264) |   －    |   ○   |   －    | Linux-specific video decoder settings. Not needed in other environments. A restart is required to take effect |
| API usage monitor                                |    ○    |   ○   |    ○    | On Android, it is shown in the tab bar menu                                                                   |
