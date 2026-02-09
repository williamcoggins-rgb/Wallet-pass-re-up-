#!/usr/bin/env python3
"""
Generate Apple Wallet pass images from the Emporium Grooming & Supply logo.

Usage:
    python3 scripts/resize-barbershop-logo.py path/to/emporium-logo.png

Outputs icon and logo images at 1x/2x/3x into assets-barbershop/.
"""
import sys
from pathlib import Path
from PIL import Image

SIZES = {
    # Icons: square, shown in notifications and pass list
    "icon.png":    (29, 29),
    "icon@2x.png": (58, 58),
    "icon@3x.png": (87, 87),
    # Logos: wide, shown at top of the pass
    "logo.png":    (160, 50),
    "logo@2x.png": (320, 100),
    "logo@3x.png": (480, 150),
}

def resize_fit(img: Image.Image, target_w: int, target_h: int) -> Image.Image:
    """Resize image to fit within target dimensions, preserving aspect ratio, on transparent bg."""
    img = img.convert("RGBA")
    img.thumbnail((target_w, target_h), Image.LANCZOS)
    canvas = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    x = (target_w - img.width) // 2
    y = (target_h - img.height) // 2
    canvas.paste(img, (x, y), img)
    return canvas

def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <logo-image-path>")
        sys.exit(1)

    src_path = Path(sys.argv[1])
    if not src_path.exists():
        print(f"File not found: {src_path}")
        sys.exit(1)

    out_dir = Path(__file__).parent.parent / "assets-barbershop"
    out_dir.mkdir(exist_ok=True)

    img = Image.open(src_path)
    print(f"Source: {src_path} ({img.width}x{img.height})")

    for filename, (w, h) in SIZES.items():
        resized = resize_fit(img, w, h)
        out_path = out_dir / filename
        resized.save(out_path, "PNG")
        print(f"  {filename}: {w}x{h} -> {out_path}")

    print(f"\nDone! {len(SIZES)} images saved to {out_dir}/")

if __name__ == "__main__":
    main()
