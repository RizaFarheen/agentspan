/*
 * Copyright (c) 2025 AgentSpan
 * Licensed under the MIT License.
 */
package dev.agentspan.runtime.ai;

import com.google.genai.Client;
import com.google.genai.types.Content;
import com.google.genai.types.GenerateContentConfig;
import com.google.genai.types.GenerateContentResponse;
import com.google.genai.types.Part;
import org.conductoross.conductor.ai.AIModel;
import org.conductoross.conductor.ai.models.*;
import org.conductoross.conductor.ai.providers.gemini.GeminiVertex;
import org.conductoross.conductor.ai.providers.gemini.GeminiVertexConfiguration;
import org.conductoross.conductor.ai.models.ChatCompletion;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.metadata.ChatGenerationMetadata;
import org.springframework.ai.chat.metadata.ChatResponseMetadata;
import org.springframework.ai.chat.metadata.DefaultUsage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.chat.prompt.Prompt;

import java.util.ArrayList;
import java.util.List;

/**
 * Gemini model that uses the Google GenAI Java SDK with API key authentication.
 *
 * <p>Bypasses Spring AI's VertexAiGeminiChatModel (which requires GCP IAM) and
 * instead uses the {@code com.google.genai.Client} directly, which supports
 * Google AI Studio API keys for REST-based access.</p>
 */
public class GeminiApiKeyModel extends GeminiVertex {

    private final Client genaiClient;

    public GeminiApiKeyModel(GeminiVertexConfiguration config, String apiKey) {
        super(config);
        this.genaiClient = Client.builder().apiKey(apiKey).build();
    }

    @Override
    public ChatModel getChatModel() {
        return new GeminiApiKeyChatModel(genaiClient);
    }

    @Override
    public ChatOptions getChatOptions(ChatCompletion chatCompletion) {
        // Provide valid chat options so LLMHelper doesn't NPE on null model lookup
        return ChatOptions.builder()
                .model(chatCompletion.getModel() != null ? chatCompletion.getModel() : "gemini-2.5-flash")
                .build();
    }

    /**
     * Minimal ChatModel implementation wrapping the Google GenAI Client.
     */
    private static class GeminiApiKeyChatModel implements ChatModel {

        private final Client client;

        GeminiApiKeyChatModel(Client client) {
            this.client = client;
        }

        @Override
        public ChatResponse call(Prompt prompt) {
            // Convert Spring AI messages to GenAI Content objects
            List<Content> contents = new ArrayList<>();
            String systemInstruction = null;

            for (var message : prompt.getInstructions()) {
                switch (message.getMessageType()) {
                    case SYSTEM -> systemInstruction = message.getText();
                    case USER -> contents.add(Content.fromParts(
                            Part.fromText(message.getText())));
                    case ASSISTANT -> {
                        Content assistantContent = Content.fromParts(
                                Part.fromText(message.getText()));
                        // Mark as model role
                        contents.add(assistantContent.toBuilder().role("model").build());
                    }
                    default -> contents.add(Content.fromParts(
                            Part.fromText(message.getText())));
                }
            }

            // Determine model name from prompt options or default
            String modelName = "gemini-2.5-flash";
            if (prompt.getOptions() != null && prompt.getOptions().getModel() != null) {
                modelName = prompt.getOptions().getModel();
            }

            // Build config
            GenerateContentConfig.Builder configBuilder = GenerateContentConfig.builder();
            if (systemInstruction != null) {
                configBuilder.systemInstruction(Content.fromParts(
                        Part.fromText(systemInstruction)));
            }

            // Call the GenAI API
            GenerateContentResponse response = client.models.generateContent(
                    modelName, contents, configBuilder.build());

            // Extract text from response
            String text = response.text() != null ? response.text() : "";

            // Extract token usage from response
            int promptTokens = 0, completionTokens = 0, totalTokens = 0;
            if (response.usageMetadata().isPresent()) {
                var usage = response.usageMetadata().get();
                promptTokens = usage.promptTokenCount().orElse(0);
                completionTokens = usage.candidatesTokenCount().orElse(0);
                totalTokens = usage.totalTokenCount().orElse(promptTokens + completionTokens);
            }

            // Build Spring AI ChatResponse with finish reason and token usage
            var genMetadata = ChatGenerationMetadata.builder()
                    .finishReason("STOP")
                    .build();
            Generation generation = new Generation(new AssistantMessage(text), genMetadata);

            var responseUsage = new DefaultUsage(
                    promptTokens, completionTokens, totalTokens);
            var responseMetadata = ChatResponseMetadata.builder()
                    .usage(responseUsage)
                    .model(modelName)
                    .build();

            return new ChatResponse(List.of(generation), responseMetadata);
        }

        @Override
        public ChatOptions getDefaultOptions() {
            return null;
        }
    }
}
