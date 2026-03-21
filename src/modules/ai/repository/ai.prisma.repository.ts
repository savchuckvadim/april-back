import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import { AiRepository } from './ai.repository';
import { AiEntity } from '../entity/ai.entity';
import { createAiEntityFromPrisma } from '../lib/ai-entity.util';

@Injectable()
export class AiPrismaRepository implements AiRepository {
    constructor(private readonly prisma: PrismaService) {}

    async create(aiEntity: Partial<AiEntity>): Promise<AiEntity | null> {
        try {
            const data: any = {};

            if (aiEntity.provider !== undefined)
                data.provider = aiEntity.provider;
            if (aiEntity.activity_id !== undefined)
                data.activity_id = aiEntity.activity_id;
            if (aiEntity.file_id !== undefined) data.file_id = aiEntity.file_id;
            if (aiEntity.in_comment !== undefined)
                data.in_comment = aiEntity.in_comment;
            if (aiEntity.in_report !== undefined)
                data.in_report = aiEntity.in_report;
            if (aiEntity.report_item_id !== undefined)
                data.report_item_id = aiEntity.report_item_id;
            if (aiEntity.status !== undefined) data.status = aiEntity.status;
            if (aiEntity.result !== undefined) data.result = aiEntity.result;
            if (aiEntity.symbols_count !== undefined)
                data.symbols_count = aiEntity.symbols_count;
            if (aiEntity.tokens_count !== undefined)
                data.tokens_count = aiEntity.tokens_count;
            if (aiEntity.price !== undefined) data.price = aiEntity.price;
            if (aiEntity.domain !== undefined) data.domain = aiEntity.domain;
            if (aiEntity.user_id !== undefined) data.user_id = aiEntity.user_id;
            if (aiEntity.user_name !== undefined)
                data.user_name = aiEntity.user_name;
            if (aiEntity.entity_type !== undefined)
                data.entity_type = aiEntity.entity_type;
            if (aiEntity.entity_id !== undefined)
                data.entity_id = aiEntity.entity_id;
            if (aiEntity.entity_name !== undefined)
                data.entity_name = aiEntity.entity_name;
            if (aiEntity.user_result !== undefined)
                data.user_result = aiEntity.user_result;
            if (aiEntity.report_result !== undefined)
                data.report_result = aiEntity.report_result;
            if (aiEntity.user_comment !== undefined)
                data.user_comment = aiEntity.user_comment;
            if (aiEntity.owner_comment !== undefined)
                data.owner_comment = aiEntity.owner_comment;
            if (aiEntity.user_mark !== undefined)
                data.user_mark = aiEntity.user_mark;
            if (aiEntity.owner_mark !== undefined)
                data.owner_mark = aiEntity.owner_mark;
            if (aiEntity.app !== undefined) data.app = aiEntity.app;
            if (aiEntity.department !== undefined)
                data.department = aiEntity.department;
            if (aiEntity.type !== undefined) data.type = aiEntity.type;
            if (aiEntity.model !== undefined) data.model = aiEntity.model;
            if (aiEntity.portal_id !== undefined) {
                data.portal_id = aiEntity.portal_id
                    ? BigInt(aiEntity.portal_id)
                    : null;
            }
            if (aiEntity.transcription_id !== undefined) {
                data.transcription_id = aiEntity.transcription_id
                    ? BigInt(aiEntity.transcription_id)
                    : null;
            }

            const result = await this.prisma.ai.create({
                data,
            });
            return createAiEntityFromPrisma(result);
        } catch (error) {
            console.error('Error creating AI:', error);
            return null;
        }
    }

    async update(aiEntity: Partial<AiEntity>): Promise<AiEntity | null> {
        try {
            const { id, ...updateData } = aiEntity;
            const data: any = {};

            if (updateData.provider !== undefined)
                data.provider = updateData.provider;
            if (updateData.activity_id !== undefined)
                data.activity_id = updateData.activity_id;
            if (updateData.file_id !== undefined)
                data.file_id = updateData.file_id;
            if (updateData.in_comment !== undefined)
                data.in_comment = updateData.in_comment;
            if (updateData.in_report !== undefined)
                data.in_report = updateData.in_report;
            if (updateData.report_item_id !== undefined)
                data.report_item_id = updateData.report_item_id;
            if (updateData.status !== undefined)
                data.status = updateData.status;
            if (updateData.result !== undefined)
                data.result = updateData.result;
            if (updateData.symbols_count !== undefined)
                data.symbols_count = updateData.symbols_count;
            if (updateData.tokens_count !== undefined)
                data.tokens_count = updateData.tokens_count;
            if (updateData.price !== undefined) data.price = updateData.price;
            if (updateData.domain !== undefined)
                data.domain = updateData.domain;
            if (updateData.user_id !== undefined)
                data.user_id = updateData.user_id;
            if (updateData.user_name !== undefined)
                data.user_name = updateData.user_name;
            if (updateData.entity_type !== undefined)
                data.entity_type = updateData.entity_type;
            if (updateData.entity_id !== undefined)
                data.entity_id = updateData.entity_id;
            if (updateData.entity_name !== undefined)
                data.entity_name = updateData.entity_name;
            if (updateData.user_result !== undefined)
                data.user_result = updateData.user_result;
            if (updateData.report_result !== undefined)
                data.report_result = updateData.report_result;
            if (updateData.user_comment !== undefined)
                data.user_comment = updateData.user_comment;
            if (updateData.owner_comment !== undefined)
                data.owner_comment = updateData.owner_comment;
            if (updateData.user_mark !== undefined)
                data.user_mark = updateData.user_mark;
            if (updateData.owner_mark !== undefined)
                data.owner_mark = updateData.owner_mark;
            if (updateData.app !== undefined) data.app = updateData.app;
            if (updateData.department !== undefined)
                data.department = updateData.department;
            if (updateData.type !== undefined) data.type = updateData.type;
            if (updateData.model !== undefined) data.model = updateData.model;
            if (updateData.portal_id !== undefined) {
                data.portal_id = updateData.portal_id
                    ? BigInt(updateData.portal_id)
                    : null;
            }
            if (updateData.transcription_id !== undefined) {
                data.transcription_id = updateData.transcription_id
                    ? BigInt(updateData.transcription_id)
                    : null;
            }

            const result = await this.prisma.ai.update({
                where: { id: BigInt(id!) },
                data,
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
