FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/qingzhi-api ./cmd/api

FROM alpine:3.22
RUN adduser -D -u 10001 appuser
USER appuser
COPY --from=build /out/qingzhi-api /usr/local/bin/qingzhi-api
EXPOSE 8080
ENTRYPOINT ["qingzhi-api"]
