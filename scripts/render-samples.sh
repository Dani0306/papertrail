#!/usr/bin/env bash
# Regenerates samples/* from samples/src/*.html (all synthetic).
# Needs Google Chrome and ffmpeg. Usage: bash scripts/render-samples.sh [name ...]
# With names (e.g. synthetic-koyo-yen), only those sources are rendered.
#
# Most sources render to a PDF. A few become images and are degraded to look
# like a phone photo, a thermal-receipt scan or a fax.
# samples/synthetic-harbor-pine-inv-2041.pdf was built by hand (a raw PDF) and has no source here.
set -euo pipefail

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
SRC=samples/src
OUT=samples
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

shot() { # shot <html> <png> <width> <height> <scale>
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor="$5" \
    --window-size="$3,$4" --screenshot="$2" "file://$PWD/$1" 2>/dev/null
}

pdf() { # pdf <html> <pdf>
  "$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="$2" "file://$PWD/$1" 2>/dev/null
}

degrade() { # degrade <in> <out> <ffmpeg filter>
  ffmpeg -loglevel error -y -i "$1" -vf "$3" -q:v 4 "$2"
}

if [ "$#" -gt 0 ]; then
  SOURCES=()
  for name in "$@"; do SOURCES+=("$SRC/$name.html"); done
else
  SOURCES=("$SRC"/*.html)
fi

for html in "${SOURCES[@]}"; do
  name="$(basename "$html" .html)"
  case "$name" in
    *.p2)
      # Page 2 of a mixed PDF: rendered by its parent below, never on its own.
      continue
      ;;
    synthetic-harrow-mixed-scan)
      # Page 1 keeps its text layer; page 2 (the totals) becomes a scanned image with none.
      shot "$SRC/$name.p2.html" "$TMP/$name-p2.png" 794 1123 1.25
      degrade "$TMP/$name-p2.png" "$TMP/$name-p2-scan.png" \
        "format=gray,eq=contrast=1.15:brightness=0.02,rotate=0.6*PI/180:fillcolor=white,gblur=sigma=0.6,noise=alls=12:allf=t"
      sed "s|__PAGE2__|file://$TMP/$name-p2-scan.png|" "$html" > "$TMP/$name.html"
      "$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --allow-file-access-from-files \
        --print-to-pdf="$OUT/$name.pdf" "file://$TMP/$name.html" 2>/dev/null
      ;;
    synthetic-bluefin-handwritten-total)
      # Flatbed scan of a form filled in by hand: slight skew and blur, off-white paper.
      shot "$html" "$TMP/$name.png" 794 1123 1.25
      degrade "$TMP/$name.png" "$OUT/$name.png" \
        "pad=iw+50:ih+50:25:25:color=0xf3f0e8,rotate=-0.9*PI/180:fillcolor=0xf3f0e8,gblur=sigma=0.6,noise=alls=8:allf=t,eq=contrast=0.95"
      ;;
    synthetic-ridgeline-rotated-scan)
      # Fed into the scanner sideways at low resolution.
      shot "$html" "$TMP/$name.png" 794 1123 1
      degrade "$TMP/$name.png" "$OUT/$name.png" \
        "transpose=1,format=gray,scale=iw*0.72:-1,eq=contrast=1.2,gblur=sigma=0.5,noise=alls=10:allf=t"
      ;;
    synthetic-cerro-azul-mxn-photo)
      # Phone photo in poor light: steep angle, dark corners, warm cast, soft focus.
      shot "$html" "$TMP/$name.png" 794 1123 1.5
      degrade "$TMP/$name.png" "$OUT/$name.jpg" \
        "pad=iw*1.2:ih*1.14:(ow-iw)/2:(oh-ih)/2:color=0x2e2a25,rotate=-4.5*PI/180:fillcolor=0x2e2a25,perspective=x0=70:y0=30:x1=W-20:y1=0:x2=10:y2=H-10:x3=W-60:y3=H-40:sense=destination,gblur=sigma=1.3,noise=alls=16:allf=t,vignette=angle=PI/3.6,eq=brightness=-0.07:contrast=0.9:saturation=0.85,colorchannelmixer=rr=1.06:gg=0.98:bb=0.86"
      ;;
    synthetic-cobalt-ridge-inv-0587)
      pdf "$html" "$OUT/$name.pdf"
      shot "$html" "$OUT/$name.png" 794 1123 1.5
      ;;
    synthetic-tallow-lane-photo)
      # Phone photo: page on a dark desk, tilted, a little out of focus, uneven light.
      shot "$html" "$TMP/$name.png" 794 1123 1.5
      degrade "$TMP/$name.png" "$OUT/$name.jpg" \
        "pad=iw*1.18:ih*1.12:(ow-iw)/2:(oh-ih)/2:color=0x4a3f36,rotate=3.2*PI/180:fillcolor=0x4a3f36,perspective=x0=40:y0=10:x1=W-10:y1=30:x2=0:y2=H:x3=W-30:y3=H-15:sense=destination,gblur=sigma=1.1,noise=alls=10:allf=t,vignette=angle=PI/4.5,eq=brightness=-0.02:contrast=0.93:saturation=0.9,colorchannelmixer=rr=1.03:gg=0.99:bb=0.92"
      ;;
    synthetic-kestrel-receipt-scan)
      # Thermal receipt on a flatbed: grey paper, faded print, slight skew.
      shot "$html" "$TMP/$name.png" 380 610 1.5
      degrade "$TMP/$name.png" "$OUT/$name.png" \
        "format=gray,eq=contrast=0.78:brightness=0.03,pad=iw+60:ih+60:30:30:color=0xd6d3cc,rotate=-1.4*PI/180:fillcolor=0xd6d3cc,gblur=sigma=0.7,noise=alls=14:allf=t"
      ;;
    synthetic-meridian-fax)
      # Fax: low resolution, harsh contrast, speckle, a hair of skew.
      shot "$html" "$TMP/$name.png" 794 1123 1
      degrade "$TMP/$name.png" "$OUT/$name.png" \
        "format=gray,scale=iw*0.8:-1,eq=contrast=1.9:brightness=0.06,rotate=0.7*PI/180:fillcolor=white,gblur=sigma=0.5,noise=alls=22:allf=t"
      ;;
    *)
      pdf "$html" "$OUT/$name.pdf"
      ;;
  esac
  echo "rendered $name"
done
