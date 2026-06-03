import { AiChainOutput } from '../domain/types/ai-chain.types';

export function extractResult(result: AiChainOutput): string {
    if (typeof result === 'string') {
        return result;
    }
    if (typeof result.answer === 'string') {
        return result.answer;
    }
    if (typeof result.output === 'string') {
        return result.output;
    }
    if (Array.isArray(result.context) && result.context.length > 0) {
        return result.context.map(item => item.pageContent).join('\n\n');
    }
    return '';
}
