package main

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/mail"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

//go:embed migrations/*.sql
var migrations embed.FS

type config struct {
	Port         string
	DatabaseURL  string
	JWTSecret    string
	AllowOrigin  string
	AIBaseURL    string
	AIAPIKey     string
	AIModel      string
	AIDailyLimit int
}

type server struct {
	db           *pgxpool.Pool
	jwtSecret    []byte
	ai           *aiClient
	aiDailyLimit int
}

type account struct {
	ID    uuid.UUID `json:"id"`
	Name  string    `json:"name"`
	Email string    `json:"email"`
}

type tokenClaims struct {
	UserID string `json:"uid"`
	jwt.RegisteredClaims
}

type authInput struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type syncInput struct {
	Snapshot json.RawMessage `json:"snapshot"`
}

func main() {
	cfg := loadConfig()
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("create database pool: %v", err)
	}
	defer pool.Close()

	if err := waitForDatabase(ctx, pool, 30*time.Second); err != nil {
		log.Fatalf("database unavailable: %v", err)
	}
	if err := runMigrations(ctx, pool); err != nil {
		log.Fatalf("run migrations: %v", err)
	}

	s := &server{
		db:           pool,
		jwtSecret:    []byte(cfg.JWTSecret),
		ai:           newAIClient(cfg.AIBaseURL, cfg.AIAPIKey, cfg.AIModel),
		aiDailyLimit: cfg.AIDailyLimit,
	}
	router := s.routes(cfg.AllowOrigin)
	log.Printf("轻脂管家 API listening on :%s", cfg.Port)
	if err := router.Run(":" + cfg.Port); err != nil {
		log.Fatal(err)
	}
}

func loadConfig() config {
	cfg := config{
		Port:         envOr("PORT", "8080"),
		DatabaseURL:  envOr("DATABASE_URL", "postgres://qingzhi:qingzhi@localhost:5432/qingzhi?sslmode=disable"),
		JWTSecret:    envOr("JWT_SECRET", "development-only-change-me-please"),
		AllowOrigin:  envOr("ALLOW_ORIGIN", "*"),
		AIBaseURL:    envOr("AI_BASE_URL", "https://api.deepseek.com"),
		AIAPIKey:     strings.TrimSpace(os.Getenv("AI_API_KEY")),
		AIModel:      envOr("AI_MODEL", "deepseek-chat"),
		AIDailyLimit: envIntOr("AI_DAILY_LIMIT", 50),
	}
	if len(cfg.JWTSecret) < 24 {
		log.Fatal("JWT_SECRET must contain at least 24 characters")
	}
	if strings.Contains(cfg.JWTSecret, "development-only") && gin.Mode() == gin.ReleaseMode {
		log.Fatal("set a strong JWT_SECRET before running in release mode")
	}
	return cfg
}

func envIntOr(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		log.Fatalf("%s must be a positive integer", key)
	}
	return parsed
}

func envOr(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func waitForDatabase(ctx context.Context, pool *pgxpool.Pool, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	var lastErr error
	for time.Now().Before(deadline) {
		if err := pool.Ping(ctx); err == nil {
			return nil
		} else {
			lastErr = err
		}
		time.Sleep(time.Second)
	}
	return lastErr
}

func runMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	entries, err := migrations.ReadDir("migrations")
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		body, err := migrations.ReadFile("migrations/" + entry.Name())
		if err != nil {
			return err
		}
		if _, err := pool.Exec(ctx, string(body)); err != nil {
			return fmt.Errorf("%s: %w", entry.Name(), err)
		}
	}
	return nil
}

