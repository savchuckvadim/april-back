import { Logger } from '@nestjs/common';
import { BitrixService } from '@lib/bitrix';
import { IBXItem } from '@lib/bitrix/domain/crm/item/interface/item.interface';
import {
    SKAP_IP_LIST_MAX_LEN,
    SkapEventCode,
    SkapFieldCode,
    SkapSmartInfo,
} from '@lib/portal-lib/pbx/pbx-skap-smart';
import { BitrixOwnerTypeId } from '@lib/bitrix';

/** Данные элемента логин×месяц для записи в смарт. */
export interface SkapSmartItemInput {
    xmlId: string;
    title: string;
    period: Date;
    periodCode: string;
    login: string;
    loginCreated: Date | null;
    clientCard: string;
    regList: string;
    rpName: string;
    clientName: string;
    complectId: string;
    complectType: string;
    complectName: string | null;
    supplyKind: string;
    netCoef: string;
    sessionCount: number;
    timeTotalMin: number;
    ipCount: number;
    ipList: string;
    city: string | null;
    region: string | null;
    managerName: string | null;
    mailingCount: number | null;
    sourceFile: string;
    formatVersion: string;
    companyId: number;
    dealId: number | null;
    contactId: number | null;
    assignedById: number | null;
    events: SkapEventCode[];
}

const XMLID_CHUNK = 50;

/**
 * Writer смарта «СКАП»: upsert элементов по xmlId и детализация сессий в
 * таймлайн. НЕ @Injectable — создаётся `new SkapSmartWriterService(bitrix,
 * info)` под конкретный домен.
 *
 * Записи — одиночные crm.item.add/update (POST JSON), НЕ батчем: batch-путь
 * библиотеки не URL-кодирует значения, русские названия молча ломают
 * команду (урок call-report). Темп записи сдерживает BitrixRateLimiter.
 */
export class SkapSmartWriterService {
    private readonly logger = new Logger(SkapSmartWriterService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly info: SkapSmartInfo,
    ) {}

    /**
     * Существующие элементы по xmlId батч-чтением (чанки по 50):
     * Map xmlId → id. Fail-open: ошибка чтения не блокирует запись
     * (upsert подстрахует dedup-таблица).
     */
    async findItemIdsByXmlIds(xmlIds: string[]): Promise<Map<string, number>> {
        const map = new Map<string, number>();
        for (let i = 0; i < xmlIds.length; i += XMLID_CHUNK) {
            const chunk = xmlIds.slice(i, i + XMLID_CHUNK);
            try {
                const items = await this.bitrix.item.listAll(
                    String(this.info.entityTypeId),
                    { '@xmlId': chunk } as unknown as Partial<IBXItem>,
                    ['id', 'xmlId'],
                );
                for (const item of items) {
                    const raw = item as unknown as {
                        id?: number;
                        xmlId?: string;
                    };
                    if (raw.id && raw.xmlId) {
                        map.set(String(raw.xmlId), Number(raw.id));
                    }
                }
            } catch (error) {
                this.logger.warn(
                    `Поиск элементов по xmlId не удался (чанк ${i / XMLID_CHUNK + 1}): ${(error as Error).message}`,
                );
            }
        }
        return map;
    }

    /** Upsert элемента; existingId — из findItemIdsByXmlIds. */
    async upsertItem(
        input: SkapSmartItemInput,
        existingId: number | null,
    ): Promise<{ id: number; created: boolean }> {
        const fields = this.buildFields(input);
        if (existingId) {
            await this.bitrix.item.update(
                existingId,
                this.info.entityTypeId as never,
                fields,
            );
            return { id: existingId, created: false };
        }
        fields.xmlId = input.xmlId;
        const response = await this.bitrix.item.add(
            String(this.info.entityTypeId),
            fields,
        );
        const itemId = Number(
            (response as { result?: { item?: { id?: number } } } | undefined)
                ?.result?.item?.id,
        );
        if (!itemId) {
            throw new Error(
                `crm.item.add не вернул id элемента (${input.xmlId})`,
            );
        }
        return { id: itemId, created: true };
    }

