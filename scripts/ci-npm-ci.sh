#!/usr/bin/env bash
# Reliable CI install: npm packages first, then ffmpeg-static binary with retries/mirrors.
# GitHub release downloads for ffmpeg-static often flake during npm ci postinstall.
set -euo pipefail

RELEASE="${FFMPEG_BINARY_RELEASE:-b6.1.1}"
FFMPEG_DEST="node_modules/ffmpeg-static/ffmpeg"
CACHE_FILE=".ci-cache/ffmpeg-${RELEASE}-linux-x64"

echo "==> npm ci --ignore-scripts"
npm ci --ignore-scripts

echo "==> npm run postinstall (prisma / patches / fonts)"
npm run postinstall

mkdir -p node_modules/ffmpeg-static .ci-cache

if [ -x "$FFMPEG_DEST" ]; then
  echo "ffmpeg already present at $FFMPEG_DEST"
elif [ -f "$CACHE_FILE" ]; then
  cp "$CACHE_FILE" "$FFMPEG_DEST"
  chmod +x "$FFMPEG_DEST"
  echo "Restored ffmpeg from $CACHE_FILE"
else
  URLS=(
    "https://github.com/eugeneware/ffmpeg-static/releases/download/${RELEASE}/ffmpeg-linux-x64.gz"
    "https://cdn.npmmirror.com/binaries/ffmpeg-static/${RELEASE}/ffmpeg-linux-x64.gz"
  )
  ok=0
  for url in "${URLS[@]}"; do
    for attempt in 1 2 3 4 5; do
      echo "Fetching ffmpeg: $url (attempt $attempt)"
      tmp="$(mktemp)"
      if curl -fsSL --retry 3 --retry-delay 5 --connect-timeout 30 --max-time 180 -o "$tmp" "$url" \
        && gzip -t "$tmp" 2>/dev/null; then
        gunzip -c "$tmp" > "$FFMPEG_DEST"
        chmod +x "$FFMPEG_DEST"
        cp "$FFMPEG_DEST" "$CACHE_FILE"
        rm -f "$tmp"
        ok=1
        break 2
      fi
      rm -f "$tmp"
      sleep $((attempt * 5))
    done
  done
  if [ "$ok" != 1 ]; then
    echo "::error::Failed to download ffmpeg-static binary after retries (GitHub + mirror)"
    exit 1
  fi
fi

test -x "$FFMPEG_DEST"
"$FFMPEG_DEST" -version | head -n 1
echo "ffmpeg-static ready"
