select 'select ''awesome'';' as def
from pg_database
where datname = $1
