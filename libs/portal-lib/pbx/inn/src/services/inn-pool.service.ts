import { Logger } from '@nestjs/common';
import { isValidInn, uniq } from '@lib/portal-lib/pbx-duplicate';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { formatInnAuditComment, IInnAuditRecord } from '../lib/inn-audit.codec';
import {
    candidateValues,
    mergeInnObservations,
    pickAutoInn,
} from '../lib/inn-candidate.util';
import { InnFieldMap } from '../lib/inn-fields';
import {
    IInnBitrix,
    innId,
    innList,
    innRow,
    InnRow,
    innText,
} from '../lib/inn-row.util';
import {
    IInnObservation,
    INN_AUDIT_ACTIONS,
    InnAuditAction,
} from '../type/inn.type';

/** Кто делает запись — приходит из фрейма. */
export interface IInnActor {
    id: number | null;
    name: string;
}

/** Итог пополнения пула. */
export interface IInnAbsorbResult {
    /** Пул сделки после записи. */
    pool: string[];
    /** Текущий `op_inn` после записи. */
    current: string;
    /** Автоматика сама поставила `op_inn`. */
    autoSet: boolean;
    warnings: string[];
}

/** Итог ручного выбора. */
export interface IInnChooseResult {
    pool: string[];
    current: string;
    warnings: string[];
}

/**
 * ЕДИНСТВЕННЫЙ ПИСАТЕЛЬ `op_inn` / `op_inn_pool`.
 *
 * Правила записи (постановка `ai/tasks/2026-09-17-inn-strategy.md`):
 *  - пул — ТОЛЬКО объединение, значения из него не исчезают: по старому
 *    ИНН могли уйти документы;
 *  - `op_inn` автоматика ставит сама, только когда он пуст, кандидат ровно
 *    один и он не «слабый» (слабый = найден только в названии);
 *  - ручной выбор пишется всегда и всегда оставляет след в таймлайне —
 *    кто, когда и что выбрал;
 *  - пул компании синхронизируется тем же набором, иначе боевой путь и
 *    ночной догон разъезжаются (так и было до 17.09.2026).
 *
 * НЕ `@Injectable()`: инстанс Битрикса свой на каждый домен, держать его в
 * поле синглтона нельзя (CLAUDE.md). Создаётся как
 * `new InnPoolService(bitrix, portal, domain)`.
 */
export class InnPoolService {
    private readonly logger = new Logger(InnPoolService.name);
    private readonly fields: InnFieldMap;

    constructor(
        private readonly bitrix: IInnBitrix,
        portal: PortalModel,
        /** Домен портала — для сообщений в логе: инстансов много. */
        private readonly domain: string,
    ) {
        this.fields = InnFieldMap.from(portal);
    }

    /** Карта полей — вызывающему она нужна для признаков доступности. */
    get fieldMap(): InnFieldMap {
        return this.fields;
    }

    /**
     * Наблюдения → пул сделки (объединением) и, если позволено правилами,
     * автоматический `op_inn`. Заодно синхронизируется пул компании.
     */
    async absorb(
        dealId: number,
        deal: InnRow,
        observations: readonly IInnObservation[],
        options: { companyId?: number; hidden?: readonly string[] } = {},
    ): Promise<IInnAbsorbResult> {
        const result: IInnAbsorbResult = {
            pool: [],
            current: '',
            autoSet: false,
            warnings: [],
        };
        const innName = this.fields.inn('deal');
        const poolName = this.fields.pool('deal');
        if (!innName || !poolName) {
            result.warnings.push(
                'Поля op_inn / op_inn_pool не установлены на сделке',
            );
            return result;
        }

        const currentPool = innList(deal[poolName]);
        const current = innText(deal[innName]);
        const candidates = mergeInnObservations(observations, {
            pool: currentPool,
            current,
            hidden: options.hidden ?? [],
        });
        const pool = uniq([...currentPool, ...candidateValues(candidates)]);
        result.pool = pool;
        result.current = current;

        const auto = current ? null : pickAutoInn(candidates);
        const poolGrew = pool.length !== currentPool.length;
        if (!poolGrew && !auto) return result;

        const fields: InnRow = { [poolName]: pool };
        if (auto) fields[innName] = auto;

        try {
            await this.bitrix.api.call('crm.deal.update', {
                id: dealId,
                fields,
            });
        } catch (error) {
            result.warnings.push(
                `ИНН сделки ${dealId} не записан: ${(error as Error).message}`,
            );
            return result;
        }

        if (auto) {
            result.current = auto;
            result.autoSet = true;
            const label = candidates.find(item => item.inn === auto)?.label;
            await this.audit(dealId, result.warnings, {
                action: INN_AUDIT_ACTIONS.auto,
                inn: auto,
                ...(label ? { sourceLabel: label } : {}),
            });
        }

        const companyId = options.companyId ?? innId(deal.COMPANY_ID);
        if (companyId) {
            await this.syncCompany(companyId, pool, result.warnings);
        }
        return result;
    }

