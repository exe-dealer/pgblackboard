.PHONY: up shell dist clean ui/_vendor/* server/_vendor/*

up:
	COMPOSE_BAKE=true docker compose up --build --watch --menu=false

shell:
	COMPOSE_BAKE=true docker compose run --build --rm --volume $(PWD):/w --workdir /w pgbb ash

clean:
	rm -rf ui/.build dist

dist: dist/pgbb.js

dist/pgbb.js: \
		ui/.build/importmap.json \
		ui/.build/assets.js \
		ui/.build/index.html \
		ui/.build/favicon.svg \
		ui/.build/style.css \
		ui/.build/main.js \
		ui/.build/map.js

	deno bundle \
		--unstable-raw-imports \
		--import-map=ui/.build/importmap.json \
		./server/pgbb.js \
		--output=$@

ui/.build/importmap.json:
	install -D /dev/null $@
	echo '{ "imports": { "../assets.js": "./assets.js" } }' > $@

ui/.build/assets.js: ui/assets.js
	esbuild $< --outfile=$@ --drop-labels=DEV

ui/.build/%.js: ui/%.js
	esbuild $< --outfile=$@ \
		--bundle \
		--format=esm

ui/.build/style.css: ui/style.css
	esbuild $< --outfile=$@ \
		--bundle \
		--target=chrome100 \
		--loader:.svg=dataurl \
		--loader:.woff2=dataurl \

ui/.build/%: ui/%
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
