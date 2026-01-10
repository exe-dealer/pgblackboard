# pgBlackboard

Postgres web interface for SQL geeks

- SQL-first, multi-statement scripts
- Editable query results
- PostGIS support

![screenshot](https://raw.githubusercontent.com/exedealer/pgblackboard/refs/heads/main/screenshot.png)

# Docker

[Docker Hub repo](https://hub.docker.com/r/exedealer/pgblackboard)

```sh
docker run -it --rm -p 7890:7890 exedealer/pgblackboard \
  pgbb 'postgres://HOST:5432'
```

```yaml
services:
  pgbb:
    image: exedealer/pgblackboard
    ports: ['7890:7890']
    command: [pgbb, 'postgres://HOST:5432']
```

# Sponsorship

If you find this project useful, consider supporting its development!
Your contributions help maintain and improve the project.

[![PayPal](https://img.shields.io/badge/paypal-donate-blue?logo=paypal&logoColor=white&style=for-the-badge)](https://paypal.me/exedealer)
[![Ko-fi](https://img.shields.io/badge/ko--fi-donate-blue?logo=ko-fi&logoColor=white&style=for-the-badge
)](https://ko-fi.com/exedealer)
