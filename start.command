#!/bin/bash
# Double-click (macOS) or run ./start.command to serve the app locally and open it in Chrome.
# Nothing leaves your computer: it is a plain static server on localhost.
cd "$(dirname "$0")" || exit 1
PORT=8765
while lsof -i :"$PORT" >/dev/null 2>&1; do PORT=$((PORT + 1)); done
URL="http://localhost:$PORT/"
echo "Emotion Mixer -> $URL   (Ctrl-C or close this window to stop)"
( sleep 1
  if [ -d "/Applications/Google Chrome.app" ]; then open -a "Google Chrome" "$URL"
  elif [ -d "/Applications/Microsoft Edge.app" ]; then open -a "Microsoft Edge" "$URL"
  else open "$URL"; fi ) &
exec python3 -m http.server "$PORT" --bind 127.0.0.1