func (s *server) routes(allowOrigin string) *gin.Engine {
	router := gin.New()
	if err := router.SetTrustedProxies(nil); err != nil {
		log.Printf("disable trusted proxies: %v", err)
	}
	router.Use(gin.Logger(), gin.Recovery(), cors(allowOrigin), securityHeaders())
	router.GET("/health", s.health)
	v1 := router.Group("/api/v1")
	v1.POST("/auth/register", s.register)
	v1.POST("/auth/login", s.login)
	authorized := v1.Group("")
	authorized.Use(s.authenticate())
	authorized.GET("/me", s.me)
	authorized.POST("/sync", s.uploadSnapshot)
	authorized.GET("/sync/latest", s.latestSnapshot)
	authorized.GET("/ai/daily-summary", s.latestDailySummary)
	authorized.POST("/ai/daily-summary", s.generateDailySummary)
	authorized.POST("/ai/food-estimate", s.estimateFood)
	authorized.POST("/ai/ask", s.askNutritionAssistant)
	return router
}

func cors(origin string) gin.HandlerFunc {
	return func(c *gin.Context) {
		requestOrigin := c.GetHeader("Origin")
		allowed := origin
		if origin == "*" && requestOrigin != "" {
			allowed = requestOrigin
		}
		c.Header("Access-Control-Allow-Origin", allowed)
		c.Header("Vary", "Origin")
		c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type")
		c.Header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func securityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Cache-Control", "no-store")
		c.Next()
	}
}

func (s *server) health(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
	defer cancel()
	if err := s.db.Ping(ctx); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "unavailable"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (s *server) register(c *gin.Context) {
	var input authInput
	if err := c.ShouldBindJSON(&input); err != nil {
		fail(c, http.StatusBadRequest, "请求格式不正确")
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	input.Email = normalizeEmail(input.Email)
	if input.Name == "" || len([]rune(input.Name)) > 40 {
		fail(c, http.StatusBadRequest, "昵称长度需要在 1–40 个字符之间")
		return
	}
	if !validEmail(input.Email) {
		fail(c, http.StatusBadRequest, "邮箱地址格式不正确")
		return
	}
	if len(input.Password) < 8 || len(input.Password) > 72 {
		fail(c, http.StatusBadRequest, "密码长度需要在 8–72 位之间")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), 12)
	if err != nil {
		fail(c, http.StatusInternalServerError, "无法创建账号")
		return
	}
	user := account{ID: uuid.New(), Name: input.Name, Email: input.Email}
	_, err = s.db.Exec(c.Request.Context(),
		`INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)`,
		user.ID, user.Name, user.Email, string(hash),
	)
	if err != nil {
		if strings.Contains(err.Error(), "users_email_key") {
			fail(c, http.StatusConflict, "这个邮箱已经注册")
			return
		}
		fail(c, http.StatusInternalServerError, "无法创建账号")
		return
	}
	s.respondWithToken(c, user)
}

func (s *server) login(c *gin.Context) {
	var input authInput
	if err := c.ShouldBindJSON(&input); err != nil {
		fail(c, http.StatusBadRequest, "请求格式不正确")
		return
	}
	input.Email = normalizeEmail(input.Email)
	var user account
	var hash string
	err := s.db.QueryRow(c.Request.Context(),
		`SELECT id, name, email, password_hash FROM users WHERE email = $1`, input.Email,
	).Scan(&user.ID, &user.Name, &user.Email, &hash)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && bcrypt.CompareHashAndPassword([]byte(hash), []byte(input.Password)) != nil) {
		fail(c, http.StatusUnauthorized, "邮箱或密码不正确")
		return
	}
	if err != nil {
		fail(c, http.StatusInternalServerError, "暂时无法登录")
		return
	}
	s.respondWithToken(c, user)
}

func (s *server) respondWithToken(c *gin.Context, user account) {
	now := time.Now()
	claims := tokenClaims{
		UserID: user.ID.String(),
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer: "qingzhi-api", Subject: user.ID.String(), IssuedAt: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(30 * 24 * time.Hour)),
		},
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.jwtSecret)
	if err != nil {
		fail(c, http.StatusInternalServerError, "无法创建登录会话")
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token, "user": user})
}

