.PHONY: up shell build clean ui/_vendor/* server/_vendor/*

up:
	COMPOSE_BAKE=true docker compose up --build --watch --menu=false

shell:
	COMPOSE_BAKE=true docker compose run --build --rm --volume $(PWD):/w --workdir /w pgbb ash

build: \
	.dist/ui/index.html \
	.dist/ui/favicon.svg \
	.dist/ui/ui.css \
	.dist/ui/ui.js \
	.dist/server/pgbb.js \
	.dist/bin/pgbb

clean:
	rm -rf .dist

.dist/ui/ui.js: ui/*.js # ui/*/*.js  exclude _vendor?
	esbuild ui/ui.js --outdir=.dist/ui \
		--bundle \
		--format=esm \
		--splitting \
		--chunk-names=[name]

.dist/server/pgbb.js: server/*.js # TODO imported deps
	esbuild server/pgbb.js --outfile=$@ --bundle --format=esm
	# deno bundle $< --output=$@ --minify

.dist/%.css: %.css # TODO imported deps
	esbuild $< --outfile=$@ \
		--bundle \
		--target=chrome100 \
		--loader:.svg=dataurl \
		--loader:.woff2=dataurl \

.dist/%: %
	install -D $< $@

ui/_vendor/vue.js:
	# TODO https://unpkg.com/vue@3.5.13/dist/vue.esm-browser.prod.js
	wget -O $@ 'https://unpkg.com/vue@3.5.13/dist/vue.esm-browser.js'

ui/_vendor/maplibre.css:
	wget -O $@ 'https://esm.sh/maplibre-gl@5.15.0/dist/maplibre-gl.css'
	deno fmt $@
ui/_vendor/maplibre.js:
	wget -O $@ 'https://esm.sh/v135/maplibre-gl@5.15.0/es2022/dist/maplibre-gl-dev.development.bundle.js'
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
	wget -O $@ 'https://raw.githubusercontent.com/kagis/pgwire/b992f307097ac5bd350ba41ea4c85d194ccb611f/mod.js'
server/_vendor/parse_args.js:
	deno bundle -o $@ 'https://jsr.io/@std/cli/1.0.25/parse_args.ts'
	# wget -O $@ 'https://jsr.io/@std/cli/1.0.12/parse_args.ts'


# docker run -it --rm -v $PWD:/app -w /app alpine:3.21.2
# apk add --no-cache make clang wasi-sdk lld flex
# apk add --repository=https://dl-cdn.alpinelinux.org/alpine/edge/testing wabt

server/psqlscan/psqlscan.wasm.js: server/psqlscan/.psqlscan.wasm
	base64 -w0 $< | awk '{ print "export default `data:application/wasm;base64," $$0 "`;"  }' > $@

# TODO -O3 not works
server/psqlscan/.psqlscan.wasm: server/psqlscan/.psqlscan.c
	clang --target=wasm32-wasi \
		--sysroot=/usr/share/wasi-sysroot \
		-nostartfiles \
		-Wl,--export,malloc \
		-Wl,--export,free \
		-Wl,--no-entry \
		-o $@ \
		$<

server/psqlscan/.psqlscan.c: server/psqlscan/psqlscan.l
	flex -o $@ $<
