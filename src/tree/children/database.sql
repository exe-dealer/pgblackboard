select oid                                 as id
     ,'schema'                             as type
     ,nspname                              as name
     ,obj_description(oid, 'pg_namespace') as comment
from pg_namespace
where nspname not like 'pg\_temp\_%%'
    and nspname not like 'pg\_toast\_temp\_%%'
    and nspname != 'pg_toast'
order by name
