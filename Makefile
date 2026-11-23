NODE_IMAGE ?= node:22.23.2-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9
DOCKER_RUN = docker run --rm --user $$(id -u):$$(id -g) -e npm_config_cache=/tmp/npm-cache -v "$$(pwd):/app" -w /app $(NODE_IMAGE)

.PHONY: install dev typecheck lint test build check version

install:
	$(DOCKER_RUN) npm ci

dev: install
	$(DOCKER_RUN) npm run dev

typecheck: install
	$(DOCKER_RUN) npm run typecheck

lint: install
	$(DOCKER_RUN) npm run lint

test: install
	$(DOCKER_RUN) npm run test:coverage

build: install
	$(DOCKER_RUN) npm run build

check: install
	$(DOCKER_RUN) npm run check

version:
	docker run --rm --user $$(id -u):$$(id -g) -e npm_config_cache=/tmp/npm-cache -e VERSION="$(VERSION)" -v "$$(pwd):/app" -w /app $(NODE_IMAGE) sh -c 'test -n "$$VERSION" && npm version "$$VERSION" --no-git-tag-version'
