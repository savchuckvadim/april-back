import { Logger } from '@nestjs/common';
import { BitrixService } from '@lib/bitrix';
import {
    normalizeSkapLogin,
    SKAP_CONTACT_LOGINS_FIELD,
    SKAP_CONTACT_SOURCE_PREFIX,
} from '@lib/portal-lib/pbx/pbx-skap-smart';

/** Параметры автосоздания контакта из данных СКАП. */
export interface SkapContactCreateInput {
    login: string;
    companyId: number;
    companyTitle: string;
    clientCard: string;
    /** Ответственный компании — получит контакт и задачу-уведомление. */
    assignedById: number | null;
}

/**
 * Ключ СКАП-логина на контакте (UF_CRM_SKAP_LOGINS):
 * - дозапись ключа найденному по EMAIL контакту (чтобы дальше находить по
 *   ключу даже после смены email или мерджа контактов);
 * - автосоздание контакта, когда компания по рег-листу найдена, а контакт
 *   с таким логином — нет, + задача ответственному «создан контакт на
 *   основе данных СКАП» (контакт потом могут смерджить — ключ переживёт).
 *
 * НЕ @Injectable: создаётся `new SkapContactKeyService(bitrix)`.
 */
export class SkapContactKeyService {
    private readonly logger = new Logger(SkapContactKeyService.name);

    constructor(private readonly bitrix: BitrixService) {}

    /**
     * Дозапись логина в UF_CRM_SKAP_LOGINS контакта (если его там нет).
     * Fail-open: ошибка не блокирует импорт.
     */
    async ensureLoginKey(
        contactId: number,
        currentLogins: string[],
        login: string,
    ): Promise<void> {
        const normalized = normalizeSkapLogin(login);
        if (currentLogins.includes(normalized)) return;
        await this.bitrix.contact
            .update(contactId, {
                [SKAP_CONTACT_LOGINS_FIELD]: [...currentLogins, normalized],
            })
            .catch((error: Error) =>
                this.logger.warn(
                    `Ключ СКАП не дописан контакту #${contactId} (${normalized}): ${error.message}`,
                ),
            );
    }

    /** Логин похож на валидный email (Bitrix валидирует поле EMAIL). */
    static isEmailLike(login: string): boolean {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login);
    }

    /**
     * Создаёт контакт с ключом СКАП-логина + задачу ответственному.
     * Возвращает id контакта; null — создать не удалось (импорт
     * продолжается без контакта).
     *
     * ВАЖНО: EMAIL ставится только для логинов-email — АРМ-логины бывают
     * произвольными строками, Bitrix отклоняет весь crm.contact.add с
     * «Поле "Рабочий e-mail" содержит некорректный адрес» (прод-инцидент
     * 2026-08-12, телеграм-флуд). Ключ в UF_CRM_SKAP_LOGINS пишется всегда.
     */
    async createContact(input: SkapContactCreateInput): Promise<number | null> {
        const login = normalizeSkapLogin(input.login);
        try {
            const response = await this.bitrix.contact.set({
                // ФИО неизвестно — именем становится логин; менеджер
                // переименует или смерджит (ключ в UF переживёт мердж).
                NAME: login,
                COMPANY_ID: input.companyId,
                ...(input.assignedById
                    ? { ASSIGNED_BY_ID: input.assignedById }
                    : {}),
                ...(SkapContactKeyService.isEmailLike(login)
                    ? { EMAIL: [{ VALUE: login, TYPE: 'WORK' }] }
                    : {}),
                // По префиксу еженедельный крон находит автосозданные
                // контакты и формирует сводные задачи (по 30 шт).
                SOURCE_DESCRIPTION: `${SKAP_CONTACT_SOURCE_PREFIX} (${input.clientCard})`,
                [SKAP_CONTACT_LOGINS_FIELD]: [login],
            });
            const contactId = Number(response.result);
            if (!contactId) {
                throw new Error('crm.contact.add не вернул id');
            }
            this.logger.log(
                `Создан контакт #${contactId} (${login}) для компании #${input.companyId}`,
            );
            return contactId;
        } catch (error) {
            this.logger.warn(
                `Контакт не создан (${login}, компания #${input.companyId}): ${(error as Error).message}`,
            );
            return null;
        }
    }
}
