#!/usr/bin/env bash
set -euo pipefail
safari_root="$(cd "$(dirname "$0")/../safari-extension" && pwd)"
safari_test_dir="$(mktemp -d /tmp/rankwrangler-safari-oauth.XXXXXX)"
trap 'trash "$safari_test_dir"' EXIT
swiftc -swift-version 5 -parse-as-library \
    -target "$(uname -m)-apple-macos14.4" \
    "$safari_root/Shared (Extension)/SafariOAuthSupport.swift" \
    "$safari_root/Shared (Extension)/SafariOAuthClient.swift" \
    "$safari_root/Shared (Extension)/SafariKeychain.swift" \
    "$safari_root/Shared (Extension)/SafariTokenSession.swift" \
    "$safari_root/Tests/NativeOAuthTests.swift" \
    -o "$safari_test_dir/native-oauth-tests"
"$safari_test_dir/native-oauth-tests"
