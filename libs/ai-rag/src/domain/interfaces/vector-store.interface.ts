import { EmbeddingsInterface } from '@langchain/core/embeddings';
import { BaseRetrieverInterface } from '@langchain/core/retrievers';

export interface VectorStoreFactory {
    getRetriever(
        embeddings: EmbeddingsInterface,
        embeddingId: string,
        domain?: string,
        kind?: string,
    ): Promise<BaseRetrieverInterface>;
}

export const VECTOR_STORE_FACTORY = Symbol('VECTOR_STORE_FACTORY');
