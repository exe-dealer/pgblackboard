import { defineAsyncComponent } from '../_vendor/vue.js';

const mod_promise = import('./map.js');
export default defineAsyncComponent({
  loader: _ => mod_promise,
});
