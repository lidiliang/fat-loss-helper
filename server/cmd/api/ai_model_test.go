package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestAIModelOverride(t *testing.T) {
	gin.SetMode(gin.TestMode)
	s := &server{ai: newAIClient("https://example.test", "secret", "deepseek-flash")}
	for _, tc := range []struct {
		value, want string
		status      int
	}{
		{"", "deepseek-flash", 200},
		{"  vendor/custom-model  ", "vendor/custom-model", 200},
		{"bad model", "", 400},
		{strings.Repeat("a", 121), "", 400},
		{"模型", "", 400},
	} {
		t.Run(tc.value, func(t *testing.T) {
			router := gin.New()
			router.GET("/", s.withAIModel(func(scoped *server, c *gin.Context) {
				if scoped.ai.model != tc.want {
					t.Errorf("model = %q, want %q", scoped.ai.model, tc.want)
				}
				if scoped.ai.apiKey != s.ai.apiKey || scoped.ai.http != s.ai.http {
					t.Error("connection settings changed")
				}
				c.Status(http.StatusOK)
			}))
			req := httptest.NewRequest("GET", "/", nil)
			req.Header.Set("X-AI-Model", tc.value)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)
			if w.Code != tc.status {
				t.Errorf("status = %d, want %d", w.Code, tc.status)
			}
			if s.ai.model != "deepseek-flash" {
				t.Fatal("shared default mutated")
			}
		})
	}
}

func TestAIConfigOnlyExposesModel(t *testing.T) {
	s := &server{ai: newAIClient("https://example.test", "secret", "env-model")}
	router := gin.New()
	router.GET("/", s.aiConfig)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
	if w.Code != 200 || w.Body.String() != `{"defaultModel":"env-model"}` {
		t.Fatalf("unexpected config: %s", w.Body.String())
	}
}
