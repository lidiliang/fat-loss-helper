package main

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func (s *server) aiConfig(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"defaultModel": s.ai.model})
}

// Each request gets its own client value; the shared default is never mutated.
func (s *server) withAIModel(handler func(*server, *gin.Context)) gin.HandlerFunc {
	return func(c *gin.Context) {
		model := strings.TrimSpace(c.GetHeader("X-AI-Model"))
		if len(model) > 120 || strings.ContainsAny(model, " \t\r\n") {
			fail(c, http.StatusBadRequest, "模型名称最多120个字符，不能包含空白")
			return
		}
		for _, char := range model {
			if char < 33 || char > 126 {
				fail(c, http.StatusBadRequest, "模型名称只能包含英文、数字和符号")
				return
			}
		}
		scoped := *s
		client := *s.ai
		if model != "" {
			client.model = model
		}
		scoped.ai = &client
		handler(&scoped, c)
	}
}
