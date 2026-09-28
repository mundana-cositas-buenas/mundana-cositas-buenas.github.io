#!/bin/sh
set -eu

_USER=$(id -un)
_UID=$(id -u)
_GID=$(id -g)

exec docker build --rm \
	--build-arg "DEVEL_USER=${_USER}" \
	--build-arg "DEVEL_UID=${_UID}" \
	--build-arg "DEVEL_GID=${_GID}" \
	-t mundana/site .
