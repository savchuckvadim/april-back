import { isValidInn, uniq } from '@lib/portal-lib/pbx-duplicate';
import { InnFieldMap } from '../lib/inn-fields';
import {
    IInnBitrix,
    innList,
    innRow,
    InnRow,
    innText,
} from '../lib/inn-row.util';

/** Владельцы ИНН помимо сделки: компания и заявка. */
export type InnOwnerEntity = 'company' | 'lead';

const OWNER_METHODS: Record<
    InnOwnerEntity,
    { get: string; update: string; label: string }
> = {
    company: {
        get: 'crm.company.get',
        update: 'crm.company.update',
        label: 'компании',
    },
    lead: { get: 'crm.lead.get', update: 'crm.lead.update', label: 'заявки' },
};

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
        for (const leadId of leadIds) {
            await this.write('lead', leadId, inn, warnings, true);
        }
    }

    /**
     * Человек указал ИНН компании или заявки в шапке «Звонков», а открытой
     * сделки рядом нет: текущий — поверх прежнего, пул — объединением.
     * false — поля нет на портале, сущность не нашлась или запись упала
     * (причина — в предупреждениях).
     */
    async setCurrent(
        entity: InnOwnerEntity,
        id: number,
        inn: string,
        warnings: string[],
    ): Promise<boolean> {
        return this.write(entity, id, inn, warnings, false);
    }

    private async write(
        entity: InnOwnerEntity,
        id: number,
        inn: string,
        warnings: string[],
        onlyEmpty: boolean,
    ): Promise<boolean> {
        const innName = this.fields.inn(entity);
        if (!innName) return false;
        const poolName = this.fields.pool(entity);
        const methods = OWNER_METHODS[entity];
        try {
            const row = innRow(await this.bitrix.api.call(methods.get, { id }));
            if (!row) return false;
            const current = innText(row[innName]);
            if (onlyEmpty && current) return false;
            const pool = poolName ? innList(row[poolName]) : [];
            const nextPool = uniq([...pool, inn]);
            if (current === inn && nextPool.length === pool.length) return true;
            const fields: InnRow = { [innName]: inn };
            if (poolName) fields[poolName] = nextPool;
            await this.bitrix.api.call(methods.update, { id, fields });
            return true;
        } catch (error) {
            warnings.push(
                `ИНН ${methods.label} ${id} не записан: ${(error as Error).message}`,
            );
            return false;
        }
    }
}
