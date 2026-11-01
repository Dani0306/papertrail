#!/usr/bin/env bash
# Regenerates samples/* from samples/src/*.html (all synthetic).
# Needs Google Chrome and ffmpeg. Usage: bash scripts/render-samples.sh
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

for html in "$SRC"/*.html; do
  name="$(basename "$html" .html)"
  case "$name" in
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
