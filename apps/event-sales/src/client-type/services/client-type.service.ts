import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    IInnBitrix,
    innId,
    innRow,
    InnRow,
    innText,
} from '@lib/portal-lib/pbx-inn';
import { ClientTypeCode, ClientTypeEntity } from '../lib/client-type.const';
import {
    ClientTypeDealNotFoundError,
    ClientTypeNoTargetError,
} from '../lib/client-type.errors';
import { ClientTypeFieldMap } from '../lib/client-type-field.map';
import {
    CLIENT_TYPE_SYNC_KINDS,
    planClientTypeSync,
} from '../lib/client-type-sync.plan';

/** Тип клиента у сделки и компании после чтения или записи. */
export interface IClientTypeState {
    /** Что показывает шапка: тип компании, без него — сделки. */
    current: ClientTypeCode | null;
    deal: ClientTypeCode | null;
    company: ClientTypeCode | null;
    /** Значения разные — выбирает человек. */
    conflict: boolean;
    /** Что не удалось записать при выравнивании. */
    warnings: string[];
}

export interface IClientTypeTarget {
    dealId?: number;
    companyId?: number;
}

const METHODS: Record<ClientTypeEntity, { get: string; update: string }> = {
    deal: { get: 'crm.deal.get', update: 'crm.deal.update' },
    company: { get: 'crm.company.get', update: 'crm.company.update' },
};

const isClosed = (deal: InnRow): boolean =>
    innText(deal.CLOSED).toUpperCase() === 'Y';

/**
 * Тип клиента (поле «Тип Клиента») — один на клиента, как ИНН (владелец
 * 26.10.2026): главное значение у компании, сделка его повторяет.
 *  - `align` — при открытии сделки пустая сторона заполняется из
 *    непустой; разные значения не трогаем, это конфликт для человека;
 *  - `set` — выбор человека пишется и в сделку, и в компанию.
 * Закрытую сделку не меняем: она только читается.
 *
 * НЕ `@Injectable()`: инстанс Битрикса свой на каждый домен (CLAUDE.md).
 */
export class ClientTypeService {
    private readonly fields: ClientTypeFieldMap;

    constructor(
        private readonly bitrix: IInnBitrix,
        portal: PortalModel,
    ) {
        this.fields = ClientTypeFieldMap.from(portal);
    }

    async align(dealId: number): Promise<IClientTypeState> {
        const deal = await this.read('deal', dealId);
        if (!deal) throw new ClientTypeDealNotFoundError(dealId);
        const companyId = innId(deal.COMPANY_ID);
        const company = companyId
            ? await this.read('company', companyId)
            : null;

        let dealCode = this.fields.codeOf('deal', deal);
        let companyCode = this.fields.codeOf('company', company);
        const warnings: string[] = [];
        const plan = planClientTypeSync({
            deal: dealCode,
            company: companyCode,
            hasCompany: Boolean(company) && !!this.fields.ufName('company'),
        });
        if (plan.kind === CLIENT_TYPE_SYNC_KINDS.toDeal && !isClosed(deal)) {
            if (await this.tryWrite('deal', dealId, plan.code, warnings)) {
                dealCode = plan.code;
            }
        }
        if (plan.kind === CLIENT_TYPE_SYNC_KINDS.toCompany) {
            if (
                await this.tryWrite('company', companyId, plan.code, warnings)
            ) {
                companyCode = plan.code;
            }
        }
        return this.state(dealCode, companyCode, warnings);
    }

    async set(
        target: IClientTypeTarget,
        code: ClientTypeCode,
    ): Promise<IClientTypeState> {
        let companyId = target.companyId ?? 0;
        let dealCode: ClientTypeCode | null = null;
        let written = false;

        if (target.dealId) {
            const deal = await this.read('deal', target.dealId);
            if (deal) {
                companyId = companyId || innId(deal.COMPANY_ID);
                dealCode = this.fields.codeOf('deal', deal);
                if (
                    !isClosed(deal) &&
                    (await this.write('deal', target.dealId, code))
                ) {
                    dealCode = code;
                    written = true;
                }
            }
        }
        let companyCode: ClientTypeCode | null = null;
        if (companyId && (await this.write('company', companyId, code))) {
            companyCode = code;
            written = true;
        }
        if (!written) throw new ClientTypeNoTargetError();
        return this.state(dealCode, companyCode, []);
    }

    /* ------------------------------------------------------------------ */

    private state(
        deal: ClientTypeCode | null,
        company: ClientTypeCode | null,
        warnings: string[],
    ): IClientTypeState {
        return {
            current: company ?? deal,
            deal,
            company,
            conflict: Boolean(deal && company && deal !== company),
            warnings,
        };
    }

    private async read(
        entity: ClientTypeEntity,
        id: number,
    ): Promise<InnRow | null> {
        return innRow(await this.bitrix.api.call(METHODS[entity].get, { id }));
    }

    /** false — поля или варианта нет на портале, писать некуда. */
    private async write(
        entity: ClientTypeEntity,
        id: number,
        code: ClientTypeCode,
    ): Promise<boolean> {
        const ufName = this.fields.ufName(entity);
        const value = this.fields.valueOf(entity, code);
        if (!ufName || value === null) return false;
        await this.bitrix.api.call(METHODS[entity].update, {
            id,
            fields: { [ufName]: value },
        });
        return true;
    }

    /** Выравнивание не роняет открытие сделки: сбой — в предупреждения. */
    private async tryWrite(
        entity: ClientTypeEntity,
        id: number,
        code: ClientTypeCode,
        warnings: string[],
    ): Promise<boolean> {
        try {
            return await this.write(entity, id, code);
        } catch (error) {
            warnings.push(
                `Тип клиента ${entity === 'deal' ? 'сделки' : 'компании'} ${id} ` +
                    `не записан: ${(error as Error).message}`,
            );
            return false;
        }
    }
}
