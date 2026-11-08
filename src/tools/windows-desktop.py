"""Windows desktop input for a single MCP request. JSON on stdin, result on stdout."""
import base64
import ctypes
import io
import json
import os
from pathlib import Path
import sys

try:
    import win32api
    import win32cred
    import win32gui
    from PIL import ImageGrab
    from pywinauto import keyboard, mouse
    from pywinauto.uia_defines import IUIA
except ImportError:
    sys.exit(81)


def require_window(window):
    if not window or win32gui.GetForegroundWindow() != window:
        raise ValueError("Foreground window changed. Observe again before sending input.")


def geometry():
    width, height = (win32api.GetSystemMetrics(i) for i in (0, 1))
    scale = min(1, 1600 / width, 1600 / height)
    return width, height, max(1, round(width * scale)), max(1, round(height * scale))


def observe():
    window = win32gui.GetForegroundWindow()
    width, height, image_width, image_height = geometry()
    image = ImageGrab.grab()
    if image.size != (width, height):
        raise ValueError("Display changed during capture. Try observing again.")
    stream = io.BytesIO()
    image.resize((image_width, image_height)).convert("RGB").save(stream, "JPEG", quality=78)
    require_window(window)
    return json.dumps(dict(window=window, title=win32gui.GetWindowText(window),
                           width=image_width, height=image_height,
                           image=base64.b64encode(stream.getvalue()).decode("ascii")))


def password_field():
    field = IUIA().iuia.GetFocusedElement()
    if not field or not field.CurrentIsPassword:
        raise ValueError("Focus a password field that Windows accessibility identifies as protected.")
    return tuple(field.GetRuntimeId())


def type_literal(value, window, field=None):
    # Send literal UTF-16 units, including surrogate pairs, without using the clipboard.
    encoded = value.encode("utf-16-le")
    for i in range(0, len(encoded), 2):
        require_window(window)
        if field is not None and field != password_field():
            raise ValueError("Password field changed during entry.")
        keyboard.KeyAction(chr(int.from_bytes(encoded[i:i + 2], "little"))).run()


KEYS = {"Enter": "{ENTER}", "Tab": "{TAB}", "Shift+Tab": "+{TAB}", "Escape": "{ESC}",
        "Backspace": "{BACKSPACE}", "Delete": "{DELETE}", "Up": "{UP}", "Down": "{DOWN}",
        "Left": "{LEFT}", "Right": "{RIGHT}", "Ctrl+A": "^a", "Ctrl+C": "^c",
        "Ctrl+V": "^v", "Ctrl+S": "^s", "Alt+F4": "%{F4}"}


def perform(args):
    ctypes.windll.user32.SetProcessDPIAware()
    action = args["action"]
    if action == "observe":
        return observe()
    if action == "launch":
        app = args["app"]
        if Path(app).suffix.lower() != ".exe":
            raise ValueError("Specify an executable name or full path ending in .exe.")
        os.startfile(app)
        return "Launch requested. Observe the desktop to verify."

    window = args["window"]
    require_window(window)
    if action in ("click", "double_click"):
        width, height, iw, ih = geometry()
        x, y = args["x"], args["y"]
        if not (0 <= x < iw and 0 <= y < ih):
            raise ValueError("Coordinates outside the observed image.")
        coords = (round(x * (width - 1) / max(1, iw - 1)), round(y * (height - 1) / max(1, ih - 1)))
        click = mouse.click if action == "click" else mouse.double_click
        click(coords=coords)
    elif action == "key":
        keyboard.send_keys(KEYS[args["key"]], turn_off_numlock=False)
    elif action == "text":
        type_literal(args["text"], window)
    elif action == "credential":
        field = password_field()
        entry = win32cred.CredRead("DesktopCommander/" + args["credential"], win32cred.CRED_TYPE_GENERIC)
        type_literal(entry["CredentialBlob"].decode("utf-16-le"), window, field)
    else:
        raise ValueError("Unknown desktop action.")
    return "Input sent. Observe the desktop to verify."


if __name__ == "__main__":
    try:
        print(perform(json.load(sys.stdin)))
    except ValueError as exc:
        # Unicode errors may include input bytes. Avoid including these in diagnostics.
        sys.exit("Invalid credential encoding." if isinstance(exc, UnicodeError) else str(exc))
    except Exception as exc:
        sys.exit("Desktop action failed (" + type(exc).__name__ + "). Check the interactive session, executable or saved credential.")
