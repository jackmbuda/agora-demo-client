package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/AgoraIO-Community/go-tokenbuilder/rtctokenbuilder2"
	"github.com/joho/godotenv"
)

type TokenResponse struct {
	AppID   string `json:"appId"`
	Token   string `json:"token"`
	Channel string `json:"channel"`
	UID     uint32 `json:"uid"`
}

type StartSTTRequest struct {
	Channel string `json:"channel"`
	UID     uint32 `json:"uid"`
}

type StopSTTRequest struct {
	AgentID string `json:"agentId"`
}

type SummaryRequest struct {
	Transcript []string `json:"transcript"`
}

type SummaryResponse struct {
	Summary     string   `json:"summary"`
	KeyPoints   []string `json:"keyPoints"`
	ActionItems []string `json:"actionItems"`
}

type OpenAIChatCompletionRequest struct {
	Model          string                   `json:"model"`
	Messages       []OpenAIMessage          `json:"messages"`
	ResponseFormat OpenAIResponseFormatWrap `json:"response_format"`
	Temperature    float64                  `json:"temperature"`
}

type OpenAIMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type OpenAIResponseFormatWrap struct {
	Type       string              `json:"type"`
	JSONSchema OpenAIJSONSchemaObj `json:"json_schema"`
}

type OpenAIJSONSchemaObj struct {
	Name   string         `json:"name"`
	Schema map[string]any `json:"schema"`
	Strict bool           `json:"strict"`
}

type OpenAIChatCompletionResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

