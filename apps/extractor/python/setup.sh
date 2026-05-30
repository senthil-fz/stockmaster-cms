#!/usr/bin/env bash
# Create the extractor's isolated Python environment.
# Requires `uv` (https://docs.astral.sh/uv/). Re-run any time to refresh deps.
set -euo pipefail
cd "$(dirname "$0")"

uv venv .venv --python 3.13
VIRTUAL_ENV="$(pwd)/.venv" uv pip install --python .venv -r requirements.txt

echo
echo "✓ Extractor Python env ready at $(pwd)/.venv"
echo "  Try: .venv/bin/python extract.py --help"
