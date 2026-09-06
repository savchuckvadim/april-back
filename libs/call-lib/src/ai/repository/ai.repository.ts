import { AiEntity } from '../entity/ai.entity';

export abstract class AiRepository {
    abstract create(aiEntity: Partial<AiEntity>): Promise<AiEntity | null>;
    abstract update(aiEntity: Partial<AiEntity>): Promise<AiEntity | null>;
    abstract findById(id: string): Promise<AiEntity | null>;
    abstract findMany(): Promise<AiEntity[] | null>;
    abstract findByDomain(domain: string): Promise<AiEntity[] | null>;
    abstract findByDomainAndUser(
        domain: string,
        userId: string,
    ): Promise<AiEntity[] | null>;
    /**
     * AI-записи портала заданных типов за период (по created_at) — для
     * статистики типов звонков и калибровки классификатора.
     */
    abstract findByDomainTypesInPeriod(
        domain: string,
        types: string[],
        from: Date,
        to: Date,
    ): Promise<AiEntity[]>;
    /** AI-записи по списку транскрипций (опционально — только один провайдер). */
    abstract findByTranscriptionIds(
        transcriptionIds: string[],
        provider?: string,
    ): Promise<AiEntity[]>;
}
