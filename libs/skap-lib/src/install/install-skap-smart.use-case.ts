import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';
import { BitrixOwnerTypeId } from '@lib/bitrix';
import { mapFieldTypeToBitrixType } from '@lib/portal-lib/pbx-domain';
import { PortalSmartService } from '@lib/portal-lib/pbx-domain/portal-smart';
import { PortalOnlineCacheService } from '@lib/portal-lib/store/portal-online-cache.service';
import {
    buildSkapUfName,
    PbxSkapSmartService,
    SKAP_CONTACT_LOGINS_FIELD,
    SKAP_CONTACT_LOGINS_TITLE,
    SKAP_CONTACT_LOGINS_XML_ID,
    SKAP_SMART_CODE,
    SKAP_SMART_FIELDS,
    SKAP_SMART_GROUP,
    SKAP_SMART_TITLE,
    SKAP_SMART_TYPE,
    SkapSmartFieldDef,
} from '@lib/portal-lib/pbx/pbx-skap-smart';
import {
    EUserFieldType,
    IUserFieldConfig,
    IUserFieldConfigEnumerationItem,
} from '@/modules/bitrix';

export interface InstallSkapSmartResult {
    entityTypeId: number;
    created: boolean;
    fieldsAdded: string[];
    fieldsExisting: string[];
    fieldsFailed: string[];
}

/**
 * Установка смарт-процесса «СКАП» на портал по const-конфигу
 * (по канону InstallCallReportSmartUseCase).
 *
 * Идемпотентна: повторный запуск не создаёт дубликатов типа и добавляет
 * только отсутствующие поля (обновите SKAP_SMART_FIELDS и вызовите
 * установку повторно).
 *
 * Поля создаются ОДИНОЧНЫМИ userfieldconfig.add (POST JSON), не батчем:
 * batch-путь библиотеки не URL-кодирует значения, и русские label'ы /
 * enum-значения могут молча сломать команду.
 */
@Injectable()
export class InstallSkapSmartUseCase {
    private readonly logger = new Logger(InstallSkapSmartUseCase.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly portalSmartService: PortalSmartService,
        private readonly skapSmartService: PbxSkapSmartService,
        private readonly portalCache: PortalOnlineCacheService,
    ) {}

