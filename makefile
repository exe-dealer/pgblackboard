.PHONY: up produp shell dist clean ui/_vendor/* server/_vendor/*

export COMPOSE_BAKE=true

up:
	docker compose up --build --watch --menu=false dev postgres

produp:
	docker compose up --build --menu=false prod postgres

shell:
	docker compose run --build --rm --volume $(PWD):/w --workdir /w dev ash

clean:
	rm -rf dist

dist: \
		dist/server/pgbb \
		dist/server/pgbb.js \
		dist/ui/favicon.svg \
		dist/ui/style.css \
		dist/ui/main.js

dist/server/pgbb.js:
	esbuild ./server/pgbb.js --outfile=$@ --bundle --format=esm

dist/ui/main.js:
	esbuild ui/main.js --outdir=dist/ui \
		--bundle \
		--format=esm \
		--splitting \
		--chunk-names=[name]

dist/ui/style.css: ui/style.css
	esbuild $< --outfile=$@ \
		--bundle \
		--target=chrome100 \
		--loader:.svg=dataurl \
		--loader:.woff2=dataurl \

dist/%: %
	install -D $< $@

ui/_vendor/vue.js:
	# TODO https://unpkg.com/vue@3.5.13/dist/vue.esm-browser.prod.js
	wget -O $@ 'https://unpkg.com/vue@3.5.13/dist/vue.esm-browser.js'

ui/_vendor/maplibre.css:
	wget -O $@ 'https://esm.sh/maplibre-gl@5.16.0/dist/maplibre-gl.css'
	deno fmt $@
ui/_vendor/maplibre.js:
	wget -O $@ 'https://esm.sh/v135/maplibre-gl@5.16.0/es2022/dist/maplibre-gl-dev.development.bundle.js'
	sed -i '/^\/\/# sourceMappingURL/d' $@

ui/_vendor/monaco.css:
	wget -O $@ 'https://esm.sh/monaco-editor@0.55.1/es2022/monaco-editor.css'
	deno fmt $@
ui/_vendor/monaco.js:
	wget -O $@ 'https://esm.sh/v135/monaco-editor@0.55.1/es2022/esm/vs/editor/editor.main.development.bundle.js'
ui/_vendor/monaco_worker.js:
	wget -O $@ 'https://esm.sh/v135/monaco-editor@0.55.1/es2022/esm/vs/editor/editor.worker.development.bundle.js?worker'
ui/_vendor/monaco_json_worker.js:
	wget -O $@ 'https://esm.sh/v135/monaco-editor@0.55.1/es2022/esm/vs/language/json/json.worker.development.bundle.js?worker'

server/_vendor/pgwire.js:
	wget -O $@ 'https://raw.githubusercontent.com/exedealer/pgwire/24465b25768ef0d9048acee1fddc748cf1690a14/mod.js'
server/_vendor/parse_args.js:
	deno bundle -o $@ 'https://jsr.io/@std/cli/1.0.25/parse_args.ts'

# docker run -it --rm -v $PWD:/app -w /app alpine:3.23.2
# apk add --no-cache make clang wasi-sdk lld flex
# apk add --repository=https://dl-cdn.alpinelinux.org/alpine/edge/testing wabt

# TODO -O3 not works
server/psqlscan/psqlscan.wasm: server/psqlscan/.psqlscan.c
	clang --target=wasm32-wasi \
		--sysroot=/usr/share/wasi-sysroot \
		-nostartfiles \
		-Wl,--no-entry \
		-o $@ \
		$<
	chmod -x $@

server/psqlscan/.psqlscan.c: server/psqlscan/psqlscan.l
	flex -o $@ $<
