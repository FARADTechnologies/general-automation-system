#!/usr/bin/env bash
# Scans staged content (or the given files) for secrets. Exit 1 on any hit.
set -u
PATTERNS='sk-ant-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{32,}|ghp_[A-Za-z0-9]{30,}|gho_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|xox[baprs]-[A-Za-z0-9-]{10,}'
hits=0
if [ "$#" -gt 0 ]; then
  files="$*"
  for f in $files; do
    if grep -I -n -E "$PATTERNS" "$f" >/dev/null 2>&1; then echo "secret-scan: possible secret in $f"; hits=1; fi
  done
else
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    case "$f" in
      .env|.env.*) [ "$f" != ".env.example" ] && { echo "secret-scan: refusing to commit $f"; hits=1; } ;;
    esac
    if git show ":$f" 2>/dev/null | grep -I -n -E "$PATTERNS" >/dev/null; then echo "secret-scan: possible secret in staged $f"; hits=1; fi
  done < <(git diff --cached --name-only --diff-filter=ACMR)
fi
exit $hits
