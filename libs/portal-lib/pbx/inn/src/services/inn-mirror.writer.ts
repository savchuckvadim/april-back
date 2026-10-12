import { isValidInn, uniq } from '@lib/portal-lib/pbx-duplicate';
import { InnFieldMap } from '../lib/inn-fields';
import {
    IInnBitrix,
    innList,
    innRow,
    InnRow,
    innText,
} from '../lib/inn-row.util';

/**
 * Запись ИНН в КОМПАНИЮ и ЗАЯВКИ — отражения текущего ИНН сделки.
 *
 * Текущий ИНН — один в сделке и в компании (владелец, 06.10.2026); заявке
 * пишем только в пустое поле: она источник, её данные не перетираем.
 * Пишет только по команде InnPoolService — единственного писателя ИНН.
 *
 * НЕ `@Injectable()`: инстанс Битрикса свой на каждый домен.
 */
export class InnMirrorWriter {
    constructor(
        private readonly bitrix: IInnBitrix,
        private readonly fields: InnFieldMap,
    ) {}

    /**
     * Пул компании — объединением; её `op_inn` заполняем только пустой.
     * `current` — текущий ИНН, который ОБЯЗАН стоять и в компании (выбор
     * человека, выравнивание со сделкой): пишется поверх прежнего.
     *
     * Перенесено из `scripts/backfill-deal-inn.ts`: раньше синхронизация
     * жила только в ночном догоне, и боевой хук оставлял компанию без
     * вариантов — новые сделки клиента начинали с пустого места.
     */
    async syncCompany(
        companyId: number,
        inns: readonly string[],
        warnings: string[] = [],
        current?: string,
    ): Promise<string[]> {
        const poolName = this.fields.pool('company');
        const innName = this.fields.inn('company');
        const values = uniq(inns.filter(isValidInn));
        if (!poolName || !values.length) return warnings;

        try {
            const company = innRow(
                await this.bitrix.api.call('crm.company.get', {
                    id: companyId,
                }),
            );
            if (!company) return warnings;
            const currentPool = innList(company[poolName]);
            const pool = uniq([...currentPool, ...values]);
            const currentInn = innName ? innText(company[innName]) : '';
            const nextInn =
                current && isValidInn(current)
                    ? current
                    : // Без явного текущего — только в пустое и только
                      // когда вариант один: у компании бывают две пары
                      // реквизитов.
                      !currentInn && values.length === 1
                      ? values[0]
                      : currentInn;
            if (pool.length === currentPool.length && nextInn === currentInn) {
                return warnings;
            }
            const fields: InnRow = { [poolName]: pool };
            if (innName && nextInn && nextInn !== currentInn) {
                fields[innName] = nextInn;
            }
            await this.bitrix.api.call('crm.company.update', {
                id: companyId,
                fields,
            });
        } catch (error) {
            warnings.push(
                `Пул компании ${companyId} не синхронизирован: ` +
                    (error as Error).message,
            );
        }
        return warnings;
    }

    /**
     * Заявкам сделки — выбранный ИНН в ПУСТОЕ поле (заявка — источник, её
     * данные не перетираем) и в пул. Ошибка одной заявки — в предупреждения.
     */
    async fillLeads(
        leadIds: readonly number[],
        inn: string,
        warnings: string[],
    ): Promise<void> {
        const innName = this.fields.inn('lead');
        if (!innName || !leadIds.length) return;
        const poolName = this.fields.pool('lead');
        for (const leadId of leadIds) {
            try {
                const lead = innRow(
                    await this.bitrix.api.call('crm.lead.get', { id: leadId }),
                );
                if (!lead || innText(lead[innName])) continue;
                const fields: InnRow = { [innName]: inn };
                if (poolName) {
                    fields[poolName] = uniq([...innList(lead[poolName]), inn]);
                }
                await this.bitrix.api.call('crm.lead.update', {
                    id: leadId,
                    fields,
                });
            } catch (error) {
                warnings.push(
                    `ИНН заявки ${leadId} не записан: ${(error as Error).message}`,
                );
            }
        }
    }
}
