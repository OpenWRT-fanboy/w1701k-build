#!/bin/bash

# Copyright (c) 2019 P3TERX
# From https://github.com/P3TERX/Actions-OpenWrt

set +eo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "Deleting files, please wait ..."
sudo rm -rf \
  "$AGENT_TOOLSDIRECTORY" \
  /opt/ghc \
  /opt/google/chrome \
  /opt/microsoft/msedge \
  /opt/microsoft/powershell \
  /opt/pipx \
  /usr/lib/jvm \
  /usr/lib/mono \
  /usr/local/.ghcup \
  /usr/local/julia* \
  /usr/local/lib/android \
  /usr/local/lib/node_modules \
  /usr/local/share/chromium \
  /usr/local/share/powershell \
  /usr/share/dotnet \
  /usr/share/swift
docker rmi "$(docker images -q)"
df -h
exit 0