    /**
     * Детализация месяца в таймлайн элемента (сессии логина из
     * Online_detail) — кусками по ~8000 символов, fail-open.
     */
    async postSessionsComment(itemId: number, text: string): Promise<void> {
        const parts = this.split(text, 8000);
        for (let i = 0; i < parts.length; i++) {
            const partLabel =
                parts.length > 1 ? ` (часть ${i + 1}/${parts.length})` : '';
            await this.bitrix.timeline
                .addTimelineComment({
                    ENTITY_ID: itemId,
                    ENTITY_TYPE: `DYNAMIC_${this.info.entityTypeId}`,
                    COMMENT: `📊 [b]Сессии СКАП за месяц[/b]${partLabel}:\n\n${parts[i]}`,
                    AUTHOR_ID: '1',
                })
                .catch((error: Error) =>
                    this.logger.warn(
                        `Сессии не запощены в таймлайн #${itemId}: ${error.message}`,
                    ),
                );
        }
    }

    private buildFields(input: SkapSmartItemInput): Partial<IBXItem> {
        const fields: Record<string, unknown> = {
            title: input.title,
            companyId: input.companyId,
            [`parentId${BitrixOwnerTypeId.COMPANY}`]: input.companyId,
            assignedById: input.assignedById ?? undefined,
        };
        if (input.dealId) {
            fields[`parentId${BitrixOwnerTypeId.DEAL}`] = input.dealId;
        }
        if (input.contactId) {
            fields.contactId = input.contactId;
            fields[`parentId${BitrixOwnerTypeId.CONTACT}`] = input.contactId;
        }

        this.setUf(fields, 'PERIOD', input.period.toISOString());
        this.setUf(fields, 'PERIOD_CODE', input.periodCode);
        this.setUf(fields, 'LOGIN', input.login);
        this.setUf(
            fields,
            'LOGIN_CREATED',
            input.loginCreated ? input.loginCreated.toISOString() : null,
        );
        this.setUf(fields, 'CLIENT_CARD', input.clientCard);
        this.setUf(fields, 'REG_LIST', input.regList);
        this.setUf(fields, 'RP_NAME', input.rpName);
        this.setUf(fields, 'CLIENT_NAME', input.clientName);
        this.setUf(fields, 'COMPLECT_ID', input.complectId);
        this.setUf(fields, 'COMPLECT_TYPE', input.complectType);
        this.setUf(fields, 'COMPLECT_NAME', input.complectName);
        this.setUf(fields, 'SUPPLY_KIND', input.supplyKind);
        this.setUf(fields, 'NET_COEF', input.netCoef);
        this.setUf(fields, 'SESSION_COUNT', input.sessionCount);
        this.setUf(fields, 'TIME_TOTAL_MIN', input.timeTotalMin);
        this.setUf(fields, 'IP_COUNT', input.ipCount);
        this.setUf(
            fields,
            'IP_LIST',
            input.ipList.slice(0, SKAP_IP_LIST_MAX_LEN),
        );
        this.setUf(fields, 'CITY', input.city);
        this.setUf(fields, 'REGION', input.region);
        this.setUf(fields, 'MANAGER_NAME', input.managerName);
        this.setUf(fields, 'MAILING_COUNT', input.mailingCount);
        this.setUf(fields, 'SOURCE_FILE', input.sourceFile);
        this.setUf(fields, 'FORMAT_VERSION', input.formatVersion);

        // crm-связи: массив ссылок ['CO_x'] / ['D_x'] / ['C_x']
        this.setUf(fields, 'COMPANY_LINK', [`CO_${input.companyId}`]);
        if (input.dealId) {
            this.setUf(fields, 'DEAL_LINK', [`D_${input.dealId}`]);
        }
        if (input.contactId) {
            this.setUf(fields, 'CONTACT_LINK', [`C_${input.contactId}`]);
        }

        // enum multiple: числовые id значений
        const eventIds = input.events
            .map(code => this.info.enumItems['EVENTS']?.[code])
            .filter((id): id is number => typeof id === 'number');
        if (eventIds.length) {
            this.setUf(fields, 'EVENTS', eventIds);
        }

        return fields as Partial<IBXItem>;
    }

    /** Ставит значение по фактическому camel-ключу поля (null/'' — пропуск). */
    private setUf(
        fields: Record<string, unknown>,
        code: SkapFieldCode,
        value: unknown,
    ): void {
        if (value === null || value === undefined || value === '') return;
        const key = this.info.ufKeyByCode[code];
        if (!key) {
            this.logger.warn(
                `Поле ${code} не найдено в смарте (ufKeyByCode) — значение пропущено`,
            );
            return;
        }
        fields[key] = value;
    }

    private split(value: string, partSize: number): string[] {
        if (value.length <= partSize) return [value];
        const parts: string[] = [];
        for (let i = 0; i < value.length; i += partSize) {
            parts.push(value.slice(i, i + partSize));
        }
        return parts;
    }
}
