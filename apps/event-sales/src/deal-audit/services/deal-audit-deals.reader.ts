import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { PbxDealSalesBaseStageCode } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { parseBitrixField } from '@lib/shared/lib/date';
// Утилита event-report переиспользуется как есть: поля Битрикса приходят
// как unknown, и прямой String(...) на объекте дал бы «[object Object]».
import { scalarText } from '../../event-report/services/entity/scalar-text.util';
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

const toId = (raw: unknown): number | null => {
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
};

/**
 * Чтение открытых сделок воронки ОП и сборка слепков для правил.
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
     * Слепки открытых сделок основной воронки.
     *
     * Бросает доменную ошибку, если воронка не настроена на портале:
     * подставлять литерал вместо кода нельзя (ai/rules/pbx-typing.md).
     */
    async load(
        tasks: DealAuditTaskIndex,
        warnings: string[],
    ): Promise<DealAuditSnapshot[]> {
        const category = this.portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_base,
        );
        if (!category) {
            throw new Error(
                'Воронка «ОП Основная» (sales_base) не настроена на портале — аудит невозможен',
            );
        }

        const stageByBitrixId = new Map<string, StageRef>();
        for (const stage of category.stages) {
            stageByBitrixId.set(String(stage.bitrixId), {
                code: stage.code,
                name: stage.name,
                bitrixId: String(stage.bitrixId),
            });
        }

        const nextCallField = this.fieldName(
            PBX_SALES_EVENT_FIELD_CODES.call_next_date,
        );
        if (!nextCallField) {
            warnings.push(
                'поле «ОП Дата следующего звонка» не установлено — признаки по дате звонка не считаются',
            );
        }

        const select = [
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

        const rows = (await this.bitrix.deal.all(
            {
                CATEGORY_ID: String(category.bitrixId),
                CLOSED: 'N',
            } as Partial<IBXDeal>,
            select,
        )) as unknown as DealRow[];

        return rows.filter(Boolean).map(row => {
            const dealId = Number(row['ID']);
            const companyId = toId(row['COMPANY_ID']);
            const stage = this.resolveStage(row['STAGE_ID'], stageByBitrixId);
            return {
                dealId,
                title: scalarText(row['TITLE']) || `Сделка #${dealId}`,
                stageCode: stage
                    ? (stage.code as PbxDealSalesBaseStageCode)
                    : null,
                stageName: stage?.name ?? '',
                assignedById: toId(row['ASSIGNED_BY_ID']),
                companyId,
                lastActivityAt: this.moment(row['LAST_ACTIVITY_TIME']),
                stageMovedAt: this.moment(row['MOVED_TIME']),
                nextCallAt: nextCallField
                    ? this.moment(row[nextCallField])
                    : null,
                openTasks: tasks.forDeal(dealId, companyId),
                previousStatus: this.fields.names.status
                    ? this.fields.statusCodeByItemId(
                          row[this.fields.names.status],
                      )
                    : null,
            } satisfies DealAuditSnapshot;
        });
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
