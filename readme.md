# pgBlackboard

Minimalistic web interface for PostgreSQL

- supports psql style multistatement scripts
- supports postgis
- inplace dataset editing

# Docker image

https://hub.docker.com/r/kagiskz/pgblackboard

```
docker run -it --rm -p 7890:7890 kagiskz/pgblackboard:3-20241121 pgbb postgres://HOST:PORT
```

# TODO

- tree, search
- tree, create table script
- tree, partitioned tables icon
- tree, show object owner

- table, virtual scroll
- table, column auto width
- table, continue download to file

- log, commit button feedback
- log, commandcomplete/notices contrast
- log, reveal "more"/"commit" button (auto scroll to last row?)

- datum, jsonb pretty
- datum, html/svg preview
- datum, `explain` visualization

- map, antarctida is broken on zoom
- map, hexewkb support (no st_asgeojson crutch)
  - https://gitlab.kagis.kz/kagis/geonomix/-/blob/master/engine/repub/repub.js#L883
  - how to detect geom column
  - how to display unsupported geomtypes (polyhedral, circle, tin, *M values)

- map, collapsible & lazy component
- map, geometry drawing
- map, add satellite (custom service support)
  - guc (can be set in script, or user/database, or conn_uri)
- map, city labels optimization

- run in implicit transaction
- `scroll to log` button
- file upload
- `copy to stdout` download
- color scheme revision
- editing with no `dump changes` button
- avoid pass authkey by url
