import index_html from './index.html' with { type: 'text' };
import favicon_svg from './favicon.svg' with { type: 'text' };
import style_css from './style.css' with { type: 'text' };
import main_js from './main.js' with { type: 'text' };
import map_js from './map.js' with { type: 'text' };

const embedded = {
  '/': new Blob([index_html], { type: 'text/html; charset=utf-8' }),
  '/favicon.svg': new Blob([favicon_svg], { type: 'image/svg+xml; charset=utf-8' }),
  '/style.css': new Blob([style_css], { type: 'text/css; charset=utf-8' }),
  '/main.js': new Blob([main_js], { type: 'text/javascript; charset=utf-8' }),
  '/map.js': new Blob([map_js], { type: 'text/javascript; charset=utf-8' }),
  __proto__: null,
};

// TODO template
// export function index_html({ title }) {

// }

export async function get_asset(pathname) {
  const emb = embedded[pathname];
  if (emb) return emb;

  DEV: {
    const file_url = import.meta.resolve('.' + pathname);
    const res = await fetch(file_url);
    return new Blob([await res.blob()], { type: get_content_type(pathname) });

    function get_content_type(fname) {
      // if (/\.html$/.test(fname)) return 'text/html; charset=utf-8';
      // if (/\.ico$/.test(fname)) return 'image/vnd.microsoft.icon';
      if (/\.css$/.test(fname)) return 'text/css; charset=utf-8';
      if (/\.js$/.test(fname)) return 'text/javascript; charset=utf-8';
      if (/\.svg$/.test(fname)) return 'image/svg+xml; charset=utf-8';
      if (/\.woff2$/.test(fname)) return 'font/woff2';
    }
  }

  return null;
}