func (s *server) authenticate() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			fail(c, http.StatusUnauthorized, "请先登录")
			c.Abort()
			return
		}
		claims := &tokenClaims{}
		token, err := jwt.ParseWithClaims(strings.TrimPrefix(header, "Bearer "), claims, func(token *jwt.Token) (any, error) {
			if token.Method != jwt.SigningMethodHS256 {
				return nil, errors.New("unexpected signing method")
			}
			return s.jwtSecret, nil
		})
		if err != nil || !token.Valid {
			fail(c, http.StatusUnauthorized, "登录已失效，请重新登录")
			c.Abort()
			return
		}
		userID, err := uuid.Parse(claims.UserID)
		if err != nil {
			fail(c, http.StatusUnauthorized, "登录信息无效")
			c.Abort()
			return
		}
		c.Set("userID", userID)
		c.Next()
	}
}

func (s *server) me(c *gin.Context) {
	userID := c.MustGet("userID").(uuid.UUID)
	var user account
	if err := s.db.QueryRow(c.Request.Context(), `SELECT id, name, email FROM users WHERE id = $1`, userID).Scan(&user.ID, &user.Name, &user.Email); err != nil {
		fail(c, http.StatusNotFound, "账号不存在")
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": user})
}

func (s *server) uploadSnapshot(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 5<<20)
	var input syncInput
	if err := c.ShouldBindJSON(&input); err != nil || len(input.Snapshot) == 0 || !json.Valid(input.Snapshot) {
		fail(c, http.StatusBadRequest, "备份内容无效或超过 5 MB")
		return
	}
	var meta struct {
		Version    int       `json:"version"`
		ExportedAt time.Time `json:"exportedAt"`
	}
	if err := json.Unmarshal(input.Snapshot, &meta); err != nil || meta.Version != 1 || meta.ExportedAt.IsZero() {
		fail(c, http.StatusBadRequest, "不支持的备份版本")
		return
	}
	userID := c.MustGet("userID").(uuid.UUID)
	tx, err := s.db.Begin(c.Request.Context())
	if err != nil {
		fail(c, http.StatusInternalServerError, "无法开始备份")
		return
	}
	defer tx.Rollback(c.Request.Context())
	var backedUpAt time.Time
	err = tx.QueryRow(c.Request.Context(),
		`INSERT INTO backup_snapshots (user_id, version, snapshot, client_exported_at)
		 VALUES ($1, $2, $3, $4) RETURNING created_at`, userID, meta.Version, input.Snapshot, meta.ExportedAt,
	).Scan(&backedUpAt)
	if err == nil {
		_, err = tx.Exec(c.Request.Context(),
			`DELETE FROM backup_snapshots WHERE user_id = $1 AND id NOT IN
			 (SELECT id FROM backup_snapshots WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30)`, userID,
		)
	}
	if err != nil || tx.Commit(c.Request.Context()) != nil {
		fail(c, http.StatusInternalServerError, "备份保存失败")
		return
	}
	c.JSON(http.StatusOK, gin.H{"backedUpAt": backedUpAt})
}

func (s *server) latestSnapshot(c *gin.Context) {
	userID := c.MustGet("userID").(uuid.UUID)
	var snapshot json.RawMessage
	var backedUpAt time.Time
	err := s.db.QueryRow(c.Request.Context(),
		`SELECT snapshot, created_at FROM backup_snapshots WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, userID,
	).Scan(&snapshot, &backedUpAt)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusOK, gin.H{"snapshot": nil})
		return
	}
	if err != nil {
		fail(c, http.StatusInternalServerError, "无法读取备份")
		return
	}
	c.JSON(http.StatusOK, gin.H{"snapshot": snapshot, "backedUpAt": backedUpAt})
}

func normalizeEmail(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func validEmail(value string) bool {
	parsed, err := mail.ParseAddress(value)
	return err == nil && parsed.Address == value && strings.Contains(value, "@")
}

func fail(c *gin.Context, status int, message string) {
	c.JSON(status, gin.H{"error": message})
}
