import { PrismaService } from 'src/core/prisma';
import { AiEntity } from '../entity/ai.entity';

export function createAiEntityFromPrisma(
    data: NonNullable<Awaited<ReturnType<PrismaService['ai']['findUnique']>>>,
): AiEntity {
    const entity = new AiEntity();
    entity.id = data.id.toString();
    entity.provider = data.provider ?? null;
    entity.activity_id = data.activity_id ?? null;
    entity.file_id = data.file_id ?? null;
    entity.in_comment = data.in_comment;
    entity.in_report = data.in_report;
    entity.report_item_id = data.report_item_id ?? null;
    entity.status = data.status ?? null;
    entity.result = data.result ?? null;
    entity.symbols_count = data.symbols_count ?? null;
    entity.tokens_count = data.tokens_count ?? null;
    entity.price = data.price ?? null;
    entity.domain = data.domain ?? null;
    entity.user_id = data.user_id ?? null;
    entity.user_name = data.user_name ?? null;
    entity.entity_type = data.entity_type ?? null;
    entity.entity_id = data.entity_id ?? null;
    entity.entity_name = data.entity_name ?? null;
    entity.user_result = data.user_result ?? null;
    entity.report_result = data.report_result ?? null;
    entity.user_comment = data.user_comment ?? null;
    entity.owner_comment = data.owner_comment ?? null;
    entity.user_mark = data.user_mark ?? null;
    entity.owner_mark = data.owner_mark ?? null;
    entity.app = data.app ?? null;
    entity.department = data.department ?? null;
    entity.type = data.type ?? null;
    entity.model = data.model ?? null;
    entity.portal_id = data.portal_id?.toString() ?? null;
    entity.transcription_id = data.transcription_id?.toString() ?? null;
    entity.created_at = data.created_at ?? undefined;
    entity.updated_at = data.updated_at ?? undefined;
    return entity;
}
