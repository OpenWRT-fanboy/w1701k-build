#!/bin/bash

set -eo pipefail

# shellcheck disable=SC1090
source "${HOST_WORK_DIR}/scripts/host/docker.sh"

docker_exec "${BUILDER_CONTAINER_ID}" "${BUILDER_WORK_DIR}/scripts/config.sh"
if [ "x${OPT_UPLOAD_CONFIG}" = "x1" ] && [ "x${TEST}" != "x1" ]; then
  set +eo pipefail
fi
