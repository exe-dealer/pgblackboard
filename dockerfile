# https://hub.docker.com/r/denoland/deno/tags?name=alpine
FROM denoland/deno:alpine-2.6.4 AS deno
EXPOSE 7890
WORKDIR /app
RUN ln -s /app/bin/pgbb /usr/local/bin/pgbb
CMD ["pgbb", "postgres://postgres:5432"]

FROM deno AS dev
RUN apk add --no-cache make esbuild
COPY . .

FROM dev AS build
RUN make clean build

FROM deno
LABEL org.opencontainers.image.authors="exe-dealer@yandex.kz"
COPY --from=build /app/.dist /app
USER deno
