import { bxFieldId, bxFieldText } from '@lib/shared/lib/utils';
import { parseUserIds } from '@lib/portal-lib/store/app-settings/lib/parse-user-ids';
import {
    ILeadClientBitrix,
    LeadClientKind,
    resultOf,
    Row,
} from './lead-client.types';

/** Организационно-правовая форма отдельным словом. */
const ORG_FORM =
    /(^|[\s«"'(])(ООО|ОАО|ЗАО|ПАО|АО|ИП|НАО|ГБУ|ГБОУ|ГАУ|ГКУ|МБУ|МКУ|МАУ|МБОУ|МАОУ|МБДОУ|МАДОУ|БДОУ|ФГБУ|ФГБОУ|ФГУП|ГУП|МУП|ТСЖ|СНТ|АНО|НКО|КФХ)([\s»"')]|$)/i;

/** Слова, которых не бывает в ФИО. */
const ORG_WORDS =
    /общество|учреждени|предприяти|компани|фирм|коллеги[яи]|адвокатск|бюро|кооператив|товарищество|фонд|ассоциаци|администраци|школ|детский сад|поликлиник|больниц|завод|фабрик|холдинг|групп[аы]/i;

/**
 * Похож ли лид на организацию — по содержимому, без учёта привязок.
 *
 * Разведка 17.09.2026: в ростовских отделах так выглядят 83% и 54% лидов,
 * хотя привязаны они к контактам. ФИО-лиды компанией становиться не должны:
 * «Иванов Иван» в списке компаний — мусор.
 */
export function looksLikeOrganization(
    lead: Row,
    innFieldNames: readonly string[] = [],
): boolean {
    if (bxFieldText(lead.COMPANY_TITLE)) return true;
    if (innFieldNames.some(name => bxFieldText(lead[name]))) return true;
    const title = bxFieldText(lead.TITLE) ?? '';
    return ORG_FORM.test(title) || ORG_WORDS.test(title);
}

/**
 * Кем станет лид: компанией — только в «отделах компаний» и только если он
 * похож на организацию; иначе контактом.
 */
export class LeadClientKindResolver {
    private departments: Map<number, number> | null = null;
    private readonly userDepartments = new Map<number, number[]>();
    private readonly companyDepartments: number[];

    constructor(
        private readonly bitrix: ILeadClientBitrix,
        /** Настройка портала: id отделов через запятую (с подотделами). */
        companyDepartmentIdsCsv: string,
        private readonly innFieldNames: readonly string[] = [],
    ) {
        this.companyDepartments = parseUserIds(companyDepartmentIdsCsv);
    }

    async resolve(
        lead: Row,
        responsibleId: number | null,
    ): Promise<LeadClientKind> {
        if (!this.companyDepartments.length || !responsibleId) return 'contact';
        if (!looksLikeOrganization(lead, this.innFieldNames)) return 'contact';
        return (await this.inCompanyDepartment(responsibleId))
            ? 'company'
            : 'contact';
    }

    private async inCompanyDepartment(userId: number): Promise<boolean> {
        const parents = await this.parentMap();
        for (const start of await this.departmentsOf(userId)) {
            let current: number | undefined = start;
            for (let guard = 0; current && guard < 20; guard += 1) {
                if (this.companyDepartments.includes(current)) return true;
                current = parents.get(current);
            }
        }
        return false;
    }

    private async departmentsOf(userId: number): Promise<number[]> {
        const cached = this.userDepartments.get(userId);
        if (cached) return cached;
        const rows = resultOf(
            await this.bitrix.api.call('user.get', { ID: userId }),
        );
        const user = Array.isArray(rows)
            ? (rows[0] as Row | undefined)
            : undefined;
        const raw = user?.UF_DEPARTMENT;
        const ids = (Array.isArray(raw) ? raw : [])
            .map(bxFieldId)
            .filter((id): id is number => id !== null);
        this.userDepartments.set(userId, ids);
        return ids;
    }

    /** Отдел → родитель. Отделов на портале десятки — читаем все один раз. */
    private async parentMap(): Promise<Map<number, number>> {
        if (this.departments) return this.departments;
        const parents = new Map<number, number>();
        for (let start = 0; start < 1000; start += 50) {
            const response = (await this.bitrix.api.call('department.get', {
                start,
            })) as Row;
            const rows = Array.isArray(response?.result)
                ? (response.result as Row[])
                : [];
            for (const row of rows) {
                const id = bxFieldId(row.ID);
                const parent = bxFieldId(row.PARENT);
                if (id && parent) parents.set(id, parent);
            }
            if (rows.length < 50) break;
        }
        this.departments = parents;
        return parents;
    }
}
