#!/usr/bin/env bash
# Build the Leakscope pitch deck: slides.html -> out/leakscope-deck.pdf + out/slides-png/*.png
# Uses Playwright from web/node_modules (or a local install in deck/).
set -euo pipefail
cd "$(dirname "$0")"
node render.cjs
