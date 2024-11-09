import monaco_worker from './_vendor/monaco_worker.js';
import monaco_json_worker from './_vendor/monaco_json_worker.js';
import { editor } from './_vendor/monaco.js';
import { createApp, reactive, watchEffect, h as create_vnode } from './_vendor/vue.js';
import root_component from './app/app.js';
import { Store } from './store.js';

globalThis.MonacoEnvironment = {
  getWorker(_module_id, label) {
    switch (label) {
      case 'json': return monaco_json_worker();
      default: return monaco_worker();
    }
	},
};

editor.defineTheme('pgbb-dark', {
	base: 'vs-dark',
	inherit: true,
  colors: {
    'editorLineNumber.foreground': '#5c5c5c',
  },
	rules: [
    { token: 'comment', foreground: '888888' },
    { token: 'string.sql', foreground: 'CE9178' },
  ],
});

editor.defineTheme('pgbb-light', {
	base: 'vs',
	inherit: true,
  colors: {},
	rules: [
    { token: 'comment', foreground: '888888' },
    { token: 'string.sql', foreground: 'A31515' },
  ],
});

const store = reactive(new Store());
const app = createApp({
  // TODO createApp(root_component) does not render by mixin
  render() { return create_vnode(root_component); },
});
app.config.globalProperties.$store = store;

watchEffect(_ => {
  editor.setTheme(store.light_theme ? 'pgbb-light' : 'pgbb-dark');
});

app.mixin({
  render() {
    return transform_vdom(this._render());
  },
  mounted() {
    this._mounted?.();
  },
  unmounted() {
    this._unmounted?.();
  },
});

function transform_vdom(def) {
  if (Array.isArray(def)) {
    for (let i = 0; i < def.length; i++) {
      def[i] = transform_vdom(def[i]);
    }
  };
  const { tag, inner } = def || 0;
  if (tag) {
    def.tag = undefined;
    def.inner = undefined;
    def = create_vnode(tag, def, transform_vdom(inner));
  }
  return def;
}

app.mount('body');

globalThis.debug_store = store;
