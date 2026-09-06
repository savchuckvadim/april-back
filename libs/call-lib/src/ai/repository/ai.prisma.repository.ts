import { Injectable } from '@nestjs/common';
import { PrismaService } from '@lib/core/prisma';
import { Prisma } from 'generated/prisma';
import { AiRepository } from './ai.repository';
import { AiEntity } from '../entity/ai.entity';
import { createAiEntityFromPrisma } from '../lib/ai-entity.util';
import {
    AI_RECORD_KEYS_CHUNK_SIZE,
    AiRecordKeySelector,
    buildAiRecordKeySelectors,
    chunkArray,
    pickLatestAiEntityPerKey,
    sortAiEntitiesById,
} from '../lib/ai-record-keys.util';
import {
    AiFindByKeysOptions,
    AiRecordKeyColumn,
    AiRecordKeys,
} from '../type/ai-record-keys.type';

@Injectable()
export class AiPrismaRepository implements AiRepository {
    constructor(private readonly prisma: PrismaService) {}

    /**
     * Готовит данные для prisma: отбрасывает undefined-поля,
     * id/created_at/updated_at и конвертирует BigInt-колонки.
     */
    private toPrismaData(
        aiEntity: Partial<AiEntity>,
    ): Prisma.AiUncheckedCreateInput {
        const {
            id: _id,
            created_at: _createdAt,
            updated_at: _updatedAt,
            portal_id,
            transcription_id,
            ...rest
        } = aiEntity;
        void _id;
        void _createdAt;
        void _updatedAt;

        const data: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(rest)) {
            if (value !== undefined) data[key] = value;
        }
        if (portal_id !== undefined) {
            data.portal_id = portal_id ? BigInt(portal_id) : null;
        }
        if (transcription_id !== undefined) {
            data.transcription_id = transcription_id
                ? BigInt(transcription_id)
                : null;
        }
        return data as Prisma.AiUncheckedCreateInput;
    }

    // created_at/updated_at здесь не проставляются вручную: их централизованно
    // заполняет laravelTimestampsExtension в PrismaService (как Eloquent).

    async create(aiEntity: Partial<AiEntity>): Promise<AiEntity | null> {
        try {
            const result = await this.prisma.ai.create({
                data: this.toPrismaData(aiEntity),
            });
            return createAiEntityFromPrisma(result);
        } catch (error) {
            console.error('Error creating AI:', error);
            return null;
        }
    }

    async update(aiEntity: Partial<AiEntity>): Promise<AiEntity | null> {
        try {
            if (!aiEntity.id) return null;
            const result = await this.prisma.ai.update({
                where: { id: BigInt(aiEntity.id) },
                data: this.toPrismaData(aiEntity),
            });
            return createAiEntityFromPrisma(result);
        } catch (error) {
            console.error('Error updating AI:', error);
            return null;
        }
    }

    async findById(id: string): Promise<AiEntity | null> {
        try {
            const result = await this.prisma.ai.findUnique({
                where: { id: BigInt(id) },
            });
            if (!result) return null;
            return createAiEntityFromPrisma(result);
        } catch (error) {
            console.error('Error finding AI by id:', error);
            return null;
        }
    }

    async findMany(): Promise<AiEntity[] | null> {
        try {
            const result = await this.prisma.ai.findMany();
            if (!result) return null;
            return result.map(ai => createAiEntityFromPrisma(ai));
        } catch (error) {
            console.error('Error finding many AI records:', error);
            return null;
        }
    }

    async findByDomain(domain: string): Promise<AiEntity[] | null> {
        try {
            const result = await this.prisma.ai.findMany({
                where: { domain },
            });
            if (!result) return null;
            return result.map(ai => createAiEntityFromPrisma(ai));
        } catch (error) {
            console.error('Error finding AI by domain:', error);
            return null;
        }
    }

    async findByDomainAndUser(
        domain: string,
        userId: string,
    ): Promise<AiEntity[] | null> {
        try {
            const userIdNumber = parseInt(userId, 10);
            if (isNaN(userIdNumber)) {
                console.error('Invalid user_id format:', userId);
                return null;
            }

            const result = await this.prisma.ai.findMany({
                where: {
                    domain,
                    user_id: userIdNumber,
                },
            });
            if (!result) return null;
            return result.map(ai => createAiEntityFromPrisma(ai));
        } catch (error) {
            console.error('Error finding AI by domain and user:', error);
            return null;
        }
    }

    async findByDomainTypesInPeriod(
        domain: string,
        types: string[],
        from: Date,
        to: Date,
    ): Promise<AiEntity[]> {
        if (!types.length) return [];
        try {
            const result = await this.prisma.ai.findMany({
                where: {
                    domain,
                    type: { in: types },
                    created_at: { gte: from, lte: to },
                },
                orderBy: { created_at: 'asc' },
            });
            return result.map(ai => createAiEntityFromPrisma(ai));
        } catch (error) {
            console.error('Error finding AI by domain/types/period:', error);
            return [];
        }
    }

    async findByTranscriptionIds(
        transcriptionIds: string[],
        provider?: string,
    ): Promise<AiEntity[]> {
        if (!transcriptionIds.length) return [];
        try {
            const result = await this.prisma.ai.findMany({
                where: {
                    transcription_id: {
                        in: transcriptionIds.map(id => BigInt(id)),
                    },
                    ...(provider ? { provider } : {}),
                },
            });
            return result.map(ai => createAiEntityFromPrisma(ai));
        } catch (error) {
            console.error('Error finding AI by transcription ids:', error);
            return [];
        }
    }

    /**
     * Наборы ключей объединяются по ИЛИ, каждый — порциями по 500 значений
     * (один IN-список на запрос), без окна created_at. latestOnly оставляет
     * на каждый ключ запись с максимальным id. Результат — без дублей, по id.
     */
    async findByDomainTypeKeys(
        domain: string,
        type: string,
        keys: AiRecordKeys,
        options?: AiFindByKeysOptions,
    ): Promise<AiEntity[]> {
        const selectors = buildAiRecordKeySelectors(keys);
        if (!selectors.length) return [];
        try {
            const byId = new Map<string, AiEntity>();
            for (const selector of selectors) {
                const found = await this.findBySelector(domain, type, selector);
                const picked = options?.latestOnly
                    ? pickLatestAiEntityPerKey(found, selector.column)
                    : found;
                for (const entity of picked) byId.set(entity.id, entity);
            }
            return sortAiEntitiesById([...byId.values()]);
        } catch (error) {
            console.error('Error finding AI by domain/type/keys:', error);
            return [];
        }
    }

    /** Один набор ключей порциями по AI_RECORD_KEYS_CHUNK_SIZE значений. */
    private async findBySelector(
        domain: string,
        type: string,
        selector: AiRecordKeySelector,
    ): Promise<AiEntity[]> {
        const entities: AiEntity[] = [];
        for (const chunk of chunkArray(
            selector.values,
            AI_RECORD_KEYS_CHUNK_SIZE,
        )) {
            const rows = await this.prisma.ai.findMany({
                where: {
                    domain,
                    type,
                    ...this.keyWhere(selector.column, chunk),
                },
                orderBy: { id: 'asc' },
            });
            entities.push(...rows.map(row => createAiEntityFromPrisma(row)));
        }
        return entities;
    }

    /** Условие IN по колонке ключа с приведением к типу колонки (BigInt / Int). */
    private keyWhere(
        column: AiRecordKeyColumn,
        values: (string | number)[],
    ): Prisma.AiWhereInput {
        switch (column) {
            case 'activity_id':
                return { activity_id: { in: values.map(String) } };
            case 'transcription_id':
                return {
                    transcription_id: {
                        in: values.map(value => BigInt(value)),
                    },
                };
            case 'entity_id':
                return { entity_id: { in: values.map(Number) } };
        }
    }
}
