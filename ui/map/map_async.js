import { defineAsyncComponent } from '../_vendor/vue.js';
const xMapModule = import('./map.js');

export default defineAsyncComponent({
  loader: _ => xMapModule,
});
