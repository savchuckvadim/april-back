import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { PbxDealSalesBaseStageCode } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { parseBitrixField } from '@lib/shared/lib/date';
// Утилита event-report переиспользуется как есть: поля Битрикса приходят
// как unknown, и прямой String(...) на объекте дал бы «[object Object]».
import { scalarText } from '../../event-report/services/entity/scalar-text.util';
import {
    DEAL_AUDIT_OUTSIDE_GROUP_TITLE,
    DealAuditStaffGroup,
    staffGroupUserIds,
} from '../lib/deal-audit-staff-groups';
import { DealAuditSnapshot } from '../types/deal-audit.types';
import { DealAuditTaskIndex } from './deal-audit-tasks.reader';
import { DealAuditFields } from './deal-audit-fields';

type DealRow = Record<string, unknown>;

/** Стадия воронки в терминах слепка портала. */
interface StageRef {
    readonly code: string;
    readonly name: string;
    readonly bitrixId: string;
}

/** Больше Битрикс за один запрос списка не отдаёт. */
const BITRIX_PAGE_SIZE = 50;

/** Самые давние первыми: по ним никто давно ничего не делал. */
const MOST_IDLE_FIRST = { LAST_ACTIVITY_TIME: 'ASC' } as const;

const toId = (raw: unknown): number | null => {
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
};

const toRows = (raw: unknown): DealRow[] =>
    Array.isArray(raw) ? (raw.filter(Boolean) as DealRow[]) : [];

/** Что выбрать для аудита. */
export interface DealAuditDealsQuery {
    /** Отделы продаж — по каждому берутся самые давние сделки. */
    readonly groups: readonly DealAuditStaffGroup[];
    /** Сколько сделок на отдел (не больше страницы Битрикса). */
    readonly limitPerGroup: number;
    /** Ручной прогон по конкретным сделкам — отделы тогда не читаются. */
    readonly dealIds?: readonly number[];
}

/**
 * Чтение сделок воронки ОП для аудита и сборка слепков для правил.
 *
 * Аудит НЕ обходит всю воронку (решение владельца, 05.10.2026): по каждому
 * отделу продаж Битрикс сам отдаёт не больше 50 открытых сделок, самых
 * давних по дате последней активности. Раньше читалась вся воронка — на
 * портале в девять тысяч открытых сделок это 180 запросов подряд, а
 * теперь все отделы укладываются в одну пачку.
 *
 * НЕ `@Injectable` (инстанс Битрикса приходит параметром — CLAUDE.md).
 * Всё, что знает про формат Битрикса, заканчивается здесь: правила
 * получают уже разобранные числа и коды.
 */
