#!/usr/bin/env bash
# Builds out/leakscope-demo.mp4 (1920x1080, H.264/AAC) and out/leakscope-demo.srt from scratch.
#
#   ./make.sh                      record every scene against the live site and assemble
#   BASE=http://localhost:3000 ./make.sh   record against another deployment
#   ./make.sh plan scan            re-record only these scenes, reuse the rest, assemble
#   SKIP_TTS=1 ./make.sh           keep build/tts/*.wav (e.g. your own voice takes)
#   VOICE=Daniel RATE=180 ./make.sh
#
# Needs: macOS `say`, ffmpeg/ffprobe, node >= 20, and web/node_modules (Playwright + Chromium).
set -euo pipefail
cd "$(dirname "$0")"

node tts.mjs
node record.mjs "$@"
node assemble.mjs
node script.mjs
ffprobe -v error -show_entries format=duration,size -of default=nw=1 out/leakscope-demo.mp4
