#!/usr/bin/env bash
# Manage the three namp repos (node-multi-hashing, node-stratum-pool, zny-nomp) at once.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOS=(node-multi-hashing node-stratum-pool zny-nomp)

usage() {
    cat <<'EOF'
Usage: ./manage.sh <command> [args]

Commands:
  status              Branch, working-tree state and ahead/behind for each repo
  fetch               git fetch --all --prune in each repo
  pull                Fast-forward pull the current branch of each repo
  sync                fetch + ff-update local main/develop + ff-pull current branch
  push                Push the current branch of each repo
  exec <git args...>  Run any git command in each repo (e.g. ./manage.sh exec log -1)
EOF
}

cmd="${1:-status}"
shift || true

case "$cmd" in
    help|-h|--help)
        usage
        exit 0
        ;;
    status|fetch|pull|push|sync|exec)
        ;;
    *)
        echo "Unknown command: $cmd" >&2
        usage >&2
        exit 1
        ;;
esac

rc=0
for repo in "${REPOS[@]}"; do
    dir="${ROOT}/${repo}"
    echo ""
    echo "=== ${repo} ==="
    case "$cmd" in
        status)
            git -C "$dir" status -sb || rc=1
            git -C "$dir" log -1 --format='  HEAD: %h %s' || rc=1
            ;;
        fetch)
            git -C "$dir" fetch --all --prune || rc=1
            ;;
        pull)
            git -C "$dir" pull --ff-only || rc=1
            ;;
        push)
            git -C "$dir" push || rc=1
            ;;
        sync)
            git -C "$dir" fetch origin --prune || { rc=1; continue; }
            current="$(git -C "$dir" branch --show-current)"
            # Fast-forward the long-lived branches that are not checked out.
            for b in main develop; do
                if [ "$b" != "$current" ] \
                    && git -C "$dir" show-ref -q --verify "refs/heads/$b"; then
                    git -C "$dir" fetch origin "$b:$b" || rc=1
                fi
            done
            git -C "$dir" pull --ff-only origin "$current" || rc=1
            ;;
        exec)
            git -C "$dir" "$@" || rc=1
            ;;
    esac
done
exit "$rc"
