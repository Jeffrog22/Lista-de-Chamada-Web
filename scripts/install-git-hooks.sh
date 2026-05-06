#!/usr/bin/env bash
set -e

echo "Installing git hooks from .githooks"
git config core.hooksPath .githooks

echo "Git hooks installed."