    /**
     * Ручной выбор текущего ИНН. Пишется всегда — даже если значение то же
     * самое: запись в таймлайне превращает «алгоритм угадал» в «человек
     * подтвердил», а именно этого не хватает четырём тысячам сделок ночного
     * догона.
     */
    async choose(
        dealId: number,
        deal: InnRow,
        inn: string,
        actor: IInnActor,
    ): Promise<IInnChooseResult> {
        const result: IInnChooseResult = {
            pool: [],
            current: '',
            warnings: [],
        };
        if (!isValidInn(inn)) {
            throw new Error(
                `ИНН ${inn} не проходит проверку контрольной суммы`,
            );
        }
        const innName = this.fields.inn('deal');
        const poolName = this.fields.pool('deal');
        if (!innName || !poolName) {
            result.warnings.push(
                'Поля op_inn / op_inn_pool не установлены на сделке',
            );
            return result;
        }

        const previous = innText(deal[innName]);
        const pool = uniq([...innList(deal[poolName]), inn]);
        await this.bitrix.api.call('crm.deal.update', {
            id: dealId,
            fields: { [innName]: inn, [poolName]: pool },
        });
        result.pool = pool;
        result.current = inn;

        await this.audit(dealId, result.warnings, {
            action: INN_AUDIT_ACTIONS.choose,
            inn,
            ...(previous ? { previousInn: previous } : {}),
            userId: actor.id,
            userName: actor.name,
        });

        const companyId = innId(deal.COMPANY_ID);
        if (companyId) {
            await this.syncCompany(companyId, pool, result.warnings);
        }
        return result;
    }

    /**
     * Скрыть вариант («это не наш ИНН») или вернуть его.
     *
     * Значение из пула НЕ удаляется: пул только пополняется. Скрытие живёт
     * записью в таймлайне сделки — отдельного поля под него нет. По
     * постановке скрытие должно жить НА КОМПАНИИ (иначе один и тот же
     * мусор прячут в каждой сделке холдинга), но поля компании под это не
     * заведено, а заводить его самовольно нельзя.
     */
    async hide(
        dealId: number,
        inn: string,
        actor: IInnActor,
        action: InnAuditAction = INN_AUDIT_ACTIONS.hide,
    ): Promise<string[]> {
        const warnings: string[] = [];
        await this.audit(dealId, warnings, {
            action,
            inn,
            userId: actor.id,
            userName: actor.name,
        });
        return warnings;
    }

    /**
     * Пул компании — объединением; её `op_inn` заполняем только пустой.
     *
     * Перенесено из `scripts/backfill-deal-inn.ts`: раньше синхронизация
     * жила только в ночном догоне, и боевой хук оставлял компанию без
     * вариантов — новые сделки клиента начинали с пустого места.
     */
    async syncCompany(
        companyId: number,
        inns: readonly string[],
        warnings: string[] = [],
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
            if (pool.length === currentPool.length && currentInn) {
                return warnings;
            }
            const fields: InnRow = { [poolName]: pool };
            // Основной ИНН клиента ставим только в пустое и только когда
            // вариант один: у компании бывают две пары реквизитов.
            if (innName && !currentInn && values.length === 1) {
                fields[innName] = values[0];
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

    /** Запись в таймлайн сделки. Её отказ не отменяет саму запись полей. */
    private async audit(
        dealId: number,
        warnings: string[],
        record: IInnAuditRecord,
    ): Promise<void> {
        try {
            await this.bitrix.api.call('crm.timeline.comment.add', {
                fields: {
                    ENTITY_ID: dealId,
                    ENTITY_TYPE: 'deal',
                    COMMENT: formatInnAuditComment(record),
                },
            });
        } catch (error) {
            const message =
                `Запись об ИНН сделки ${dealId} не попала в таймлайн ` +
                `(${this.domain}): ${(error as Error).message}`;
            this.logger.warn(message);
            warnings.push(message);
        }
    }
}
