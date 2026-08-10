.PHONY: db-up db-down api mobile apk test smoke

db-up:
	docker-compose up -d postgres

db-down:
	docker-compose stop postgres

api:
	cd server && DATABASE_URL='postgres://qingzhi:qingzhi@127.0.0.1:5432/qingzhi?sslmode=disable' JWT_SECRET='development-only-change-me-please' go run ./cmd/api

mobile:
	cd mobile && npm start

apk:
	./scripts/build-android-apk.sh

test:
	cd mobile && npm run typecheck
	cd server && go test ./...

smoke:
	./scripts/smoke-api.sh
