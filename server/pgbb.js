import { parseArgs as parse_args } from './_vendor/parse_args.ts';
import { pgconnection } from './_vendor/pgwire.js';
import { psqlscan_split } from './psqlscan/mod.js';

async function main(args) {
  const flags = parse_args(args, {
    default: {
      'listen-port': '7890',
      // 'listen-addr': '0.0.0.0',
    },
  });

  const app = new App();
  app.pg_uri = flags._[0];

  await app.init();

  const server = Deno.serve({
    hostname: flags['listen-addr'],
    port: Number(flags['listen-port']),
    handler: app.handle_req.bind(app),
    onListen() {
      console.log('{"event":"start"}');
    },
    // TODO onError json log
  });

  await server.finished;
}


class App {
  // pg_conn_defaults = {
  //   statement_timeout: '10s',
  //   default_transaction_read_only: 'on',
  // };
  pg_uri;
  _pwd_key;
  _wakers = new Map();

  async init() {
    this._pwd_key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  handle_req(/** @type {Request} */ req) {
    const url = new URL(req.url);
    console.log(JSON.stringify({
      event: 'request',
      method: req.method,
      path: url.pathname,
      qs: url.search || undefined,
    }));
    if (req.method == 'POST' && url.pathname == '/') {
      return this._handle_api(req, url);
    }
    if (/^(GET|HEAD)$/.test(req.method) && url.pathname == '/favicon.ico') {
      return new Response(null, {
        status: 302,
        headers: { location: 'favicon.svg' },
      });
    }
    return this._serve_static(req);
  }

  async _serve_static(req) {
    if (req.method != 'GET') {
      return Response.json('method not allowed', { status: 405 });
    }
    // TODO etag
    const url = new URL(req.url);
    const pathname = url.pathname.replace(/^[/]$/, '/index.html');
    // TODO fix parent traverse
    const file_url = import.meta.resolve('../ui' + pathname);
    const file_res = await fetch(file_url);
    return new Response(file_res.body, {
      headers: { 'content-type': get_content_type(file_url) },
    });
    function get_content_type(fname) {
      if (/\.html$/.test(fname)) return 'text/html; charset=utf-8';
      if (/\.css$/.test(fname)) return 'text/css; charset=utf-8';
      if (/\.js$/.test(fname)) return 'text/javascript; charset=utf-8';
      if (/\.svg$/.test(fname)) return 'image/svg+xml; charset=utf-8';
      if (/\.ico$/.test(fname)) return 'image/vnd.microsoft.icon';
      if (/\.woff2$/.test(fname)) return 'font/woff2';
    }
  }

  async _handle_api(/** @type {Request} */ req, url) {
    const qs = Object.fromEntries(url.searchParams);
    const { api } = qs;
    switch (api) {
      case 'auth': return this._api_auth(req, qs);
      case 'wake': return this._api_wake(req, qs);
    }
    const { key } = qs;
    const password = await this._decrypt_pwd(key);
    if (password == null) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
    switch (api) {
      case 'tree': return this._api_tree(req, qs, password);
      case 'defn': return this._api_defn(req, qs, password);
      case 'run': return this._api_run(req, qs, password);
    }
    return Response.json({ error: 'uknown api' }, { status: 400 });
  }

  async _api_auth(req, { u }) {
    // TODO rate limit
    // TODO body size limit
    const { password } = await req.json(); // base64 ?
    const pg = pgconnection({ password, user: u, _debug: false }, this.pg_uri, { database: 'postgres' });
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
    const key = await this._encrypt_pwd(password);
    return Response.json({ ok: true, key });
  }

  async _encrypt_pwd(plain) {
    const utf8 = new TextEncoder().encode(plain);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc_pwd = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this._pwd_key, utf8);
    const b64 = btoa(String.fromCharCode(...iv,  ...new Uint8Array(enc_pwd)));
    return b64.replace(/[+]/g, '-').replace(/[/]/g, '_').replace(/=+$/g, '');
  }