export class DealAuditDealsReader {
    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
        private readonly fields: DealAuditFields,
    ) {}

    /**
     * Строки самых давних открытых сделок основной воронки.
     *
     * Бросает доменную ошибку, если воронка не настроена на портале:
     * подставлять литерал вместо кода нельзя (ai/rules/pbx-typing.md).
     */
    async loadMostIdle(
        query: DealAuditDealsQuery,
        warnings: string[],
    ): Promise<DealRow[]> {
        const category = this.requireCategory();
        const baseFilter = {
            CATEGORY_ID: String(category.bitrixId),
            CLOSED: 'N',
        };
        const select = this.select(warnings);

        if (query.dealIds?.length) {
            const response = await this.bitrix.deal.getList(
                {
                    ...baseFilter,
                    ID: [...query.dealIds],
                } as unknown as Partial<IBXDeal>,
                select,
                MOST_IDLE_FIRST,
                -1,
            );
            return toRows(response?.result);
        }

        if (!query.groups.length) {
            warnings.push(
                'структура отделов продаж пуста — сделки для аудита не выбраны',
            );
            return [];
        }

        const limit = Math.min(
            BITRIX_PAGE_SIZE,
            Math.max(1, Math.floor(query.limitPerGroup)),
        );
        const commands = this.queueGroups(query.groups, baseFilter, select);
        const results = await this.runBatch(warnings);

        const seen = new Set<number>();
        const rows: DealRow[] = [];
        for (const { key, title } of commands) {
            if (!(key in results)) {
                warnings.push(`сделки группы «${title}» не прочитаны`);
                continue;
            }
            for (const row of toRows(results[key]).slice(0, limit)) {
                const id = toId(row['ID']);
                if (id === null || seen.has(id)) continue;
                seen.add(id);
                rows.push(row);
            }
        }
        return rows;
    }

    /** Слепки для правил: строки сделок + их открытые задачи. */
    toSnapshots(
        rows: readonly DealRow[],
        tasks: DealAuditTaskIndex,
    ): DealAuditSnapshot[] {
        const stageByBitrixId = this.stages();
        const nextCallField = this.fieldName(
            PBX_SALES_EVENT_FIELD_CODES.call_next_date,
        );
        const statusField = this.fields.names.status;

        return rows.map(row => {
            const dealId = Number(row['ID']);
            const stage = this.resolveStage(row['STAGE_ID'], stageByBitrixId);
            return {
                dealId,
                title: scalarText(row['TITLE']) || `Сделка #${dealId}`,
                stageCode: stage
                    ? (stage.code as PbxDealSalesBaseStageCode)
                    : null,
                stageName: stage?.name ?? '',
                assignedById: toId(row['ASSIGNED_BY_ID']),
                companyId: toId(row['COMPANY_ID']),
                lastActivityAt: this.moment(row['LAST_ACTIVITY_TIME']),
                stageMovedAt: this.moment(row['MOVED_TIME']),
                nextCallAt: nextCallField
                    ? this.moment(row[nextCallField])
                    : null,
                openTasks: tasks.forDeal(dealId),
                previousStatus: statusField
                    ? this.fields.statusCodeByItemId(row[statusField])
                    : null,
            } satisfies DealAuditSnapshot;
        });
    }

    /**
     * Команды пачки: по одной на отдел плюс одна на сделки, чей
     * ответственный не состоит ни в одном отделе продаж (уволенные,
     * переведённые) — такие сделки и есть самые забытые, пропускать их
     * нельзя.
     */
    private queueGroups(
        groups: readonly DealAuditStaffGroup[],
        baseFilter: Record<string, string>,
        select: string[],
    ): { key: string; title: string }[] {
        const commands: { key: string; title: string }[] = [];
        groups.forEach((group, index) => {
            const key = `audit_group_${index}`;
            this.bitrix.batch.deal.getList(
                key,
                {
                    ...baseFilter,
                    ASSIGNED_BY_ID: [...group.userIds],
                } as unknown as Partial<IBXDeal>,
                select,
                MOST_IDLE_FIRST,
                -1,
            );
            commands.push({ key, title: group.title });
        });

        const outsideKey = 'audit_group_outside';
        this.bitrix.batch.deal.getList(
            outsideKey,
            {
                ...baseFilter,
                '!ASSIGNED_BY_ID': staffGroupUserIds(groups),
            } as unknown as Partial<IBXDeal>,
            select,
            MOST_IDLE_FIRST,
            -1,
        );
        commands.push({
            key: outsideKey,
            title: DEAL_AUDIT_OUTSIDE_GROUP_TITLE,
        });
        return commands;
    }

    /** Ответы пачки одной картой «ключ команды → значение». */
    private async runBatch(
        warnings: string[],
    ): Promise<Record<string, unknown>> {
        const merged: Record<string, unknown> = {};
        try {
            const responses = await this.bitrix.api.callBatchWithConcurrency(1);
            for (const response of responses) {
                Object.assign(merged, (response?.result ?? {}) as object);
            }
        } catch (error) {
            warnings.push(
                `сделки отделов не прочитаны: ${(error as Error).message}`,
            );
        }
        return merged;
    }

    private requireCategory() {
        const category = this.portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_base,
        );
        if (!category) {
            throw new Error(
                'Воронка «ОП Основная» (sales_base) не настроена на портале — аудит невозможен',
            );
        }
        return category;
    }

    private stages(): Map<string, StageRef> {
        const stageByBitrixId = new Map<string, StageRef>();
        for (const stage of this.requireCategory().stages) {
            stageByBitrixId.set(String(stage.bitrixId), {
                code: stage.code,
                name: stage.name,
                bitrixId: String(stage.bitrixId),
            });
        }
        return stageByBitrixId;
    }

    private select(warnings: string[]): string[] {
        const nextCallField = this.fieldName(
            PBX_SALES_EVENT_FIELD_CODES.call_next_date,
        );
        if (!nextCallField) {
            warnings.push(
                'поле «ОП Дата следующего звонка» не установлено — признаки по дате звонка не считаются',
            );
        }
        return [
            'ID',
            'TITLE',
            'STAGE_ID',
            'ASSIGNED_BY_ID',
            'COMPANY_ID',
            'LAST_ACTIVITY_TIME',
            'MOVED_TIME',
            ...(nextCallField ? [nextCallField] : []),
            // Прошлый статус аудита: по нему пропускаем повторную запись.
            ...(this.fields.names.status ? [this.fields.names.status] : []),
        ];
    }

    /**
     * `STAGE_ID` приходит как `C7:PREPARATION` — суффикс после двоеточия
     * и есть `bitrixId` стадии в слепке портала. У первой (дефолтной)
     * воронки префикса нет вовсе, поэтому режем только при его наличии.
     */
    private resolveStage(
        raw: unknown,
        stages: ReadonlyMap<string, StageRef>,
    ): StageRef | null {
        const value = scalarText(raw);
        if (!value) return null;
        const suffix = value.includes(':')
            ? value.slice(value.indexOf(':') + 1)
            : value;
        return stages.get(suffix) ?? null;
    }

    private moment(raw: unknown): number | null {
        const parsed = parseBitrixField(raw, this.portal.getTimezone());
        return parsed ? parsed.valueOf() : null;
    }

    private fieldName(code: string): string | null {
        const field = this.portal.getEntityFieldByCode('deal', code);
        return field ? this.portal.getFieldBitrixId(field) : null;
    }
}

export type { DealRow as DealAuditDealRow };
