package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (function roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}

func jsonHTTPResponse(status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader(body)),
	}
}

func TestAIClientDisablesThinkingAndRetriesEmptyContent(t *testing.T) {
	var mutex sync.Mutex
	requests := 0
	client := newAIClient("https://api.deepseek.com", "test-key", "deepseek-v4-flash")
	client.http = &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		mutex.Lock()
		defer mutex.Unlock()
		requests++
		var body map[string]any
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		thinking, ok := body["thinking"].(map[string]any)
		if !ok || thinking["type"] != "disabled" {
			t.Fatalf("thinking parameter = %#v, want disabled", body["thinking"])
		}
		if requests == 1 {
			return jsonHTTPResponse(http.StatusOK, `{"choices":[{"message":{"content":"","reasoning_content":"reasoning only"},"finish_reason":"length"}],"usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":30}}`), nil
		}
		return jsonHTTPResponse(http.StatusOK, `{"choices":[{"message":{"content":"连接正常"},"finish_reason":"stop"}],"usage":{"prompt_tokens":11,"completion_tokens":2,"total_tokens":13}}`), nil
	})}

	content, usage, err := client.chat(context.Background(), "system", "user", false)
	if err != nil {
		t.Fatalf("chat() error = %v", err)
	}
	if content != "连接正常" || requests != 2 {
		t.Fatalf("content=%q requests=%d", content, requests)
	}
	if usage != (aiUsage{PromptTokens: 21, CompletionTokens: 22, TotalTokens: 43}) {
		t.Fatalf("usage=%+v", usage)
	}
}

func TestFoodEstimateRetriesMalformedJSON(t *testing.T) {
	requests := 0
	client := newAIClient("https://api.deepseek.com", "test-key", "deepseek-v4-flash")
	client.http = &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		requests++
		if requests == 1 {
			return jsonHTTPResponse(http.StatusOK, `{"choices":[{"message":{"content":"not json"},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}}`), nil
		}
		return jsonHTTPResponse(http.StatusOK, `{"choices":[{"message":{"content":"{\"name\":\"水果黄瓜\",\"nutritionUnit\":\"g\",\"calories\":15,\"protein\":0.7,\"fat\":0.1,\"carb\":3.6,\"servingLabel\":\"根\",\"servingAmount\":100,\"confidence\":\"medium\",\"basis\":\"常见值\",\"notice\":\"以实物为准\"}"},"finish_reason":"stop"}],"usage":{"prompt_tokens":8,"completion_tokens":10,"total_tokens":18}}`), nil
	})}

	estimate, usage, err := client.estimateFoodNutrition(context.Background(), "估算水果黄瓜")
	if err != nil {
		t.Fatalf("estimateFoodNutrition() error = %v", err)
	}
	if estimate.Name != "水果黄瓜" || requests != 2 {
		t.Fatalf("estimate=%+v requests=%d", estimate, requests)
	}
	if usage.TotalTokens != 25 {
		t.Fatalf("usage=%+v", usage)
	}
}

func TestEmptyContentErrorIncludesDiagnostics(t *testing.T) {
	err := (&aiEmptyContentError{FinishReason: "length", ReasoningChars: 1200}).Error()
	if !strings.Contains(err, "finish_reason=length") || !strings.Contains(err, "reasoning_chars=1200") {
		t.Fatalf("diagnostic error = %q", err)
	}
}