  async _decrypt_pwd(cipher) {
    try {
      cipher = cipher.replace(/-/g, '+').replace(/_/g, '/');
      const key_u8 = Uint8Array.from(atob(cipher), x => x.charCodeAt());
      const iv = key_u8.subarray(0, 12);
      const pld = key_u8.subarray(12);
      const utf8 = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, this._pwd_key, pld);
      return new TextDecoder().decode(utf8);
    } catch (ex) {
      // console.error(ex);
      return null;
    }
  }

  /** @param {Request} _req */
  async _api_tree(_req, { u: user, db: database, ntype, noid, ntid }, password) {
    const pg = pgconnection({
      user,
      password,
      database,
      default_transaction_read_only: 'on',
      search_path: 'pg_catalog',
    }, this.pg_uri, {
      database: 'postgres',
      statement_timeout: '10s',
    });
    try {
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
    } finally {
      await pg.end();
    }
  }

  /** @param {Request} _req */
  async _api_defn(_req, { u: user, db: database, ntype, noid, ntid }, password) {
    const pg = pgconnection({
      user,
      password,
      database,
      default_transaction_read_only: 'on',
      search_path: 'pg_catalog',
    }, this.pg_uri, {
      statement_timeout: '10s',
    });
    try {
      const [result] = await pg.query({
        statement: defn_sql,
        params: [
          { type: 'text', value: ntype },
          { type: 'oid', value: noid },
          { type: 'text', value: ntid },
        ],
      });
      return Response.json({ result });
    } finally {
      await pg.end();
    }
  }

  /** @param {Request} req */
  async _api_run(req, { u: user, db: database }, password) {
    // TODO kill previous connection - prevent connections leak in case of abort lag
    const { signal } = req;
    const req_body = await req.json();
    const resp_init = {
      headers: {
        'content-type': 'text/x-ndjson; charset=utf-8', // TODO application/json
        'x-accel-buffering': 'no', // disable nginx buffering
        'cache-control': 'no-transform', // prevent gzip buffering
      },
    };
    const resp_body = ReadableStream.from(this._api_run_body({
      ...req_body, user, password, database, signal,
    }));
    return new Response(resp_body, resp_init);
  }

  async * _api_run_body({ sql, tz, user, password, database, signal }) {
    const ctl = { wake() { } };
    const wake_token = crypto.randomUUID();
    let pg;
    let in_user_script = false;
    let statement_pos = 0;
    try {
      this._wakers.set(wake_token, ctl);

      pg = pgconnection(
        { user, database, password },
        this.pg_uri,
        {
          // _debug: true,
          _maxReadBuf: 10 << 20,
          // TODO _wakeInterval: 0
          TimeZone: tz,
          statement_timeout: '1min',

          // notices flush rows after each statement
          client_min_messages: 'LOG',
          // debug_print_plan: 'on',
          // debug_print_parse: 'on',
          // debug_print_rewritten: 'on',
          // debug_pretty_print: 'off',
        },
      );

      // report connection error in user script context
      in_user_script = true;
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
                'att_notnull', attnotnull
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
      });

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
      const splitted_statements = psqlscan_split(sql);

      for (const statement of splitted_statements) {
        // TODO yield start execution
        //   +statement_pos
        //   avoid ErrorResponse & NoticeResponse position modification
        //   allow navigate to statement in code by click to log message

        in_user_script = true;
        // TODO fwd NoticeResponse?
        const parse_res = await Array.fromAsync(pg.stream(
          { message: 'Parse',  statement },
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
        statement: /*sql*/ `select txid_current_if_assigned() is not null`,
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
      console.log('ending connection');
      this._wakers.delete(wake_token);
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
        yield jsonl_enc(['suspended', { wake_token, reason }]);
        await promise;
      } finally {
        signal.removeEventListener('abort', onabort);
      }
    }
  }

  _api_wake(_req, { token }) {
    const ctl = this._wakers.get(token);
    ctl?.wake();
    // TODO ratelimit - sleep 1 sec
    return Response.json({ ok: true });
  }
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
with geom_typoid as (
  select t.oid
  from pg_type t, pg_depend d, pg_extension e
  where d.deptype = 'e'
    and d.classid = 'pg_type'::regclass
    and d.objid = t.oid
    and d.refobjid = e.oid
    and t.typname in ('geometry', 'geography')
    and e.extname = 'postgis'
)
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
    select string_agg(format(col_fmt, attname), e',\n' order by attnum)
      -- TODO desc indexing
      , string_agg(format('%I', attname), ', ' order by pk_pos) filter (where pk_pos is not null)
    from pg_attribute, array_position(pk.conkey, attnum) pk_pos
    , text(
      case when atttypid in (select * from geom_typoid)
      then '  ST_AsGeoJSON(ST_Transform(%I, 4326))'
      else '  %I'
      end
    ) col_fmt
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
