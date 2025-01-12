import wasm_b64url from './psqlscan.wasm.js';
// https://deno.com/blog/v2.1#first-class-wasm-support
// but esbuild not supports wasm imports.

const wasm = await WebAssembly.instantiateStreaming(fetch(wasm_b64url));

const { memory, psql_stmt_len, malloc, free } = wasm.instance.exports;
const utf8d = new TextDecoder();
const utf8e = new TextEncoder();

// TODO stream mode
export function psqlscan_split(sql) {
  const input_cap = sql.length * 3;
  const input_p = malloc(input_cap);
  try {
    const input_buf = new Uint8Array(memory.buffer, input_p, input_cap);
    const { written } = utf8e.encodeInto(sql, input_buf);
    const res = [];
    for (let of = 0; of < written; ) {
      const len = psql_stmt_len(input_p + of, written - of);
      // TODO avoid new strings allocation, use sql.slice(...)
      res.push(utf8d.decode(input_buf.subarray(of, of + len)));
      of += len;
    }
    return res;
  } finally {
    free(input_p);
  }
}

// console.log(psqlscan_split(String.raw `
//   begin read write;

//   create or Replace function hello(lang text)
//   returns text /* ; */ -- ;
//   begin atomic;
//     select case lang
//       when 'ru' then e''
//       '\'привет;\''
//       else $$hello;$$
//     end;
//   end;

//   select hello('ru');

//   rollback
// `));
