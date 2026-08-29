import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';
import { EUserFieldType, IUserFieldConfig } from '@/modules/bitrix';
import { QuestionnaireFieldSource } from './questionnaire-field-source.service';

/** Живой клиент Битрикса для одного портала. */
export type QuestionnaireBitrix = Awaited<
    ReturnType<PBXService['init']>
>['bitrix'];

/** Вариант списка живого поля. */
export interface QuestionnaireLiveFieldItem {
    /** Идентификатор элемента: ровно он уходит в `crm.*.update`. */
    id: number | null;
    value: string;
    xmlId: string | null;
}

/** Живое пользовательское поле носителя. */
export interface QuestionnaireLiveField {
    /** Полное UF-имя ровно как его вернул Битрикс. */
    fieldName: string;
    title: string;
    /** `userTypeId`: string, date, enumeration и т.д. */
    type: string;
    multiple: boolean;
    mandatory: boolean;
    /** Идентификатор поля; в degraded-режиме недоступен. */
    bitrixId: number | null;
    /** Внешний код; в degraded-режиме недоступен. */
    xmlId: string | null;
    items: QuestionnaireLiveFieldItem[];
}

/** Что удалось прочитать и насколько полно. */
export interface QuestionnaireLiveFields {
    fields: QuestionnaireLiveField[];
    /** Читали через `crm.item.fields`: без xmlId и идентификаторов полей. */
    degraded: boolean;
    error?: string;
}

/** Пользовательские поля CRM всегда с этим префиксом. */
const CRM_FIELD_PREFIX = 'UF_CRM_';

/**
 * Чтение ЖИВЫХ пользовательских полей портала — единственное место, где
 * админка ходит в Битрикс за составом полей.
 *
 * Два пути, и оба нужны:
 *  1) `userfieldconfig` — полные данные (xmlId, обязательность, элементы
 *     списка с их идентификаторами), но метод доступен только
 *     администратору CRM. Обход страниц уже внутри `getAllWithItems`:
 *     `userfieldconfig.list` отдаёт порядка 50 полей за раз, и без обхода
 *     часть полей владельца ПРОСТО НЕ ПОЯВИТСЯ в списке выбора — без
 *     ошибки, молча;
 *  2) `crm.item.fields` — работает и без прав администратора, отсюда
 *     degraded-режим. Обязательно с `useOriginalUfNames: 'Y'`: иначе
 *     имена приходят в camelCase (`ufCrm7Code`), а в анкете имя поля —
 *     ЯКОРЬ, по которому фрейм пишет ответ. Записать туда camelCase
 *     значит получить анкету, которая никуда не сохраняет.
 *
 * Оба пути fail-open: недоступный портал не роняет экран админки, а
 * возвращает пустой список с человеческим текстом ошибки.
 */
@Injectable()
export class QuestionnaireBitrixFieldsReader {
    private readonly logger = new Logger(QuestionnaireBitrixFieldsReader.name);

    constructor(private readonly pbxService: PBXService) {}

    /** Живой клиент портала: инициализация стоит запроса, зовите один раз. */
    async connect(domain: string): Promise<QuestionnaireBitrix> {
        const { bitrix } = await this.pbxService.init(domain);
        return bitrix;
    }

    /** Поля одного носителя. */
    async readFields(
        bitrix: QuestionnaireBitrix,
        source: QuestionnaireFieldSource,
    ): Promise<QuestionnaireLiveFields> {
        try {
            if (!source.ufEntityId) {
                throw new Error(
                    source.warning ??
                        'Для носителя не известен идентификатор типа CRM',
                );
            }
            const fields = await bitrix.userFieldConfig.getAllWithItems(
                'crm',
                // entityId = CRM_COMPANY… или CRM_{id из crm.type.list}.
                // entityTypeId сюда подставлять нельзя — см. jsdoc класса.
                { entityId: source.ufEntityId },
            );
            return {
                fields: fields
                    .map(field => this.toLiveField(field))
                    .filter(field => this.isUserField(field.fieldName)),
                degraded: false,
            };
        } catch (error) {
            const message = this.describeError(error);
            this.logger.warn(
                `userfieldconfig для ${source.entity}` +
                    `${source.smartId ? ` #${source.smartId}` : ''} ` +
                    `недоступен (${message}) — читаем crm.item.fields`,
            );
            return this.readViaItemFields(bitrix, source, message);
        }
    }

