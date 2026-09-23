import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
    AGENT_ANALYSIS_TYPE,
    AiEntityDto,
    AiService,
    CALL_RESUME_TYPE,
} from '@lib/call-lib';
import { PbxAicallSmartService } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { TelegramService } from '@lib/telegram';
import {
    AI_REVIEW_AUTHOR_ROLE_LABELS,
    AI_REVIEW_FEEDBACK_OBJECT_PREFIX,
    AI_REVIEW_ISSUE_LABELS,
    AI_REVIEW_MESSAGES,
    AI_REVIEW_SOURCE,
    AI_REVIEW_VERDICT_LABELS,
} from '../constants/ai-review.const';
import { AiReviewRequestDto, AiReviewResultDto } from '../dto/ai-review.dto';
import { AiAnalyticsFeedbackStore } from '../store/ai-analytics-feedback.store';
import { parseSmartItemLink, SmartItemLinkParts } from './review-link.util';

/** Запись разбора, найденная по элементу смарта: звонок и менеджер. */
interface ReviewAnalysisRef {
    transcriptionId: string | null;
    managerId: string | null;
}

/**
 * Приём отзыва руководителя на разбор звонка с сайта продукта.
 *
 * Идентификация — только ссылка на карточку разбора: из неё берутся домен,
 * entityTypeId смарта и id элемента. Смарт сверяется с установленным на
 * портале (`PbxAicallSmartService.resolveInfo`), запись разбора ищется в
 * ais по `report_item_id` (глубокий разбор, затем первичный). Отзыв
 * ложится записью обратной связи (kind useful / disagree, object
 * `site-review:{itemId}`, детали в payload) и уходит в чат админов;
 * сбой чата отзыв не отменяет.
 */
@Injectable()
export class AiAnalyticsReviewUseCase {
    private readonly logger = new Logger(AiAnalyticsReviewUseCase.name);

    constructor(
        private readonly aicallSmart: PbxAicallSmartService,
        private readonly aiService: AiService,
        private readonly feedback: AiAnalyticsFeedbackStore,
        private readonly telegram: TelegramService,
    ) {}

    async execute(dto: AiReviewRequestDto): Promise<AiReviewResultDto> {
        const parts = parseSmartItemLink(dto.link);
        if (!parts) throw new BadRequestException(AI_REVIEW_MESSAGES.badLink);
        await this.assertPortalSmart(parts);

        const analysis = await this.findAnalysis(parts);
        const comment = dto.comment?.trim() ?? '';
        const id = await this.feedback.add({
            domain: parts.domain,
            kind: dto.verdict === 'agree' ? 'useful' : 'disagree',
            object: `${AI_REVIEW_FEEDBACK_OBJECT_PREFIX}:${parts.itemId}`,
            managerId: analysis.managerId,
            transcriptionId: analysis.transcriptionId,
            requesterUserId: null,
            reason: comment || null,
            payload: {
                source: AI_REVIEW_SOURCE,
                link: dto.link.trim(),
                entityTypeId: parts.entityTypeId,
                itemId: parts.itemId,
                authorName: dto.authorName.trim(),
                authorRole: dto.authorRole,
                verdict: dto.verdict,
                issues: dto.issues,
                comment,
                contact: dto.contact?.trim() ?? '',
                analysisFound: analysis.transcriptionId !== null,
            },
        });

        const result: AiReviewResultDto = {
            id,
            domain: parts.domain,
            itemId: parts.itemId,
            transcriptionId: analysis.transcriptionId,
            managerId: analysis.managerId,
            analysisFound: analysis.transcriptionId !== null,
        };
        await this.notify(dto, result);
        return result;
    }

    /** Смарт из ссылки должен быть смартом «AI-анализ звонков» этого портала. */
    private async assertPortalSmart(parts: SmartItemLinkParts): Promise<void> {
        const info = await this.aicallSmart.resolveInfo(parts.domain);
        if (!info) {
            throw new BadRequestException(
                AI_REVIEW_MESSAGES.smartNotFound(parts.domain),
            );
        }
        if (Number(info.entityTypeId) !== parts.entityTypeId) {
            throw new BadRequestException(AI_REVIEW_MESSAGES.wrongSmart);
        }
    }

    /** Запись разбора по элементу: глубокий разбор, иначе первичный; ошибка — не найдено. */
    private async findAnalysis(
        parts: SmartItemLinkParts,
    ): Promise<ReviewAnalysisRef> {
        const empty: ReviewAnalysisRef = {
            transcriptionId: null,
            managerId: null,
        };
        try {
            for (const type of [AGENT_ANALYSIS_TYPE, CALL_RESUME_TYPE]) {
                const rows = await this.aiService.findByDomainTypeKeys(
                    parts.domain,
                    type,
                    { reportItemIds: [String(parts.itemId)] },
                    { latestOnly: true },
                );
                const row = rows[rows.length - 1];
                if (row) return toAnalysisRef(row);
            }
        } catch (error) {
            this.logger.warn(
                `Отзыв ${parts.domain}#${parts.itemId}: запись разбора не прочитана — ${(error as Error).message}`,
            );
        }
        return empty;
    }

    /** Сообщение в чат админов; сбой канала только в лог. */
    private async notify(
        dto: AiReviewRequestDto,
        result: AiReviewResultDto,
    ): Promise<void> {
        const issues = dto.issues.map(code => AI_REVIEW_ISSUE_LABELS[code]);
        const lines = [
            `Отзыв руководителя с сайта (${result.domain}): ${AI_REVIEW_VERDICT_LABELS[dto.verdict]}`,
            `Автор: ${dto.authorName.trim()} (${AI_REVIEW_AUTHOR_ROLE_LABELS[dto.authorRole]})`,
            `Разбор: ${dto.link.trim()}`,
            `Что не так: ${issues.length ? issues.join(', ') : 'по пунктам замечаний нет'}`,
            `Комментарий: ${dto.comment?.trim() || '—'}`,
            `Контакт: ${dto.contact?.trim() || 'не указан'}`,
            result.analysisFound
                ? `Транскрипция ${result.transcriptionId}, менеджер ${result.managerId ?? '—'}; запись feedback #${result.id}`
                : `Запись разбора по элементу в базе не найдена; запись feedback #${result.id}`,
        ];
        try {
            await this.telegram.sendMessage(lines.join('\n'));
        } catch (error) {
            this.logger.warn(
                `Отзыв ${result.domain}#${result.itemId}: сообщение в чат не ушло — ${(error as Error).message}`,
            );
        }
    }
}

function toAnalysisRef(row: AiEntityDto): ReviewAnalysisRef {
    return {
        transcriptionId: row.transcription_id
            ? String(row.transcription_id)
            : null,
        managerId: row.user_id > 0 ? String(row.user_id) : null,
    };
}
