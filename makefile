all: static/dist/app.js static/dist/index.html static/dist/style.css static/dist/map.js static/dist/map.css static/dist/table.js static/dist/table.css static/dist/favicon.ico

static/dist/app.js: static/tree.sql static/main.js static/splitpanel.js static/model.js
	{ \
		echo '(function (undefined) {'; \
		python3 -c "import json; \
			import itertools; \
			parts = open('static/tree.sql').read().split('---')[1:]; \
			print('var treesql = ', json.dumps(dict(zip(parts[::2], parts[1::2]))), ';');"; \
		cat static/splitpanel.js; \
		cat static/model.js; \
		cat static/main.js; \
		echo '})()'; \
	} > static/dist/app.js

static/dist/index.html: static/index.html
	cp static/index.html static/dist/index.html

static/dist/style.css: static/fontello/css/fontello-embedded.css static/layout.css static/sidebar.css static/splitpanel.css static/dark.css
	{ \
		cat static/fontello/css/fontello-embedded.css; \
		cat static/layout.css; \
		cat static/sidebar.css; \
		cat static/splitpanel.css; \
		cat static/dark.css; \
	} > static/dist/style.css

static/dist/map.js: static/map.js
	cp static/map.js static/dist/map.js

static/dist/map.css: static/map.css
	cp static/map.css static/dist/map.css

static/dist/table.js: static/table.js
	cp static/table.js static/dist/table.js

static/dist/table.css: static/table.css
	cp static/table.css static/dist/table.css

static/dist/favicon.ico: static/favicon.ico
	cp static/favicon.ico static/dist/favicon.ico
