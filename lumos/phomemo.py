#!/usr/bin/env python3
"""
Native wireless Bluetooth printer driver for the Phomemo M834 8.5" thermal printer.
Uses pure Python AF_BLUETOOTH RFCOMM sockets and liblzo2 miniLZO raster compression.
Protocol reverse-engineered by cure-honey (https://github.com/cure-honey/PhomemoA4).
"""
import ctypes
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
from typing import Any, Dict, Optional, Union

# Load system LZO compression library
_liblzo = None
for candidate in ["liblzo2.so.2", "liblzo2.so", "./minilzo.so"]:
    try:
        _liblzo = ctypes.cdll.LoadLibrary(candidate)
        break
    except Exception:
        continue

_wk_buffer = ctypes.create_string_buffer(16384 * 8) if _liblzo else None


def _send_lzo_chunk(data: bytes, sock: socket.socket) -> int:
    """Compresses `data` using LZO1X-1 and writes to Bluetooth socket."""
    if not _liblzo:
        raise RuntimeError("liblzo2 library not available on system.")

    buff = ctypes.create_string_buffer(data, len(data))
    ni = ctypes.c_int(len(buff))
    no_max = len(buff) + len(buff) // 16 + 64 + 3
    out = ctypes.create_string_buffer(no_max)
    no = ctypes.c_int(len(out))

    iret = _liblzo.lzo1x_1_compress(
        ctypes.byref(buff),
        ni,
        ctypes.byref(out),
        ctypes.byref(no),
        ctypes.byref(_wk_buffer),
    )
    if iret != 0:
        raise RuntimeError(f"LZO compression failed with error code: {iret}")

    payload = no.value.to_bytes(3, byteorder="little") + out[:no.value]
    sock.sendall(payload)
    return len(payload)


def convert_pdf_to_monochrome_image(pdf_path: Path, target_width: int = 2480) -> Any:
    """Converts a PDF file to a 1-bit monochrome PIL Image with target dot width (default 2480 for 8.5" at 300 DPI)."""
    from PIL import Image

    with tempfile.TemporaryDirectory() as tmpdir:
        prefix = str(Path(tmpdir) / "raster")
        # Run pdftoppm at 300 DPI
        cmd = ["pdftoppm", "-png", "-r", "300", "-singlefile", str(pdf_path), prefix]
        subprocess.run(cmd, check=True, capture_output=True)
        img_path = Path(f"{prefix}.png")
        if not img_path.exists():
            raise FileNotFoundError(f"pdftoppm failed to produce {img_path}")

        img = Image.open(img_path).copy()

    # If landscape, rotate to portrait
    if img.width > img.height:
        img = img.transpose(Image.ROTATE_90)

    # Scale to exactly target_width dots
    scaled_height = int(img.height * target_width / img.width)
    img = img.resize((target_width, scaled_height), Image.Resampling.LANCZOS)
    # Convert to 1-bit dithered / threshold monochrome
    return img.convert(mode="1")


def print_pdf_via_bluetooth(
    pdf_path: Union[str, Path],
    mac: Optional[str] = None,
    port: int = 1,
    darkness: int = 4,
    timeout: int = 45,
) -> Dict[str, Any]:
    """
    Connects to the Phomemo M834 wirelessly via Bluetooth RFCOMM socket and prints the PDF.
    Returns status dictionary with battery remaining and bytes sent.
    """
    target_mac = (mac or os.getenv("PHOMEMO_BT_MAC", "")).strip()
    if not target_mac:
        return {"ok": False, "error": "No Bluetooth MAC address provided (PHOMEMO_BT_MAC not set)."}

    pdf_p = Path(pdf_path).resolve()
    if not pdf_p.exists():
        return {"ok": False, "error": f"PDF file does not exist: {pdf_p}"}

    if not hasattr(socket, "AF_BLUETOOTH"):
        return {"ok": False, "error": "Current Python environment does not support AF_BLUETOOTH sockets."}

    # 1. Convert PDF to 2480-dot 1-bit image
    try:
        image = convert_pdf_to_monochrome_image(pdf_p, target_width=2480)
    except Exception as e:
        return {"ok": False, "error": f"Failed to rasterize PDF: {e}"}

    IMAGE_WIDTH_BITS = 2480
    IMAGE_WIDTH_BYTES = IMAGE_WIDTH_BITS // 8  # 310 bytes per line
    total_lines = image.height

    # 2. Connect via AF_BLUETOOTH RFCOMM socket
    sock = socket.socket(socket.AF_BLUETOOTH, socket.SOCK_STREAM, socket.BTPROTO_RFCOMM)
    sock.settimeout(timeout)
    try:
        sock.connect((target_mac, port))
    except Exception as e:
        sock.close()
        return {"ok": False, "error": f"Failed to connect to Phomemo M834 at {target_mac}: {e}"}

    try:
        ESC = b"\x1B"
        GS = b"\x1D"
        US = b"\x1F"

        RESET = ESC + b"@"
        BMP = GS + b"v" + b"0" + b"\x00"
        ENRGY = US + b"\x11" + b"\x08"

        # Initialize printer and set darkness (0x01: low, 0x03: med, 0x04: deep high-contrast)
        dark_byte = bytes([max(1, min(4, darkness))])
        sock.sendall(RESET)
        sock.sendall(US + b"\x11\x02" + dark_byte)
        sock.sendall(US + b"\x11\x37\x64")  # Concentration coeff
        sock.sendall(US + b"\x11\x0b")
        sock.sendall(US + b"\x11\x35\x01")
        sock.sendall(US + b"\x11\x3c\x00")

        # Send Raster Bitmap Header
        header = (
            BMP
            + IMAGE_WIDTH_BYTES.to_bytes(2, byteorder="little")
            + total_lines.to_bytes(2, byteorder="little")
        )
        sock.sendall(header)

        # Pack and stream lines in 4096-byte chunks with miniLZO
        chunk_size = 4096
        image_bytes = bytearray()
        bytes_compressed_total = len(header)

        for iy in range(total_lines):
            for ix in range(IMAGE_WIDTH_BYTES):
                byte = 0
                for bit in range(8):
                    # 0 = black dot in 1-bit PIL image
                    if image.getpixel((ix * 8 + bit, iy)) == 0:
                        byte |= 1 << (7 - bit)
                image_bytes.append(byte)
                if len(image_bytes) == chunk_size:
                    sent = _send_lzo_chunk(bytes(image_bytes), sock)
                    bytes_compressed_total += sent
                    image_bytes.clear()

        if image_bytes:
            sent = _send_lzo_chunk(bytes(image_bytes), sock)
            bytes_compressed_total += sent

        # Query energy to wait for printer processing
        sock.sendall(ENRGY)
        battery_res = sock.recv(3)
        battery_pct = int(battery_res[2]) if len(battery_res) >= 3 else None

        return {
            "ok": True,
            "mac": target_mac,
            "width_dots": IMAGE_WIDTH_BITS,
            "height_lines": total_lines,
            "bytes_sent": bytes_compressed_total,
            "battery_pct": battery_pct,
        }
    except Exception as e:
        return {"ok": False, "error": f"Error streaming to M834: {e}"}
    finally:
        sock.close()
