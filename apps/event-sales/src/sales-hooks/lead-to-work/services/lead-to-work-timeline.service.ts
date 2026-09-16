import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import {
    BitrixEntityType,
    BitrixOwnerTypeId,
} from '@lib/bitrix/domain/enums/bitrix-constants.enum';
import {
    crmCardUrl,
    timelineBold,
    timelineLink,
    toTimelineComment,
} from '@lib/bitrix/consts/timeline.consts';
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
    /**
     * Переносить КОММЕНТАРИИ таймлайна лида в таймлайн сделки.
     *
     * Это отдельная от дел сущность (`crm.timeline.comment`), и
     * `crm.activity.binding.add` её не касается: в старой базе в
     * комментариях лежит самое ценное — «кому звонить», «когда вернуться»,
     * реквизиты (владелец, 15.09.2026).
     */
    copyComments?: boolean;
    /** Сколько последних комментариев переносить на лид. */
    commentsLimit?: number;
}

/** Сколько последних комментариев лида переносим, если лимит не задан. */
const DEFAULT_COMMENTS_LIMIT = 50;

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

        /*
         * СНАЧАЛА ЧИТАЕМ ВСЕХ ОДНИМ БАТЧЕМ, ПОТОМ ПИШЕМ.
         *
         * Раньше на каждый лид шли два ОТДЕЛЬНЫХ HTTP-запроса (список дел и
         * список комментариев) прямо в цикле — на пачке из двадцати лидов это
         * сорок последовательных запросов, и именно они, а не запись, были
         * потолком массового переноса (замер 15.09: с таймлайном 11 лидов/мин
         * против 17 без него). Одним батчем это два-три запроса на пачку.
         */
        const sources = await this.readSources(targets, options, warnings);

        for (const target of targets) {
            if (options.writeOriginComment && !target.reused) {
                this.queueOriginComment(target, warnings);
            }
            if (options.copyActivities) {
                this.queueActivityBindings(
                    target,
                    sources.activities.get(target.leadId) ?? [],
                    options.activitiesLimit,
                );
            }
            if (options.copyComments) {
                this.queueComments(
                    target,
                    sources.comments.get(target.leadId) ?? [],
                    options.commentsLimit ?? DEFAULT_COMMENTS_LIMIT,
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
     * Дела и комментарии ВСЕХ лидов пачки — одним batch-проводом.
     *
     * Ключи команд привязаны к лиду: одинаковый ключ batch-карта Битрикса
     * молча схлопывает, и пачка потеряла бы всё, кроме первого лида.
     */
    private async readSources(
        targets: ILeadTimelineTransfer[],
        options: ILeadTimelineOptions,
        warnings: string[],
    ): Promise<{
        activities: Map<number, BxRow[]>;
        comments: Map<number, BxRow[]>;
    }> {
        const activities = new Map<number, BxRow[]>();
        const comments = new Map<number, BxRow[]>();
        if (!options.copyActivities && !options.copyComments) {
            return { activities, comments };
        }

        for (const target of targets) {
            if (options.copyActivities) {
                this.bitrix.batch.activity.getList(
                    `lw_src_act_${target.leadId}`,
                    {
                        OWNER_TYPE_ID: BitrixOwnerTypeId.LEAD,
                        OWNER_ID: target.leadId,
                    } as never,
                    ['ID', 'CREATED'],
                );
            }
            if (options.copyComments) {
                this.bitrix.batch.timeline.getTimelineComments(
                    `lw_src_cmt_${target.leadId}`,
                    {
                        ENTITY_ID: target.leadId,
                        ENTITY_TYPE: BitrixEntityType.LEAD,
                    },
                );
            }
        }

        try {
            const responses = await this.bitrix.api.callBatchWithConcurrency(1);
            for (const chunk of responses) {
                for (const [cmd, value] of Object.entries(
                    (chunk?.result ?? {}) as Record<string, unknown>,
                )) {
                    const rows = Array.isArray(value) ? (value as BxRow[]) : [];
                    const actId = Number(cmd.replace('lw_src_act_', ''));
                    if (cmd.startsWith('lw_src_act_') && actId) {
                        activities.set(actId, rows);
                        continue;
                    }
                    const cmtId = Number(cmd.replace('lw_src_cmt_', ''));
                    if (cmd.startsWith('lw_src_cmt_') && cmtId) {
                        comments.set(cmtId, rows);
                    }
                }
            }
        } catch (error) {
            /*
             * Fail-open: таймлайн — украшение поверх уже созданной сделки,
             * ронять перенос из-за него нельзя. Но МОЛЧА терять историю
             * тоже нельзя: предупреждение уходит в результат операции и в
             * журнал прогона, чтобы такие лиды догнать вторым проходом.
             */
            warnings.push(
                `Таймлайн заявок не прочитан: ${getErrorDetails(error).message}`,
            );
        }
        return { activities, comments };
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
            const url = crmCardUrl(this.domain, 'lead', target.leadId);
            const title = target.leadTitle || `Лид ${target.leadId}`;
            this.bitrix.batch.timeline.addTimelineComment(
                `lw_tl_comment_${target.dealId}`,
                {
                    ENTITY_ID: target.dealId,
                    ENTITY_TYPE: BitrixEntityType.DEAL,
                    COMMENT: toTimelineComment([
                        `${timelineBold('Работа создана из заявки')}: ` +
                            timelineLink(
                                url,
                                `${title} (лид #${target.leadId})`,
                            ),
                    ]),
                },
            );
        } catch (error) {
            warnings.push(
                `Комментарий о заявке в сделке ${target.dealId} не поставлен: ${getErrorDetails(error).message}`,
            );
        }
    }

    /**
     * КОММЕНТАРИИ таймлайна лида → комментарии таймлайна сделки.
     *
     * Копия, а не привязка: у комментария, в отличие от дела, второй
     * привязки не бывает — `crm.timeline.comment` живёт у одной сущности.
     * В лиде оригинал остаётся нетронутым.
     *
     * ЧТО СОХРАНЯЕМ И ЧТО ТЕРЯЕМ:
     *  - автор сохраняется (`AUTHOR_ID`) — иначе вся история стала бы
     *    «от вебхука»;
     *  - дата НЕ сохраняется: новый комментарий получает текущее время,
     *    другого способа у REST нет. Поэтому первой строкой ставим шапку
     *    «перенесено из заявки, исходная дата …» — без неё лента сделки
     *    врала бы по хронологии;
     *  - закрепление не переносится (решение владельца): прочитать, что
     *    закреплено у лида, REST не позволяет.
     *
     * Порядок — от старых к новым, чтобы лента сделки читалась сверху вниз
     * так же, как читалась у лида.
     */
    private queueComments(
        target: ILeadTimelineTransfer,
        rows: BxRow[],
        limit: number,
    ): void {
        {
            const recent = rows
                .slice()
                .sort((a, b) => Number(a.ID) - Number(b.ID))
                .slice(-Math.max(1, limit));

            for (const row of recent) {
                const body = this.commentText(row);
                if (!body) continue;
                const authorId = Number(row.AUTHOR_ID) || 0;
                this.bitrix.batch.timeline.addTimelineComment(
                    `lw_tl_copy_${target.dealId}_${String(row.ID)}`,
                    {
                        ENTITY_ID: target.dealId,
                        ENTITY_TYPE: BitrixEntityType.DEAL,
                        COMMENT: toTimelineComment([
                            timelineBold(
                                `Из заявки #${target.leadId}` +
                                    (this.text(row.CREATED)
                                        ? `, ${this.text(row.CREATED)}`
                                        : ''),
                            ),
                            body,
                        ]),
                        ...(authorId ? { AUTHOR_ID: String(authorId) } : {}),
                    },
                );
            }
            if (recent.length) {
                this.logger.log(
                    `[timeline] лид ${target.leadId} → сделка ${target.dealId}: ` +
                        `комментариев к переносу ${recent.length}`,
                );
            }
        }
    }

    /** Текст комментария; пустой/нечитаемый — пропускаем. */
    private commentText(row: BxRow): string {
        const raw = this.text(row.COMMENT);
        return raw ? raw : '';
    }

    /** Строковое поле Битрикса; объекты дают пустую строку. */
    private text(raw: unknown): string {
        return typeof raw === 'string' ? raw.trim() : '';
    }

    /**
     * Дела лида → привязка к сделке. Берём последние N по дате создания:
     * у давно живущего лида дел могут быть сотни, а ценность у свежих.
     */
    private queueActivityBindings(
        target: ILeadTimelineTransfer,
        rows: BxRow[],
        limit: number,
    ): void {
        const safeLimit = Math.max(
            1,
            Math.min(limit, MAX_BINDINGS_PER_ACTIVITY),
        );
        {
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
        }
    }
}
