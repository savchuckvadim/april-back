import { Logger } from '@nestjs/common';
import { BitrixService } from '@lib/bitrix';
import { normalizeInn } from '@lib/portal-lib/pbx-duplicate';
import {
    IInnRequisiteCard,
    INN_DEAL_ENTITY_TYPE_ID,
    INN_RQ_ENTITY,
} from '../type/inn.type';
import { IInnBitrix, innId, InnRow, innText } from '../lib/inn-row.util';

/**
 * ЧТЕНИЕ РЕКВИЗИТОВ. ТОЛЬКО У КОМПАНИИ (4) И КОНТАКТА (3).
 *
 * У лида и сделки реквизитов не бывает вовсе: `crm.requisite.list` по ним
 * отвечает ошибкой, а каждая такая ошибка уходит отдельным сообщением в
 * телеграм-чат админов (проверено 16.09.2026, сотни сообщений за прогон).
 * Реквизит сделки — это ПРИВЯЗКА (`crm.requisite.link`) к реквизиту
 * клиента, и читается она отдельным методом.
 */

/** Порт: полный `BitrixService` подходит, мок в тесте — тоже. */
export type IInnRequisiteBitrix = IInnBitrix &
    Pick<BitrixService, 'requisite' | 'requisiteLink' | 'requisitePreset'>;

/** Сколько реквизитов проверяем на «уже есть другая сделка». */
const MAX_LINK_LOOKUPS = 4;

/** Сколько ИНН проверяем на «есть у другой компании». */
const MAX_OTHER_COMPANY_LOOKUPS = 6;

/**
 * Память об отказе в правах на реквизиты — на процесс, на час.
 *
 * Без неё каждое открытие вкладки на портале без прав слало бы в телеграм
 * по алерту: ошибка `Access denied` для `crm.requisite.list` не входит в
 * список «ожидаемых» в ядре Битрикс-клиента.
 */
const DENIED_UNTIL = new Map<string, number>();
const DENIED_TTL_MS = 60 * 60 * 1000;

export interface IInnRequisiteOwners {
    companyId: number;
    companyTitle: string;
    contacts: readonly { id: number; title: string }[];
}

export interface IInnRequisitesResult {
    cards: IInnRequisiteCard[];
    /** Реквизиты читаются: прав хватает. */
    readable: boolean;
}

export class InnRequisiteReader {
    private readonly logger = new Logger(InnRequisiteReader.name);

    constructor(
        private readonly bitrix: IInnRequisiteBitrix,
        private readonly domain: string,
    ) {}

    /** Карточки реквизитов компании сделки и её контактов. */
    async cards(owners: IInnRequisiteOwners): Promise<IInnRequisitesResult> {
        if (this.isDenied()) return { cards: [], readable: false };

        const cards: IInnRequisiteCard[] = [];
        let readable = true;

        const targets: {
            typeId: number;
            ownerType: 'company' | 'contact';
            id: number;
            title: string;
        }[] = [];
        if (owners.companyId) {
            targets.push({
                typeId: INN_RQ_ENTITY.company,
                ownerType: 'company',
                id: owners.companyId,
                title: owners.companyTitle,
            });
        }
        for (const contact of owners.contacts) {
            targets.push({
                typeId: INN_RQ_ENTITY.contact,
                ownerType: 'contact',
                id: contact.id,
                title: contact.title,
            });
        }

        for (const target of targets) {
            const rows = await this.list(target.typeId, target.id);
            if (rows === null) {
                readable = false;
                break;
            }
            for (const row of rows) {
                cards.push({
                    id: innId(row.ID),
                    ownerType: target.ownerType,
                    ownerId: target.id,
                    ownerTitle: target.title,
                    name: innText(row.NAME),
                    presetId: innId(row.PRESET_ID),
                    presetName: '',
                    inn: normalizeInn(innText(row.RQ_INN)) ?? '',
                    kpp: innText(row.RQ_KPP),
                    companyName: innText(row.RQ_COMPANY_NAME),
                    linked: false,
                    otherDealIds: [],
                });
            }
        }

        if (cards.length) await this.fillPresetNames(cards);
        return { cards, readable };
    }

    /** Id реквизита, привязанного к сделке (0 — привязки нет). */
    async linkedRequisiteId(dealId: number): Promise<number> {
        try {
            const response = await this.bitrix.requisiteLink.getList(
                {
                    ENTITY_TYPE_ID: INN_DEAL_ENTITY_TYPE_ID,
                    ENTITY_ID: dealId,
                },
                ['ENTITY_TYPE_ID', 'ENTITY_ID', 'REQUISITE_ID'],
            );
            const rows = Array.isArray(response?.result) ? response.result : [];
            for (const row of rows) {
                if (innId(row.ENTITY_ID) !== dealId) continue;
                const id = innId(row.REQUISITE_ID);
                if (id) return id;
            }
        } catch (error) {
            this.logger.warn(
                `Привязка реквизита сделки ${dealId} не прочитана ` +
                    `(${this.domain}): ${(error as Error).message}`,
            );
        }
        return 0;
    }

