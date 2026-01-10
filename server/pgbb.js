import { parseArgs as parse_args } from './_vendor/parse_args.js';
import { pgconnection } from './_vendor/pgwire.js';
import { psqlscan_iter } from './psqlscan/mod.js';
import { get_asset } from '../ui/assets.js';

const application_name = 'pgBlackboard';

export default async function main(args) {
  // TODO --help
  const flags = parse_args(args, {
    default: {
      'listen-port': '7890',
      // 'listen-addr': '0.0.0.0',
    },
  });

  const env = {
    pg_uri: flags._[0],
    wakers: new Map(),
    ... await init_secret(),
  };

  // TODO should we support standalone https/h2 server?
  const server = Deno.serve({
    hostname: flags['listen-addr'],
    port: Number(flags['listen-port']),
    handler: req => respond(req, env),
  });

  await server.finished;
}

async function respond(req, env) {
  const url = new URL(req.url);
  const ctx = { __proto__: env, req, url };

  // TODO log response status
  console.log(req.method, url.pathname + url.search);

  const { method } = req;
  const path = url.pathname;

  // TODO GET / dynamic <title>{application_name}</title>

  if (path == '/' && method == 'POST') {
    const qs_api = url.searchParams.get('api');
    if (qs_api == 'auth') return api_auth(ctx);
    if (qs_api == 'wake') return api_wake(ctx); // TODO auth

    const r = await authorize(ctx);
    if (r) return r;

    if (qs_api == 'tree') return api_tree(ctx);
    if (qs_api == 'defn') return api_defn(ctx);
    if (qs_api == 'run') return api_run(ctx);

    return Response.json({ error: 'uknown api' }, { status: 400 });
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
  const pg = pgconnection({ password, user }, pg_uri, { database: 'postgres', application_name });
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
    statement: tree_sql,
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
    statement: defn_sql,
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
      client_min_messages: 'LOG',
    }, pg_uri, {
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

async function serve_static({ req, url }) {
  if (req.method != 'GET') {
    return Response.json({ error: 'method not allowed' }, { status: 405 });
  }

  // TODO etag
  const asset = await get_asset(url.pathname);
  if (!asset) return Response.json({ error: 'not found' }, { status: 404 });
  return new Response(asset);
}

const tree_sql = String.raw /*sql*/ `
  select text ''          db
    , text ''             ntype
    , oid '0'             noid
    , text ''             ntid
    , text '' collate "C" "name"
    , text ''             descr
    , text ''             mod
    , float8 '0'          size
    , bool 'false'        leaf
    , int2 '0'            ord
  where false

  -- databases
  union all
  select datname, 'database', null, null, datname, descr, null, null, false, 1
  from pg_database, shobj_description(oid, 'pg_database') descr
  where $1 is null
    and not datistemplate

  -- schemas
  union all
  select current_catalog, 'schema', oid, null, nspname, descr, null, null, false, 1
  from pg_namespace, obj_description(oid, 'pg_namespace') descr
  where 'database' = $1
    and nspname not like all ('{ pg\\_toast , pg\\_temp\\_% , pg\\_toast\\_temp\\_% }')

  -- functions
  union all
  select current_catalog, 'function', p.oid, null, sign, descr, mod, null, true, 2
  from pg_proc p
  left join pg_aggregate agg on aggfnoid = oid
  , obj_description(p.oid, 'pg_proc') descr
  , pg_get_function_result(p.oid) fnres
  , format(
    '%s (%s)%s'
    , proname
    , pg_get_function_identity_arguments(p.oid)
    , e' \u2022 ' || fnres
  ) sign
  ,concat_ws(' '
    , case when agg is not null then 'aggregate' end
    , case when fnres is null then 'procedure' end
  ) mod
  where ('schema', pronamespace) = ($1, $2)

  -- tables
  union all
  select current_catalog, 'table', oid, null, relname, descr, mod, size, false, 1
  from pg_class
  , obj_description(oid, 'pg_class') descr
  , format('table_%s', relkind) mod
  , nullif(reltuples, -1) size
  where ('schema', relnamespace) = ($1, $2)
    and relkind not in ('i', 'I', 't', 'c', 'S')

  -- columns
  union all
  select current_catalog, 'column', attrelid, text(attnum), attname, descr, mod, null, true, attnum
  from pg_attribute
  , concat_ws(' '
    , format_type(atttypid, atttypmod)
    , case when attnotnull then 'not null' end
    , '-- ' || col_description(attrelid, attnum)
  ) descr
  , concat_ws(' '
    , (
      select 'column_pk'
      from pg_constraint
      where conrelid = attrelid and contype = 'p' and attnum = any(conkey)
      -- limit 1
    )
  ) mod
  where ('table', attrelid) = ($1, $2)
    and (attnum > 0 or attname = 'oid')
    and not attisdropped

  -- constraints
  union all
  select current_catalog, 'constraint', oid, null, conname, descr, mod, null, true, 10010
  from pg_constraint
  , obj_description(oid, 'pg_constraint') descr
  , concat_ws(' '
    , format('constraint_%s', contype)
    , case when not convalidated then 'constraint_not_validated' end
  ) mod
  where ('table', conrelid) = ($1, $2)
    -- and contype not in ()

  -- indexes
  union all
  select current_catalog, 'index', indexrelid, null, relname, descr, mod, null, true, 10020
  from pg_index join pg_class on indexrelid = oid
  , obj_description(indexrelid, 'pg_class') descr
  , concat_ws(' ', null) mod -- TODO uniq
  where ('table', indrelid) = ($1, $2)

  -- triggers
  union all
  select current_catalog, 'trigger', oid, null, tgname, descr, mod, null, true, 10030
  from pg_trigger
  , obj_description(oid, 'pg_trigger') descr
  , concat_ws(' ', null) mod -- TODO tgenabled=D
  where ('table', tgrelid) = ($1, $2)
    and tgconstraint = 0

  -- fs
  union all
  select current_catalog, 'dir', null, '.', './', null, null, null, false, 2
  where $1 is null
    and has_function_privilege('pg_ls_dir(text)', 'execute')

  -- dir
  union all
  select current_catalog, 'dir', null, fpath, fname, null, null, null, false, 1
  from pg_ls_dir($3) fname
  , concat($3, '/', fname) fpath
  , pg_stat_file(fpath) stat
  where 'dir' = $1
    and stat.isdir

  -- file
  union all
  select current_catalog, 'file', null, fpath, fname, null, null, null, true, 2
  from pg_ls_dir($3) fname
  , concat($3, '/', fname) fpath
  , pg_stat_file(fpath) stat
  where 'dir' = $1
    and not stat.isdir

  order by ord, "name"
`;


const defn_sql = String.raw /*sql*/ `
select format(e'\\connect %I\n\n%s', current_catalog, def)
from substring(current_setting('server_version') from '\d+') pg_major_ver
, lateral (

  -- database
  select concat_ws(e'\n'
    , e'SELECT * FROM text(''hello world'');'
    , ''
    , format('-- https://www.postgresql.org/docs/%s/sql-alterdatabase.html', pg_major_ver)
    , ''
  )
  where 'database' = $1

  -- schema
  union all
  select concat_ws(e'\n'
    , format('-- https://www.postgresql.org/docs/%s/sql-alterschema.html', pg_major_ver)
    , ''
  )
  where 'schema' = $1

  -- table
  union all
  select concat_ws(e'\n'
    , 'SELECT'
    , select_cols
    , format('FROM %I.%I', nspname, relname)
    , format('-- WHERE (%s) = ('''')', orderby_cols)
    , 'ORDER BY ' || orderby_cols
    , 'LIMIT 1000'
    , ';'
    , ''
    , format('-- https://www.postgresql.org/docs/%s/sql-altertable.html', pg_major_ver)
    , ''
    , '/*'
    , (
      case relkind
      -- view
      when 'v' then format(
        e'CREATE OR REPLACE VIEW %I.%I AS\n%s'
        , nspname
        , relname
        , pg_get_viewdef(pg_class.oid, true)
      )
      else 'CREATE TABLE'
      end
    )
    , '*/', ''
  )
  from pg_class
  join pg_namespace on pg_class.relnamespace = pg_namespace.oid
  left join pg_constraint pk on (contype, conrelid) = ('p', pg_class.oid)
  , lateral (
    select string_agg(format('  %I', attname), e',\n' order by attnum)
      -- TODO desc indexing
      , string_agg(format('%I', attname), ', ' order by pk_pos) filter (where pk_pos is not null)
    from pg_attribute, array_position(pk.conkey, attnum) pk_pos
    where attrelid = pg_class.oid and (attnum > 0 or attname = 'oid') and not attisdropped
  ) _(select_cols, orderby_cols)
  where ('table', pg_class.oid) = ($1, $2)

  -- function
  union all
  select concat_ws(e'\n'
    , pg_get_functiondef(p.oid) || ';'
    , ''
    , '/*'
    , format('DROP %s %s(%s);'
      , case when pg_get_function_result(p.oid) is null then 'PROCEDURE' else 'FUNCTION' end
      , regproc(p.oid)
      , pg_get_function_identity_arguments(p.oid)
    )
    , '*/'
    , ''
  )
  from pg_proc p
  where ('function', p.oid) = ($1, $2)
    and not exists (select from pg_aggregate where aggfnoid = p.oid)


  -- aggregate
  union all
  select concat_ws(e'\n'
    , format('CREATE OR REPLACE AGGREGATE %s(%s) (', aggfnoid, fnargs)
    , '   SFUNC     = ' || aggtransfn
    , '  ,STYPE     = ' || format_type(aggtranstype, null)
    , '  ,FINALFUNC = ' || nullif(aggfinalfn, 0)::regproc
    , '  ,INITCOND  = ' || array_to_string(nullif(agginitval, '')::text[], ', ')
    , '  ,SORTOP    = ' || nullif(aggsortop, 0)::regoperator
    , ');'
    , ''
    , '/*'
    , format('DROP AGGREGATE %s(%s);', aggfnoid, fnargs)
    , '*/'
    , ''
  )
  from pg_aggregate, pg_get_function_identity_arguments(aggfnoid) fnargs
  where ('function', aggfnoid) = ($1, $2)

  -- constraint
  union all
  select format(e''
    'ALTER TABLE %s DROP CONSTRAINT %I;\n\n'
    'ALTER TABLE %1$s ADD CONSTRAINT %2$I %3$s;\n'
    , conrelid::regclass
    , conname
    , pg_get_constraintdef(oid)
  )
  from pg_constraint
  where ('constraint', oid) = ($1, $2)

  -- index
  union all
  select format(e''
    'DROP INDEX %1$s;\n\n'
    '%s\n'
    , oid::regclass
    , pg_get_indexdef(oid)
  )
  from pg_class
  where ('index', oid) = ($1, $2)

  -- trigger
  union all
  select format(e''
    'DROP TRIGGER %I ON %s;\n\n'
    '%s\n'
    , tgname
    , tgrelid::regclass
    , pg_get_triggerdef(oid, true)
  )
  from pg_trigger
  where ('trigger', oid) = ($1, $2)

  -- file
  union all
  select format(e'SELECT pg_read_file(%L, 0, 5000);\n', $3)
  where 'file' = $1

) _(def)
`;

if (import.meta.main) {
  await main(Deno.args);
}
