import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import {
    getSalesBaseStageOrder,
    PbxDealSalesBaseStageCode,
} from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';
import { InnFieldMap } from '@lib/portal-lib/pbx-inn/lib/inn-fields';
import { parseBitrixField } from '@lib/shared/lib/date';
// Разбор значений полей-ссылок сделка → лид — общий с холодным обзвоном.
import {
    toLinkedIds,
    toLinkedLeadId,
} from '../../cold-hook-v2/lib/deal-link-fields';
import { scalarText } from '../../event-report/services/entity/scalar-text.util';
import { toId } from '../../shared/department-heads/department-heads.util';
import { DuplicateDeal } from '../types/duplicate-report.types';

type DealRow = Record<string, unknown>;

interface StageRef {
    readonly name: string;
    readonly order: number;
}

/** UF-имена наших полей сделки; null — поле на портале не установлено. */
interface DealFieldNames {
    readonly fromLead: string | null;
    readonly joined: string | null;
    readonly inn: string | null;
}

const BASE_SELECT = [
    'ID',
    'TITLE',
    'STAGE_ID',
    'ASSIGNED_BY_ID',
    'COMPANY_ID',
    'CONTACT_ID',
    'OPPORTUNITY',
    'DATE_CREATE',
    'DATE_MODIFY',
    'LAST_ACTIVITY_TIME',
    'LAST_ACTIVITY_BY',
    'CREATED_BY_ID',
    'LEAD_ID',
];

export const SALES_BASE_MISSING =
    'Воронка «ОП Основная» (sales_base) не настроена на портале — отчёт по дублям невозможен';

/**
 * Все открытые сделки воронки «ОП Основная» — первый проход отчёта.
 *
 * НЕ `@Injectable`: инстанс Битрикса приходит параметром (CLAUDE.md —
 * иначе гонка между порталами). Читаются ВСЕ страницы: `deal.all` идёт
 * курсором по ID, а не первыми пятьюдесятью.
 */
export class DuplicateDealsReader {
    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    /**
     * Все открытые сделки воронки. Бросает доменную ошибку, если воронка
     * не настроена: подставлять литерал категории нельзя
     * (ai/rules/pbx-typing.md).
     */
    async load(): Promise<DuplicateDeal[]> {
        return this.loadWhere({});
    }

    /**
     * Открытые сделки воронки одного клиента — по компании или контакту
     * («Открытые сделки по клиенту» в «Звонках»). Тот же разбор, что у отчёта, чтобы
     * основная и «самая свежая» в карточке совпадали с отчётом.
     */
    async loadForClient(
        by: { readonly companyId: number } | { readonly contactId: number },
    ): Promise<DuplicateDeal[]> {
        return this.loadWhere(
            'companyId' in by
                ? { COMPANY_ID: String(by.companyId) }
                : { CONTACT_ID: String(by.contactId) },
        );
    }

    private async loadWhere(
        extra: Readonly<Record<string, string>>,
    ): Promise<DuplicateDeal[]> {
        const category = this.portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_base,
        );
        if (!category) throw new Error(SALES_BASE_MISSING);

        const stages = new Map<string, StageRef>(
            category.stages.map(stage => [
                String(stage.bitrixId),
                {
                    name: stage.name,
                    order: getSalesBaseStageOrder(
                        stage.code as PbxDealSalesBaseStageCode,
                    ),
                },
            ]),
        );
        const fields: DealFieldNames = {
            fromLead: this.fieldName(
                PBX_SALES_EVENT_FIELD_CODES.deal_from_lead_id,
            ),
            joined: this.fieldName(
                PBX_SALES_EVENT_FIELD_CODES.deal_joined_leads,
            ),
            inn: InnFieldMap.from(this.portal).inn('deal'),
        };
        const select = [
            ...BASE_SELECT,
            ...[fields.fromLead, fields.joined, fields.inn].filter(
                (name): name is string => !!name,
            ),
        ];

        const rows = (await this.bitrix.deal.all(
            {
                ...extra,
                CATEGORY_ID: String(category.bitrixId),
                CLOSED: 'N',
            } as unknown as Partial<IBXDeal>,
            select,
        )) as unknown as DealRow[];

        return rows
            .filter(Boolean)
            .map(row => this.toDeal(row, stages, fields));
    }

    private toDeal(
        row: DealRow,
        stages: ReadonlyMap<string, StageRef>,
        fields: DealFieldNames,
    ): DuplicateDeal {
        const stageId = scalarText(row['STAGE_ID']);
        const stage = stages.get(stageSuffix(stageId));
        const fromLead = fields.fromLead
            ? toLinkedLeadId(row[fields.fromLead])
            : null;
        return {
            id: Number(row['ID']),
            title: scalarText(row['TITLE']).trim(),
            stageName: stage?.name ?? stageId,
            stageOrder: stage?.order ?? 0,
            assignedById: toId(row['ASSIGNED_BY_ID']),
            createdById: toId(row['CREATED_BY_ID']),
            companyId: toId(row['COMPANY_ID']),
            contactId: toId(row['CONTACT_ID']),
            opportunity: Number(scalarText(row['OPPORTUNITY'])) || 0,
            createdAt: this.moment(row['DATE_CREATE']),
            modifiedAt: this.moment(row['DATE_MODIFY']),
            lastActivityAt: this.moment(row['LAST_ACTIVITY_TIME']),
            lastActivityById: toId(row['LAST_ACTIVITY_BY']),
            sourceLeadId: fromLead ?? toId(row['LEAD_ID']),
            joinedLeads: fields.joined
                ? toLinkedIds(row[fields.joined], /^L_/i).length
                : 0,
            inn: fields.inn
                ? scalarText(row[fields.inn]).replace(/\D/g, '')
                : '',
            openTasks: 0,
            ownOpenTasks: 0,
            openTaskIds: [],
            lead: null,
        };
    }

    private moment(raw: unknown): number | null {
        const parsed = parseBitrixField(raw, this.portal.getTimezone());
        return parsed ? parsed.valueOf() : null;
    }

    /** UF-имя поля сделки по коду реестра; null — не установлено. */
    private fieldName(code: string): string | null {
        const field = this.portal.getEntityFieldByCode('deal', code);
        return field ? this.portal.getFieldBitrixId(field) : null;
    }
}

/**
 * `STAGE_ID` приходит как `C7:PREPARATION`: суффикс после двоеточия и есть
 * `bitrixId` стадии в слепке портала (у дефолтной воронки префикса нет).
 */
const stageSuffix = (stageId: string): string =>
    stageId.includes(':') ? stageId.slice(stageId.indexOf(':') + 1) : stageId;
