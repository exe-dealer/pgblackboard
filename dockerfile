# https://hub.docker.com/r/denoland/deno/tags?name=alpine
FROM denoland/deno:alpine-2.6.4 AS deno
EXPOSE 7890
WORKDIR /app
ENV DENO_V8_FLAGS=--stack_trace_limit=30
CMD ["pgbb", "postgres://postgres:5432"]

FROM deno AS dev
RUN apk add --no-cache make esbuild \
  # preload deno bundle esbuild
  && deno bundle /dev/null \
  && ln -s /app/server/pgbb-dev /usr/local/bin/pgbb
COPY . .

FROM dev AS build
RUN make clean && make -j3 dist

FROM deno
LABEL org.opencontainers.image.authors="exe-dealer@yandex.kz"
COPY --from=build /app/dist /app
RUN deno install --global --name=pgbb \
  --no-config \
  --no-npm \
  --no-remote \
  --no-prompt \
  --allow-net \
  ./pgbb.js
USER deno
