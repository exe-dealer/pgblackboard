import { parseArgs as parse_args } from './_vendor/parse_args.js';
import { pgconnection } from './_vendor/pgwire.js';
import { psqlscan_iter } from './psqlscan/mod.js';
import api_tree_sql from './api_tree.sql' with { type: 'bytes' };
import api_defn_sql from './api_defn.sql' with { type: 'bytes' };
import index_html from '../ui/index.html' with { type: 'bytes' };
// import app_version from './version.json' with { type: 'json' };

const help_msg = `
pgBlackboard: Postgres web interface for SQL geeks

USAGE:
  pgbb [OPTIONS] 'postgres://host:port?params'

OPTIONS:
  -p, --listen-port  HTTP server listen port (default 7890)
  -a, --listen-addr  HTTP server host (default 0.0.0.0)
  -h, --help         show help message
`;

const application_name = 'pgBlackboard';

if (import.meta.main) {
  await main(Deno.args);
}

async function main(args) {
  const flags = parse_args(args, {
    // https://jsr.io/@std/cli/1.0.25/parse_args.ts#L322
    boolean: ['help'],
    string: ['listen-addr', 'listen-port'],
    alias: {
      'p': 'listen-port',
      'a': 'listen-addr',
      'h': 'help',
    },
    default: {
      'listen-port': '7890',
    },
    unknown(arg, unknown_key) {
      if (unknown_key) throw Error(`unknown flag "${arg}"`);
      return true; // pass positional args
    },
  });

  if (flags['help']) {
    return console.log(help_msg);
  }

  // console.log('pgBlackboard', app_version);

  const env = {
    pg_uri: flags._[0],
    wakers: new Map(),
    ... await init_secret(),
  };

  // TODO should we support standalone https/h2 server?
  const server = Deno.serve({
    hostname: flags['listen-addr'],
    port: Number(flags['listen-port']),
    handler: (req, inf) => respond(req, inf, env),
    onListen({ port, hostname }) {
      console.log('listening on %s:%s', hostname, port);
    },
  });

  await server.finished;
}

async function respond(req, inf, env) {
  const url = new URL(req.url);
  const remote_addr = inf.remoteAddr;
  const ctx = { __proto__: env, req, url, remote_addr };

  log_request(ctx);

  const { method } = req;
  const path = url.pathname;

  // TODO GET / dynamic <title>{application_name}</title>

  if (path == '/') {
    if (method == 'GET' || method == 'HEAD') {
      return serve_index(ctx);
    }

    if (method == 'POST') {
      const qs_api = url.searchParams.get('api');
      if (qs_api == 'auth') return api_auth(ctx);
      if (qs_api == 'wake') return api_wake(ctx); // TODO auth

      const unauthorized_res = await authorize(ctx);
      if (unauthorized_res) return unauthorized_res;

      if (qs_api == 'tree') return api_tree(ctx);
      if (qs_api == 'defn') return api_defn(ctx);
      if (qs_api == 'run') return api_run(ctx);

      return Response.json({ error: 'uknown api' }, { status: 400 });
    }

    return Response.json({ error: 'method not allowed' }, { status: 405 });
  }

  if (path == '/favicon.ico') {
    if (method == 'GET' || method == 'HEAD') {
      // https://github.com/denoland/deno/issues/30353
      const headers = { location: 'favicon.svg' };
      return new Response(null, { status: 302, headers });
    }
    return Response.json({ error: 'method not allowed' }, { status: 405 });
  }

  return serve_static(ctx);
}

async function init_secret() {
  const secret = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return { secret };
}

async function authorize(ctx) {
  const { req, url, secret } = ctx;
  const token = req.headers.get('x-pgbb-auth');
  // username parameter (?u=postgres) is redundant,
  // it is only needed for observability
  const u = url.searchParams.get('u');
  try {
    const token_u8 = Uint8Array.fromBase64(token, { alphabet: 'base64url' });
    const iv = token_u8.subarray(0, 12);
    const payload_encrypted = token_u8.subarray(12);
    const payload_serialized = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, secret, payload_encrypted);
    const payload = JSON.parse(new TextDecoder().decode(payload_serialized));

    const [user, password] = payload;
    if (user !== u) throw Error('user mismatch');
    ctx.user = user;
    ctx.password = password;
  } catch (ex) {
    console.error(ex);
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
}

