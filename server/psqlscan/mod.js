import wasm_src from './psqlscan.wasm' with { type: 'bytes' };
// https://deno.com/blog/v2.1#first-class-wasm-support
// but esbuild not supports wasm imports.

// TODO set memory limit option?
const wasm = await WebAssembly.instantiate(wasm_src);
const { memory, psql_realloc, psql_free, psql_stmt_len } = wasm.instance.exports;

/**
 * @param {AsyncIterable<Uint8Array>} inp_stream
 * @return {AsyncIterable<string>}
 * */
export async function * psqlscan_iter(inp_stream) {
  // TODO avoid utf8 decoding,
  // we use it only for statement_pos += statement.length
  const utf8d = new TextDecoder();

  using buf = new Memblock();
  let buf_len = 0;
  for await (const chunk of inp_stream) {
    // console.log('chunk', chunk.toHex());

    if (!chunk.byteLength) continue;

    // grow buffer if full
    if (buf_len + chunk.byteLength > buf.size) {
      buf.realloc(buf.size + chunk.byteLength);
    }

    // append bytes to buffer
    buf.deref.set(chunk, buf_len);
    buf_len += chunk.byteLength;

    let off = 0;
    for (;;) {
      const stmt_len = psql_stmt_len(buf.p + off, buf_len - off);
      // do not emit last statement, may be uncompleted
      if (!(off + stmt_len < buf_len)) break;
      // TODO is it concurent safe to use single wasm instance?
      yield utf8d.decode(buf.deref.subarray(off, off + stmt_len));
      off += stmt_len;
    }

    // move last statement to end
    buf.deref.copyWithin(0, off, buf_len);
    buf_len -= off;
  }

  if (buf_len) {
    yield utf8d.decode(buf.deref.subarray(0, buf_len));
  }
}

class Memblock {
  p = 0;
  size = 0;

  get deref() {
    return new Uint8Array(memory.buffer, this.p, this.size);
  }

  realloc(size) {
    const new_p = psql_realloc(this.p, size);
    if (!new_p) throw Error('realloc fail');
    this.size = size;
    this.p = new_p;
  }

  [Symbol.dispose]() {
    psql_free(this.p);
  }
}

// const split = (...chunks) => Array.fromAsync(psqlscan_iter(new Blob(chunks).stream()));
// console.log(await split(String.raw `
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


// const split = (...chunks) => Array.fromAsync(psqlscan_iter(new Blob(chunks).stream()));

// console.log(await split('', 'hello; one', 'three'));
// console.log(await split(
//   Uint8Array.fromHex('d0bfd180d0'),
//   Uint8Array.fromHex('b8d0b2d0b5d182'),
//   Uint8Array.fromHex('f0'),
//   Uint8Array.fromHex('9f9880'),
//   '_three')
// );
