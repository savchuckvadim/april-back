export const LLM_MODELS = ['gigachat', 'openai', 'ollama', 'fake'] as const;

export type LlmModel = (typeof LLM_MODELS)[number];

export const AI_RAG_KINDS = ['resume', 'recomendation'] as const;

export type AiRagKind = (typeof AI_RAG_KINDS)[number];