    /**
     * Сделки, к которым уже привязаны эти реквизиты (кроме текущей). Так
     * менеджер видит «по этому реквизиту уже есть сделка №812» — вторая
     * пара реквизитов у компании это норма, а не ошибка.
     */
    async dealsByRequisite(
        requisiteIds: readonly number[],
        exceptDealId: number,
    ): Promise<Map<number, number[]>> {
        const map = new Map<number, number[]>();
        for (const requisiteId of requisiteIds.slice(0, MAX_LINK_LOOKUPS)) {
            try {
                const response = await this.bitrix.requisiteLink.getList(
                    {
                        ENTITY_TYPE_ID: INN_DEAL_ENTITY_TYPE_ID,
                        REQUISITE_ID: requisiteId,
                    },
                    ['ENTITY_TYPE_ID', 'ENTITY_ID', 'REQUISITE_ID'],
                );
                const rows = Array.isArray(response?.result)
                    ? response.result
                    : [];
                const deals = rows
                    // Фильтр повторно проверяем на своей стороне: если
                    // портал проигнорирует его, лишние связи не должны
                    // превратиться в ложную пометку.
                    .filter(
                        row =>
                            innId(row.REQUISITE_ID) === requisiteId &&
                            innId(row.ENTITY_TYPE_ID) ===
                                INN_DEAL_ENTITY_TYPE_ID,
                    )
                    .map(row => innId(row.ENTITY_ID))
                    .filter(id => id && id !== exceptDealId);
                if (deals.length) map.set(requisiteId, [...new Set(deals)]);
            } catch (error) {
                this.logger.warn(
                    `Связи реквизита ${requisiteId} не прочитаны ` +
                        `(${this.domain}): ${(error as Error).message}`,
                );
            }
        }
        return map;
    }

    /**
     * Компании портала, у реквизитов которых тот же ИНН. Автоматически
     * ничего не сливаем — только показываем плашку и ссылку.
     */
    async companiesByInn(
        inns: readonly string[],
        exceptCompanyId: number,
    ): Promise<Map<string, number[]>> {
        const map = new Map<string, number[]>();
        if (this.isDenied()) return map;

        for (const inn of inns.slice(0, MAX_OTHER_COMPANY_LOOKUPS)) {
            try {
                const response = await this.bitrix.requisite.getList(
                    {
                        ENTITY_TYPE_ID: INN_RQ_ENTITY.company,
                        RQ_INN: inn,
                    },
                    ['ID', 'ENTITY_TYPE_ID', 'ENTITY_ID', 'RQ_INN'],
                );
                const rows = Array.isArray(response?.result)
                    ? response.result
                    : [];
                const companies = rows
                    .filter(
                        row =>
                            normalizeInn(innText(row.RQ_INN)) === inn &&
                            innId(row.ENTITY_TYPE_ID) === INN_RQ_ENTITY.company,
                    )
                    .map(row => innId(row.ENTITY_ID))
                    .filter(id => id && id !== exceptCompanyId);
                if (companies.length) {
                    map.set(inn, [...new Set(companies)]);
                }
            } catch (error) {
                this.remember(error);
                break;
            }
        }
        return map;
    }

    /** `crm.requisite.list` сущности; null — прав нет. */
    private async list(
        entityTypeId: number,
        entityId: number,
    ): Promise<InnRow[] | null> {
        try {
            const response = await this.bitrix.requisite.getList(
                { ENTITY_TYPE_ID: entityTypeId, ENTITY_ID: entityId },
                [
                    'ID',
                    'ENTITY_TYPE_ID',
                    'ENTITY_ID',
                    'PRESET_ID',
                    'NAME',
                    'RQ_INN',
                    'RQ_KPP',
                    'RQ_COMPANY_NAME',
                ],
            );
            const rows = Array.isArray(response?.result) ? response.result : [];
            return rows.filter(
                row => innId(row.ENTITY_ID) === entityId,
            ) as unknown as InnRow[];
        } catch (error) {
            this.remember(error);
            return null;
        }
    }

    private async fillPresetNames(cards: IInnRequisiteCard[]): Promise<void> {
        try {
            const response = await this.bitrix.requisitePreset.getList({}, [
                'ID',
                'NAME',
            ]);
            const rows = Array.isArray(response?.result) ? response.result : [];
            const names = new Map<number, string>();
            for (const row of rows) {
                names.set(innId(row.ID), innText(row.NAME));
            }
            for (const card of cards) {
                card.presetName = names.get(card.presetId) ?? '';
            }
        } catch (error) {
            this.logger.warn(
                `Пресеты реквизитов не прочитаны (${this.domain}): ` +
                    (error as Error).message,
            );
        }
    }

    private isDenied(): boolean {
        const until = DENIED_UNTIL.get(this.domain) ?? 0;
        if (until > Date.now()) return true;
        if (until) DENIED_UNTIL.delete(this.domain);
        return false;
    }

    /** «Access denied» запоминаем на час — иначе телеграм заливает алертами. */
    private remember(error: unknown): void {
        const message = (error as Error).message ?? '';
        this.logger.warn(
            `Реквизиты недоступны (${this.domain}): ${message || 'ошибка'}`,
        );
        if (
            /access denied/i.test(message) ||
            /Недостаточно прав/i.test(message)
        ) {
            DENIED_UNTIL.set(this.domain, Date.now() + DENIED_TTL_MS);
        }
    }
}
