#!/bin/bash

# --- Robustness Settings ---
# -e: Exit immediately if a command fails
# -u: Treat unset variables as an error
# -o pipefail: Pipeline exit code is the code of the last command to fail
set -euo pipefail

echo "--- 1. Installing Python & Node Dependencies ---"

# Install Python packages
# --no-cache-dir keeps the container slim
echo "Installing LangGraph and LangChain Google GenAI..."
pip install --no-cache-dir langgraph langchain-google-genai

echo "--- 2. Initializing Goose Environment ---"

MOUNT_POINT="/home/vscode/goose-config"
TARGET_DIR="$HOME/.config/goose"

# Copy the config from the mount to the container
if [ -d "$MOUNT_POINT" ]; then
    echo "Copying Goose configuration from WSL mount..."
    # Ensure the local config directory and file exists
    mkdir -p "$HOME/.config/goose"
    touch "$HOME/.config/goose/config.yaml"
    # We use sudo to read from the mount, but -p to preserve what we can
    sudo cat $MOUNT_POINT/config.yaml > "$HOME/.config/goose/config.yaml"
else
    echo "⚠️ Warning: Mount point $MOUNT_POINT not found. Skipping copy."
fi

echo "--- All systems go! ---"