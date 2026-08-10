FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -buildvcs=false -trimpath -ldflags="-s -w" -o /out/qingzhi-api ./cmd/api

FROM alpine:3.22
RUN adduser -D -u 10001 appuser
USER appuser
COPY --from=build /out/qingzhi-api /usr/local/bin/qingzhi-api
ENV GIN_MODE=release \
    PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -q -O - http://127.0.0.1:8080/health >/dev/null || exit 1
ENTRYPOINT ["qingzhi-api"]
