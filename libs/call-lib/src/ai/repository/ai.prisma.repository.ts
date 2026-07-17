import { Injectable } from '@nestjs/common';
import { PrismaService } from '@lib/core/prisma';
import { Prisma } from 'generated/prisma';
import { AiRepository } from './ai.repository';
import { AiEntity } from '../entity/ai.entity';
import { createAiEntityFromPrisma } from '../lib/ai-entity.util';

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
}
