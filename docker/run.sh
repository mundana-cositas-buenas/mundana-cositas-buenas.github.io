#!/bin/sh
set -eu
_USER=$(id -un)
exec docker run -it --rm -u "${_USER}" \
	--name mundana-vite \
	--hostname vite.mundana.local \
	-v "${PWD}:/opt/mundana/site" \
	--workdir /opt/mundana/site \
	--entrypoint /usr/bin/npm \
	-p 127.0.0.1:5173:5173 \
	mundana/site run dev -- --host 0.0.0.0 --port 5173
