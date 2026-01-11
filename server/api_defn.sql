-- "database"
select concat_ws(e'\n'
  , format('\connect %I', current_catalog)
  , ''
  , 'SELECT * FROM text(''hello world'');'
  , ''
  , format('-- https://www.postgresql.org/docs/%s/sql-alterdatabase.html', pg_major_ver)
  , ''
)
from substring(current_setting('server_version') from '\d+') pg_major_ver
where 'database' = $1

-- schema
union all
select concat_ws(e'\n'
  , format('\connect %I', current_catalog)
  , ''
  , format('-- https://www.postgresql.org/docs/%s/sql-alterschema.html', pg_major_ver)
  , ''
)
from substring(current_setting('server_version') from '\d+') pg_major_ver
where 'schema' = $1

-- table
union all
select concat_ws(e'\n'
  , format('\connect %I', current_catalog)
  , ''
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
    when 'm' then format(
      e'CREATE OR REPLACE MATERIALIZED VIEW %I.%I AS\n%s'
      , nspname
      , relname
      , pg_get_viewdef(pg_class.oid, true)
    )
    -- TODO a lot of to do, maybe pg_tabledef will be invented sometime
    -- https://github.com/postgres/postgres/blob/540c39cc56f51b27bff9a6fc78d6524564953c6c/src/bin/pg_dump/pg_dump.c#L17093
    -- https://www.postgresql.org/docs/current/sql-createtable.html
    when 'r' then format(
      e'CREATE TABLE %I.%I (\n%s\n)'
      , nspname
      , relname
      , (
        select string_agg(
          concat_ws(' '
            , ' '
            , quote_ident(attname)
            , format_type(atttypid, atttypmod)
            , 'COLLATE "' || nullif(collname, 'default') || '"'
            , case when attnotnull then 'NOT NULL' end
            , 'DEFAULT (' || pg_get_expr(adbin, adrelid) || ')'
          )
          , e',\n'
          order by attnum
        )
        from pg_attribute
        left outer join pg_attrdef on attrelid = adrelid and adnum = attnum
        left outer join pg_collation on pg_collation.oid = attcollation
        where attrelid = pg_class.oid and attnum > 0 and not attisdropped
      )
    )
    else 'CREATE script not implemented for this relkind'
    end
  )
  , '*/'
  , ''
)
from substring(current_setting('server_version') from '\d+') pg_major_ver
, pg_class
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
  , format('\connect %I', current_catalog)
  , ''
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
  , format('\connect %I', current_catalog)
  , ''
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
select concat_ws(e'\n'
  , format('\connect %I', current_catalog)
  , ''
  , format('ALTER TABLE %s DROP CONSTRAINT %I;'
    , conrelid::regclass
    , conname
  )
  , ''
  , format('ALTER TABLE %s ADD CONSTRAINT %I %s;'
    , conrelid::regclass
    , conname
    , pg_get_constraintdef(oid)
    , ''
  )
)
from pg_constraint
where ('constraint', oid) = ($1, $2)

-- index
union all
select concat_ws(e'\n'
  , format('\connect %I', current_catalog)
  , ''
  , format('DROP INDEX %s;', oid::regclass)
  , ''
  , pg_get_indexdef(oid) || ';'
  , ''
)
from pg_class
where ('index', oid) = ($1, $2)

-- trigger
union all
select concat_ws(e'\n'
  , format('\connect %I', current_catalog)
  , ''
  , format('DROP TRIGGER %I ON %s;', tgname, tgrelid::regclass)
  , ''
  , pg_get_triggerdef(oid, true)
  , ''
)
from pg_trigger
where ('trigger', oid) = ($1, $2)

-- file
union all
select concat_ws(e'\n'
  , format('\connect %I', current_catalog)
  , ''
  , format('SELECT pg_read_file(%L, 0, 5000);', $3)
  , ''
)
where 'file' = $1
