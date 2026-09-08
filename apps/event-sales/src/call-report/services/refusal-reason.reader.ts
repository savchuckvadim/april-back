import { Logger } from '@nestjs/common';
import { BitrixService } from '@lib/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { IField } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import {
    PBX_DEAL_SALES_BASE_STAGE_CODE,
    PbxDealSalesBaseStageCode,
} from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import { EnumSalesKpiFieldCode } from '@lib/portal-lib/pbx/pbx-sales-kpi-list/type/pbx-sales-kpi-list.enum';
import { SalesListReaderService } from '@lib/portal-lib/pbx/pbx-sales-list-reader';
import {
    isMeaningfulRefusalReason,
    ManagerRefusalReason,
    NO_MANAGER_REFUSAL_REASON,
} from './refusal-reason.util';

/**
 * ФИНАЛЫ ОТКАЗА воронки «ОП Основная»: только на них имеет смысл требовать
 * причину. «Успех» и открытые стадии причиной отказа не сопровождаются.
 * Тип по лестнице стадий — забытый финал станет ошибкой компиляции, а не
 * тихой дырой (ai/rules/pbx-typing.md: никаких строк-литералов).
 */
const REFUSAL_FINAL_STAGES: Readonly<
    Partial<Record<PbxDealSalesBaseStageCode, string>>
> = {
    [PBX_DEAL_SALES_BASE_STAGE_CODE.fail]: 'Отказ',
    [PBX_DEAL_SALES_BASE_STAGE_CODE.apology]: 'Не состоялась',
    [PBX_DEAL_SALES_BASE_STAGE_CODE.notCa]: 'Не ЦА',
};

/**
 * Коды как строки: сравнение идёт со значениями из слепка портала
 * (там это обычные строки), enum здесь — только источник правды кода.
 */
const BASE_CATEGORY_CODE: string = PbxDealCategoryCodeEnum.sales_base;
const LIST_FAIL_REASON_CODE: string = EnumSalesKpiFieldCode.op_fail_reason;

/** Окно поиска записей отчётности вокруг даты звонка, дней. */
const LIST_WINDOW_DAYS = 3;
/** Записей списков на звонок хватает нескольких — причина одна. */
const LIST_RECORDS_LIMIT = 5;

/** Сделка «ОП Основная» глазами сверки причин отказа. */
export interface RefusalDealState {
    /** Строка сделки из crm.deal.get. */
    row: Record<string, unknown>;
    /** pbx-код стадии; null — стадия не резолвится в лестницу основной воронки. */
    stageCode: string | null;
    /** Человеческое имя финала отказа; null — сделка отказом не закрыта. */
    refusalStageTitle: string | null;
}

/**
 * ЧИТАТЕЛЬ ПРИЧИНЫ ОТКАЗА из карточек и списков отчётности.
 *
 * Владелец (08.09.2026): «причина отказа фиксируется и в карточках в полях,
 * и в списках». Поэтому источников два — поле «ОП Причина Отказа»
 * (`op_efield_fail_reason`) на сделке воронки «ОП Основная» плюс её
 * комментарии отказа (`op_fail_comments`), и поле причины отказа в записях
 * «ОП KPI» / «ОП История» (`op_fail_reason`). Комментарий ленты сюда не
 * входит вовсе: «08.09 отказ» — признак того, что поля НЕ заполнены.
 *
 * НЕ @Injectable: создаётся `new` рядом с BitrixService и PortalModel
 * (правило CLAUDE.md про race condition инстансов битрикса).
 */
