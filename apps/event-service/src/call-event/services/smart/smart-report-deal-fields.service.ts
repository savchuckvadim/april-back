import dayjs from 'dayjs';
import { IBXDeal } from '@/modules/bitrix';
import { IBXProductRowRow } from '@/modules/bitrix/domain/crm/product-row/interface/bx-product-row.interface';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { IPSmart } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { PbxServiceMonthFieldCode } from '@lib/portal-lib/pbx';
import { CRM_DATETIME_SHORT_FORMAT } from './utils/date.util';

type SmartFieldValue = string | number | string[];

/** Коды полей смарта, значения которых надо переформатировать в дату. */
const DATE_FIELD_CODES: readonly PbxServiceMonthFieldCode[] = [
    PbxServiceMonthFieldCode.date_last_call,
    PbxServiceMonthFieldCode.date_next_call,
    PbxServiceMonthFieldCode.date_last_edu,
    PbxServiceMonthFieldCode.date_next_edu,
    PbxServiceMonthFieldCode.supply_date,
    PbxServiceMonthFieldCode.contract_start,
    PbxServiceMonthFieldCode.contract_end,
];

/**
 * Аналог legacy `job_in_deal`: собирает поля смарта из базовой сервисной сделки
 * (`service_base`) и её товаров. Чистый класс без обращений к Bitrix — данные
 * приходят из init-контекста.
 */
export class SmartReportDealFieldsService {
    constructor(private readonly portal: PortalModel) {}

    build(
        smart: IPSmart,
        deal: IBXDeal | null,
        productRows: IBXProductRowRow[],
    ): Record<string, SmartFieldValue> {
        if (!deal) {
            return {};
        }
        const out: Record<string, SmartFieldValue> = {};
        const record = deal as unknown as Record<string, unknown>;

        this.setFromDeal(
            out,
            smart,
            PbxServiceMonthFieldCode.date_last_call,
            record.UF_CRM_CALL_LAST_DATE,
        );
        this.setFromDeal(
            out,
            smart,
            PbxServiceMonthFieldCode.date_next_call,
            record.UF_CRM_CALL_NEXT_DATE,
        );
        this.setFromDeal(
            out,
            smart,
            PbxServiceMonthFieldCode.date_last_edu,
            record.UF_CRM_ORK_LAST_EDU_DATE,
        );
        this.setFromDeal(
            out,
            smart,
            PbxServiceMonthFieldCode.date_next_edu,
            record.UF_CRM_ORK_NEXT_EDU_DATE,
        );
        this.setFromDeal(
            out,
            smart,
            PbxServiceMonthFieldCode.supply_date,
            record.UF_CRM_SUPPLY_DATE,
        );
        this.setFromDeal(
            out,
            smart,
            PbxServiceMonthFieldCode.contract_start,
            record.UF_CRM_CONTRACT_START,
        );
        this.setFromDeal(
            out,
            smart,
            PbxServiceMonthFieldCode.contract_end,
            record.UF_CRM_CONTRACT_END,
        );

        // Конкурент: id → имя элемента справочника сделки
        const concurentRaw = record.UF_CRM_OP_CONCURENTS;
        const concurentId = Number(concurentRaw);
        if (concurentRaw && Number.isFinite(concurentId)) {
            const item = this.portal.getDealFieldItemByBitrixID(concurentId);
            this.set(
                out,
                smart,
                PbxServiceMonthFieldCode.concurent,
                item?.name ?? '',
            );
        }

        // Название комплекта: имена товаров сделки
        const productNames = productRows
            .map(row => row.productName)
            .filter((name): name is string => Boolean(name));
        this.set(
            out,
            smart,
            PbxServiceMonthFieldCode.complect_name,
            productNames,
        );

        return out;
    }

    private setFromDeal(
        out: Record<string, SmartFieldValue>,
        smart: IPSmart,
        code: PbxServiceMonthFieldCode,
        rawValue: unknown,
    ): void {
        if (rawValue === undefined || rawValue === null || rawValue === '') {
            return;
        }
        const value =
            DATE_FIELD_CODES.includes(code) && typeof rawValue === 'string'
                ? this.formatDate(rawValue)
                : (rawValue as SmartFieldValue);
        this.set(out, smart, code, value);
    }

    private set(
        out: Record<string, SmartFieldValue>,
        smart: IPSmart,
        code: PbxServiceMonthFieldCode,
        value: SmartFieldValue,
    ): void {
        const field = this.portal.getSmartFieldByCode(smart, code);
        if (!field?.bitrixId) return;
        out[field.bitrixId] = value;
    }

    private formatDate(iso: string): string {
        const d = dayjs(iso);
        return d.isValid() ? d.format(CRM_DATETIME_SHORT_FORMAT) : iso;
    }
}
