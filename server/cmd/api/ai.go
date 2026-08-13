package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const nutritionSafetyBoundary = `你是“轻脂管家”的营养生活方式助手。请使用简体中文，给出温和、具体、可执行的建议。你不能诊断或治疗疾病，不能建议停药或改变治疗方案。涉及重度脂肪肝、异常血糖、明显不适、快速减重或其他高风险情况时，明确建议咨询医生或注册营养师。营养数据存在品牌、烹饪方式和可食部差异时必须说明是估算。不要鼓励极端节食，不要把单日波动解释为确定的健康结论。不得凭空设定低于App既有目标的热量上限；不得把总脂肪数据解释为已知的饱和或不饱和脂肪构成；不得声称某一种食物或营养素能够治疗或逆转脂肪肝。`

type aiClient struct {
	baseURL string
	apiKey  string
	model   string
	http    *http.Client
}

type aiUsage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

type aiChatResponse struct {
	Choices []struct {
		Message struct {
			Content          string `json:"content"`
			ReasoningContent string `json:"reasoning_content"`
		} `json:"message"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Usage aiUsage `json:"usage"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

type aiHTTPError struct {
	StatusCode int
	Message    string
}

type aiEmptyContentError struct {
	FinishReason   string
	ReasoningChars int
}

func (e *aiEmptyContentError) Error() string {
	finishReason := e.FinishReason
	if finishReason == "" {
		finishReason = "unknown"
	}
	return fmt.Sprintf("DeepSeek 未返回最终内容（finish_reason=%s, reasoning_chars=%d）", finishReason, e.ReasoningChars)
}

type aiMalformedResponseError struct {
	Message string
}

func (e *aiMalformedResponseError) Error() string {
	return e.Message
}

func (e *aiHTTPError) Error() string {
	return e.Message
}

type dailyContext struct {
	Date      string          `json:"date"`
	Version   string          `json:"version"`
	Profile   json.RawMessage `json:"profile"`
	Summary   json.RawMessage `json:"summary"`
	Meals     json.RawMessage `json:"meals"`
	Exercises json.RawMessage `json:"exercises"`
}

type summaryInput struct {
	Context dailyContext `json:"context"`
	Force   bool         `json:"force"`
}

type dailyPlanInput struct {
	Date     string         `json:"date"`
	Contexts []dailyContext `json:"contexts"`
	Force    bool           `json:"force"`
}

type foodEstimateInput struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type askInput struct {
	Question string       `json:"question"`
	Context  dailyContext `json:"context"`
}

type foodEstimate struct {
	Name          string  `json:"name"`
	NutritionUnit string  `json:"nutritionUnit"`
	Calories      float64 `json:"calories"`
	Protein       float64 `json:"protein"`
	Fat           float64 `json:"fat"`
	Carb          float64 `json:"carb"`
	ServingLabel  string  `json:"servingLabel"`
	ServingAmount float64 `json:"servingAmount"`
	Confidence    string  `json:"confidence"`
	Basis         string  `json:"basis"`
	Notice        string  `json:"notice"`
}

type aiRecord struct {
	ID               uuid.UUID       `json:"id"`
	ResponseText     string          `json:"responseText,omitempty"`
	ResponseJSON     json.RawMessage `json:"responseJson,omitempty"`
	ContextVersion   string          `json:"contextVersion,omitempty"`
	CreatedAt        time.Time       `json:"createdAt"`
	PromptTokens     int             `json:"promptTokens"`
	CompletionTokens int             `json:"completionTokens"`
	TotalTokens      int             `json:"totalTokens"`
}

type aiHistoryRecord struct {
	ID              uuid.UUID `json:"id"`
	InteractionType string    `json:"interactionType"`
	DayKey          string    `json:"dayKey,omitempty"`
	Question        string    `json:"question,omitempty"`
	ResponseText    string    `json:"responseText"`
	CreatedAt       time.Time `json:"createdAt"`
}

func newAIClient(baseURL, apiKey, model string) *aiClient {
	return &aiClient{
		baseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		apiKey:  strings.TrimSpace(apiKey),
		model:   strings.TrimSpace(model),
		http:    &http.Client{Timeout: 25 * time.Second},
	}
}

func (a *aiClient) available() bool {
	return a != nil && a.apiKey != "" && a.baseURL != "" && a.model != ""
}

func (a *aiClient) chat(ctx context.Context, system, user string, jsonMode bool) (string, aiUsage, error) {
	var total aiUsage
	var lastErr error
	for attempt := 0; attempt < 2; attempt++ {
		content, usage, err := a.chatOnce(ctx, system, user, jsonMode)
		total = addAIUsage(total, usage)
		if err == nil {
			return content, total, nil
		}
		lastErr = err
		if !isRetryableAIError(err) || attempt == 1 || !waitForAIRetry(ctx) {
			break
		}
	}
	return "", total, lastErr
}

func (a *aiClient) chatOnce(ctx context.Context, system, user string, jsonMode bool) (string, aiUsage, error) {
	if !a.available() {
		return "", aiUsage{}, errors.New("AI_API_KEY 未配置")
	}
	body := map[string]any{
		"model": a.model,
		"messages": []map[string]string{
			{"role": "system", "content": system},
			{"role": "user", "content": user},
		},
		"temperature": 0.3,
		"max_tokens":  1600,
		"thinking":    map[string]string{"type": "disabled"},
	}
	if jsonMode {
		body["response_format"] = map[string]string{"type": "json_object"}
	}
	encoded, err := json.Marshal(body)
	if err != nil {
		return "", aiUsage{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.baseURL+"/chat/completions", bytes.NewReader(encoded))
	if err != nil {
		return "", aiUsage{}, err
	}
	req.Header.Set("Authorization", "Bearer "+a.apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := a.http.Do(req)
	if err != nil {
		return "", aiUsage{}, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return "", aiUsage{}, err
	}
	var payload aiChatResponse
	if err := json.Unmarshal(raw, &payload); err != nil {
		message := fmt.Sprintf("DeepSeek 返回格式异常（HTTP %d, response=%s）", resp.StatusCode, compactAIExcerpt(string(raw), 240))
		if resp.StatusCode >= 500 || resp.StatusCode == http.StatusTooManyRequests {
			return "", aiUsage{}, &aiHTTPError{StatusCode: resp.StatusCode, Message: message}
		}
		return "", aiUsage{}, &aiMalformedResponseError{Message: message}
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		message := "DeepSeek 请求失败"
		if payload.Error != nil && payload.Error.Message != "" {
			message = payload.Error.Message
		}
		return "", payload.Usage, &aiHTTPError{StatusCode: resp.StatusCode, Message: message}
	}
	if len(payload.Choices) == 0 {
		return "", payload.Usage, &aiEmptyContentError{FinishReason: "no_choices"}
	}
	choice := payload.Choices[0]
	if strings.TrimSpace(choice.Message.Content) == "" {
		return "", payload.Usage, &aiEmptyContentError{
			FinishReason:   choice.FinishReason,
			ReasoningChars: len([]rune(choice.Message.ReasoningContent)),
		}
	}
	return strings.TrimSpace(choice.Message.Content), payload.Usage, nil
}

func (a *aiClient) estimateFoodNutrition(ctx context.Context, prompt string) (foodEstimate, aiUsage, error) {
	var total aiUsage
	var lastErr error
	currentPrompt := prompt
	for attempt := 0; attempt < 2; attempt++ {
		content, usage, err := a.chatOnce(ctx, nutritionSafetyBoundary+"你必须输出合法JSON，不要使用Markdown代码块。", currentPrompt, true)
		total = addAIUsage(total, usage)
		if err != nil {
			lastErr = err
			if !isRetryableAIError(err) || attempt == 1 || !waitForAIRetry(ctx) {
				break
			}
			continue
		}
		var estimate foodEstimate
		decodeErr := json.Unmarshal([]byte(stripJSONFence(content)), &estimate)
		if decodeErr == nil && validFoodEstimate(estimate) {
			return estimate, total, nil
		}
		lastErr = fmt.Errorf("模型返回的营养结构无法解析（attempt=%d, response=%s）", attempt+1, compactAIExcerpt(content, 240))
		if attempt == 0 {
			currentPrompt = prompt + `\n上一次输出不是符合字段和数值约束的JSON。请重新检查全部字段，只输出一个完整JSON对象，不要解释。`
		}
	}
	return foodEstimate{}, total, lastErr
}

func addAIUsage(left, right aiUsage) aiUsage {
	return aiUsage{
		PromptTokens:     left.PromptTokens + right.PromptTokens,
		CompletionTokens: left.CompletionTokens + right.CompletionTokens,
		TotalTokens:      left.TotalTokens + right.TotalTokens,
	}
}

func isRetryableAIError(err error) bool {
	var emptyErr *aiEmptyContentError
	if errors.As(err, &emptyErr) {
		return true
	}
	var malformedErr *aiMalformedResponseError
	if errors.As(err, &malformedErr) {
		return true
	}
	var httpErr *aiHTTPError
	if errors.As(err, &httpErr) {
		return httpErr.StatusCode == http.StatusRequestTimeout || httpErr.StatusCode == http.StatusTooManyRequests || httpErr.StatusCode >= 500
	}
	var networkErr net.Error
	return errors.As(err, &networkErr)
}

func waitForAIRetry(ctx context.Context) bool {
	timer := time.NewTimer(250 * time.Millisecond)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

func compactAIExcerpt(value string, maxRunes int) string {
	value = strings.Join(strings.Fields(value), " ")
	runes := []rune(value)
	if len(runes) > maxRunes {
		value = string(runes[:maxRunes]) + "…"
	}
	if value == "" {
		return "<empty>"
	}
	return value
}

func (s *server) latestDailySummary(c *gin.Context) {
	userID := c.MustGet("userID").(uuid.UUID)
	day := strings.TrimSpace(c.Query("date"))
	if !validDayKey(day) {
		fail(c, http.StatusBadRequest, "日期格式不正确")
		return
	}
	record, err := s.loadLatestAIRecord(c.Request.Context(), userID, "daily_summary", day)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusOK, gin.H{"summary": nil, "remaining": s.remainingAIQuota(c.Request.Context(), userID)})
		return
	}
	if err != nil {
		fail(c, http.StatusInternalServerError, "无法读取AI总结")
		return
	}
	c.JSON(http.StatusOK, gin.H{"summary": record, "remaining": s.remainingAIQuota(c.Request.Context(), userID)})
}

func (s *server) generateDailySummary(c *gin.Context) {
	var input summaryInput
	if err := bindLimitedJSON(c, &input); err != nil || !validDailyContext(input.Context) {
		fail(c, http.StatusBadRequest, "当日数据不完整或格式不正确")
		return
	}
	userID := c.MustGet("userID").(uuid.UUID)
	if !input.Force {
		if cached, err := s.loadLatestAIRecord(c.Request.Context(), userID, "daily_summary", input.Context.Date); err == nil && cached.ContextVersion == input.Context.Version {
			c.JSON(http.StatusOK, gin.H{"summary": cached, "cached": true, "remaining": s.remainingAIQuota(c.Request.Context(), userID)})
			return
		}
	}
	recordID, remaining, err := s.reserveAIInteraction(c.Request.Context(), userID, "daily_summary", input.Context.Date, input.Context.Version, "")
	if err != nil {
		s.respondAIReservationError(c, err)
		return
	}
	contextJSON, _ := json.Marshal(input.Context)
	prompt := `请根据以下当日档案、目标、饮食与运动数据生成今日减脂总结。使用以下小标题：今日概况、做得好的地方、需要调整、明日一条行动建议。必须同时评价总热量、蛋白质、脂肪、碳水，不要鼓励为了“达标”而强行吃满目标；若数据不完整请明确说明。控制在500字以内。数据：` + string(contextJSON)
	content, usage, callErr := s.ai.chat(c.Request.Context(), nutritionSafetyBoundary, prompt, false)
	if callErr != nil {
		s.failAIInteraction(c.Request.Context(), recordID, callErr, usage)
		fail(c, http.StatusBadGateway, friendlyAIError(callErr))
		return
	}
	if err := s.completeAIInteraction(c.Request.Context(), recordID, content, nil, usage); err != nil {
		fail(c, http.StatusInternalServerError, "AI总结已生成但保存失败")
		return
	}
	record, _ := s.loadAIRecord(c.Request.Context(), recordID)
	c.JSON(http.StatusOK, gin.H{"summary": record, "cached": false, "remaining": remaining})
}

func (s *server) latestDailyPlan(c *gin.Context) {
	userID := c.MustGet("userID").(uuid.UUID)
	day := strings.TrimSpace(c.Query("date"))
	if !validDayKey(day) {
		fail(c, http.StatusBadRequest, "日期格式不正确")
		return
	}
	record, err := s.loadLatestAIRecord(c.Request.Context(), userID, "daily_plan", day)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusOK, gin.H{"plan": nil, "remaining": s.remainingAIQuota(c.Request.Context(), userID)})
		return
	}
	if err != nil {
		fail(c, http.StatusInternalServerError, "无法读取今日方案")
		return
	}
	c.JSON(http.StatusOK, gin.H{"plan": record, "remaining": s.remainingAIQuota(c.Request.Context(), userID)})
}

func (s *server) generateDailyPlan(c *gin.Context) {
	var input dailyPlanInput
	if err := bindLimitedJSON(c, &input); err != nil || !validDayKey(input.Date) || len(input.Contexts) != 2 {
		fail(c, http.StatusBadRequest, "前两日数据不完整或格式不正确")
		return
	}
	for _, daily := range input.Contexts {
		if !validDailyContext(daily) {
			fail(c, http.StatusBadRequest, "前两日数据不完整或格式不正确")
			return
		}
	}
	contextVersion := "v1-" + input.Contexts[0].Version + "-" + input.Contexts[1].Version
	if len(contextVersion) > 160 {
		contextVersion = fmt.Sprintf("v1-%x", []byte(contextVersion)[:60])
	}
	userID := c.MustGet("userID").(uuid.UUID)
	if !input.Force {
		if cached, err := s.loadLatestAIRecord(c.Request.Context(), userID, "daily_plan", input.Date); err == nil && cached.ContextVersion == contextVersion {
			c.JSON(http.StatusOK, gin.H{"plan": cached, "cached": true, "remaining": s.remainingAIQuota(c.Request.Context(), userID)})
			return
		}
	}
	recordID, remaining, err := s.reserveAIInteraction(c.Request.Context(), userID, "daily_plan", input.Date, contextVersion, "")
	if err != nil {
		s.respondAIReservationError(c, err)
		return
	}
	contextJSON, _ := json.Marshal(input.Contexts)
	prompt := `请根据以下连续前两天的档案、饮食和运动记录，为用户制定今天的减脂执行方案。使用小标题：今日重点、饮食方案、运动方案、执行提醒。比较两天的总热量、蛋白质、脂肪、碳水和运动；只有记录存在时才作判断，不得把缺失记录当作真实零摄入。方案应具体、容易执行，不鼓励极端节食，也不要要求用户为了达标强行吃满。控制在500字以内。前两日数据：` + string(contextJSON)
	content, usage, callErr := s.ai.chat(c.Request.Context(), nutritionSafetyBoundary, prompt, false)
	if callErr != nil {
		s.failAIInteraction(c.Request.Context(), recordID, callErr, usage)
		fail(c, http.StatusBadGateway, friendlyAIError(callErr))
		return
	}
	if err := s.completeAIInteraction(c.Request.Context(), recordID, content, nil, usage); err != nil {
		fail(c, http.StatusInternalServerError, "今日方案已生成但保存失败")
		return
	}
	record, _ := s.loadAIRecord(c.Request.Context(), recordID)
	c.JSON(http.StatusOK, gin.H{"plan": record, "cached": false, "remaining": remaining})
}

func (s *server) aiHistory(c *gin.Context) {
	userID := c.MustGet("userID").(uuid.UUID)
	filter := strings.TrimSpace(c.DefaultQuery("type", "all"))
	if filter != "all" && filter != "daily_summary" && filter != "question" {
		fail(c, http.StatusBadRequest, "历史类型不正确")
		return
	}
	limit := 20
	if rawLimit := c.Query("limit"); rawLimit != "" {
		parsed, err := strconv.Atoi(rawLimit)
		if err != nil {
			fail(c, http.StatusBadRequest, "limit格式不正确")
			return
		}
		limit = parsed
	}
	if limit < 1 {
		limit = 1
	}
	if limit > 50 {
		limit = 50
	}
	before := strings.TrimSpace(c.Query("before"))
	var beforeValue any
	if before != "" {
		parsed, err := time.Parse(time.RFC3339Nano, before)
		if err != nil {
			fail(c, http.StatusBadRequest, "before格式不正确")
			return
		}
		beforeValue = parsed
	}
	rows, err := s.db.Query(c.Request.Context(), `
		SELECT id,interaction_type,COALESCE(day_key::text,''),COALESCE(question,''),COALESCE(response_text,''),created_at
		FROM ai_interactions
		WHERE user_id=$1 AND status='success'
		  AND interaction_type IN ('daily_summary','question')
		  AND ($2='all' OR interaction_type=$2)
		  AND ($3::timestamptz IS NULL OR created_at < $3)
		ORDER BY created_at DESC,id DESC LIMIT $4`, userID, filter, beforeValue, limit)
	if err != nil {
		fail(c, http.StatusInternalServerError, "无法读取AI历史")
		return
	}
	defer rows.Close()
	items := make([]aiHistoryRecord, 0, limit)
	for rows.Next() {
		var item aiHistoryRecord
		if err := rows.Scan(&item.ID, &item.InteractionType, &item.DayKey, &item.Question, &item.ResponseText, &item.CreatedAt); err != nil {
			fail(c, http.StatusInternalServerError, "无法读取AI历史")
			return
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		fail(c, http.StatusInternalServerError, "无法读取AI历史")
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (s *server) estimateFood(c *gin.Context) {
	var input foodEstimateInput
	if err := bindLimitedJSON(c, &input); err != nil {
		fail(c, http.StatusBadRequest, "请求格式不正确")
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	input.Description = strings.TrimSpace(input.Description)
	if input.Name == "" || len([]rune(input.Name)) > 80 || len([]rune(input.Description)) > 500 {
		fail(c, http.StatusBadRequest, "食物名称需要在1–80字，补充描述不超过500字")
		return
	}
	userID := c.MustGet("userID").(uuid.UUID)
	recordID, remaining, err := s.reserveAIInteraction(c.Request.Context(), userID, "food_estimate", "", "", input.Name)
	if err != nil {
		s.respondAIReservationError(c, err)
		return
	}
	prompt := fmt.Sprintf(`估算食物“%s”的营养。补充描述：“%s”。只返回JSON对象，字段必须为：name、nutritionUnit（只能g或ml）、calories（单位kcal）、protein、fat、carb（后三者单位g，所有营养均按每100g或100mL）、servingLabel、servingAmount、confidence（high/medium/low）、basis、notice。数值使用非负数字；品牌或做法不明确时使用常见中位估计并降低置信度。`, input.Name, input.Description)
	estimate, usage, callErr := s.ai.estimateFoodNutrition(c.Request.Context(), prompt)
	if callErr != nil {
		s.failAIInteraction(c.Request.Context(), recordID, callErr, usage)
		fail(c, http.StatusBadGateway, friendlyAIError(callErr))
		return
	}
	responseJSON, _ := json.Marshal(estimate)
	if err := s.completeAIInteraction(c.Request.Context(), recordID, "", responseJSON, usage); err != nil {
		fail(c, http.StatusInternalServerError, "估算已完成但保存失败")
		return
	}
	c.JSON(http.StatusOK, gin.H{"estimate": estimate, "remaining": remaining})
}

func (s *server) askNutritionAssistant(c *gin.Context) {
	var input askInput
	if err := bindLimitedJSON(c, &input); err != nil || !validDailyContext(input.Context) {
		fail(c, http.StatusBadRequest, "问题或当日数据格式不正确")
		return
	}
	input.Question = strings.TrimSpace(input.Question)
	if input.Question == "" || len([]rune(input.Question)) > 500 {
		fail(c, http.StatusBadRequest, "问题需要在1–500字之间")
		return
	}
	userID := c.MustGet("userID").(uuid.UUID)
	recordID, remaining, err := s.reserveAIInteraction(c.Request.Context(), userID, "question", input.Context.Date, input.Context.Version, input.Question)
	if err != nil {
		s.respondAIReservationError(c, err)
		return
	}
	contextJSON, _ := json.Marshal(input.Context)
	prompt := `用户问题：` + input.Question + `
请结合用户档案、当天目标、已摄入和运动明细先给出直接结论，再解释判断依据，最后给出可执行建议。如果问题是“能否再吃某食物”，需要估算加入后的热量和宏量营养影响；信息不足时说明假设，不要假装精确。只能使用数据中已有的饮食目标，不得另造更低的全天热量上限；若只提供总脂肪，不得推断其脂肪酸构成。控制在600字以内。
当日数据：` + string(contextJSON)
	content, usage, callErr := s.ai.chat(c.Request.Context(), nutritionSafetyBoundary, prompt, false)
	if callErr != nil {
		s.failAIInteraction(c.Request.Context(), recordID, callErr, usage)
		fail(c, http.StatusBadGateway, friendlyAIError(callErr))
		return
	}
	if err := s.completeAIInteraction(c.Request.Context(), recordID, content, nil, usage); err != nil {
		fail(c, http.StatusInternalServerError, "回答已生成但保存失败")
		return
	}
	c.JSON(http.StatusOK, gin.H{"answer": content, "interactionId": recordID, "remaining": remaining})
}

var errAIQuota = errors.New("AI_DAILY_QUOTA_EXCEEDED")
var errAINotConfigured = errors.New("AI_NOT_CONFIGURED")

func (s *server) reserveAIInteraction(ctx context.Context, userID uuid.UUID, interactionType, dayKey, contextVersion, question string) (uuid.UUID, int, error) {
	if !s.ai.available() {
		return uuid.Nil, 0, errAINotConfigured
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return uuid.Nil, 0, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, userID.String()); err != nil {
		return uuid.Nil, 0, err
	}
	var used int
	if err := tx.QueryRow(ctx, `SELECT COUNT(*) FROM ai_interactions WHERE user_id=$1 AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai'`, userID).Scan(&used); err != nil {
		return uuid.Nil, 0, err
	}
	if used >= s.aiDailyLimit {
		return uuid.Nil, 0, errAIQuota
	}
	id := uuid.New()
	var nullableDay any
	if dayKey != "" {
		nullableDay = dayKey
	}
	_, err = tx.Exec(ctx, `INSERT INTO ai_interactions (id,user_id,interaction_type,day_key,context_version,question,model,status) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')`, id, userID, interactionType, nullableDay, emptyToNil(contextVersion), emptyToNil(question), s.ai.model)
	if err != nil {
		return uuid.Nil, 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, 0, err
	}
	return id, s.aiDailyLimit - used - 1, nil
}

func (s *server) completeAIInteraction(ctx context.Context, id uuid.UUID, text string, responseJSON []byte, usage aiUsage) error {
	_, err := s.db.Exec(ctx, `UPDATE ai_interactions SET response_text=$2,response_json=$3,prompt_tokens=$4,completion_tokens=$5,total_tokens=$6,status='success',completed_at=NOW() WHERE id=$1`, id, emptyToNil(text), responseJSON, usage.PromptTokens, usage.CompletionTokens, usage.TotalTokens)
	return err
}

func (s *server) failAIInteraction(ctx context.Context, id uuid.UUID, cause error, usage aiUsage) {
	message := cause.Error()
	if len(message) > 1000 {
		message = message[:1000]
	}
	_, _ = s.db.Exec(ctx, `UPDATE ai_interactions SET status='failed',error_message=$2,prompt_tokens=$3,completion_tokens=$4,total_tokens=$5,completed_at=NOW() WHERE id=$1`, id, message, usage.PromptTokens, usage.CompletionTokens, usage.TotalTokens)
}

func (s *server) loadLatestAIRecord(ctx context.Context, userID uuid.UUID, interactionType, day string) (aiRecord, error) {
	var record aiRecord
	err := s.db.QueryRow(ctx, `SELECT id,COALESCE(response_text,''),COALESCE(response_json,'null'::jsonb),COALESCE(context_version,''),created_at,prompt_tokens,completion_tokens,total_tokens FROM ai_interactions WHERE user_id=$1 AND interaction_type=$2 AND day_key=$3 AND status='success' ORDER BY created_at DESC LIMIT 1`, userID, interactionType, day).Scan(&record.ID, &record.ResponseText, &record.ResponseJSON, &record.ContextVersion, &record.CreatedAt, &record.PromptTokens, &record.CompletionTokens, &record.TotalTokens)
	return record, err
}

func (s *server) loadAIRecord(ctx context.Context, id uuid.UUID) (aiRecord, error) {
	var record aiRecord
	err := s.db.QueryRow(ctx, `SELECT id,COALESCE(response_text,''),COALESCE(response_json,'null'::jsonb),COALESCE(context_version,''),created_at,prompt_tokens,completion_tokens,total_tokens FROM ai_interactions WHERE id=$1`, id).Scan(&record.ID, &record.ResponseText, &record.ResponseJSON, &record.ContextVersion, &record.CreatedAt, &record.PromptTokens, &record.CompletionTokens, &record.TotalTokens)
	return record, err
}

func (s *server) remainingAIQuota(ctx context.Context, userID uuid.UUID) int {
	var used int
	if err := s.db.QueryRow(ctx, `SELECT COUNT(*) FROM ai_interactions WHERE user_id=$1 AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai'`, userID).Scan(&used); err != nil {
		return 0
	}
	if used >= s.aiDailyLimit {
		return 0
	}
	return s.aiDailyLimit - used
}

func (s *server) respondAIReservationError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, errAINotConfigured):
		fail(c, http.StatusServiceUnavailable, "服务端尚未配置 DeepSeek API Key")
	case errors.Is(err, errAIQuota):
		fail(c, http.StatusTooManyRequests, fmt.Sprintf("今天的AI调用已达到%d次，请明天再试", s.aiDailyLimit))
	default:
		fail(c, http.StatusInternalServerError, "暂时无法创建AI请求")
	}
}

func bindLimitedJSON(c *gin.Context, target any) error {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 512<<10)
	return c.ShouldBindJSON(target)
}

func validDailyContext(value dailyContext) bool {
	return validDayKey(value.Date) && strings.TrimSpace(value.Version) != "" && len(value.Version) <= 160 && json.Valid(value.Profile) && json.Valid(value.Summary) && json.Valid(value.Meals) && json.Valid(value.Exercises)
}

func validDayKey(value string) bool {
	parsed, err := time.Parse("2006-01-02", value)
	return err == nil && parsed.Format("2006-01-02") == value
}

func validFoodEstimate(value foodEstimate) bool {
	if value.NutritionUnit != "g" && value.NutritionUnit != "ml" {
		return false
	}
	if value.Calories < 0 || value.Calories > 1000 || value.Protein < 0 || value.Protein > 100 || value.Fat < 0 || value.Fat > 100 || value.Carb < 0 || value.Carb > 100 || value.ServingAmount < 0 || value.ServingAmount > 10000 {
		return false
	}
	if value.Confidence != "high" && value.Confidence != "medium" && value.Confidence != "low" {
		return false
	}
	if (strings.TrimSpace(value.ServingLabel) == "") != (value.ServingAmount == 0) {
		return false
	}
	return strings.TrimSpace(value.Name) != "" && len([]rune(value.Name)) <= 80 && len([]rune(value.ServingLabel)) <= 20 && len([]rune(value.Basis)) <= 1000 && len([]rune(value.Notice)) <= 1000
}

func stripJSONFence(value string) string {
	value = strings.TrimSpace(value)
	value = strings.TrimPrefix(value, "```json")
	value = strings.TrimPrefix(value, "```")
	value = strings.TrimSuffix(value, "```")
	return strings.TrimSpace(value)
}

func emptyToNil(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func friendlyAIError(err error) string {
	var httpErr *aiHTTPError
	if errors.As(err, &httpErr) && (httpErr.StatusCode == http.StatusUnauthorized || httpErr.StatusCode == http.StatusForbidden) {
		return "DeepSeek认证失败，请检查服务端API Key"
	}
	if strings.Contains(err.Error(), "401") || strings.Contains(strings.ToLower(err.Error()), "authentication") {
		return "DeepSeek认证失败，请检查服务端API Key"
	}
	return "AI服务暂时不可用，请稍后重试"
}
