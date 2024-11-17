# pgBlackboard

Minimalistic web interface for PostgreSQL

- supports psql style multistatement scripts
- supports postgis
- inplace dataset editing

# Docker image

[Dockerhub repo](https://hub.docker.com/r/kagiskz/pgblackboard/)

```
docker run -it --rm -p 7890:7890 kagiskz/pgblackboard pgbb postgres://HOST:PORT
```

# TODO

- tree, search
- tree, create table script
- tree, partitioned tables icon

- datum, jsonb pretty
- datum, html/svg preview
- datum, `explain` visualization

- map, hexewkb support (no st_asgeojson crutch)
- map, geometry drawing
- map, add satellite (custom service support)
- map, city labels optimization

- `scroll to log` button
- file upload
- `copy to stdout` download
