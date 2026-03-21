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
}
