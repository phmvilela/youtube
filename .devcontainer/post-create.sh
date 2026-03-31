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

# Initialize Claude Code
cat > ~/.claude.json << 'EOF'
{
  "hasCompletedOnboarding": true,
  "lastOnboardingVersion": "2.1.29",
  "oauthAccount": {
    "accountUuid": "b556c7ba-a37b-4b10-bdd8-e97999271881",
    "emailAddress": "pedromv@gmail.com",
    "organizationUuid": "5c759cb8-08c3-4e01-8dee-d51527e00c78"
  }
}
EOF

echo "--- All systems go! ---"