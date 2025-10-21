#!/bin/bash
# Deprecated stack deployment helper.

set -e

echo "❌ Legacy script detected."
echo "This stack now deploys via GHCR using merchbase-infra/stack/rankwrangler under the rankwrangler user."
echo "Run the GitHub Actions workflow or execute stack/rankwrangler/deploy.sh on the server."
exit 1
