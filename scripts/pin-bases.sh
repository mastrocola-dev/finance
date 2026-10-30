#!/usr/bin/env bash
set -euo pipefail

file="${1:-Dockerfile}"

for ref in $(awk '$1 == "FROM" && $2 ~ /:/ && $2 !~ /@/ { print $2 }' "$file" | sort -u); do
  docker pull -q "$ref" > /dev/null
  digest="$(docker image inspect --format '{{index .RepoDigests 0}}' "$ref")"
  digest="${digest#*@}"
  [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "no digest for $ref" >&2; exit 1; }
  sed -i "s|^FROM $ref |FROM $ref@$digest |" "$file"
  echo "$ref@$digest"
done
