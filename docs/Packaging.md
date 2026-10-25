# Package your application

Build from the repository root after setting your [application identity](AppIdentity.md). The root script builds the frontend and backend together, then compiles a desktop executable with Bun. Windows and Linux are the targets developed and tested by this template.

## Make a build for your own machine

```sh
bun run build --offline
```

With the starter `APP_ID`, the result is `build/astro-desktop.exe` on Windows or `build/astro-desktop` on Linux. Your own id changes that basename. `bundle/` is temporary staging; `build/` contains the distributable files. Both directories are gitignored.

Launch the built executable to try it. On Windows:

```powershell
.\build\astro-desktop.exe
```

On Linux:

```sh
./build/astro-desktop
```

The executable includes the Bun runtime, built Astro assets, and backend worker. The destination machine does not need Bun, Node, the repository, or a separate frontend `dist`. It still needs its system WebView and the desktop dependencies for the native features you use.

## Ship the native files too

An app package includes both the executable and any staged native assets for its target. These must retain their paths relative to the executable. For a Windows x64 offline build with a configured tray icon, the relevant structure is:

```text
build/
  astro-desktop.exe
  webui-windows-msvc-x64/
    webui-2.dll
    ...license files
  native/
    dialogs/win32/x64/
      nfd.dll
      ...license files
    toast/win32/
      ...notification helper files and licenses
    tray/win32/
      icon.ico
```

The tray directory is only needed for a configured icon file; the default Windows system icon and Linux theme names need no file. Linux uses `native/dialogs/linux/x64/libnfd.so` and `webui-linux-gcc-x64/libwebui-2.so` for the equivalent x64 build, plus any configured `native/tray/linux` icon. Linux notifications use the system `notify-send` tool instead of a bundled notification helper.

The build may leave files for several targets in `build/`. Distribute the executable and native directories relevant to the target you are shipping. Preserve included license notices. Test a copied package from another directory so accidental dependencies on your source checkout are exposed.

## Choose first-run download or an offline package

Without `--offline`, WebUI downloads its native library on first launch if missing. That launch needs network access and a writable application directory. With `--offline`, the build downloads the library for the selected target and stages it beside the executable, so WebUI can find it without a runtime download.

An offline build still needs network access while building, and still depends on the destination's OS WebView and system tools. It does not produce an installer for all those operating-system dependencies. Set `WEBUI_RELEASE` to a release tag if you want to select a WebUI archive instead of the default `nightly`.

Native libraries and helper executables are real files because the OS must load or launch them. Frontend assets and the backend worker are embedded. If your app adds another native dependency or runtime data file, explicitly arrange its target-specific distribution rather than relying on a development path inside `node_modules`.

## Build for Windows or Linux from either host

```sh
bun run build --target=bun-windows-x64 --offline
bun run build --target=bun-linux-x64 --offline
```

Explicit targets add a suffix, producing files such as `build/astro-desktop-windows-x64.exe` or `build/astro-desktop-linux-x64`. The build selects the native library for the target, not the machine doing the build.

The builder accepts x64 and ARM64 variants of Windows, Linux (glibc), and macOS. Current native testing focuses on Windows/Linux x64; do not assume a successful cross-compile verifies a target at runtime. The current file-dialog provider supplies FFI libraries for Windows x64 and Linux x64; other Windows/Linux architectures use its platform-script fallback. macOS support remains future work for the newer native components.

## Override a release's metadata

```sh
bun run build --offline --define 'APP_VERSION="1.2.0"'
```

Use the root build command so frontend metadata, client scripts, backend, and executable all receive the same config. [Application identity](AppIdentity.md) lists available overrides and the required JSON quoting.

Windows builds hide the console by default. When diagnosing startup, build with `--console` for an unminified executable with console output:

```sh
bun run build --offline --console
```

## Run on Ubuntu or WSLg

For the explicit Linux x64 target, install these on Ubuntu:

```sh
sudo apt-get install libwebkit2gtk-4.1-0 libnotify-bin zenity libayatana-appindicator3-1 wl-clipboard xsel xdg-utils libglib2.0-bin
```

Then launch the copied package in a graphical session, preserving the native folders described above:

```sh
./build/astro-desktop-linux-x64
```

WSLg provides a display for the WebView, but does not by itself provide a desktop panel or notification server. For notifications in a minimal environment, one option is Dunst:

```sh
sudo apt-get install dunst dbus-x11
dbus-update-activation-environment --systemd DISPLAY WAYLAND_DISPLAY XDG_RUNTIME_DIR
systemctl --user start dunst
```

Pass the display environment in the active WSLg session. If an earlier service launch failed, inspect its logs and reset its failed state before starting it again. The tray still needs a supporting panel/host; without one, the app reports that state and refuses to hide its only window through the tray action.

## Check the result before sharing it

GitHub Actions also produces these packages automatically. See [CI and releases](CI.md) for PR artifacts, testing prereleases from develop, and main releases.

Run `bun run check` during development. To exercise a package on the build host, use `bun run test:package --offline`; it builds, copies the distributable to a temporary directory, launches a real test WebView, and closes it. Cross-compiled executables must be tested on their target OS. A compiled `--smoke-test` argument runs the native integration checks and closes its test window.

Inspect your own branding, window behavior, notification settings, dialogs, and file workflows as well. Installers, code signing, and platform installation/registration are responsibilities of the application you make from this template. See [Contributing](Contributing.md) for all verification commands and details of the supplied tests.

[Documentation home](README.md) · [Application identity](AppIdentity.md)
