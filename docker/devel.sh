#!/bin/sh
set -eu
_USER=$(id -un)
datadir="${HOME}/Docker/claude"
install -v -d -m 0750 "${datadir}"
install -v -d -m 0750 "${datadir}/config"
if ! test -s "${datadir}/claude.json"; then
	touch "${datadir}/claude.json"
fi
exec docker run -it --rm -u "${_USER}" \
	--hostname mundana.local \
	-e "TERM=${TERM}" \
	-v "${datadir}/config:/home/${_USER}/.claude" \
	-v "${datadir}/claude.json:/home/${_USER}/.claude.json" \
	-v "${PWD}:/opt/mundana/site" \
	--workdir /opt/mundana/site \
	mundana/site
