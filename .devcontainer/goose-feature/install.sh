#!/bin/sh
set -e

echo "Installing Goose..."

echo "Downloading and installing Goose..."
curl -fsSL https://github.com/block/goose/releases/download/stable/download_cli.sh | GOOSE_BIN_DIR=/usr/local/bin CONFIGURE=false bash

echo "Done!"
