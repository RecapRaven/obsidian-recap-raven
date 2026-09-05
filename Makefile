NODE_IMAGE ?= node:22.23.2-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5
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
