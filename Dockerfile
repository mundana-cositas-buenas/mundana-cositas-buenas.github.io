FROM debian:forky-20260824-slim

LABEL maintainer="Jeremías Casteglione <jrmsdev@gmail.com>"
LABEL version="260928"

ENV MUNDANA_UPGRADE=260928

USER root:root
WORKDIR /root

ENV USER=root
ENV HOME=/root

ENV DEBIAN_FRONTEND=noninteractive

ENV APT_INSTALL='bash openssl ca-certificates media-types less wget curl python3 npm make git shellcheck'

RUN apt-get clean \
	&& apt-get update -yy \
	&& apt-get dist-upgrade -yy --purge \
	&& apt-get install -yy --no-install-recommends ${APT_INSTALL} \
	&& apt-get clean \
	&& apt-get autoremove -yy --purge \
	&& rm -rf /var/lib/apt/lists/* \
		/var/cache/apt/archives/*.deb \
		/var/cache/apt/*cache.bin

ARG DEVEL_UID=1000
ARG DEVEL_GID=1000
ARG DEVEL_USER=devel

ENV DEVEL_UID=${DEVEL_UID}
ENV DEVEL_GID=${DEVEL_GID}
ENV DEVEL_USER=${DEVEL_USER}

RUN groupadd -o -g ${DEVEL_GID} ${DEVEL_USER} \
	&& useradd -o -d /home/${DEVEL_USER} -m -c "${DEVEL_USER}" -g ${DEVEL_GID} -u ${DEVEL_UID} ${DEVEL_USER} \
	&& chmod -v 0750 /home/${DEVEL_USER}

RUN printf 'umask %s\n' '027' >>/home/${DEVEL_USER}/.profile

COPY ./docker/user-login.sh /usr/local/bin/user-login.sh
RUN chmod -v 0755 /usr/local/bin/user-login.sh

RUN install -v -m 0750 -o ${DEVEL_USER} -g ${DEVEL_USER} -d /opt/mundana
RUN install -v -m 0750 -o ${DEVEL_USER} -g ${DEVEL_USER} -d /opt/mundana/site

RUN ln -vsf /home/${DEVEL_USER}/.local/npm/node_modules/.bin/claude /usr/local/bin/claude

USER ${DEVEL_USER}:${DEVEL_USER}
WORKDIR /home/${DEVEL_USER}

ENV USER=${DEVEL_USER}
ENV HOME=/home/${DEVEL_USER}

RUN npm version
RUN npx --version

ENV MUNDANA_CLAUDE_UPGRADE=2.1.257

RUN install -v -d -m 0750 ${HOME}/.local/npm \
	&& cd ${HOME}/.local/npm \
	&& npm install @anthropic-ai/claude-code

RUN /usr/local/bin/claude --version

ENTRYPOINT ["/usr/local/bin/user-login.sh"]
