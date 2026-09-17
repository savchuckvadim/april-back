import { isValidInn, normalizeInn } from '@lib/portal-lib/pbx-duplicate';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { innText } from '../lib/inn-row.util';
import { composeInnSnapshot } from '../lib/inn-snapshot.composer';
import {
    InnDealClosedError,
    InnDealNotFoundError,
    InnHideCurrentError,
    InnInvalidValueError,
    InnVersionConflictError,
} from '../lib/inn.errors';
import {
    IInnAuditEvent,
    IInnSnapshot,
    INN_AUDIT_ACTIONS,
    InnAuditAction,
} from '../type/inn.type';
import { IInnDealState, InnDealStateReader } from './inn-deal-state.reader';
import { IInnActor, InnPoolService } from './inn-pool.service';
import { IInnRequisiteBitrix } from './inn-requisite.reader';

/**
 * Сценарии вкладки «ИНН»: снимок, выбор, скрытие варианта.
 *
 * Чтение — `InnDealStateReader`, выводы — чистый композитор, запись — только
 * `InnPoolService`. Здесь остаётся порядок действий и правила допуска:
 * закрытая сделка только читается, устаревшая версия снимка отклоняется.
 *
 * НЕ `@Injectable()`: инстанс Битрикса свой на каждый домен (CLAUDE.md).
 */
export class InnDealService {
    private readonly reader: InnDealStateReader;
    private readonly pool: InnPoolService;

    constructor(
        bitrix: IInnRequisiteBitrix,
        portal: PortalModel,
        private readonly domain: string,
    ) {
        this.reader = new InnDealStateReader(bitrix, portal, domain);
        this.pool = new InnPoolService(bitrix, portal, domain);
    }

    /** Снимок ИНН сделки. Ничего не пишет: открытие карточки не событие. */
    async snapshot(dealId: number): Promise<IInnSnapshot> {
        return this.compose(await this.load(dealId));
    }

    /**
     * Выбрать текущий ИНН договора.
     *
     * `inn` либо уже среди кандидатов, либо это новое валидное значение —
     * тогда оно добавляется в пул («добавить вручную»). Версия снимка
     * проверяется до записи: карточка могла устареть.
     */
    async choose(
        dealId: number,
        params: { inn: string; version: string; actor: IInnActor },
    ): Promise<IInnSnapshot> {
        const inn = this.normalize(params.inn);
        const state = await this.load(dealId);
        this.assertWritable(state, params.version);

        const result = await this.pool.choose(
            dealId,
            state.deal,
            inn,
            params.actor,
        );
        // Пустой `current` значит, что записывать было некуда (поля не
        // установлены) — состояние в этом случае не трогаем.
        if (result.current) {
            this.applyWrite(state, result.pool, result.current);
            this.remember(state, INN_AUDIT_ACTIONS.choose, inn, params.actor);
        }
        const snapshot = this.compose(state);
        snapshot.warnings.push(...result.warnings);
        return snapshot;
    }

    /**
     * Скрыть вариант («это не наш ИНН») или вернуть его обратно.
     *
     * Из пула значение не удаляется — пул только пополняется. Скрытие живёт
     * записью в таймлайне сделки: поля под него нет, а заводить поле на
     * компании (как просит постановка) без ведома владельца нельзя.
     */
    async hide(
        dealId: number,
        params: { inn: string; actor: IInnActor; restore?: boolean },
    ): Promise<IInnSnapshot> {
        const inn = this.normalize(params.inn);
        const state = await this.load(dealId);
        this.assertWritable(state);

        const action = params.restore
            ? INN_AUDIT_ACTIONS.restore
            : INN_AUDIT_ACTIONS.hide;
        if (
            action === INN_AUDIT_ACTIONS.hide &&
            this.currentInn(state) === inn
        ) {
            throw new InnHideCurrentError(inn);
        }

        await this.pool.hide(dealId, inn, params.actor, action);
        this.remember(state, action, inn, params.actor);
        return this.compose(state);
    }

    /* ------------------------------------------------------------------ */

    private async load(dealId: number): Promise<IInnDealState> {
        const state = await this.reader.read(dealId);
        if (!state) throw new InnDealNotFoundError(dealId);
        return state;
    }

    private compose(state: IInnDealState): IInnSnapshot {
        return composeInnSnapshot({
            dealId: state.dealId,
            domain: this.domain,
            deal: state.deal,
            closed: state.closed,
            companyId: state.companyId,
            observations: state.observations,
            requisites: state.requisites,
            requisitesReadable: state.requisitesReadable,
            linkedRequisiteId: state.linkedRequisiteId,
            audit: state.audit,
            otherCompanies: state.otherCompanies,
            fields: state.fields,
        });
    }

    private normalize(raw: string): string {
        const inn = normalizeInn(raw);
        if (!inn || !isValidInn(inn)) throw new InnInvalidValueError(raw);
        return inn;
    }

    private assertWritable(state: IInnDealState, version?: string): void {
        if (state.closed) throw new InnDealClosedError(state.dealId);
        if (version === undefined) return;
        const actual = this.compose(state).version;
        if (actual !== version) {
            throw new InnVersionConflictError(version, actual);
        }
    }

    private currentInn(state: IInnDealState): string {
        const innName = state.fields.inn('deal');
        return innName ? innText(state.deal[innName]) : '';
    }

    /** Записанные значения — в состояние, чтобы ответ не требовал перечтения. */
    private applyWrite(
        state: IInnDealState,
        pool: readonly string[],
        current: string,
    ): void {
        const innName = state.fields.inn('deal');
        const poolName = state.fields.pool('deal');
        if (innName) state.deal[innName] = current;
        if (poolName) state.deal[poolName] = [...pool];
    }

    /** Свежее событие аудита — в состояние: таймлайн мы уже не перечитываем. */
    private remember(
        state: IInnDealState,
        action: InnAuditAction,
        inn: string,
        actor: IInnActor,
    ): void {
        const event: IInnAuditEvent = {
            action,
            inn,
            userId: actor.id,
            userName: actor.name,
            at: new Date().toISOString(),
        };
        state.audit = [...state.audit, event];
    }
}