func main() {
	_ = godotenv.Load()

	appID := os.Getenv("AGORA_APP_ID")
	appCertificate := os.Getenv("AGORA_APP_CERTIFICATE")
	customerID := os.Getenv("AGORA_CUSTOMER_ID")
	customerSecret := os.Getenv("AGORA_CUSTOMER_SECRET")
	port := os.Getenv("PORT")

	if port == "" {
		port = "8080"
	}

	if appID == "" || appCertificate == "" {
		log.Fatal("Missing AGORA_APP_ID or AGORA_APP_CERTIFICATE in server/.env")
	}

	if customerID == "" || customerSecret == "" {
		log.Println("Warning: AGORA_CUSTOMER_ID or AGORA_CUSTOMER_SECRET missing; STT endpoints will fail until set")
	}

	mux := http.NewServeMux()

	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		enableCORS(&w)

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		channel := r.URL.Query().Get("channel")
		if channel == "" {
			channel = "demo-channel"
		}

		uidParam := r.URL.Query().Get("uid")
		var uid uint32 = 1
		if uidParam != "" {
			parsed, err := strconv.ParseUint(uidParam, 10, 32)
			if err != nil || parsed == 0 {
				http.Error(w, "invalid uid", http.StatusBadRequest)
				return
			}
			uid = uint32(parsed)
		}

		tokenExpireSeconds := uint32(3600)
		privilegeExpireSeconds := uint32(3600)

		token, err := rtctokenbuilder2.BuildTokenWithUid(
			appID,
			appCertificate,
			channel,
			uid,
			rtctokenbuilder2.RolePublisher,
			tokenExpireSeconds,
			privilegeExpireSeconds,
		)
		if err != nil {
			log.Println("failed to build token:", err)
			http.Error(w, "failed to build token", http.StatusInternalServerError)
			return
		}

		response := TokenResponse{
			AppID:   appID,
			Token:   token,
			Channel: channel,
			UID:     uid,
		}

		writeJSON(w, http.StatusOK, response)
	})

	mux.HandleFunc("/stt/start", func(w http.ResponseWriter, r *http.Request) {
		enableCORS(&w)

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var reqBody StartSTTRequest
		if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if reqBody.Channel == "" {
			reqBody.Channel = "demo-channel"
		}
		if reqBody.UID == 0 {
			http.Error(w, "uid must be a positive integer", http.StatusBadRequest)
			return
		}

		const botUID uint32 = 88222
		botUIDStr := "88222"

		tokenExpireSeconds := uint32(3600)
		privilegeExpireSeconds := uint32(3600)

		botToken, err := rtctokenbuilder2.BuildTokenWithUid(
			appID,
			appCertificate,
			reqBody.Channel,
			botUID,
			rtctokenbuilder2.RolePublisher,
			tokenExpireSeconds,
			privilegeExpireSeconds,
		)
		if err != nil {
			log.Println("failed to build botToken:", err)
			http.Error(w, "failed to build STT bot token", http.StatusInternalServerError)
			return
		}

		uniqueAgentName := reqBody.Channel + "-" + strconv.FormatInt(time.Now().UnixNano(), 10)

		payload := map[string]any{
			"languages":   []string{"en-US"},
			"name":        uniqueAgentName,
			"maxIdleTime": 300,
			"rtcConfig": map[string]any{
				"channelName":        reqBody.Channel,
				"subBotUid":          botUIDStr,
				"subBotToken":        botToken,
				"pubBotUid":          botUIDStr,
				"pubBotToken":        botToken,
				"enableJsonProtocol": false,
			},
		}

		respBody, statusCode, err := callAgoraSTT(
			http.MethodPost,
			"https://api.agora.io/api/speech-to-text/v1/projects/"+appID+"/join",
			payload,
		)
		log.Println("STT start status:", statusCode)
		log.Println("STT start body:", string(respBody))

		if err != nil {
			log.Println("failed to call Agora STT start:", err)
			http.Error(w, "failed to call Agora STT start", http.StatusBadGateway)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(statusCode)
		w.Write(respBody)
	})

	mux.HandleFunc("/stt/query", func(w http.ResponseWriter, r *http.Request) {
		enableCORS(&w)

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		agentID := r.URL.Query().Get("agentId")
		if agentID == "" {
			http.Error(w, "missing agentId", http.StatusBadRequest)
			return
		}

		respBody, statusCode, err := callAgoraSTT(
			http.MethodGet,
			"https://api.agora.io/api/speech-to-text/v1/projects/"+appID+"/agents/"+agentID,
			nil,
		)
		log.Println("STT query status:", statusCode)
		log.Println("STT query body:", string(respBody))

		if err != nil {
			log.Println("failed to call Agora STT query:", err)
			http.Error(w, "failed to call Agora STT query", http.StatusBadGateway)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(statusCode)
		w.Write(respBody)
	})

	mux.HandleFunc("/stt/stop", func(w http.ResponseWriter, r *http.Request) {
		enableCORS(&w)

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var reqBody StopSTTRequest
		if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if reqBody.AgentID == "" {
			http.Error(w, "missing agentId", http.StatusBadRequest)
			return
		}

		respBody, statusCode, err := callAgoraSTT(
			http.MethodPost,
			"https://api.agora.io/api/speech-to-text/v1/projects/"+appID+"/agents/"+reqBody.AgentID+"/leave",
			nil,
		)
		log.Println("STT stop status:", statusCode)
		log.Println("STT stop body:", string(respBody))

		if err != nil {
			log.Println("failed to call Agora STT stop:", err)
			http.Error(w, "failed to call Agora STT stop", http.StatusBadGateway)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(statusCode)
		w.Write(respBody)
	})

	mux.HandleFunc("/summary", func(w http.ResponseWriter, r *http.Request) {
		enableCORS(&w)

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var reqBody SummaryRequest
		if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		if len(reqBody.Transcript) == 0 {
			http.Error(w, "transcript is required", http.StatusBadRequest)
			return
		}

		result, err := generateSummary(reqBody.Transcript)
		if err != nil {
			log.Println("failed to generate summary:", err)
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}

		writeJSON(w, http.StatusOK, result)
	})

	log.Printf("Server listening on http://localhost:%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}

func generateSummary(lines []string) (SummaryResponse, error) {
	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey == "" {
		return SummaryResponse{}, errors.New("missing OPENAI_API_KEY")
	}

	model := os.Getenv("OPENAI_MODEL")
	if model == "" {
		model = "gpt-4o-mini"
	}

	transcriptText := strings.Join(lines, "\n")

	schema := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"summary": map[string]any{
				"type": "string",
			},
			"keyPoints": map[string]any{
				"type": "array",
				"items": map[string]any{
					"type": "string",
				},
			},
			"actionItems": map[string]any{
				"type": "array",
				"items": map[string]any{
					"type": "string",
				},
			},
		},
		"required":             []string{"summary", "keyPoints", "actionItems"},
		"additionalProperties": false,
	}

	reqBody := OpenAIChatCompletionRequest{
		Model: model,
		Messages: []OpenAIMessage{
			{
				Role:    "system",
				Content: "You create concise meeting notes from a transcript. Return JSON only. Keep the summary to 2-4 sentences. Key points and action items should be concise bullet-style strings.",
			},
			{
				Role:    "user",
				Content: "Create meeting notes from this transcript:\n\n" + transcriptText,
			},
		},
		ResponseFormat: OpenAIResponseFormatWrap{
			Type: "json_schema",
			JSONSchema: OpenAIJSONSchemaObj{
				Name:   "meeting_notes",
				Schema: schema,
				Strict: true,
			},
		},
		Temperature: 0.2,
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return SummaryResponse{}, err
	}

	req, err := http.NewRequest(
		http.MethodPost,
		"https://api.openai.com/v1/chat/completions",
		bytes.NewBuffer(bodyBytes),
	)
	if err != nil {
		return SummaryResponse{}, err
	}

	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return SummaryResponse{}, err
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return SummaryResponse{}, err
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Println("OpenAI summary status:", resp.StatusCode)
		log.Println("OpenAI summary body:", string(respBytes))
		return SummaryResponse{}, errors.New("openai returned a non-2xx response")
	}

	var openAIResp OpenAIChatCompletionResponse
	if err := json.Unmarshal(respBytes, &openAIResp); err != nil {
		return SummaryResponse{}, err
	}

	if len(openAIResp.Choices) == 0 {
		return SummaryResponse{}, errors.New("openai returned no choices")
	}

	content := openAIResp.Choices[0].Message.Content
	var summaryResp SummaryResponse
	if err := json.Unmarshal([]byte(content), &summaryResp); err != nil {
		log.Println("Failed to parse summary JSON content:", content)
		return SummaryResponse{}, err
	}

	return summaryResp, nil
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func enableCORS(w *http.ResponseWriter) {
	(*w).Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
	(*w).Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	(*w).Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
}

func agoraBasicAuth() string {
	customerID := os.Getenv("AGORA_CUSTOMER_ID")
	customerSecret := os.Getenv("AGORA_CUSTOMER_SECRET")
	raw := customerID + ":" + customerSecret
	return "Basic " + base64.StdEncoding.EncodeToString([]byte(raw))
}

func callAgoraSTT(method, url string, payload any) ([]byte, int, error) {
	var body io.Reader

	if payload != nil {
		jsonBytes, err := json.Marshal(payload)
		if err != nil {
			return nil, 0, err
		}
		body = bytes.NewBuffer(jsonBytes)
	}

	req, err := http.NewRequest(method, url, body)
	if err != nil {
		return nil, 0, err
	}

	req.Header.Set("Authorization", agoraBasicAuth())
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, 0, err
	}

	return respBody, resp.StatusCode, nil
}
