import { Logger } from '@nestjs/common';
import { BitrixService } from '@lib/bitrix';
import { TranscriptionPipelineView } from '@lib/call-lib';
import { CallAnalysisBitrixService } from '@lib/call-lib/call-analysis/services/call-analysis-bitrix.service';
import { resolveCallManagerId } from '@lib/call-lib/call-report/services/call-manager.util';
import { CallReportSmartInfo } from '@lib/call-lib/call-report/services/call-report-smart-resolver.service';
import { AgentCallAnalysisDto } from '../dto/agent-analysis-request.dto';
import { SmartItemWriteResult } from './agent-analysis-intake.types';
import { resolveCallDirection } from './agent-analysis-smart-input.mapper';
import {
    renderAnalysisDuplicateComment,
    renderAudioCommentTitle,
    renderDialogComments,
    renderMethodologyComments,
    renderSectionComment,
} from './agent-analysis-text-render.util';

/**
 * Записи таймлайна по итогам разбора (смарт-элемент, дубль в сущность,
 * binding записи звонка) — вынесены из intake; НЕ Injectable: bitrix аргументом.
 */
export class AgentAnalysisTimelineWriter {
    constructor(
        private readonly bitrix: BitrixService,
        private readonly logger: Logger,
    ) {}

    /**
     * Таймлайн созданного смарт-элемента: по одной записи на каждый
     * актуальный раздел разговора («как было / что не самое лучшее / как
     * можно по-другому: 1..3»), а САМОЙ ВЕРХНЕЙ записью — запись разговора
     * (аудио активности). Комменты в таймлайне сортируются новые-сверху,
     * поэтому разделы постятся в обратном порядке, аудио — последним.
     */
    async writeSmartElement(
        smartInfo: CallReportSmartInfo,
        row: TranscriptionPipelineView,
        written: SmartItemWriteResult,
        dto: AgentCallAnalysisDto,
    ): Promise<void> {
        const entityType = `DYNAMIC_${smartInfo.entityTypeId}`;
        const authorId = this.resolveAuthorId(row, written.managerId);
        const post = (comment: string): Promise<unknown> =>
            this.bitrix.timeline.addTimelineComment({
                ENTITY_ID: written.itemId,
                ENTITY_TYPE: entityType,
                COMMENT: comment,
                AUTHOR_ID: authorId,
            });
        const sections = (dto.sections ?? []).filter(
            section => section.relevance > 0,
        );

        for (const section of [...sections].reverse()) {
            const comment = renderSectionComment(section);
            // Разделы-пустышки (REFUSAL без отказов и т.п.) не постим.
            if (!comment) continue;
            await post(comment);
        }

        // «Хвост», «5К» и сверка с отчётом менеджера — ОТДЕЛЬНЫЕ записи
        // (решение владельца 15.08.2026). Постятся после разделов —
        // в ленте окажутся выше них, под диалогом и аудио.
        for (const comment of renderMethodologyComments(dto).reverse()) {
            await post(comment);
        }

        // Диалог по ролям — между разделами и аудио (частями, в обратном
        // порядке, чтобы часть 1 оказалась выше остальных).
        const dialogParts = renderDialogComments(dto.dialog);
        for (const part of [...dialogParts].reverse()) {
            await post(part);
        }

        // Оригинальная запись звонка с плеером: привязываем СУЩЕСТВУЮЩУЮ
        // активность к смарт-элементу (crm.activity.binding.add) — в
        // таймлайне элемента появляется родная запись телефонии.
        // Fallback (binding не прошёл) — коммент со ссылкой на файл.
        const bound = await this.bindCallActivity(smartInfo, row, written);
        if (!bound) {
            const audioComment = await this.buildAudioComment(row, written);
            if (audioComment) await post(audioComment);
        }
    }

    /**
     * Дубль анализа в таймлайн сделки/лида (по требованию задачи):
     * руководитель и менеджер видят разбор в привычной ленте, не открывая
     * смарт.
     *
     * Автор записи — УЖЕ СВЕДЁННЫЙ ответственный разбора (владелец звонка из
     * телефонии, у «своей» сущности — её ответственный). Перечитывать
     * сущность ради ASSIGNED_BY_ID нельзя: у сделки чужой воронки это чужой
     * сотрудник, и дубль разбора подписывался им (прод-баг 08.09.2026).
     */
    async duplicateToEntity(
        row: TranscriptionPipelineView,
        dto: AgentCallAnalysisDto,
        managerId: number | undefined,
    ): Promise<void> {
        const isLead = row.entityType === 'lead';
        await this.bitrix.timeline.addTimelineComment({
            ENTITY_ID: Number(row.entityId),
            ENTITY_TYPE: isLead ? 'lead' : 'deal',
            COMMENT: renderAnalysisDuplicateComment(row.activityId, dto),
            AUTHOR_ID: this.resolveAuthorId(row, managerId),
        });
    }

    /** Привязка активности звонка к смарт-элементу; false — не удалось. */
    private async bindCallActivity(
        smartInfo: CallReportSmartInfo,
        row: TranscriptionPipelineView,
        written: SmartItemWriteResult,
    ): Promise<boolean> {
        if (!row.activityId) return false;
        try {
            await this.bitrix.activity.addBinding(
                Number(row.activityId),
                smartInfo.entityTypeId,
                written.itemId,
            );
            return true;
        } catch (error) {
            // «Дело уже привязано» — это успех (повторный push-back):
            // запись звонка уже в таймлайне элемента, fallback не нужен.
            const raw =
                (error as Error).message +
                JSON.stringify(
                    (error as { response?: { data?: unknown } }).response
                        ?.data ?? '',
                );
            if (raw.includes('ALREADY_BOUND')) return true;
            this.logger.warn(
                `binding активности ${row.activityId} к смарту не выполнен: ${(error as Error).message}`,
            );
            return false;
        }
    }

    /**
     * Fallback: ссылка на аудио-файл разговора (когда binding активности
     * не прошёл). Название ссылки — человеческое, как у записей телефонии.
     */
    private async buildAudioComment(
        row: TranscriptionPipelineView,
        written: SmartItemWriteResult,
    ): Promise<string | null> {
        const activity = written.activity;
        if (!activity) return null;
        try {
            const bx = new CallAnalysisBitrixService(this.bitrix);
            const audio = (await bx.getAudioFiles([activity]))[0];
            if (!audio) return null;
            const title = renderAudioCommentTitle(
                resolveCallDirection(activity),
                row.callStartedAt,
                row.durationSec,
            );
            return `🎧 [b]${title}[/b]\n[url=${audio.downloadUrl}]${title}.mp3[/url]`;
        } catch (error) {
            this.logger.warn(
                `Аудио для таймлайна не получено (activity ${row.activityId}): ${(error as Error).message}`,
            );
            return null;
        }
    }

    /**
     * Автор записи таймлайна: владелец звонка из телефонии, иначе
     * ответственный сущности, иначе администратор (#1) — но с логом:
     * записи «от администратора» это сигнал, что владелец не определился.
     */
    private resolveAuthorId(
        row: TranscriptionPipelineView,
        fallbackManagerId: number | undefined,
    ): string {
        const author = resolveCallManagerId({
            callOwnerUserId: row.userId,
            entityManagerId: fallbackManagerId,
            entityIsOwn: true,
        });
        if (author) return String(author);
        this.logger.warn(
            `Автор записи таймлайна не определён (transcription ${row.id}, ` +
                `${row.domain ?? '—'}) — пишем от администратора #1`,
        );
        return '1';
    }
}
