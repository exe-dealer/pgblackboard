# pgBlackboard

Web interface for PostgreSQL

- Multi-statement scripts
- PostGIS support
- Inplace data editing

![screenshot](./screenshot.png)

# Docker image

https://hub.docker.com/r/exedealer/pgblackboard

```
docker run -it --rm -p 7890:7890 exedealer/pgblackboard pgbb postgres://HOST:5432
```

```yaml
services:
  pgbb:
    image: exedealer/pgblackboard
    ports: [7890:7890]
    command: [pgbb, postgres://HOST:5432]
```