    /**
     * Fallback без прав администратора CRM. Идентификаторы полей и xmlId
     * этот метод не отдаёт — поэтому проверка привязок в degraded-режиме
     * НЕ меняет статусы: по неполным данным поле не «теряют».
     */
    private async readViaItemFields(
        bitrix: QuestionnaireBitrix,
        source: QuestionnaireFieldSource,
        primaryError: string,
    ): Promise<QuestionnaireLiveFields> {
        try {
            // Типизированная сущность библиотеки, а не сырой api.call:
            // apps/* ходят в Битрикс только через @workspace/bitrix.
            // Второй аргумент — оригинальные UF-имена вместо camelCase:
            // имя поля это якорь анкеты, подменять его нельзя.
            const response = (await bitrix.item.fields(
                source.entityTypeId,
                'Y',
            )) as {
                result?: { fields?: Record<string, Record<string, unknown>> };
            };
            const raw = response?.result?.fields ?? {};
            const fields: QuestionnaireLiveField[] = [];
            for (const [key, meta] of Object.entries(raw)) {
                const fieldName = this.toText(meta.upperName) || key;
                if (!this.isUserField(fieldName)) continue;
                fields.push({
                    fieldName,
                    title: this.toText(meta.title) || fieldName,
                    type: this.toText(meta.type),
                    multiple: meta.isMultiple === true,
                    mandatory: meta.isRequired === true,
                    bitrixId: null,
                    xmlId: null,
                    items: this.toItems(meta.items),
                });
            }
            return {
                fields,
                degraded: true,
                error: this.humanizeError(primaryError),
            };
        } catch (error) {
            const message = this.describeError(error);
            this.logger.warn(
                `Поля носителя ${source.entity} на портале не прочитаны: ` +
                    message,
            );
            return {
                fields: [],
                degraded: true,
                error: this.humanizeError(message),
            };
        }
    }

    /**
     * userfieldconfig.* доступен только администраторам CRM: без прав
     * Битрикс отвечает «Вы не можете просматривать настройки
     * пользовательских полей». Превращаем в подсказку, что чинить.
     */
    private humanizeError(message: string): string {
        if (message.includes('не можете просматривать настройки')) {
            return (
                'У REST-ключа портала нет прав администратора CRM ' +
                '(userfieldconfig): поля прочитаны урезанным способом — ' +
                'без внешних кодов и идентификаторов. Пересоздайте вебхук ' +
                'от имени администратора и повторите проверку привязок.'
            );
        }
        return message;
    }

    /**
     * Ответ `userfieldconfig` → живое поле.
     *
     * Публичный: тем же разбором пользуется запись поля
     * (`QuestionnaireFieldWriter`) — она перечитывает созданное поле и
     * обязана показать его владельцу ровно так же, как показывает список.
     * Два разбора означали бы, что созданное поле выглядит не так, как то
     * же самое поле в списке выбора.
     */
    toLiveField(field: IUserFieldConfig): QuestionnaireLiveField {
        const fieldName = String(field.fieldName ?? '');
        return {
            fieldName,
            title: field.editFormLabel?.ru || fieldName,
            type: String(field.userTypeId ?? ''),
            multiple: field.multiple === 'Y',
            mandatory: field.mandatory === 'Y',
            bitrixId: this.toNumber(field.id),
            xmlId: field.xmlId ?? null,
            items:
                field.userTypeId === EUserFieldType.ENUMERATION
                    ? (field.enum ?? []).map(item => ({
                          id: this.toNumber(item.id),
                          value: String(item.value ?? ''),
                          xmlId: item.xmlId ?? null,
                      }))
                    : [],
        };
    }

    /** Элементы списка из `crm.item.fields` приходят в верхнем регистре. */
    private toItems(value: unknown): QuestionnaireLiveFieldItem[] {
        if (!Array.isArray(value)) return [];
        return (value as Record<string, unknown>[]).map(item => ({
            id: this.toNumber(item.ID ?? item.id),
            value: this.toText(item.VALUE ?? item.value),
            xmlId: null,
        }));
    }

    /** Штатные поля (TITLE, OPPORTUNITY) в каталог полей не попадают. */
    private isUserField(fieldName: string): boolean {
        return fieldName.toUpperCase().startsWith(CRM_FIELD_PREFIX);
    }

    private toNumber(value: unknown): number | null {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed !== 0 ? parsed : null;
    }

    private toText(value: unknown): string {
        if (typeof value === 'string') return value;
        if (typeof value === 'number') return String(value);
        return '';
    }

    private describeError(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
