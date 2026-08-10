.PHONY: db-up db-down api api-local mobile apk test smoke

db-up:
	docker-compose up -d postgres

db-down:
	docker-compose stop postgres

api:
	@test -n "$(JWT_SECRET)" || (printf '%s\n' '请先设置 JWT_SECRET，例如：export JWT_SECRET=$$(openssl rand -hex 32)' && exit 1)
	docker-compose up --build -d api

api-local:
	cd server && DATABASE_URL='postgres://qingzhi:qingzhi@127.0.0.1:5433/qingzhi?sslmode=disable' JWT_SECRET='development-only-change-me-please' go run ./cmd/api

mobile:
	cd mobile && npm start

apk:
	./scripts/build-android-apk.sh

test:
	cd mobile && npm run typecheck
	cd server && go test ./...

smoke:
	./scripts/smoke-api.sh
