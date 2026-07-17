#!/bin/sh
# check-html-tails.sh - guard against truncated / malformed site HTML.
#
# Raised by HANDOVER-C006 after CW005: on 26 Mar 2026 (commit 03fff0b) six pages
# were committed with their closing markup cut off - missing the footer-bottom
# block, the js/main.js include and </body></html> - and nothing caught it for
# four months, leaving the mobile menu dead on the homepage and five other pages.
#
# This check fails loudly on any tracked *.html that does not end in </html> or
# has unbalanced <div>/</div> counts. Both conditions are the signature of that
# truncation (an unclosed page ends mid-markup and drops its closing divs).
#
# Portable POSIX sh; runs under Ubuntu CI and Git Bash on Windows. Normalises
# CRLF before comparing, because the working tree is CRLF while blobs are LF.
set -u

cd "$(git rev-parse --show-toplevel)" || exit 2

files=$(git ls-files '*.html')
if [ -z "$files" ]; then
  echo "check-html-tails: no tracked *.html found (unexpected)"
  exit 2
fi

fail=0
count=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  [ -f "$f" ] || continue
  count=$((count + 1))

  # Last non-empty line, trimmed of leading/trailing whitespace and CR.
  last=$(tr -d '\r' < "$f" | awk 'NF{l=$0} END{sub(/^[ \t]+/,"",l); sub(/[ \t]+$/,"",l); print l}')
  if [ "$last" != "</html>" ]; then
    echo "FAIL  $f  - does not end with </html> (last content line: '$last')"
    fail=1
  fi

  opens=$(tr -d '\r' < "$f" | grep -o '<div' | wc -l | tr -d ' ')
  closes=$(tr -d '\r' < "$f" | grep -o '</div>' | wc -l | tr -d ' ')
  if [ "$opens" != "$closes" ]; then
    echo "FAIL  $f  - unbalanced div tags (<div>=$opens  </div>=$closes)"
    fail=1
  fi
done <<EOF
$files
EOF

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "check-html-tails: FAILED - a page looks truncated or malformed."
  echo "See HANDOVER-C006 / CW005. Do not commit or deploy until the tail is restored."
  exit 1
fi

echo "check-html-tails: OK - $count HTML files end with </html> and have balanced <div> tags."
exit 0