async function api_auth({ pg_uri, secret, req, url }) {
  const user = url.searchParams.get('u');
  // TODO rate limit
  // TODO body size limit
  const { password } = await req.json(); // base64 ?
  // TODO block weak password ?
  const pg = pgconnection(
    { password, user },
    pg_uri,
    {
      database: 'postgres',
      application_name,
      // https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-CONNECT-REQUIRE-AUTH
      // TODO require_auth: 'scram-sha-256,md5'
    },
  );
  try {
    await pg.query();
  } catch (ex) {
    console.error(ex);
    // TODO respond network_error or postgres_auth_error,
    // do not expose string message
    return Response.json({ ok: false, error: String(ex) });
  } finally {
    await pg.end();
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = [user, password];
  const payload_serialized = new TextEncoder().encode(JSON.stringify(payload));
  const payload_encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, secret, payload_serialized);
  const token = Uint8Array.of(...iv, ...new Uint8Array(payload_encrypted)).toBase64({ alphabet: 'base64url' });

  return Response.json({ ok: true, token });
}

async function api_tree({ pg_uri, url, user, password }) {
  const database = url.searchParams.get('db') || undefined;
  const ntype = url.searchParams.get('ntype');
  const noid = url.searchParams.get('noid');
  const ntid = url.searchParams.get('ntid');

  // TODO handle auth error when password changed
  await using pg = pgconnection({
    user,
    password,
    database,
    default_transaction_read_only: 'on',
    search_path: 'pg_catalog',
  }, pg_uri, {
    database: 'postgres',
    statement_timeout: '10s',
    application_name,
  });
  const { rows } = await pg.query({
    statement: api_tree_sql,
    params: [
      { type: 'text', value: ntype },
      { type: 'oid', value: noid },
      { type: 'text', value: ntid },
    ],
  });
  const result = rows.map(([db, ntype, noid, ntid, name, descr, mod, size, leaf]) => ({
    db, ntype, noid: noid ?? undefined, ntid: ntid ?? undefined, name, descr, mod, size, leaf,
  }));
  return Response.json({ result });
}

async function api_defn({ pg_uri, url, user, password }) {
  const database = url.searchParams.get('db');
  const ntype = url.searchParams.get('ntype');
  const noid = url.searchParams.get('noid');
  const ntid = url.searchParams.get('ntid');

  // TODO handle auth error when password changed
  await using pg = pgconnection({
    user,
    password,
    database,
    default_transaction_read_only: 'on',
    search_path: 'pg_catalog',
  }, pg_uri, {
    statement_timeout: '10s',
    application_name,
  });
  const [result] = await pg.query({
    statement: api_defn_sql,
    params: [
      { type: 'text', value: ntype },
      { type: 'oid', value: noid },
      { type: 'text', value: ntid },
    ],
  });
  return Response.json({ result });
}

async function api_run(ctx) {
  // TODO abort previous or respond 409?

  // if (already_has_active) {
  //   if (is_aborting) return 409; // conflict
  //   await abort_active();
  // }

  // 'set this as active'();

  const resp_body = ReadableStream.from(api_run_body(ctx));
  return new Response(resp_body, {
    headers: {
      'content-type': 'text/x-ndjson; charset=utf-8', // TODO application/json
      'x-accel-buffering': 'no', // disable nginx buffering
      'cache-control': 'no-transform', // prevent gzip buffering
    },
  });
}

