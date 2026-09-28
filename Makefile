# host targets

.PHONY: docker
docker:
	docker/build.sh

.PHONY: clean
clean:
	@rm -rf dist coverage .vite __pycache__

.PHONY: distclean
distclean: clean
	@rm -rf node_modules

# container targets

.PHONY: check
check:
	@git ls-files | grep -F .sh | xargs shellcheck
	@python3 -m py_compile release.py upgrade.py && rm -rf __pycache__

.PHONY: ci-check
ci-check: check
	@npm ci
	@npm run check
	@npm run test

.PHONY: test
test:
	@npm run check
	@npm run test

.PHONY: build
build:
	@npm run build

.PHONY: dev
dev:
	@npm run dev

.PHONY: upgrade
upgrade:
	@python3 upgrade.py
