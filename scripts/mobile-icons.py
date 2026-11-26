"""Resize the existing approved artwork. Requires Pillow (python -m pip install Pillow)."""
from pathlib import Path
from PIL import Image

source = Image.open('dist/assets/mentra-logo-original.png').convert('RGBA')

def icon(path, size, ratio=.7):
    canvas = Image.new('RGB', (size, size), '#f6f4ec')
    tile = source.copy()
    tile.thumbnail((int(size * ratio), int(size * ratio)), Image.Resampling.LANCZOS)
    canvas.paste(tile, ((size - tile.width) // 2, (size - tile.height) // 2), tile)
    canvas.save(path)

icon('dist/assets/mentra-icon-512.png', 512)
icon('dist/assets/mentra-apple-touch.png', 180, .85)
icon('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024, .85)
for bucket, size in [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]:
    for name in ['ic_launcher', 'ic_launcher_round']:
        icon(f'android/app/src/main/res/mipmap-{bucket}/{name}.png', size, .85)
    icon(f'android/app/src/main/res/mipmap-{bucket}/ic_launcher_foreground.png', round(size * 2.25), .60)
for path in [*Path('android/app/src/main/res').glob('drawable*/splash.png'), *Path('ios/App/App/Assets.xcassets/Splash.imageset').glob('*.png')]:
    with Image.open(path) as old:
        size = old.size
    canvas = Image.new('RGB', size, '#f6f4ec')
    tile = source.copy()
    extent = min(600, min(size) // 3)
    tile.thumbnail((extent, extent), Image.Resampling.LANCZOS)
    canvas.paste(tile, ((size[0] - tile.width) // 2, (size[1] - tile.height) // 2), tile)
    canvas.save(path)
