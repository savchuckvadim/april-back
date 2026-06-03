import { BaseMessage } from '@langchain/core/messages';
import { Document } from '@langchain/core/documents';

export interface AiChainInput {
    input: string;
    context?: string;
    chat_history?: BaseMessage[];
}

export interface AiChainOutputObject {
    answer?: string;
    output?: string;
    context?: Document[];
}

export type AiChainOutput = string | AiChainOutputObject;

export interface AiChain {
    invoke(input: AiChainInput): Promise<AiChainOutput>;
}
