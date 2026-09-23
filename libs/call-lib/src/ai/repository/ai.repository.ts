import { AiEntity } from '../entity/ai.entity';
import { AiFindByKeysOptions, AiRecordKeys } from '../type/ai-record-keys.type';

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
    /**
     * AI-записи домена и типа по наборам ключей (activity_id / transcription_id /
     * entity_id, объединение по ИЛИ) — без окна created_at: для backfill
     * снапшотов и сцепки звонок-сделка. Каждый набор — порциями по 500;
     * latestOnly — на каждый ключ запись с максимальным id.
     */
    /**
     * Физическое удаление записей по id — ретенция снапшотов
     * (админ-ручка `retention/run`). Возвращает число удалённых строк;
     * несуществующие id просто не попадают в счёт.
     */
    abstract deleteByIds(ids: readonly string[]): Promise<number>;
    abstract findByDomainTypeKeys(
        domain: string,
        type: string,
        keys: AiRecordKeys,
        options?: AiFindByKeysOptions,
    ): Promise<AiEntity[]>;
}