async function * api_run_body({ wakers, pg_uri, req, url, user, password }) {
  // TODO Prefer header?
  // https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Prefer#custom_preference
  const tz = url.searchParams.get('tz');
  const database = url.searchParams.get('db');
  const { signal } = req;
  const ctl = { wake() { } };
  const wake_id = crypto.randomUUID();
  let pg;
  let in_user_script = false;
  let statement_pos = 0;
  try {
    wakers.set(wake_id, ctl);

    // TODO kill previous connection - prevent connections leak in case of abort lag
    pg = pgconnection({
      user,
      database,
      password,
      statement_timeout: '1min',
      // 'pgbb.version': app_version,
    }, pg_uri, {
      client_min_messages: 'NOTICE',
      // _debug: true,
      _maxReadBuf: 10 << 20,
      // TODO _wakeInterval: 0
      TimeZone: tz,
      application_name,
    });

    // report connection error in user script context
    in_user_script = true;
    // TODO handle auth error when password changed?
    // cannot return headers from response body stream,
    // and cannot do pgconnect outside because response lifecycle control is eeky
    await pg.query();
    in_user_script = false;

    // TODO force search_path = pg_catalog
    await pg.query({
      message: 'Parse',
      paramTypes: ['jsonb'],
      statementName: 'pgbb_resolve_rowdescr',
      statement: /*sql*/ `
        with col_cte as (
          select coln, rec.*
          from pg_catalog.jsonb_array_elements($1) with ordinality _(el, coln)
          , pg_catalog.jsonb_to_record(el) rec("name" text, "typeOid" oid, "typeMod" int4, "tableOid" oid, "tableColumn" int2)
        ),

        -- TODO we can try to create value of type with sample wkt input.
        -- And if it produces wkb than the type is geometry:
        -- postgis.geometry 'SRID=4326;POINT (0 0)' == '0101000020E610000000000000000000000000000000000000'

        geom_typoid as (
          select t.oid
          from pg_catalog.pg_type t, pg_catalog.pg_depend d, pg_catalog.pg_extension e
          where d.deptype = 'e'
            and d.classid = pg_catalog.regclass 'pg_type'
            and d.objid = t.oid
            and d.refobjid = e.oid
            and t.typname in ('geometry', 'geography')
            and e.extname = 'postgis'
        )
        select pg_catalog.jsonb_build_object(
          'rel_name', (
            select pg_catalog.format('%I.%I', nspname, relname)
            from pg_catalog.pg_class
            join pg_catalog.pg_namespace on pg_namespace.oid = relnamespace
            where pg_class.oid = target_reloid
          ),
          'cols', array(
            select pg_catalog.jsonb_build_object(
              'name', "name",
              -- TODO full qualified type name
              -- https://github.com/postgres/postgres/blob/064e04008533b2b8a82b5dbff7da10abd6e41565/src/backend/utils/adt/format_type.c#L60
              'type', pg_catalog.format_type("typeOid", "typeMod"),
              'att_name', pg_catalog.quote_ident(attname),
              'att_key', attnum = any(target_key),
              'att_notnull', attnotnull,
              'is_geom', "typeOid" in (table geom_typoid)
            )
            from col_cte
            left join pg_catalog.pg_attribute on (attrelid, attnum) = ("tableOid", "tableColumn") and attrelid = target_reloid
            order by coln
          )
        )
        from (
          select "tableOid", conkey
          from col_cte
          -- TODO check unique index instead?
          join pg_catalog.pg_constraint on conrelid = "tableOid" and contype = 'p'
          group by "tableOid", conkey
          having conkey operator(pg_catalog.<@) array_agg("tableColumn") filter (where "tableColumn" > 0)
          union all
          select null, null
          order by 1 nulls last
          limit 1
        ) __ (target_reloid, target_key)
      `,
    }, {
      // we going to execute user script in transaction
      // and ask user confirmation before commit changes.
      statement: 'begin',
      // TODO execute user script in single implicit transaction:
      // - not all statemements can be executed in explicit transaction.
      // - CALL procedure() behaves differently in implicit and explicit transactions
      // - rollback/commit causes autocommit behavior
    }, { signal });

    let nbytes = 0;
    let nrows = 0;

    // Why split statements rather than do simple query?
    // - resolve columns types and editing info before sending rows to client
    //   to keep table editable when stream aborted.
    //   Resolve columns in separate connection is bad option because
    //   resolution will be executed outside of user script transaction
    //   and can loose newly created types and tables.
    // - simple query buffers response so execution progress is not visible
    // - use statement start position when postgres sends no error position
    const splitted_statements = psqlscan_iter(req.body);
    // TODO how deno allows duplex streaming?


    for await (const statement of splitted_statements) {
      // TODO yield start execution
      //   +statement_pos
      //   avoid ErrorResponse & NoticeResponse position modification
      //   allow navigate to statement in code by click to log message

      in_user_script = true;
      // TODO fwd NoticeResponse?
      const parse_res = await Array.fromAsync(pg.stream(
        { message: 'Parse', statement },
        { message: 'DescribeStatement' },
        { signal },
      ));
      in_user_script = false;

      // TODO report error if statement has parameters (ParameterDescription msg)

      const columns = (
        parse_res
        .filter(m => m.tag == 'RowDescription')
        .slice(0, 1)
        .flatMap(m => m.payload)
      );

      // resolve row description eagerly to keep table editable when stream aborted
      let head_msg = { cols: [] };
      if (columns.length) {
        [head_msg] = await pg.query(
          {
            message: 'Bind',
            statementName: 'pgbb_resolve_rowdescr',
            params: [{ type: 'jsonb', value: columns }],
          },
          { message: 'Execute' },
          { signal },
        );
      }

      const pg_stream = pg.stream(
        { message: 'Bind' },
        { message: 'Execute' },
        { signal },
      );

      in_user_script = true;
      for await (const { tag, payload, rows } of pg_stream) {
        if (
          nbytes >= (10 << 20) || // any chunk received when traffic limit is already reached
          rows.length && nrows >= 1000 // or new rows chunk received when rows limit is already reached
        ) {
          yield * suspend('traffic_limit_exceeded');
          nbytes = 0;
          nrows = 0;
        }
        let out_msg;
        switch (tag) {
          case 'RowDescription':
            out_msg = ['head', head_msg];
            break;

          case 'DataRow':
            out_msg = ['rows', rows.map(it => it.raw)];
            break;

          case 'NoticeResponse':
            // TODO statement_position?
            out_msg = ['notice', payload];
            break;

          case 'CommandComplete':
            out_msg = ['complete', payload];
            break;

          // case 'EmptyQueryResponse':
          case 'PortalSuspended': // TODO impossible?
            out_msg = ['complete', tag];
            break;

          default:
            continue;
        }
        const out_msg_b = jsonl_enc(out_msg);
        nbytes += out_msg_b.length;
        nrows += rows.length;
        yield out_msg_b;
      }
      in_user_script = false;
      statement_pos += statement.length;
    }

    const [tx_has_changes] = await pg.query({
      // TODO pg_current_xact_id_if_assigned (v13)
      statement: /*sql*/ `select pg_catalog.txid_current_if_assigned() is not null`,
    });

    if (tx_has_changes) {
      yield * suspend('idle_in_transaction');
      await pg.query('commit');
    }
  } catch (ex) {
    if (in_user_script && /^PgError\b/.test(ex)) {
      console.error(ex); // TODO? if (signal.aborted)

      yield jsonl_enc(['error', {
        ...ex.cause,
        position: statement_pos + (ex.cause.position || 1),
      }]);
    } else {
      console.error(ex); // TODO? if (signal.aborted)
      // TODO create dedicated message tag for client error
      yield jsonl_enc(['error', {
        severityEn: 'ERROR',
        severity: 'ERROR', // TODO non localized
        code: 'E_PGBB_BACKEND',
        message: String(ex),
        // TODO fix err.cause not exposed (too big message)
        // detail: Deno.inspect(err),
      }]);
    }
  } finally {
    // console.log('ending connection');
    wakers.delete(wake_id);
    // TODO destroy if end timeout
    await pg?.end();
  }

  function jsonl_enc(data) {
    const utf8enc = new TextEncoder();
    return utf8enc.encode(JSON.stringify(data) + '\n');
  }

  async function * suspend(reason) {
    signal.throwIfAborted();
    const { promise, resolve, reject } = Promise.withResolvers();
    ctl.wake = resolve;
    const onabort = _ => reject(signal.reason);
    signal.addEventListener('abort', onabort);
    try {
      yield jsonl_enc(['suspended', { wake_id, reason }]);
      await promise;
    } finally {
      signal.removeEventListener('abort', onabort);
    }
  }
}

