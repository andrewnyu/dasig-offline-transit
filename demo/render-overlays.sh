#!/usr/bin/env bash
set -euo pipefail

FONT="/System/Library/Fonts/SFNS.ttf"
OUT="$(cd "$(dirname "$0")" && pwd)/overlays"
mkdir -p "$OUT"

magick -size 1080x2400 xc:'#0f3828' \
  -fill '#e4f78f' -draw 'rectangle 70,700 1010,708' \
  -font "$FONT" -gravity center \
  -fill '#e4f78f' -pointsize 150 -annotate +0-330 'DASIG' \
  -fill white -pointsize 46 -annotate +0-130 'OFFLINE JEEPNEY JOURNEY PLANNING' \
  -fill '#c9d8ce' -pointsize 34 -annotate +0-40 'BACOLOD  •  ANDROID  •  ON-DEVICE' \
  -fill '#e4f78f' -draw 'roundrectangle 305,1255 775,1355 22,22' \
  -fill '#0f3828' -pointsize 40 -annotate +0+105 '1-MINUTE DEMO' \
  "$OUT/title.png"

magick -size 1080x2400 xc:'#0f3828' \
  -fill '#e4f78f' -draw 'rectangle 70,660 1010,668' \
  -font "$FONT" -gravity center \
  -fill '#e4f78f' -pointsize 100 -annotate +0-330 'A NEW TRIP.' \
  -fill white -pointsize 58 -annotate +0-170 'CALCULATED ON THE PHONE.' \
  -fill white -pointsize 48 -annotate +0-70 'EVEN WHEN THE CLOUD IS GONE.' \
  -fill '#c9d8ce' -pointsize 38 -annotate +0+150 'DASIG  •  BACOLOD' \
  "$OUT/end.png"

caption() {
  local name="$1"
  local size="$2"
  local label="$3"
  magick -size 1080x2400 xc:none \
    -fill '#0f3828e8' -draw 'roundrectangle 60,90 1020,190 20,20' \
    -font "$FONT" -gravity north -fill white -pointsize "$size" \
    -annotate +0+117 "$label" \
    "$OUT/$name.png"
}

caption airplane 38 'AIRPLANE MODE  •  NO NETWORK'
caption matching 33 'LOCAL SPEECH + FUZZY LANDMARK MATCHING'
caption routing 37 'DASIG ROUTING  •  NO SERVER CALL'
caption result 34 'OFFLINE MAP  •  ROUTE  •  FARE  •  WALK'
caption speech 36 'LOCAL TEXT-TO-SPEECH INSTRUCTIONS'
