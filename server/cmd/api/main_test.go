package main

import (
	"github.com/gin-gonic/gin"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNormalizeEmail(t *testing.T) {
	got := normalizeEmail("  Person@Example.COM ")
	if got != "person@example.com" {
		t.Fatalf("normalizeEmail() = %q", got)
	}
}

func TestAIValidationHelpers(t *testing.T) {
	if !validDayKey("2026-08-12") || validDayKey("2026-02-30") || validDayKey("12-08-2026") {
		t.Fatal("validDayKey accepted or rejected an unexpected value")
	}
	if got := stripJSONFence("```json\n{\"ok\":true}\n```"); got != `{"ok":true}` {
		t.Fatalf("stripJSONFence() = %q", got)
	}
	valid := foodEstimate{Name: "脱脂牛奶", NutritionUnit: "ml", Calories: 37, Protein: 3.2, Fat: 0, Carb: 5, ServingLabel: "瓶", ServingAmount: 250, Confidence: "high"}
	if !validFoodEstimate(valid) {
		t.Fatal("validFoodEstimate rejected a valid estimate")
	}
	valid.Calories = 1001
	if validFoodEstimate(valid) {
		t.Fatal("validFoodEstimate accepted an impossible calorie value")
	}
}

func TestDailyPlanInputValidation(t *testing.T) {
	validContext := dailyContext{
		Date: "2026-08-11", Version: "v1-a",
		Profile: []byte(`{}`), Summary: []byte(`{}`), Meals: []byte(`[]`), Exercises: []byte(`[]`),
	}
	if !validDailyContext(validContext) {
		t.Fatal("validDailyContext rejected a valid plan context")
	}
	invalid := validContext
	invalid.Date = "2026-02-30"
	if validDailyContext(invalid) {
		t.Fatal("validDailyContext accepted an invalid plan date")
	}
}

func TestAIRoutesRequireJWT(t *testing.T) {
	gin.SetMode(gin.TestMode)
	s := &server{jwtSecret: []byte("test-secret-that-is-long-enough")}
	router := s.routes("*")
	requests := []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/api/v1/ai/daily-summary?date=2026-08-12"},
		{http.MethodPost, "/api/v1/ai/daily-summary"},
		{http.MethodGet, "/api/v1/ai/daily-plan?date=2026-08-13"},
		{http.MethodPost, "/api/v1/ai/daily-plan"},
		{http.MethodGet, "/api/v1/ai/history"},
		{http.MethodPost, "/api/v1/ai/food-estimate"},
		{http.MethodPost, "/api/v1/ai/ask"},
	}
	for _, item := range requests {
		request := httptest.NewRequest(item.method, item.path, nil)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if response.Code != http.StatusUnauthorized {
			t.Errorf("%s %s returned %d, want 401", item.method, item.path, response.Code)
		}
	}
}

func TestFriendlyAIError(t *testing.T) {
	got := friendlyAIError(&aiHTTPError{StatusCode: http.StatusUnauthorized, Message: "invalid key"})
	if got != "DeepSeek认证失败，请检查服务端API Key" {
		t.Fatalf("friendlyAIError() = %q", got)
	}
}

func TestValidEmail(t *testing.T) {
	cases := []struct {
		value string
		want  bool
	}{
		{"person@example.com", true},
		{"not-an-email", false},
		{"person @example.com", false},
	}
	for _, tc := range cases {
		if got := validEmail(tc.value); got != tc.want {
			t.Errorf("validEmail(%q) = %v, want %v", tc.value, got, tc.want)
		}
	}
}