export class RefusalReasonReader {
    private readonly logger = new Logger(RefusalReasonReader.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    /** Сделка и её финал. null — прочитать не удалось (fail-open у вызова). */
    async readDeal(dealId: number): Promise<RefusalDealState | null> {
        const response = (await this.bitrix.api.call('crm.deal.get', {
            id: dealId,
        })) as { result?: Record<string, unknown> };
        const row = response?.result;
        if (!row) return null;
        const stageCode = this.resolveBaseStageCode(row);
        return {
            row,
            stageCode,
            refusalStageTitle: stageCode
                ? (REFUSAL_FINAL_STAGES[
                      stageCode as PbxDealSalesBaseStageCode
                  ] ?? null)
                : null,
        };
    }

    /**
     * Причина отказа в ПОЛЯХ сделки: сначала справочник «ОП Причина Отказа»
     * (заполненный элемент — уже зафиксированная причина), затем
     * комментарии отказа (их проверяем на содержательность).
     */
    fromDeal(row: Record<string, unknown>): ManagerRefusalReason {
        const reasonField = this.dealField(
            PBX_SALES_EVENT_FIELD_CODES.op_efield_fail_reason,
        );
        const commentField = this.dealField(
            PBX_SALES_EVENT_FIELD_CODES.op_fail_comments,
        );
        if (!reasonField && !commentField) return NO_MANAGER_REFUSAL_REASON;

        const reason = this.readFieldText(reasonField, row);
        if (reason) {
            return {
                text: reason,
                recorded: true,
                source: 'deal_field',
                fieldsConfigured: true,
            };
        }
        const comment = this.readFieldText(commentField, row);
        return {
            text: comment,
            recorded: isMeaningfulRefusalReason(comment),
            source: comment ? 'deal_comment' : null,
            fieldsConfigured: true,
        };
    }

    /**
     * Причина отказа в записях «ОП KPI» / «ОП История», привязанных к сделке
     * CRM-полем, в окне вокруг даты звонка. Fail-open: списки недоступны —
     * пустой результат, а не падение сверки.
     */
    async fromLists(
        dealId: number,
        callStartedAt: Date | null,
    ): Promise<ManagerRefusalReason> {
        try {
            const reader = new SalesListReaderService(this.bitrix, this.portal);
            const dayMs = 24 * 60 * 60_000;
            const window = callStartedAt
                ? {
                      dateFrom: new Date(
                          callStartedAt.getTime() - LIST_WINDOW_DAYS * dayMs,
                      ),
                      dateTo: new Date(
                          callStartedAt.getTime() + LIST_WINDOW_DAYS * dayMs,
                      ),
                  }
                : {};
            const records = await reader.readBoth({
                crmRefs: [`D_${dealId}`],
                ...window,
                limit: LIST_RECORDS_LIMIT,
            });
            for (const record of records) {
                const field = record.fields.find(item =>
                    this.isFailReasonCode(item.code),
                );
                if (field?.value?.trim()) {
                    return {
                        text: field.value.trim(),
                        recorded: true,
                        source: 'list_record',
                        fieldsConfigured: true,
                    };
                }
            }
            return NO_MANAGER_REFUSAL_REASON;
        } catch (error) {
            this.logger.warn(
                `Записи отчётности для сверки причины отказа (сделка ${dealId}) не прочитаны: ${(error as Error).message}`,
            );
            return NO_MANAGER_REFUSAL_REASON;
        }
    }

    /** Короткий код поля списка «ОП Причина Отказа» (терпим к префиксу). */
    private isFailReasonCode(code: string): boolean {
        return (
            code === LIST_FAIL_REASON_CODE ||
            code.endsWith(`_${LIST_FAIL_REASON_CODE}`)
        );
    }

    /** Скаляр из строки Битрикса текстом; объекты и пустое → null. */
    private scalarText(value: unknown): string | null {
        if (typeof value === 'string') return value.trim() || null;
        if (typeof value === 'number') return String(value);
        return null;
    }

    /** Поле сделки по pbx-коду; undefined — не заведено на портале. */
    private dealField(code: string): IField | undefined {
        try {
            return this.portal.getEntityFieldByCode('deal', code);
        } catch {
            return undefined;
        }
    }

    /**
     * Значение поля текстом: у справочника — ИМЯ элемента (в строке сделки
     * лежит его bitrixId), у остальных — склейка скаляров. Пусто → null.
     */
    private readFieldText(
        field: IField | undefined,
        row: Record<string, unknown>,
    ): string | null {
        if (!field) return null;
        const raw = row[this.portal.getFieldBitrixId(field)];
        const values = (Array.isArray(raw) ? raw : [raw])
            .filter(value => value !== null && value !== undefined)
            .map(value => String(value as string | number).trim())
            .filter(Boolean);
        if (!values.length) return null;
        const texts = field.items?.length
            ? values.map(value => {
                  const item = field.items.find(
                      entry => String(entry.bitrixId) === value,
                  );
                  return item?.name || item?.title || value;
              })
            : values;
        const joined = texts.join('; ').trim();
        return joined || null;
    }

    /**
     * pbx-код стадии сделки в лестнице воронки «ОП Основная». Сделка чужой
     * воронки сюда не попадает (раскладка связей отдаёт только sales_base),
     * но проверку оставляем: слепок портала бывает неполным.
     */
    private resolveBaseStageCode(row: Record<string, unknown>): string | null {
        try {
            const categoryId = this.scalarText(row.CATEGORY_ID) ?? '0';
            const category = this.portal
                .getDealCategories()
                .find(item => String(item.bitrixId) === categoryId);
            if (!category || category.code !== BASE_CATEGORY_CODE) {
                return null;
            }
            const stageId = this.scalarText(row.STAGE_ID);
            if (!stageId) return null;
            // В pbx STAGE_ID хранится полностью (C5:PREPARATION); на случай
            // хранения без префикса воронки сверяем и по суффиксу.
            const suffix = stageId.split(':').pop();
            return (
                category.stages.find(
                    stage =>
                        stage.bitrixId === stageId || stage.bitrixId === suffix,
                )?.code ?? null
            );
        } catch {
            return null;
        }
    }
}