    async execute(domain: string): Promise<InstallSkapSmartResult> {
        const { bitrix } = await this.pbxService.init(domain);

        // 1. Тип смарта: найти по коду или создать.
        const existingTypes = await bitrix.smartType.getListFull({
            filter: { code: SKAP_SMART_CODE },
            start: -1,
            order: { id: 'asc' },
        });
        let smartType = existingTypes.find(
            type => type.code === SKAP_SMART_CODE,
        );
        let created = false;

        // relations.parent: элемент СКАП появляется вкладкой в карточках
        // сделки, компании и контакта.
        const parentRelations = [
            BitrixOwnerTypeId.DEAL,
            BitrixOwnerTypeId.COMPANY,
            BitrixOwnerTypeId.CONTACT,
        ].map(parentEntityTypeId => ({
            entityTypeId: parentEntityTypeId,
            isChildrenListEnabled: 'Y' as const,
        }));

        if (smartType) {
            // Best-effort доводим relations существующего типа до эталона.
            await bitrix.smartType
                .update({
                    id: Number(smartType.id),
                    fields: {
                        title: SKAP_SMART_TITLE,
                        relations: { parent: parentRelations },
                    },
                })
                .catch((error: Error) =>
                    this.logger.warn(
                        `relations смарта не обновлены (${domain}): ${error.message}`,
                    ),
                );
        }

        if (!smartType) {
            const response = await bitrix.smartType.add({
                fields: {
                    code: SKAP_SMART_CODE,
                    title: SKAP_SMART_TITLE,
                    isUseInUserfieldEnabled: 'Y',
                    isAutomationEnabled: 'Y',
                    isBeginCloseDatesEnabled: 'N',
                    isBizProcEnabled: 'N',
                    isCategoriesEnabled: 'N',
                    isClientEnabled: 'Y',
                    isDocumentsEnabled: 'N',
                    isLinkWithProductsEnabled: 'N',
                    isMycompanyEnabled: 'N',
                    isRecyclebinEnabled: 'Y',
                    isStagesEnabled: 'N',
                    relations: { parent: parentRelations },
                },
            });
            if (!response.result?.type?.id) {
                throw new Error(
                    `Не удалось создать смарт ${SKAP_SMART_CODE} на ${domain}`,
                );
            }
            smartType = { ...response.result.type, categories: [] };
            created = true;
            this.logger.log(
                `Создан смарт ${SKAP_SMART_CODE} (entityTypeId=${smartType.entityTypeId}) на ${domain}`,
            );
        }

        const entityTypeId = Number(smartType.entityTypeId);
        // КРИТИЧНО: entityId полей = CRM_{id типа из crm.type.list},
        // НЕ entityTypeId! entityTypeId — только для crm.item.*.
        const typeId = Number(smartType.id);

        // 1a. Зеркало в таблицу smarts — видимость в мониторинге админки.
        // Сбой зеркала не фатален (маркетплейс-портал может не иметь
        // локальной строки portal).
        try {
            await this.portalSmartService.upsertFromBitrix(
                domain,
                smartType,
                SKAP_SMART_TYPE,
                SKAP_SMART_GROUP,
            );
        } catch (error) {
            this.logger.warn(
                `Зеркало smarts не обновлено (${domain}): ${(error as Error).message}`,
            );
        }

        // 2. Поля: добавить отсутствующие (идемпотентно).
        const { fieldsAdded, fieldsExisting, fieldsFailed } =
            await this.installFields(bitrix, typeId);

        // 3. Зеркало полей в PortalDB (bitrixfields + bitrixfield_items):
        // PortalModel и fallback-резолв видят поля/enum-id без Bitrix.
        try {
            const bxFields = await bitrix.userFieldConfig.getAllWithItems(
                'crm',
                { entityId: `CRM_${typeId}` },
            );
            const mirrored = await this.skapSmartService.mirrorFields(
                domain,
                typeId,
                bxFields,
                entityTypeId,
            );
            this.logger.log(
                `Зеркало полей skap в PortalDB: ${mirrored} шт (${domain})`,
            );
        } catch (error) {
            this.logger.warn(
                `Зеркало полей skap не обновлено (${domain}): ${(error as Error).message}`,
            );
        }

        // 4. Поле-ключ СКАП-логинов на КОНТАКТЕ (множественная строка):
        // идентификация «кто именно работал» — поиск контакта при импорте
        // идёт по EMAIL и по этому полю (ключ переживает мердж контактов).
        await this.installContactLoginsField(bitrix, {
            fieldsAdded,
            fieldsExisting,
            fieldsFailed,
        });

        // 5. Инвалидация online-кэша портала (portal_${domain}) — иначе
        // PortalModel не увидит новые поля до истечения TTL 10ч.
        await this.portalCache.invalidate(domain);

        return {
            entityTypeId,
            created,
            fieldsAdded,
            fieldsExisting,
            fieldsFailed,
        };
    }

    /** Идемпотентная установка UF_CRM_SKAP_LOGINS на контакт. */
    private async installContactLoginsField(
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'],
        out: Pick<
            InstallSkapSmartResult,
            'fieldsAdded' | 'fieldsExisting' | 'fieldsFailed'
        >,
    ): Promise<void> {
        try {
            const existing = await bitrix.userFieldConfig.getAllWithItems(
                'crm',
                { entityId: 'CRM_CONTACT' },
            );
            if (
                existing.some(
                    field => field.fieldName === SKAP_CONTACT_LOGINS_FIELD,
                )
            ) {
                out.fieldsExisting.push(SKAP_CONTACT_LOGINS_FIELD);
                return;
            }
            await bitrix.userFieldConfig.add({
                moduleId: 'crm',
                field: {
                    entityId: 'CRM_CONTACT',
                    fieldName: SKAP_CONTACT_LOGINS_FIELD,
                    userTypeId: EUserFieldType.STRING,
                    multiple: 'Y',
                    mandatory: 'N',
                    showFilter: 'Y',
                    showInList: 'Y',
                    editInList: 'Y',
                    isSearchable: 'Y',
                    xmlId: SKAP_CONTACT_LOGINS_XML_ID,
                    editFormLabel: { ru: SKAP_CONTACT_LOGINS_TITLE },
                    listColumnLabel: { ru: SKAP_CONTACT_LOGINS_TITLE },
                    listFilterLabel: { ru: SKAP_CONTACT_LOGINS_TITLE },
                },
            });
            out.fieldsAdded.push(SKAP_CONTACT_LOGINS_FIELD);
        } catch (error) {
            this.logger.error(
                `Поле контакта ${SKAP_CONTACT_LOGINS_FIELD} не установлено: ${(error as Error).message}`,
            );
            out.fieldsFailed.push(SKAP_CONTACT_LOGINS_FIELD);
        }
    }

