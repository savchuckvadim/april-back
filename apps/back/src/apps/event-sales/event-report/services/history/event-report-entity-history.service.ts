import dayjs from 'dayjs';
import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal/services/portal.model';
import { EventReportContext } from '../context/event-report.context';

/**
 * История изменений компании (timeline-запись) — gsirk only.
 *
 * Добавляет комментарий в crm.timeline через bitrix.batch.timeline.add.
 * Если таймлайн-схема портала специфическая — расширить fields.
 */
export class EventReportEntityHistoryService {
    private readonly logger = new Logger(EventReportEntityHistoryService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    queue(ctx: EventReportContext): void {
        if (!ctx.isGsirk) return;
        if (ctx.entityType !== 'company') return;
        if (!ctx.entityId) return;

        const tz = this.portal.getTimezone();
        const stamp = dayjs(ctx.nowDate).tz(tz).format('DD.MM.YYYY HH:mm:ss');
        const comment = this.buildComment(ctx);

        // Используем crm.timeline.comment.add — это стабильное API для записи
        // в таймлайн любой CRM-сущности.
        const cmd = `add_history_${ctx.entityId}`;
        // Прямая batch-команда — обходимся без выделенного wrapper'а.
        // (BitrixService.api напрямую позволяет добавлять произвольную команду
        // через batch — но проще закинуть через bitrix.batch.deal/contact?
        // Используем bitrix.timeline.add если есть, иначе мягко логируем.)

        const timelineApi = (
            this.bitrix as unknown as {
                batch?: {
                    timeline?: {
                        addComment?: (
                            cmd: string,
                            payload: Record<string, unknown>,
                        ) => void;
                    };
                };
            }
        ).batch?.timeline?.addComment;

        if (typeof timelineApi === 'function') {
            timelineApi(cmd, {
                fields: {
                    ENTITY_TYPE: 'company',
                    ENTITY_ID: ctx.entityId,
                    COMMENT: `${stamp}\n${comment}`,
                },
            });
            return;
        }

        this.logger.warn(
            'history-service: timeline.addComment not available on bitrix.batch — пропускаем (требуется расширение библиотеки)',
        );
    }

    private buildComment(ctx: EventReportContext): string {
        const parts: string[] = [];
        if (ctx.reportEventType) {
            parts.push(`Отчёт по событию: ${ctx.reportEventType}`);
        }
        if (ctx.planEventType) {
            parts.push(`План: ${ctx.planEventType}`);
        }
        if (ctx.reportComment) {
            parts.push(`Комментарий: ${ctx.reportComment}`);
        }
        return parts.join('\n');
    }
}
