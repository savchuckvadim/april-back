export interface LlmProvider {
    resume(query: string, domain?: string): Promise<string>;
    recomendation(query: string, domain?: string): Promise<string>;
}
