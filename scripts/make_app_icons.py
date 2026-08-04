"""Gera ícones PWA a partir do ícone quadrado Teu Posto."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(
    r"C:\Users\gabri\.cursor\projects\c-Users-gabri-server\assets\teuposto-app-icon.png"
)
OUT_DIR = ROOT / "public" / "icons"
IMG_DIR = ROOT / "public" / "imagens"
IMG_DIR_ROOT = ROOT / "imagens"


def enhance_blue(img: Image.Image) -> Image.Image:
    img = img.convert("RGB")
    img = ImageEnhance.Color(img).enhance(1.2)
    img = ImageEnhance.Contrast(img).enhance(1.08)
    return img


def resize_cover(img: Image.Image, size: int, scale: float = 1.0) -> Image.Image:
    """Redimensiona para size x size. scale < 1 adiciona margem (maskable)."""
    base = enhance_blue(img)
    if abs(scale - 1.0) < 1e-3:
        return base.resize((size, size), Image.Resampling.LANCZOS)

    content = int(size * scale)
    resized = base.resize((content, content), Image.Resampling.LANCZOS)
    # Fundo = cor média das bordas
    sample = base.resize((8, 8), Image.Resampling.BOX)
    bg = sample.getpixel((0, 0))
    canvas = Image.new("RGB", (size, size), bg)
    offset = (size - content) // 2
    canvas.paste(resized, (offset, offset))
    return canvas


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Fonte não encontrada: {SOURCE}")

    logo = Image.open(SOURCE)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    IMG_DIR.mkdir(parents=True, exist_ok=True)

    outputs = {
        "icon-512.png": (512, 1.0),
        "icon-512-maskable.png": (512, 0.80),
        "icon-192.png": (192, 1.0),
        "icon-180.png": (180, 1.0),
        "apple-touch-icon.png": (180, 1.0),
    }

    for name, (size, scale) in outputs.items():
        icon = resize_cover(logo, size, scale=scale)
        icon.save(OUT_DIR / name, format="PNG", optimize=True)
        print(f"OK {name}")

    fav_src = Image.open(OUT_DIR / "icon-180.png")
    for fav_name, fav_size in [("favicon-48.png", 48), ("favicon-32.png", 32)]:
        f = fav_src.resize((fav_size, fav_size), Image.Resampling.LANCZOS)
        f.save(IMG_DIR / fav_name, format="PNG", optimize=True)
        if IMG_DIR_ROOT.exists():
            f.save(IMG_DIR_ROOT / fav_name, format="PNG", optimize=True)
        print(f"OK {fav_name}")

    ico_sizes = [(16, 16), (32, 32), (48, 48)]
    icos = [fav_src.resize(s, Image.Resampling.LANCZOS) for s in ico_sizes]
    for dest in [IMG_DIR, IMG_DIR_ROOT]:
        if not dest.exists():
            continue
        icos[0].save(dest / "favicon.ico", format="ICO", sizes=ico_sizes, append_images=icos[1:])
    print("OK favicon.ico")


if __name__ == "__main__":
    main()