async function api_wake({ wakers, url }) {
  // TODO we can limit "api_run" to one per auth token,
  // (and abort prevous api_run)
  // so no need to identificate "api_run"
  const id = url.searchParams.get('id');
  const ctl = wakers.get(id);
  ctl?.wake();
  // TODO ratelimit - sleep 1 sec
  return Response.json({ ok: true });
}

async function serve_index(_ctx) {
  return new Response(index_html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

async function serve_static({ req, url }) {
  if (req.method != 'GET') {
    return Response.json({ error: 'method not allowed' }, { status: 405 });
  }

  const { pathname } = url;
  // TODO check for parent traverse? seems that req.url is already sanitized
  const file_url = import.meta.resolve('../ui' + pathname);
  let res;
  try {
    res = await fetch(file_url);
  } catch {
    // TODO no way to detect file_not_found when using fetch
    // https://github.com/denoland/deno/blob/9006b37ea61590ff3f55ee3acf1f3677ae57e55e/ext/fetch/fs_fetch_handler.rs
    return Response.json({ error: 'not found' }, { status: 404 });
  }

  return new Response(res.body, {
    headers: {
      // TODO etag
      'content-type': get_content_type(pathname),
    },
  });

  function get_content_type(fname) {
    // if (/\.html$/.test(fname)) return 'text/html; charset=utf-8';
    // if (/\.ico$/.test(fname)) return 'image/vnd.microsoft.icon';
    if (/\.css$/.test(fname)) return 'text/css; charset=utf-8';
    if (/\.js$/.test(fname)) return 'text/javascript; charset=utf-8';
    if (/\.svg$/.test(fname)) return 'image/svg+xml; charset=utf-8';
    if (/\.woff2$/.test(fname)) return 'font/woff2';
  }
}

function log_request({ req, url, remote_addr }) {
  // we will trust x-forwarded-for because the server cannot be
  // run without a reverse proxy, we don't even support https
  const top_xff = /^.+(?=,)/.exec(req.headers.get('x-forwarded-for'))?.[0];
  const client_addr = top_xff || remote_addr.hostname; // https://docs.deno.com/api/deno/~/Deno.Addr
  // TODO log response status
  console.log(client_addr, req.method, url.pathname + url.search);
}
