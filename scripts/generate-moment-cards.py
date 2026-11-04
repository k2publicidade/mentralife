#!/usr/bin/env python3
"""Build the six public Momentos PNGs from the same JS data used by the app.

Usage: python3 scripts/generate-moment-cards.py
Build-only requirements: Python 3, Pillow, Node.js and Noto fonts (or Liberation).
No network, personal data, AI image editing, or runtime dependency is involved.
The approved face is read unchanged, proportionally resized, and composited using
its existing transparency. It is never retouched, recolored, cropped, or saved.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import subprocess

from PIL import Image, ImageDraw, ImageFont, PngImagePlugin

ROOT = Path(__file__).resolve().parent.parent
FACE = ROOT / "dist/assets/mentra-face.png"
SIZE = (1080, 1920)
GREEN = "#173E32"
CREAM = "#F5F1E7"


def load_font(size: int, serif: bool = False, bold: bool = False):
    family = "NotoSerifDisplay" if serif else "NotoSans"
    weight = "Bold" if bold else "Regular"
    candidates = [
        Path(f"/usr/share/fonts/truetype/noto/{family}-{weight}.ttf"),
        Path(f"/usr/share/fonts/truetype/liberation/Liberation{'Serif' if serif else 'Sans'}-{weight}.ttf"),
        Path(f"/usr/share/fonts/truetype/liberation2/Liberation{'Serif' if serif else 'Sans'}-{weight}.ttf"),
    ]
    for path in candidates:
        if path.is_file():
            return ImageFont.truetype(str(path), size)
    raise RuntimeError("Instale Noto Fonts ou Liberation Fonts para gerar os cards.")


def wrap(draw, text: str, font, width: int) -> list[str]:
    """Wrap on word boundaries; fail loudly rather than clip a long token."""
    lines: list[str] = []
    current = ""
    for word in text.split():
        if draw.textlength(word, font=font) > width:
            raise ValueError(f"Palavra excede a largura do card: {word}")
        candidate = f"{current} {word}".strip()
        if current and draw.textlength(candidate, font=font) > width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    assert " ".join(lines) == text, "O texto do card deve permanecer completo."
    return lines


def text_block(draw, text: str, font, x: int, y: int, width: int, line_height: int, fill):
    for line in wrap(draw, text, font, width):
        box = draw.textbbox((x, y), line, font=font, anchor="lt")
        if box[0] < 0 or box[2] > SIZE[0] or box[3] > SIZE[1]:
            raise ValueError(f"Texto fora do card: {line}")
        draw.text((x, y), line, font=font, fill=fill, anchor="lt")
        y += line_height
    return y


def tracked_text(draw, xy, text, font, fill, spacing=4):
    x, y = xy
    for letter in text:
        draw.text((x, y), letter, font=font, fill=fill, anchor="lt")
        x += draw.textlength(letter, font=font) + spacing
    return x


def period_icon(draw, period: str, foreground, background):
    x, y, r = 126, 268, 27
    if period == "night":
        draw.ellipse((x-r, y-r, x+r, y+r), fill=foreground)
        draw.ellipse((x-9, y-r-7, x+r+11, y+13), fill=background)
        draw.line((178, 239, 178, 253), fill=foreground, width=2)
        draw.line((171, 246, 185, 246), fill=foreground, width=2)
    else:
        draw.ellipse((x-r+9, y-r+9, x+r-9, y+r-9), outline=foreground, width=3)
        for index in range(8):
            angle = index * math.pi / 4
            draw.line((x + math.cos(angle)*30, y + math.sin(angle)*30,
                       x + math.cos(angle)*40, y + math.sin(angle)*40), fill=foreground, width=3)
        if period == "morning":
            draw.rectangle((80, y+12, 172, y+47), fill=background)
            draw.line((83, y+12, 169, y+12), fill=foreground, width=3)


def build(moment: dict, face: Image.Image) -> Path:
    night = moment["period"] == "night"
    background = GREEN if night else CREAM
    foreground = CREAM if night else GREEN
    secondary = "#D4DECC" if night else "#456253"
    rule = "#42604F" if night else "#D7DECE"
    orb = "#234B3B" if night else "#E5E9DC"
    canvas = Image.new("RGBA", SIZE, background)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((32, 32, 1047, 1887), radius=36, outline=rule, width=2)

    tracked_text(draw, (96, 113), "MENTRA LIFE", load_font(25, bold=True), foreground, 4)
    period_number = {"morning": "01", "afternoon": "02", "night": "03"}[moment["period"]]
    period_label = f"{period_number}  /  {moment['label'].upper()}"
    label_font = load_font(23)
    draw.text((984 - draw.textlength(period_label, font=label_font), 114), period_label,
              font=label_font, fill=secondary, anchor="lt")
    draw.line((96, 183, 984, 183), fill=rule, width=2)
    period_icon(draw, moment["period"], foreground, background)

    y = text_block(draw, moment["title"], load_font(76, serif=True), 96, 350, 888, 99, foreground)
    y += 44
    y = text_block(draw, moment["text"], load_font(46), 100, y, 866, 66, foreground)
    y += 46
    attribution = f"Paráfrase · {moment['reference']}" if moment["reference"] else "Um momento de cuidado."
    y = text_block(draw, attribution, load_font(25), 100, y, 866, 37, secondary)
    if y > 1090:
        raise ValueError(f"O texto se aproxima do retrato: {moment['id']} (y={y}).")

    # All portrait pixels are sourced from the approved, unchanged PNG.
    draw.ellipse((174, 1140, 906, 1820), fill=orb)
    draw.arc((147, 1113, 933, 1847), 198, 343, fill=rule, width=2)
    draw.arc((159, 1126, 921, 1834), 18, 165, fill=rule, width=2)
    portrait = face.copy()
    portrait.thumbnail((736, 736), Image.Resampling.LANCZOS)
    canvas.alpha_composite(portrait, ((SIZE[0]-portrait.width)//2, 1090))

    draw = ImageDraw.Draw(canvas)
    footer = "UM PASSO DE CADA VEZ"
    footer_font = load_font(21)
    footer_width = draw.textlength(footer, font=footer_font) + (len(footer)-1)*3
    tracked_text(draw, ((SIZE[0]-footer_width)/2, 1838), footer, footer_font, secondary, 3)

    metadata = PngImagePlugin.PngInfo()
    for key, value in {
        "Title": moment["title"],
        "Description": moment["text"],
        "Attribution": moment["attribution"],
        "Reference": moment["reference"] or "",
        "Moment-ID": moment["id"],
        "Face-SHA256": hashlib.sha256(FACE.read_bytes()).hexdigest(),
    }.items():
        metadata.add_itxt(key, value)
    destination = ROOT / "dist" / moment["cardPath"]
    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(destination, "PNG", pnginfo=metadata, optimize=True)
    with Image.open(destination) as saved:
        saved.verify()
    return destination


def main():
    original_hash = hashlib.sha256(FACE.read_bytes()).hexdigest()
    script = """
      import { PERIODS, getMoment } from './dist/moments-core.mjs';
      console.log(JSON.stringify([false, true].flatMap(christian =>
        PERIODS.map(({id}) => getMoment(id, christian)))));
    """
    moments = json.loads(subprocess.check_output(
        ["node", "--input-type=module", "-e", script], cwd=ROOT, text=True,
    ))
    if len(moments) != 6:
        raise ValueError("São necessários exatamente seis cards.")
    with Image.open(FACE) as source:
        face = source.convert("RGBA")
    for moment in moments:
        destination = build(moment, face)
        print(f"{destination.relative_to(ROOT)} · {SIZE[0]}×{SIZE[1]} · {destination.stat().st_size:,} bytes")
    if hashlib.sha256(FACE.read_bytes()).hexdigest() != original_hash:
        raise RuntimeError("A imagem aprovada foi alterada.")
    print(f"Rosto original preservado: {original_hash}")


if __name__ == "__main__":
    main()
