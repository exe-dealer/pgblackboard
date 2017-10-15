RUST_IMAGE := rust:1.21

.PHONY: all
all: ui
	$(DOCKER_RUN) $(RUST_IMAGE) sh -c "cargo build --release --features uibuild"

.PHONY: ui
ui:
	mkdir -p ui/_dist
	$(DOCKER_RUN) node:8.6-alpine sh -c "npm run build"

.PHONY: run
run:
	$(DOCKER_RUN) --publish 7890:7890 $(RUST_IMAGE) \
		sh -c "cargo run -- $(args)"

.PHONY: build_dev
build_dev:
	$(DOCKER_RUN) $(RUST_IMAGE) sh -c "cargo build"

.PHONY: lint
lint:
	$(DOCKER_RUN) node:8.6-alpine sh -c "npm run lint"

.PHONY: rust_shell
rust_shell:
	$(DOCKER_RUN) $(RUST_IMAGE) bash

PGBB_VERSION := 0.2.0
DEB_PACKAGE_DIR := target/release/pgblackboard_$(PGBB_VERSION)-1_amd64

.PHONY: deb _deb
deb: all
	$(DOCKER_RUN) node:7 sh -c "make _deb"
_deb:
	mkdir -p $(DEB_PACKAGE_DIR)/DEBIAN $(DEB_PACKAGE_DIR)/usr/bin
	cp -r debian $(DEB_PACKAGE_DIR)/
	cp target/release/pgblackboard $(DEB_PACKAGE_DIR)/usr/bin/pgblackboard
	dpkg-deb --build $(DEB_PACKAGE_DIR)
	rm -r $(DEB_PACKAGE_DIR)

node_modules: package.json
	npm install

.PHONY: clean
clean:
	rm -r target ui/_dist node_modules

DOCKER_RUN := docker run -it --rm \
	--volume $$PWD/.cargo_registry:/usr/local/cargo/registry \
	--volume $$PWD:/source \
	--workdir /source
