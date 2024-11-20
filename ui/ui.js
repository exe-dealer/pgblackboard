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
globalThis.debug_store = store;
watchEffect(_ => {
  editor.setTheme(store.light_theme ? 'pgbb-light' : 'pgbb-dark');
});

const app = createApp({
  // TODO createApp(root_component) does not render by mixin
  render() { return create_vnode(root_component); },
});

app.config.globalProperties.$store = store;
app.use(pojo_vdom_plugin);
app.use(broadcast_plugin);
app.mount('body');

function pojo_vdom_plugin(app) {
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
    if (typeof def == 'function') { // default slot
      return (...args) => transform_vdom(def(...args));
    }
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
}

function broadcast_plugin(app) {
  const et = new EventTarget();

  app.mixin({
    mounted() {
      const broadcast_listeners = this._get_broadcast_listeners?.();
      if (!broadcast_listeners) return;
      this._broadcast_listeners = broadcast_listeners;
      for (const [event, listener] of Object.entries(broadcast_listeners)) {
        et.addEventListener(event, listener);
      }
    },
    unmounted() {
      if (!this._broadcast_listeners) return;
      for (const [event, listener] of Object.entries(broadcast_listeners)) {
        et.removeEventListener(event, listener);
      }
    },
    methods: {
      $broadcast(event, details) {
        et.dispatchEvent(new CustomEvent(event, { details }));
      },
    },
  });
}
