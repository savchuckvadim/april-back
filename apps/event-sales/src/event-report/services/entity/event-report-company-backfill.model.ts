import { IField } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';

type BackfillValue = string | number | Array<string | number>;
export type CompanyBackfillMap = Record<string, BackfillValue>;

/**
 * РУЧНЫЕ общие поля, которые менеджер мог заполнить на СДЕЛКЕ, работая без
 * компании (открытый вопрос владельца №6, todo2508): позже сделку привязали
 * к компании — и у той эти поля пусты.
 *
 * Flow-поля (xo_*, pres-даты, статусы) сюда не входят: их и так пишет
 * каждый отчёт в обе сущности.
 */
export const COMPANY_BACKFILL_CODES = [
    'op_sale_date_prognoz',
    'op_concurents',
    'op_concurents_multiple',
] as const;

/**
 * Автозаполнение ПУСТЫХ полей компании значениями с базовой сделки.
 *
 * Политика (решение по вопросу «привязали компанию со своими значениями —
 * что тогда?»): автоматом НИКОГДА не перезатираем — у компании значение
 * есть, каким бы оно ни было, оно и остаётся; сведение расхождений —
 * ручное, через «Поля сущности». Автоматика заполняет только пустоту:
 * это единственный случай, где потерять нечего.
 *
 * Enumeration копируется ЧЕРЕЗ КОДЫ items: числовые id значений у поля
 * сделки и поля компании — разные справочники, прямой перенос id записал
 * бы в компанию чужое (или несуществующее) значение. Item без пары по коду
 * честно выпадает.
 */
export class EventReportCompanyBackfillModel {
    constructor(
        private readonly portal: PortalModel,
        private readonly company: Record<string, unknown>,
        private readonly deal: Record<string, unknown>,
    ) {}

    toFields(): CompanyBackfillMap {
        const out: CompanyBackfillMap = {};
        for (const code of COMPANY_BACKFILL_CODES) {
            this.applyCode(out, code);
        }
        return out;
    }

    private applyCode(out: CompanyBackfillMap, code: string): void {
        const dealField = this.portal.getEntityFieldByCode('deal', code);
        const companyField = this.portal.getEntityFieldByCode('company', code);
        // Self-gate: поле должно быть установлено на ОБЕИХ сущностях.
        if (!dealField || !companyField) return;

        const companyRaw =
            this.company[this.portal.getFieldBitrixId(companyField)];
        if (this.hasValue(companyRaw)) return;

        const dealRaw = this.deal[this.portal.getFieldBitrixId(dealField)];
        if (!this.hasValue(dealRaw)) return;

        const value =
            dealField.type === 'enumeration'
                ? this.remapEnum(dealField, companyField, dealRaw)
                : (dealRaw as BackfillValue);
        if (value == null || (Array.isArray(value) && !value.length)) return;

        out[this.portal.getFieldBitrixId(companyField)] = value;
    }

    /** id значений сделки → id значений компании через общий item-код. */
    private remapEnum(
        dealField: IField,
        companyField: IField,
        raw: unknown,
    ): BackfillValue | null {
        const ids = Array.isArray(raw) ? raw : [raw];
        const mapped: number[] = [];
        for (const id of ids) {
            const dealItem = (dealField.items ?? []).find(
                item => String(item.bitrixId) === String(id),
            );
            if (!dealItem?.code) continue;
            const companyItem = this.portal.getFieldItemByCode(
                companyField,
                dealItem.code,
            );
            if (companyItem?.bitrixId == null) continue;
            mapped.push(Number(companyItem.bitrixId));
        }
        if (!mapped.length) return null;
        return Array.isArray(raw) ? mapped : mapped[0];
    }

    /** Пустота Битрикса: null / '' / '0' у enum / пустой массив. */
    private hasValue(raw: unknown): boolean {
        if (raw == null || raw === false) return false;
        const values = Array.isArray(raw) ? raw : [raw];
        return values.some(
            value =>
                value != null &&
                String(value).trim() !== '' &&
                String(value).trim() !== '0',
        );
    }
}
