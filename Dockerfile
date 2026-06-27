# 025_midas_public_v2 capture-parity extract (vendored 021 sealed core).
# Locked stack per _workbench/version.md. glibc base so better-sqlite3 uses its
# prebuilt binary (no in-image compile). Node pinned to 22 LTS.
FROM node:22-bookworm-slim

# CLAUDE_CONFIG_DIR is a persistent volume (see docker-compose.yml) so the manual
# `claude login` (Max OAuth) survives container restarts.
ENV CLAUDE_CONFIG_DIR=/data/claude-config \
    NODE_ENV=development \
    CI=true

WORKDIR /app

# git: lets the agent's worktree tools (EnterWorktree/ExitWorktree) create + remove a REAL worktree
# in an ISOLATED throwaway repo under /tmp so the WorktreeCreate/WorktreeRemove hooks fire. The host
# workspace repo is never mounted into this container, so container git cannot touch it. A system-level
# identity keeps commits from failing. apt lists cleaned to keep the layer small.
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/* \
    && git config --system user.email "coverage@025-midas-public-v2.local" \
    && git config --system user.name "025 capture extract" \
    && git config --system init.defaultBranch main

# Install EXACTLY the locked tree. npm ci resolves the linux-x64 glibc optional deps:
# better-sqlite3's prebuilt binary AND @anthropic-ai/claude-agent-sdk-linux-x64 (the
# 238MB bundled Claude Code CLI, v0.3.160 — the same binary the SDK shells out to).
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Expose the SDK's bundled CLI as `claude` on PATH for the manual OAuth login.
# No separate/unpinned CLI install = zero version drift from the SDK.
RUN set -eux; \
    bin="$(find node_modules/@anthropic-ai -maxdepth 2 -name claude -type f | head -n1)"; \
    test -n "$bin"; \
    ln -sf "/app/$bin" /usr/local/bin/claude; \
    claude --version || true

# Persistent data roots (SQLite record + CLAUDE_CONFIG_DIR are mounted as volumes here).
# /data/bodies holds the untruncated raw API bodies (OTEL_LOG_RAW_API_BODIES=file:/data/bodies).
RUN mkdir -p /data/claude-config /data/sqlite /data/bodies

# The managed-settings OTel lock: system-level managed policy that EVERY claude process in the
# container inherits and cannot override (proven: it beats a hostile per-call env override). This is
# the un-bypassable breadth spine — it points the CLI's OTLP export at the in-container receiver
# (src/otel/receiver.ts) on 127.0.0.1:3211, which writes every event verbatim to the Spine SQLite.
RUN mkdir -p /etc/claude-code
COPY infra/managed-settings.json /etc/claude-code/managed-settings.json

# src/ and tests/ are bind-mounted at runtime (see docker-compose.yml) so the red->green
# TDD loop needs no rebuild. The image itself carries only deps + the CLI.

# Dev/test container: stay up so we exec in to `claude login`, run instrumentation, run vitest.
CMD ["sleep", "infinity"]
