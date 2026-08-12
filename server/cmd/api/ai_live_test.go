package main

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"
)

// TestDeepSeekLive is opt-in so normal test runs never consume paid API quota.
// Run it with DEEPSEEK_TEST_API_KEY set only in the process environment.
func TestDeepSeekLive(t *testing.T) {
	apiKey := os.Getenv("DEEPSEEK_TEST_API_KEY")
	if apiKey == "" {
		t.Skip("DEEPSEEK_TEST_API_KEY is not set")
	}
	client := newAIClient("https://api.deepseek.com", apiKey, "deepseek-chat")
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	answer, usage, err := client.chat(ctx, nutritionSafetyBoundary, "只回复：连接正常", false)
	if err != nil {
		t.Fatalf("plain chat failed: %v", err)
	}
	if answer == "" || usage.TotalTokens <= 0 {
		t.Fatalf("plain chat returned empty content or usage: answer=%q usage=%+v", answer, usage)
	}

	content, usage, err := client.chat(ctx, nutritionSafetyBoundary+"你必须输出合法JSON，不要使用Markdown代码块。", `估算普通水煮鸡蛋的营养，只返回JSON对象：{"name":"水煮鸡蛋","nutritionUnit":"g","calories":0,"protein":0,"fat":0,"carb":0,"servingLabel":"个","servingAmount":50,"confidence":"medium","basis":"","notice":""}。营养数值均按每100g填写。`, true)
	if err != nil {
		t.Fatalf("JSON chat failed: %v", err)
	}
	var estimate foodEstimate
	if err := json.Unmarshal([]byte(stripJSONFence(content)), &estimate); err != nil {
		t.Fatalf("JSON response cannot be decoded: %v; content=%q", err, content)
	}
	if !validFoodEstimate(estimate) || usage.TotalTokens <= 0 {
		t.Fatalf("invalid nutrition estimate or usage: estimate=%+v usage=%+v", estimate, usage)
	}
}
