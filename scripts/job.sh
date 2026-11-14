#!/usr/bin/env bash
set -euo pipefail

[[ $# -ge 1 ]] || { echo 'usage: scripts/job.sh <npm script> [word ...]' >&2; exit 2; }
case "$1" in
  db:seed | db:reset) echo "refused: $1 never runs on Azure" >&2; exit 2 ;;
esac

group="${JOB_GROUP:-rg-finance-dev}"
job="${JOB_NAME:-finance-migrate}"
poll="${JOB_POLL_SECONDS:-10}"
words=()
for word in "$@"; do [[ "$word" == -- ]] || words+=("$word"); done

spec="$(az containerapp job show -g "$group" -n "$job" --query 'properties.template.containers[0].[name, image]' -o tsv)"
read -r container image <<< "$spec"
image="${JOB_IMAGE:-$image}"
settings="$(az containerapp job show -g "$group" -n "$job" -o tsv \
  --query "properties.template.containers[0].env[].join('=', [name, value || join('', ['secretref:', secretRef])])")"
[[ -n "$settings" ]] || { echo "no environment on $job" >&2; exit 1; }
IFS=$'\n' read -r -d '' -a env <<< "$settings" || true

execution="$(az containerapp job start -g "$group" -n "$job" --image "$image" --container-name "$container" \
  --env-vars "${env[@]}" --command npm --args run "${words[@]}" --query name -o tsv)"
echo "started $execution: npm run ${words[*]} on $image"

while :; do
  status="$(az containerapp job execution show -g "$group" -n "$job" --job-execution-name "$execution" --query properties.status -o tsv)"
  case "$status" in
    Succeeded) echo "$execution Succeeded"; exit 0 ;;
    Failed | Stopped | Degraded) echo "$execution $status" >&2; exit 1 ;;
  esac
  sleep "$poll"
done
