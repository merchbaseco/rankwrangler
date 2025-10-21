#!/bin/bash
# Deprecated standalone deployment helper.

set -e

echo "❌ Legacy script detected."
echo "Deployment now runs via GitHub Actions using merchbase-infra/stack/rankwrangler under the rankwrangler user."
echo "Run the workflow or execute stack/rankwrangler/deploy.sh on the server instead."
exit 1