    /** typeId — id смарт-типа из crm.type.list (НЕ entityTypeId!). */
    private async installFields(
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'],
        typeId: number,
    ): Promise<
        Pick<
            InstallSkapSmartResult,
            'fieldsAdded' | 'fieldsExisting' | 'fieldsFailed'
        >
    > {
        let existing: IUserFieldConfig[];
        try {
            existing = await bitrix.userFieldConfig.getAllWithItems('crm', {
                entityId: `CRM_${typeId}`,
            });
        } catch (error) {
            // userfieldconfig.* требует прав администратора CRM — та же
            // ошибка возникает при передаче CRM_{entityTypeId}.
            if (
                (error as Error).message.includes(
                    'не можете просматривать настройки',
                )
            ) {
                const isAdmin = await this.checkKeyIsAdmin(bitrix);
                const diag =
                    isAdmin === false
                        ? 'user.admin=false: вебхук создан НЕ администратором — ' +
                          'пересоздайте вебхук от имени администратора портала.'
                        : isAdmin === true
                          ? 'user.admin=true: пользователь ключа админ, но доступ ' +
                            'к userfieldconfig запрещён — проверьте scope ' +
                            '`userfieldconfig` у вебхука и права CRM.'
                          : 'user.admin проверить не удалось.';
                throw new Error(
                    'Bitrix запретил чтение настроек полей (userfieldconfig). ' +
                        diag +
                        ' Повторная установка безопасна — дольёт поля.',
                );
            }
            throw error;
        }
        const existingNames = new Set(existing.map(field => field.fieldName));

        const fieldsAdded: string[] = [];
        const fieldsExisting: string[] = [];
        const fieldsFailed: string[] = [];

        for (const def of SKAP_SMART_FIELDS) {
            const fieldName = buildSkapUfName(typeId, def.code);
            if (existingNames.has(fieldName)) {
                fieldsExisting.push(fieldName);
                continue;
            }
            try {
                await bitrix.userFieldConfig.add({
                    moduleId: 'crm',
                    field: this.buildFieldPayload(typeId, fieldName, def),
                });
                fieldsAdded.push(fieldName);
            } catch (error) {
                this.logger.error(
                    `Поле ${fieldName} не установлено: ${(error as Error).message}`,
                );
                fieldsFailed.push(fieldName);
            }
        }

        return { fieldsAdded, fieldsExisting, fieldsFailed };
    }

    /** user.admin тем же ключом: true/false, null — метод недоступен. */
    private async checkKeyIsAdmin(
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'],
    ): Promise<boolean | null> {
        try {
            const response = (await bitrix.api.call('user.admin', {})) as {
                result?: boolean;
            };
            return typeof response?.result === 'boolean'
                ? response.result
                : null;
        } catch (error) {
            this.logger.warn(
                `user.admin не выполнен: ${(error as Error).message}`,
            );
            return null;
        }
    }

    /** typeId — id смарт-типа из crm.type.list (НЕ entityTypeId!). */
    private buildFieldPayload(
        typeId: number,
        fieldName: string,
        def: SkapSmartFieldDef,
    ): Partial<IUserFieldConfig> {
        const payload: Partial<IUserFieldConfig> = {
            entityId: `CRM_${typeId}`,
            fieldName,
            userTypeId: mapFieldTypeToBitrixType(def.type),
            multiple: def.isMultiple ? 'Y' : 'N',
            mandatory: 'N',
            showFilter: 'Y',
            showInList: 'Y',
            editInList: 'Y',
            isSearchable: 'Y',
            xmlId: def.code,
            editFormLabel: { ru: def.name },
            listColumnLabel: { ru: def.name },
            listFilterLabel: { ru: def.name },
        };
        if (payload.userTypeId === EUserFieldType.ENUMERATION) {
            payload.enum = (def.items ?? []).map(
                item =>
                    ({
                        value: item.VALUE,
                        def: 'N',
                        sort: item.SORT,
                        xmlId: item.CODE,
                    }) as IUserFieldConfigEnumerationItem,
            );
        }
        if (
            payload.userTypeId === EUserFieldType.CRM &&
            def.crmEntities?.length
        ) {
            // Без привязки crm-поле создаётся «пустым»: ['D_123'] не сохраняются.
            payload.settings = Object.fromEntries(
                def.crmEntities.map(entity => [entity, 'Y']),
            );
        }
        return payload;
    }
}
