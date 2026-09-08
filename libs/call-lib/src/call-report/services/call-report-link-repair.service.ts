import { Logger } from '@nestjs/common';
import { BitrixService, BitrixOwnerTypeId } from '@lib/bitrix';
import { IBXItem } from '@lib/bitrix/domain/crm/item/interface/item.interface';
import { callReportSmartUfName } from '../config/call-report-smart.config';
import { CallReportSmartInfo } from './call-report-smart-resolver.service';

/** Связи и ответственный, какими они должны стать у элемента разбора. */
export interface CallReportLinkDesired {
    /** Сделка воронки «ОП Основная» — она же родитель элемента. */
    mainDealId?: number;
    presentationDealId?: number;
    xoDealId?: number;
    /** Лид-владелец звонка (нативная связь parentId1). */
    leadId?: number;
    companyId?: number;
    contactId?: number;
    /** Ответственный элемента (он же поле «Менеджер»). */
    managerId?: number;
}

/** Что менять у существующего элемента и почему. */
export interface CallReportLinkRepairPlan {
    itemId: number;
    /** ТОЛЬКО изменившиеся значения — подмножество desired. */
    changes: CallReportLinkDesired;
    /** Строки «поле: было → стало» для лога. */
    reasons: string[];
}

/** Ключ desired → поля элемента, которые из него пишет writer, и подпись. */
const LINK_FIELD_MAP: {
    key: keyof CallReportLinkDesired;
    /** Коды UF-полей смарта (резолвятся в ufCrm{typeId}…). */
    ufCodes: string[];
    /** Системные поля элемента (нативные связи, ответственный). */
    systemKeys: string[];
    label: string;
}[] = [
    {
        key: 'mainDealId',
        ufCodes: ['DEAL_MAIN'],
        systemKeys: [`parentId${BitrixOwnerTypeId.DEAL}`],
        label: 'основная сделка «ОП Основная» (она же родитель элемента)',
    },
    {
        key: 'presentationDealId',
        ufCodes: ['DEAL_PRESENTATION'],
        systemKeys: [],
        label: 'сделка «ОП Презентации»',
    },
    {
        key: 'xoDealId',
        ufCodes: ['DEAL_XO'],
        systemKeys: [],
        label: 'сделка «ОП ХО»',
    },
    {
        key: 'leadId',
        ufCodes: [],
        systemKeys: [`parentId${BitrixOwnerTypeId.LEAD}`],
        label: 'лид-владелец звонка',
    },
    {
        key: 'companyId',
        ufCodes: [],
        systemKeys: ['companyId'],
        label: 'компания клиента',
    },
    {
        key: 'contactId',
        ufCodes: [],
        systemKeys: ['contactId'],
        label: 'контакт клиента',
    },
    {
        key: 'managerId',
        ufCodes: ['MANAGER'],
        systemKeys: ['assignedById'],
        label: 'ответственный (владелец звонка из телефонии)',
    },
];

/**
 * ПЕРЕСЧЁТ связей и ответственного у УЖЕ СОЗДАННЫХ элементов разбора.
 *
 * ЗАЧЕМ (решение владельца 08.09.2026): карточки, созданные до починки
 * раскладки, держат чужую сделку и чужого ответственного. Отдельной ручки
 * пересчёта нет — чинит ночной ревизор, который и так ходит по звонкам за
 * окно. Здесь он получает ответ на два вопроса: что стоит у элемента
 * СЕЙЧАС и что из желаемого реально изменилось.
 *
 * Обновлять «на всякий случай» нельзя: лишний update пишет в историю
 * элемента и перетирает правки руками. Поэтому шлётся только разница, а в
 * лог уходит «поле: было → стало».
 *
 * НЕ Injectable: создаётся под конкретный домен (`new …(bitrix, info)`) —
 * правило CLAUDE.md про this.bitrix в @Injectable.
 */
export class CallReportLinkRepairService {
    private readonly logger = new Logger(CallReportLinkRepairService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly smartInfo: CallReportSmartInfo,
    ) {}

    /**
     * План правки элемента звонка: null — элемента у активности нет
     * (ревизор такие пропускает: создавать карточку-пустышку запрещено).
     * Пустой `changes` — всё уже актуально, обновлять нечего.
     */
    async plan(
        activityId: string,
        desired: CallReportLinkDesired,
    ): Promise<CallReportLinkRepairPlan | null> {
        const item = await this.loadItem(activityId);
        if (!item) return null;
        const itemId = Number(item['id']);
        const changes: CallReportLinkDesired = {};
        const reasons: string[] = [];

        for (const field of LINK_FIELD_MAP) {
            const value = desired[field.key];
            if (!value) continue;
            const stale = this.fieldKeys(field).filter(
                key =>
                    CallReportLinkRepairService.idOf(item[key]) !==
                    String(value),
            );
            if (!stale.length) continue;
            changes[field.key] = value;
            const was = stale
                .map(key => {
                    const current = CallReportLinkRepairService.idOf(item[key]);
                    return `${key}=${current || '—'}`;
                })
                .join(', ');
            reasons.push(`${field.label}: было ${was} → стало ${value}`);
        }

        if (reasons.length) {
            this.logger.log(
                `Пересчёт связей элемента #${itemId} (activity ${activityId}): ` +
                    reasons.join('; '),
            );
        } else {
            this.logger.log(
                `Элемент #${itemId} (activity ${activityId}): связи и ` +
                    'ответственный актуальны — поля не трогаем',
            );
        }
        return { itemId, changes, reasons };
    }

    /** Все поля элемента, которые пишутся из одного ключа desired. */
    private fieldKeys(field: (typeof LINK_FIELD_MAP)[number]): string[] {
        return [
            ...field.systemKeys,
            ...field.ufCodes.map(code =>
                callReportSmartUfName(this.smartInfo, code),
            ),
        ];
    }

    /**
     * Текущие значения связей элемента по xmlId (`aicall_{activityId}`).
     * Fail-open: ошибка чтения → null, ревизия идёт дальше без правки.
     */
    private async loadItem(
        activityId: string,
    ): Promise<Record<string, unknown> | null> {
        const select = [
            'id',
            'xmlId',
            ...LINK_FIELD_MAP.flatMap(field => this.fieldKeys(field)),
        ];
        try {
            const response = (await this.bitrix.item.list(
                String(this.smartInfo.entityTypeId),
                { xmlId: `aicall_${activityId}` } as Partial<IBXItem>,
                select,
            )) as { result?: { items?: Record<string, unknown>[] } };
            const item = response?.result?.items?.[0];
            return item && Number(item['id']) > 0 ? item : null;
        } catch (error) {
            this.logger.warn(
                `Связи элемента (activity ${activityId}) не прочитаны: ` +
                    `${(error as Error).message} — пересчёт пропущен`,
            );
            return null;
        }
    }

    /**
     * id из значения Битрикса: число/строка, массив (множественное
     * crm-поле) и ссылка с префиксом `D_555`. Пусто — поле не заполнено.
     */
    private static idOf(value: unknown): string {
        const raw: unknown = Array.isArray(value) ? value[0] : value;
        if (typeof raw !== 'string' && typeof raw !== 'number') return '';
        const match = /^(?:[A-Z]+_)?(\d+)$/i.exec(String(raw).trim());
        return match && Number(match[1]) > 0 ? match[1] : '';
    }
}
