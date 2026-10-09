#!/usr/bin/env bash
set -euo pipefail

DEMO_DIR="$(cd "$(dirname "$0")" && pwd)"
RAW="$DEMO_DIR/raw/dasig-demo-raw2.mp4"
OUTPUT="$DEMO_DIR/DASIG-1-minute-demo.mp4"

ffmpeg -hide_banner -y \
  -loop 1 -framerate 30 -t 4 -i "$DEMO_DIR/overlays/title.png" \
  -i "$RAW" \
  -loop 1 -framerate 30 -t 8.061933 -i "$DEMO_DIR/overlays/end.png" \
  -i "$DEMO_DIR/narration.aiff" \
  -loop 1 -framerate 30 -t 48.138067 -i "$DEMO_DIR/overlays/airplane.png" \
  -loop 1 -framerate 30 -t 48.138067 -i "$DEMO_DIR/overlays/matching.png" \
  -loop 1 -framerate 30 -t 48.138067 -i "$DEMO_DIR/overlays/routing.png" \
  -loop 1 -framerate 30 -t 48.138067 -i "$DEMO_DIR/overlays/result.png" \
  -loop 1 -framerate 30 -t 48.138067 -i "$DEMO_DIR/overlays/speech.png" \
  -/filter_complex "$DEMO_DIR/video-filter.txt" \
  -map '[v]' -map '[a]' \
  -c:v libx264 -preset medium -crf 22 -pix_fmt yuv420p -r 30 \
  -c:a aac -b:a 128k -movflags +faststart -t 60.2 \
  "$OUTPUT"

printf 'Rendered %s\n' "$OUTPUT"
