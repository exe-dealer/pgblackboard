FROM denoland/deno:alpine-2.2.5 AS deno
EXPOSE 7890
WORKDIR /app
RUN ln -s /app/bin/pgbb /usr/local/bin/pgbb
CMD ["pgbb", "postgres://postgres:5432"]

FROM deno AS dev
RUN apk add --no-cache make esbuild
COPY . .

FROM dev AS build
RUN make build

FROM deno
COPY --from=build /app/.dist /app
USER deno
