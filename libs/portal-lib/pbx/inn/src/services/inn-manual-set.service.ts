import { isValidInn, normalizeInn } from '@lib/portal-lib/pbx-duplicate';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    InnDealClosedError,
    InnInvalidValueError,
    InnNoTargetError,
} from '../lib/inn.errors';
import { InnDealStateReader } from './inn-deal-state.reader';
import { InnOwnerEntity } from './inn-mirror.writer';
import { IInnActor, InnPoolService } from './inn-pool.service';
import { IInnRequisiteBitrix } from './inn-requisite.reader';

/** Куда в итоге лёг ИНН из шапки. */
export const INN_MANUAL_ENTITIES = ['deal', 'company', 'lead'] as const;
export type InnManualEntity = (typeof INN_MANUAL_ENTITIES)[number];

/** Сущности, открытые во фрейме: сделка, её компания, заявка. */
export interface IInnManualTarget {
    dealId?: number;
    companyId?: number;
    leadId?: number;
}

export interface IInnManualSetResult {
    inn: string;
    entity: InnManualEntity;
    warnings: string[];
}

/**
 * ИНН, введённый руками в шапке «Звонков» (26.10.2026).
 *
 * Раньше шапка писала поля прямо из браузера: компанию и сделку поверх, без
 * заявок и без записи в ленте, правами сотрудника. Это была вторая,
 * несогласованная обработка ИНН. Теперь запись идёт через единственного
 * писателя (`InnPoolService`) по тем же правилам, что «Выбрать» во вкладке:
 *  - есть открытая сделка — сделка, её пул, компания (поверх), пустые
 *    заявки и запись в ленте сделки «выбран вручную»;
 *  - сделки нет или она закрыта — компания, без неё — заявка: текущий
 *    поверх прежнего, пул объединением.
 *
 * НЕ `@Injectable()`: инстанс Битрикса свой на каждый домен.
 */
export class InnManualSetService {
    private readonly reader: InnDealStateReader;
    private readonly pool: InnPoolService;

    constructor(
        bitrix: IInnRequisiteBitrix,
        portal: PortalModel,
        domain: string,
    ) {
        this.reader = new InnDealStateReader(bitrix, portal, domain);
        this.pool = new InnPoolService(bitrix, portal, domain);
    }

    async set(
        target: IInnManualTarget,
        raw: string,
        actor: IInnActor,
    ): Promise<IInnManualSetResult> {
        const inn = normalizeInn(raw);
        if (!inn || !isValidInn(inn)) throw new InnInvalidValueError(raw);

        const onDeal = target.dealId
            ? await this.setOnDeal(target.dealId, inn, actor)
            : null;
        if (onDeal?.warnings) {
            return { inn, entity: 'deal', warnings: onDeal.warnings };
        }

        const owners: [InnOwnerEntity, number | undefined][] = [
            ['company', target.companyId],
            ['lead', target.leadId],
        ];
        const failures: string[] = [];
        for (const [entity, id] of owners) {
            if (!id) continue;
            const warnings: string[] = [];
            if (await this.pool.setOwner(entity, id, inn, warnings)) {
                return { inn, entity, warnings };
            }
            failures.push(...warnings);
        }
        // Закрытая сделка без компании и заявки: ИНН договора только читается.
        if (onDeal?.closed && target.dealId && !failures.length) {
            throw new InnDealClosedError(target.dealId);
        }
        throw new InnNoTargetError(failures);
    }

    /**
     * «Выбрать» на лёгком чтении. Без `warnings` — в сделку не писали:
     * её нет, она закрыта (`closed`) или поля ИНН у сделки не установлены.
     */
    private async setOnDeal(
        dealId: number,
        inn: string,
        actor: IInnActor,
    ): Promise<{ warnings?: string[]; closed?: boolean }> {
        const state = await this.reader.readLight(dealId);
        if (!state) return {};
        if (state.closed) return { closed: true };
        const result = await this.pool.choose(
            dealId,
            state.deal,
            inn,
            actor,
            state.leadIds,
        );
        return result.current ? { warnings: result.warnings } : {};
    }
}
