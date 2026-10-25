import os
import subprocess
import sys
from pathlib import Path

# Always use a private bus, without claiming the real desktop's watcher name.
if os.environ.get("ASTRO_TRAY_TEST_BUS") != "1":
    if len(sys.argv) != 2:
        sys.exit("Usage: python3 tests/fixtures/linux-tray-host.py /path/to/compiled-app")
    executable = str(Path(sys.argv[1]).resolve(strict=True))
    sys.exit(subprocess.call(["dbus-run-session", "--", sys.executable, __file__, executable], env=dict(os.environ, ASTRO_TRAY_TEST_BUS="1")))

import dbus
import dbus.service
from dbus.mainloop.glib import DBusGMainLoop
from gi.repository import GLib

DBusGMainLoop(set_as_default=True)
bus = dbus.SessionBus()
name = dbus.service.BusName("org.kde.StatusNotifierWatcher", bus, do_not_queue=True)
items = []
ready = False
clicked = False
loop = GLib.MainLoop()

class Watcher(dbus.service.Object):
    @dbus.service.method("org.kde.StatusNotifierWatcher", in_signature="s", out_signature="", sender_keyword="sender")
    def RegisterStatusNotifierItem(self, service, sender=None):
        item = (sender, str(service)) if str(service).startswith("/") else (str(service), "/StatusNotifierItem")
        items.append(item)
        print("HOST registered native StatusNotifierItem", item[1], flush=True)
        self.StatusNotifierItemRegistered(item[0] + item[1])

    @dbus.service.method("org.kde.StatusNotifierWatcher", in_signature="s", out_signature="")
    def RegisterStatusNotifierHost(self, service):
        pass

    @dbus.service.method("org.freedesktop.DBus.Properties", in_signature="ss", out_signature="v")
    def Get(self, interface, property):
        return self.GetAll(interface)[property]

    @dbus.service.method("org.freedesktop.DBus.Properties", in_signature="s", out_signature="a{sv}")
    def GetAll(self, interface):
        return {"RegisteredStatusNotifierItems": dbus.Array([n + p for n, p in items], signature="s"), "IsStatusNotifierHostRegistered": dbus.Boolean(True), "ProtocolVersion": dbus.Int32(0)}

    @dbus.service.signal("org.kde.StatusNotifierWatcher", signature="s")
    def StatusNotifierItemRegistered(self, service): pass

watcher = Watcher(bus, "/StatusNotifierWatcher")
daemon_env = dict(os.environ)
daemon_env.pop("WAYLAND_DISPLAY", None)
daemon = subprocess.Popen(["dunst"], env=daemon_env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
env = dict(os.environ, BACKEND_PORT="0", NATIVE_TRAY_TEST="1")
child = subprocess.Popen([sys.argv[1], "--smoke-test"], cwd="/tmp", env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
output = ""

def read_output(fd, condition):
    global ready, output
    chunk = os.read(fd, 65536)
    if chunk:
        output += chunk.decode("utf-8", errors="replace")
        print(chunk.decode("utf-8", errors="replace"), end="", flush=True)
        if "TRAY_MENU_TEST_READY" in output: ready = True
        return True
    return child.poll() is None

def failed(error):
    print("HOST error:", error, flush=True)

def click_menu():
    global clicked
    if ready and items and not clicked:
        clicked = True
        service, path = items[-1]
        props = dbus.Interface(bus.get_object(service, path), "org.freedesktop.DBus.Properties")
        def got_properties(values):
            menu_path = str(values["Menu"])
            menu = dbus.Interface(bus.get_object(service, menu_path), "com.canonical.dbusmenu")
            def got_layout(revision, layout):
                def find(node):
                    if str(node[1].get("label", "")) == "Native tray integration check": return node[0]
                    for child_node in node[2]:
                        result = find(child_node)
                        if result is not None: return result
                item_id = find(layout)
                if item_id is None: raise RuntimeError("Test menu entry was not exported")
                print("HOST invoking exported native menu item", item_id, flush=True)
                menu.Event(dbus.Int32(item_id), "clicked", dbus.String(""), dbus.UInt32(0), reply_handler=lambda: None, error_handler=failed)
            menu.GetLayout(dbus.Int32(0), dbus.Int32(-1), dbus.Array([], signature="s"), reply_handler=got_layout, error_handler=failed)
        props.GetAll("org.kde.StatusNotifierItem", reply_handler=got_properties, error_handler=failed)
    if child.poll() is not None:
        loop.quit()
        return False
    return True

GLib.io_add_watch(child.stdout.fileno(), GLib.IO_IN | GLib.IO_HUP, read_output)
GLib.timeout_add(100, click_menu)
def timeout():
    print("HOST test timeout", flush=True)
    child.kill()
    loop.quit()
    return False
GLib.timeout_add_seconds(80, timeout)
try:
    loop.run()
finally:
    if child.poll() is None: child.kill()
    daemon.terminate()
    daemon.wait()
sys.exit(child.wait())
