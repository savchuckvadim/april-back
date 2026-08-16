import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import {
    BitrixEntityType,
    BitrixOwnerTypeId,
} from '@lib/bitrix/domain/enums/bitrix-constants.enum';
import { getErrorDetails } from '@/shared';

type BxRow = Record<string, unknown>;

/** Что переносим и куда — по одному лиду прогона. */
export interface ILeadTimelineTransfer {
    leadId: number;
    leadTitle: string;
    /** Сделка, созданная/доведённая этим прогоном. */
    dealId: number;
    /** Уже была наша сделка — комментарий «создана из заявки» не пишем. */
    reused: boolean;
}

/** Настройки переноса (портальные, см. PORTAL_APP_SETTINGS_SCHEMA). */
export interface ILeadTimelineOptions {
    /** Привязывать дела лида к сделке. */
    copyActivities: boolean;
    /** Сколько последних дел брать (Битрикс: ≤100 привязок на дело). */
    activitiesLimit: number;
    /** Писать в таймлайн сделки комментарий со ссылкой на заявку. */
    writeOriginComment: boolean;
}

/** Максимум привязок у одного дела — ограничение Битрикса. */
const MAX_BINDINGS_PER_ACTIVITY = 100;

/**
 * Перенос «прошлого» заявки в сделку: дела таймлайна и комментарий-ссылка.
 *
 * Зачем: менеджер работает в сделке и в лид не заходит. Задачи хук уже
 * переносит, а письма и звонки оставались только в лиде — их приходилось
 * искать руками.
 *
 * Дело НЕ переезжает, а получает ВТОРУЮ привязку (`crm.activity.binding.add`):
 * в лиде история остаётся нетронутой, в сделке появляется та же переписка.
 * Это единственный неразрушающий способ — «перенос» в Битриксе означал бы
 * потерю дела у лида.
 *
 * Всё fail-open: ни одна ошибка здесь не должна ронять преобразование —
 * сделка уже создана, а таймлайн это украшение поверх неё.
 *
 * НЕ @Injectable: создаётся с per-domain bitrix (правило CLAUDE.md).
 */
export class LeadToWorkTimelineService {
    private readonly logger = new Logger(LeadToWorkTimelineService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly domain: string,
    ) {}

    /** Возвращает предупреждения (в результат операции), не бросает. */
    async run(
        transfers: ILeadTimelineTransfer[],
        options: ILeadTimelineOptions,
    ): Promise<string[]> {
        const warnings: string[] = [];
        const targets = transfers.filter(item => item.dealId > 0);
        if (!targets.length) return warnings;

        for (const target of targets) {
            if (options.writeOriginComment && !target.reused) {
                this.queueOriginComment(target, warnings);
            }
            if (options.copyActivities) {
                await this.queueActivityBindings(
                    target,
                    options.activitiesLimit,
                    warnings,
                );
            }
        }

        try {
            await this.bitrix.api.callBatchWithConcurrency(1);
        } catch (error) {
            warnings.push(`Таймлайн сделки: ${getErrorDetails(error).message}`);
        }
        return warnings;
    }

    /**
     * Комментарий «сделка создана из заявки» со ссылкой на лид — чтобы из
     * сделки можно было дойти до первоисточника одним кликом, даже если
     * UF-связи скрыты в карточке.
     */
    private queueOriginComment(
        target: ILeadTimelineTransfer,
        warnings: string[],
    ): void {
        try {
            const url = `https://${this.domain}/crm/lead/details/${target.leadId}/`;
            const title = target.leadTitle || `Лид ${target.leadId}`;
            this.bitrix.batch.timeline.addTimelineComment(
                `lw_tl_comment_${target.dealId}`,
                {
                    ENTITY_ID: target.dealId,
                    ENTITY_TYPE: BitrixEntityType.DEAL,
                    COMMENT:
                        `[B]Работа создана из заявки[/B]: ` +
                        `[URL=${url}]${title} (лид #${target.leadId})[/URL]`,
                },
            );
        } catch (error) {
            warnings.push(
                `Комментарий о заявке в сделке ${target.dealId} не поставлен: ${getErrorDetails(error).message}`,
            );
        }
    }

    /**
     * Дела лида → привязка к сделке. Берём последние N по дате создания:
     * у давно живущего лида дел могут быть сотни, а ценность у свежих.
     */
    private async queueActivityBindings(
        target: ILeadTimelineTransfer,
        limit: number,
        warnings: string[],
    ): Promise<void> {
        const safeLimit = Math.max(
            1,
            Math.min(limit, MAX_BINDINGS_PER_ACTIVITY),
        );
        try {
            const { result } = await this.bitrix.activity.getList(
                {
                    OWNER_TYPE_ID: BitrixOwnerTypeId.LEAD,
                    OWNER_ID: target.leadId,
                },
                ['ID', 'CREATED'],
            );
            const rows = (result ?? []) as unknown as BxRow[];
            const ids = rows
                .map(row => Number(row.ID))
                .filter(id => Number.isFinite(id) && id > 0)
                .sort((a, b) => b - a)
                .slice(0, safeLimit);
            if (!ids.length) return;

            for (const activityId of ids) {
                this.bitrix.batch.activity.addBinding(
                    `lw_bind_${target.dealId}_${activityId}`,
                    activityId,
                    BitrixOwnerTypeId.DEAL,
                    target.dealId,
                );
            }
            this.logger.log(
                `[timeline] лид ${target.leadId} → сделка ${target.dealId}: ` +
                    `дел к привязке ${ids.length}`,
            );
        } catch (error) {
            warnings.push(
                `Дела лида ${target.leadId} не привязаны к сделке: ${getErrorDetails(error).message}`,
            );
        }
    }
}
