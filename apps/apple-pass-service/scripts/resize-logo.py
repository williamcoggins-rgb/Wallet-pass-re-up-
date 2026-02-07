#!/usr/bin/env python3
"""
Resize your ReUp logo into all the sizes Apple Wallet needs.

Usage:
    python3 scripts/resize-logo.py path/to/your-reup-logo.png

This will generate all required files in the assets/ folder:
    icon.png     (29x29)     icon@2x.png  (58x58)     icon@3x.png  (87x87)
    logo.png     (160x50)    logo@2x.png  (320x100)   logo@3x.png  (480x150)
"""
import sys
import os
from PIL import Image

if len(sys.argv) < 2:
    print("Usage: python3 scripts/resize-logo.py <path-to-logo.png>")
    sys.exit(1)

source = sys.argv[1]
if not os.path.exists(source):
    print(f"File not found: {source}")
    sys.exit(1)

assets_dir = os.path.join(os.path.dirname(__file__), "..", "assets")
os.makedirs(assets_dir, exist_ok=True)

img = Image.open(source).convert("RGBA")

# Icon sizes (square, used in notifications and pass list)
icon_sizes = {
    "icon.png": (29, 29),
    "icon@2x.png": (58, 58),
    "icon@3x.png": (87, 87),
}

# Logo sizes (wide, shown on pass face next to "ReUp" text)
logo_sizes = {
    "logo.png": (160, 50),
    "logo@2x.png": (320, 100),
    "logo@3x.png": (480, 150),
}

def resize_contain(image, target_w, target_h):
    """Resize image to fit within target dimensions, preserving aspect ratio,
    centered on a transparent background."""
    result = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    img_copy = image.copy()
    img_copy.thumbnail((target_w, target_h), Image.LANCZOS)
    x = (target_w - img_copy.width) // 2
    y = (target_h - img_copy.height) // 2
    result.paste(img_copy, (x, y))
    return result

for filename, (w, h) in {**icon_sizes, **logo_sizes}.items():
    out_path = os.path.join(assets_dir, filename)
    resized = resize_contain(img, w, h)
    resized.save(out_path, "PNG")
    print(f"  Created {filename} ({w}x{h})")

print(f"\nAll images saved to: {os.path.abspath(assets_dir)}")
