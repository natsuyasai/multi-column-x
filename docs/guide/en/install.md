# Installation

Download the latest version from the [latest release page](https://github.com/natsuyasai/multi-column-x/releases/latest) on GitHub. Open **Assets** at the bottom of the page and choose the file for your OS.

> In the file names below, `<version>` is the version number, which changes with each release.

| OS      | File to download (in Assets)                                             |
| ------- | ------------------------------------------------------------------------ |
| Windows | `MultiColumnX_<version>_x64-setup.exe`                                   |
| Linux   | `MultiColumnX_<version>_amd64.AppImage` (recommended) or `..._amd64.deb` |
| Android | `MultiColumnX_<version>_universal.apk`                                   |

> Files ending in `.sig` or `.sha256`, and `latest.json`, are used for app updates and verification. You do not need to download them.

> Multi Column X is not code-signed for any OS, so a warning that the publisher cannot be verified may appear during installation. This is expected. Confirm that the file was downloaded from the official source (GitHub Releases) and continue.

## Windows

1. Download `MultiColumnX_<version>_x64-setup.exe` (the installer) from Assets on the latest release.
2. Double-click it to run.
3. If a **SmartScreen warning** ("Windows protected your PC") appears, click **"More info"** → then click the **"Run anyway"** button to continue the installation.
4. Follow the on-screen instructions to install.

![SmartScreen warning screen](../images/windows-smartscreen-details.png)

_At first only "Don't run" is shown. Click "More info". (The screenshot shows the Japanese UI.)_

![SmartScreen warning screen (with More info expanded)](../images/windows-smartscreen-run.png)

_Once you open "More info", the "Run anyway" button appears. Check the app name and the publisher (unknown publisher), then click "Run anyway". (The screenshot shows the Japanese UI.)_

## Linux

You can use either of the following (the AppImage version can also be installed with the install script; see [below](#using-the-install-script-appimage)).

- **AppImage** (recommended; supports in-app auto-update)
  1. Download `MultiColumnX_<version>_amd64.AppImage` from Assets.
  2. Make it executable: `chmod +x MultiColumnX_*.AppImage`
  3. Launch it by double-clicking it or with `./MultiColumnX_*.AppImage`.
- **deb package** (Debian / Ubuntu family; manual updates)
  1. Download `MultiColumnX_<version>_amd64.deb` from Assets.
  2. Install it with `sudo apt install ./MultiColumnX_*.deb`.

### Using the install script (AppImage)

With `install.sh` from Assets, you can automatically do everything from downloading the AppImage to registering it in the application menu.

- Places the latest AppImage at `~/.local/bin/MultiColumnX.AppImage`.
- Creates an icon and a desktop entry (`~/.local/share/applications/multi-column-x.desktop`) so you can launch the app from the application menu.
- The only command required is `curl`.

**Download and install with a one-liner**

```bash
bash <(curl -fsSL https://github.com/natsuyasai/multi-column-x/releases/latest/download/install.sh)
```

If the app is already installed, you will be asked to confirm overwriting (`y` / `N`). Because the script needs to accept your input, run it in the form above rather than as `curl ... | bash`.

**Save the script and then run it**

1. Download `install.sh` from Assets.
2. Make it executable and run it.

```bash
chmod +x install.sh
./install.sh
```

**Uninstall**

This removes the AppImage, the icon, and the desktop entry.

```bash
./install.sh --uninstall
```

To run it as a one-liner:

```bash
bash <(curl -fsSL https://github.com/natsuyasai/multi-column-x/releases/latest/download/install.sh) --uninstall
```

> If `~/.local/bin` is not in your `PATH`, instructions for adding it are shown when the installation finishes (this does not affect launching from the application menu).
> The AppImage version does not bundle the H.264 codec required for video playback. When the installation finishes, an installation command for your distribution is shown. You can also enable it from the in-app guidance (see "Video playback (Linux)" in [Settings](./settings#app-wide-settings)).

## Android

1. Download `MultiColumnX_<version>_universal.apk` from Assets on the latest release.
2. If you are asked for **"Install unknown apps"** permission during installation, allow installation from this source (your browser or file app) in Settings.
3. Open the APK and install it.
4. If **Google Play Protect** shows "We recommend scanning this app", choose **"Scan app"**, or open **"Details"** and choose **"Install without scanning"** to continue the installation.

![Google Play Protect confirmation screen](../images/android-install-scan.png)

_Because the APK does not come through Google Play, a scan prompt may appear. Tap "Details" to reveal the option to continue. (The screenshot shows the Japanese UI.)_

![Google Play Protect confirmation screen (with Details expanded)](../images/android-install-scan-details.png)

_With "Details" expanded. You can proceed with "Install without scanning". (The screenshot shows the Japanese UI.)_

> The wording and options shown vary depending on your Android version and device.

> For updating the app itself after installation, see [Updating the app](./update).
