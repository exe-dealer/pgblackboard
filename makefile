.PHONY: build clean ui/_vendor/* server/_vendor/*

up:
	docker compose up --build -w --menu=false

build: \
	.dist/ui/index.html \
	.dist/ui/favicon.svg \
	.dist/ui/ui.css \
	.dist/ui/ui.js \
	.dist/server/pgbb.js \
	.dist/bin/pgbb

clean:
	rm -r .dist

.dist/%.js: %.js # TODO imported deps
	esbuild $< --outfile=$@ --bundle --format=esm

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
	curl -o $@ 'https://unpkg.com/vue@3.5.13/dist/vue.esm-browser.js'

ui/_vendor/maplibre.css:
	curl -o $@ 'https://esm.sh/maplibre-gl@5.0.1/dist/maplibre-gl.css'
	deno fmt $@
ui/_vendor/maplibre.js:
	curl -o $@ 'https://esm.sh/v135/maplibre-gl@5.0.1/es2022/dist/maplibre-gl-dev.development.bundle.js'

ui/_vendor/monaco.css:
	curl -o $@ 'https://esm.sh/v135/monaco-editor@0.52.2/es2022/monaco-editor.css'
	deno fmt $@
ui/_vendor/monaco.js:
	curl -o $@ 'https://esm.sh/v135/monaco-editor@0.52.2/es2022/esm/vs/editor/editor.main.development.bundle.js'
ui/_vendor/monaco_worker.js:
	curl -o $@ 'https://esm.sh/v135/monaco-editor@0.52.2/es2022/esm/vs/editor/editor.worker.development.bundle.js?worker'
ui/_vendor/monaco_json_worker.js:
	curl -o $@ 'https://esm.sh/v135/monaco-editor@0.52.2/es2022/esm/vs/language/json/json.worker.development.bundle.js?worker'

server/_vendor/pgwire.js:
	curl -o $@ 'https://raw.githubusercontent.com/kagis/pgwire/b992f307097ac5bd350ba41ea4c85d194ccb611f/mod.js'
server/_vendor/parse_args.ts:
	curl -o $@ 'https://jsr.io/@std/cli/1.0.9/parse_args.ts'


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
		-Wl,--export,psql_stmt_len \
		-Wl,--export,malloc \
		-Wl,--export,free \
		-Wl,--no-entry \
		-o $@ \
		$<

server/psqlscan/.psqlscan.c: server/psqlscan/psqlscan.l
	flex -o $@ $<
