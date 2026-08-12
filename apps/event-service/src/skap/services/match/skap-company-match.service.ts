import { Logger } from '@nestjs/common';
import { BitrixService } from '@lib/bitrix';
import { IBXCompany } from '@/modules/bitrix';
import {
    normalizeSkapLogin,
    SKAP_COMPANY_REG_FIELD,
    SKAP_CONTACT_LOGINS_FIELD,
} from '@lib/portal-lib/pbx/pbx-skap-smart';

/** Контакты компании: ключ (email ИЛИ СКАП-логин) → контакт. */
export interface SkapCompanyContacts {
    /** email/СКАП-логин (lowercase) → contactId. */
    keyToContact: Map<string, number>;
    /** contactId → текущие значения UF_CRM_SKAP_LOGINS (для дозаписи). */
    loginsByContact: Map<number, string[]>;
}

/** Найденная компания по рег-листу. */
export interface SkapMatchedCompany {
    id: number;
    title: string;
    assignedById: number | null;
}

const FILTER_CHUNK = 50;

/**
 * Матчинг сущностей Битрикс для импорта СКАП. Компания — фундамент:
 * строго точное совпадение номера карточки клиента АРМ с
 * {@link SKAP_COMPANY_REG_FIELD} (UF_CRM_USER_CARDNUM). Контакт —
 * best-effort по email-логину среди контактов компании.
 *
 * НЕ @Injectable: создаётся `new SkapCompanyMatchService(bitrix)`.
 */
export class SkapCompanyMatchService {
    private readonly logger = new Logger(SkapCompanyMatchService.name);

    constructor(private readonly bitrix: BitrixService) {}

    /** Карточка клиента (61-40762-000004) → компания. Чанки по 50 (IN). */
    async matchCompanies(
        clientCards: string[],
    ): Promise<Map<string, SkapMatchedCompany>> {
        const map = new Map<string, SkapMatchedCompany>();
        const unique = [...new Set(clientCards.map(card => card.trim()))];
        for (let i = 0; i < unique.length; i += FILTER_CHUNK) {
            const chunk = unique.slice(i, i + FILTER_CHUNK);
            const companies = await this.bitrix.company.all(
                {
                    [`@${SKAP_COMPANY_REG_FIELD}`]: chunk,
                } as unknown as Partial<IBXCompany>,
                ['ID', 'TITLE', 'ASSIGNED_BY_ID', SKAP_COMPANY_REG_FIELD],
            );
            for (const company of companies) {
                const rawCard = (company as Record<string, unknown>)[
                    SKAP_COMPANY_REG_FIELD
                ];
                const card = typeof rawCard === 'string' ? rawCard.trim() : '';
                if (!card) continue;
                if (map.has(card)) {
                    this.logger.warn(
                        `Рег-лист ${card} у нескольких компаний (#${map.get(card)?.id} и #${company.ID}) — взята первая`,
                    );
                    continue;
                }
                map.set(card, {
                    id: Number(company.ID),
                    title: String(company.TITLE ?? ''),
                    assignedById: company.ASSIGNED_BY_ID
                        ? Number(company.ASSIGNED_BY_ID)
                        : null,
                });
            }
        }
        return map;
    }

    /**
     * Контакты компаний: companyId → ключи поиска. Ключ — И обычный EMAIL,
     * И значения спец-поля {@link SKAP_CONTACT_LOGINS_FIELD}: ключ
     * переживает мердж контактов и смену корпоративного email.
     * Fail-open: ошибка не блокирует импорт (контакт — best-effort).
     */
    async loadCompanyContacts(
        companyIds: number[],
    ): Promise<Map<number, SkapCompanyContacts>> {
        const map = new Map<number, SkapCompanyContacts>();
        const unique = [...new Set(companyIds)];
        for (let i = 0; i < unique.length; i += FILTER_CHUNK) {
            const chunk = unique.slice(i, i + FILTER_CHUNK);
            try {
                const contacts = await this.bitrix.contact.all(
                    { '@COMPANY_ID': chunk } as unknown as Record<
                        string,
                        unknown
                    >,
                    ['ID', 'COMPANY_ID', 'EMAIL', SKAP_CONTACT_LOGINS_FIELD],
                );
                for (const contact of contacts) {
                    const raw = contact as unknown as {
                        ID?: string | number;
                        COMPANY_ID?: string | number;
                        EMAIL?: { VALUE?: string }[];
                        [key: string]: unknown;
                    };
                    const companyId = Number(raw.COMPANY_ID);
                    const contactId = Number(raw.ID);
                    if (!companyId || !contactId) continue;

                    const emails = (raw.EMAIL ?? [])
                        .map(email => normalizeSkapLogin(email.VALUE ?? ''))
                        .filter(Boolean);
                    const skapLogins = this.readSkapLogins(
                        raw[SKAP_CONTACT_LOGINS_FIELD],
                    );

                    const entry = map.get(companyId) ?? {
                        keyToContact: new Map<string, number>(),
                        loginsByContact: new Map<number, string[]>(),
                    };
                    // СКАП-ключи приоритетнее email (явная привязка).
                    for (const key of [...skapLogins, ...emails]) {
                        if (!entry.keyToContact.has(key)) {
                            entry.keyToContact.set(key, contactId);
                        }
                    }
                    entry.loginsByContact.set(contactId, skapLogins);
                    map.set(companyId, entry);
                }
            } catch (error) {
                this.logger.warn(
                    `Контакты компаний не загружены (чанк ${i / FILTER_CHUNK + 1}): ${(error as Error).message}`,
                );
            }
        }
        return map;
    }

    /** Значение множественного UF (массив/строка/пусто) → lowercase-ключи. */
    private readSkapLogins(value: unknown): string[] {
        const rawList = Array.isArray(value)
            ? value
            : typeof value === 'string' && value
              ? [value]
              : [];
        return rawList
            .map(item =>
                typeof item === 'string' ? normalizeSkapLogin(item) : '',
            )
            .filter(Boolean);
    }
}
