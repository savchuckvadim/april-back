import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import {
    EUserFieldType,
    IUserFieldConfig,
    IUserFieldConfigEnumerationItem,
} from '@/modules/bitrix';
import { BitrixOwnerTypeId } from '@/modules/bitrix/domain/enums/bitrix-constants.enum';
import { mapFieldTypeToBitrixType } from '@lib/portal-lib/pbx-domain';
import { PortalSmartService } from '@lib/portal-lib/pbx-domain/portal-smart';
import { PortalOnlineCacheService } from '@lib/portal-lib/store/portal-online-cache.service';
import {
    ConstSmartBackRefField,
    ConstSmartDescriptor,
} from '@lib/portal-lib/pbx/const-smart-registry';
import { Category } from '@app/pbx-install/shared';
import { InstallSmartCategoriesService } from '../services/smart-categories/install-smart-categories.service';

/** Тип поля const-смарта (подмножество PortalFieldType). */
export type ConstSmartFieldType =
    | 'string'
    | 'integer'
    | 'date'
    | 'datetime'
    | 'boolean'
    | 'enumeration'
    | 'employee'
    | 'crm';

/** Значение enumeration-поля const-смарта. */
export interface ConstSmartFieldItem {
    CODE: string;
    VALUE: string;
    SORT: number;
}

/**
 * Определение поля const-смарта — общий знаменатель ZprSmartFieldDef и
 * PresentationSmartFieldDef (структурная совместимость, без импорта из
 * конкретного pbx-модуля).
 */
export interface ConstSmartFieldDef {
    code: string;
    name: string;
    type: ConstSmartFieldType;
    items?: readonly ConstSmartFieldItem[];
    isMultiple?: boolean;
    crmEntities?: readonly ('LEAD' | 'DEAL' | 'CONTACT' | 'COMPANY')[];
}

/**
 * Порт зеркала полей смарта в PortalDB. Реализуется pbx-сервисом смарта
 * (PbxZprSmartService, PbxPresentationSmartService) — структурно, без
 * наследования: portal-lib не знает про pbx-install.
 */
export interface ConstSmartMirrorPort {
    mirrorFields(
        domain: string,
        typeId: number,
        bxFields: IUserFieldConfig[],
        entityTypeId?: number,
    ): Promise<number>;
    invalidate(domain: string): void;
}

export interface InstallConstSmartResult {
    entityTypeId: number;
    created: boolean;
    fieldsAdded: string[];
    fieldsExisting: string[];
    fieldsFailed: string[];
}

/**
 * Доливает в settings crm-поля привязку к динамическому типу смарта.
 *
 * Формат settings crm-поля (userfieldconfig, apidocs): булевы Y/N-ключи
 * LEAD/CONTACT/COMPANY/DEAL/QUOTE/ORDER/SMART_INVOICE + `DYNAMIC_{id}` для
 * смарт-процессов, где `{id}` — тот же entityTypeId, что в значениях
 * `T{hex(entityTypeId)}_{elementId}` и в crm.item.*. Без ключа Битрикс
 * МОЛЧА отбрасывает значения `T…_…` при записи в поле.
 *
 * Merge, не replace: существующие привязки (DEAL: 'Y' и чужие DYNAMIC_*)
 * обязаны пережить доливку. Чистая функция — на неё есть тесты.
 */
export const mergeDynamicSmartBinding = (
    settings: IUserFieldConfig['settings'] | undefined,
    entityTypeId: number,
): {
    changed: boolean;
    settings: NonNullable<IUserFieldConfig['settings']>;
} => {
    const key = `DYNAMIC_${entityTypeId}`;
    const current = settings ?? {};
    if (current[key] === 'Y') {
        return { changed: false, settings: current };
    }
    return { changed: true, settings: { ...current, [key]: 'Y' } };
};

export interface InstallConstSmartInput {
    domain: string;
    /** Описатель из CONST_SMART_REGISTRY: код, тип/группа, воронки, родители. */
    descriptor: ConstSmartDescriptor;
    /** Эталонные поля смарта (const-конфиг его pbx-модуля). */
    fields: readonly ConstSmartFieldDef[];
    /** Зеркало полей в PortalDB + сброс кэша резолва. */
    mirror: ConstSmartMirrorPort;
}

/**
 * ОБЩИЙ движок установки const-смарта на портал (тип + воронка/стадии +
 * поля с items + зеркала + сброс кэшей).
 *
 * Вынесен из InstallZprSmartUseCase, когда за ЗПР пришли «Презентации»:
 * различаются они только описателем и полями, а сам сценарий установки —
 * общий. Use-case конкретного смарта остаётся тонкой обёрткой (kind →
 * ConstSmartInstallerResolver).
 *
 * Идемпотентность — по `descriptor.code`: повторный запуск не создаёт
 * дубликат типа, доливает только отсутствующие поля и приводит
 * воронку/стадии к эталону.
 *
 * Поля создаются ОДИНОЧНЫМИ userfieldconfig.add (POST JSON), не батчем:
 * batch-путь библиотеки не URL-кодирует значения, и русские label'ы /
 * enum-значения могут молча сломать команду.
 */
@Injectable()
export class InstallConstSmartService {
    private readonly logger = new Logger(InstallConstSmartService.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly portalSmartService: PortalSmartService,
        private readonly installSmartCategoriesService: InstallSmartCategoriesService,
        private readonly portalCache: PortalOnlineCacheService,
    ) {}

    async execute(
        input: InstallConstSmartInput,
    ): Promise<InstallConstSmartResult> {
        const { domain, descriptor, fields, mirror } = input;
        const { bitrix } = await this.pbxService.init(domain);

        // 1. Тип смарта: найти по коду или создать.
        const existingTypes = await bitrix.smartType.getListFull({
            filter: { code: descriptor.code },
            start: -1,
            order: { id: 'asc' },
        });
        let smartType = existingTypes.find(
            type => type.code === descriptor.code,
        );
        let created = false;

        // relations.parent: элемент появляется вкладкой в карточках
        // перечисленных сущностей (источник — descriptor). По умолчанию —
        // только сделка, как у канонического установщика.
        const parentRelations = (
            descriptor.parentEntityTypeIds ?? [BitrixOwnerTypeId.DEAL]
        ).map(parentEntityTypeId => ({
            entityTypeId: parentEntityTypeId as BitrixOwnerTypeId,
            isChildrenListEnabled: 'Y' as const,
        }));

        if (smartType) {
            // Best-effort доводим relations существующего типа до эталона.
            await bitrix.smartType
                .update({
                    id: Number(smartType.id),
                    fields: {
                        title: descriptor.title,
                        relations: { parent: parentRelations },
                    },
                })
                .catch((error: Error) =>
                    this.logger.warn(
                        `relations смарта ${descriptor.code} не обновлены (${domain}): ${error.message}`,
                    ),
                );
        }

        if (!smartType) {
            const withStages = descriptor.hasCategories ? 'Y' : 'N';
            const response = await bitrix.smartType.add({
                fields: {
                    code: descriptor.code,
                    title: descriptor.title,
                    isUseInUserfieldEnabled: 'Y',
                    isAutomationEnabled: 'Y',
                    isBeginCloseDatesEnabled: 'N',
                    isBizProcEnabled: 'N',
                    // Воронка/стадии включаются, только если смарт их имеет
                    // (ЗПР, Презентации); aicall/skap живут без стадий.
                    isCategoriesEnabled: withStages,
                    isStagesEnabled: withStages,
                    isClientEnabled: 'Y',
                    isDocumentsEnabled: 'N',
                    isLinkWithProductsEnabled: 'N',
                    isMycompanyEnabled: 'N',
                    isRecyclebinEnabled: 'Y',
                    relations: { parent: parentRelations },
                },
            });
            if (!response.result?.type?.id) {
                throw new Error(
                    `Не удалось создать смарт ${descriptor.code} на ${domain}`,
                );
            }
            smartType = { ...response.result.type, categories: [] };
            created = true;
            this.logger.log(
                `Создан смарт ${descriptor.code} (entityTypeId=${smartType.entityTypeId}) на ${domain}`,
            );
        }

        const entityTypeId = Number(smartType.entityTypeId);
        // КРИТИЧНО: entityId полей = CRM_{id типа из crm.type.list},
        // НЕ entityTypeId! entityTypeId — только для crm.item.*.
        const typeId = Number(smartType.id);

        // 1a. Зеркало в таблицу smarts — ДО стадий: InstallSmartCategoriesService
        // резолвит смарт через строку smarts. Сбой здесь не фатален для полей,
        // но стадии без строки не встанут (упадут с понятной ошибкой).
        try {
            await this.portalSmartService.upsertFromBitrix(
                domain,
                smartType,
                descriptor.type,
                descriptor.group,
            );
        } catch (error) {
            this.logger.warn(
                `Зеркало smarts не обновлено (${domain}, ${descriptor.code}): ${(error as Error).message}`,
            );
        }

        // 2. Поля: добавить отсутствующие (идемпотентно).
        const { fieldsAdded, fieldsExisting, fieldsFailed } =
            await this.installFields(bitrix, typeId, fields);

        // 3. Зеркало полей в PortalDB (bitrixfields + bitrixfield_items):
        // PortalModel и fallback-резолв видят поля/enum-id без Bitrix.
        try {
            const bxFields = await bitrix.userFieldConfig.getAllWithItems(
                'crm',
                { entityId: `CRM_${typeId}` },
            );
            const mirrored = await mirror.mirrorFields(
                domain,
                typeId,
                bxFields,
                entityTypeId,
            );
            this.logger.log(
                `Зеркало полей ${descriptor.code} в PortalDB: ${mirrored} шт (${domain})`,
            );
        } catch (error) {
            this.logger.warn(
                `Зеркало полей ${descriptor.code} не обновлено (${domain}): ${(error as Error).message}`,
            );
        }

        // 3a. Обратные crm-поля сделки/компании (op_zprs/op_presentations):
        // долить в их settings привязку DYNAMIC_{entityTypeId} — поля ставятся
        // установкой полей event-sales, когда entityTypeId смарта ещё
        // неизвестен, и без привязки значения `T{hex}_{id}` молча теряются.
        // Best-effort: неустановленное поле — warn и пропуск, повторная
        // установка смарта идемпотентно дольёт.
        await this.bindBackRefFields(
            bitrix,
            domain,
            descriptor.backRefFields ?? [],
            entityTypeId,
        );

        // 4. Воронка + стадии — канонический смартовый flow (тот же сервис,
        // что у Excel-шаблонов): Bitrix crm.category/crm.status + зеркало
        // btx_categories/btx_stages, по которому резолвится stageIdByCode.
        const templateCategories = descriptor.buildInstallCategories?.() ?? [];
        if (templateCategories.length) {
            await this.installSmartCategoriesService.installTemplateCategories({
                bitrix,
                domain,
                smartType: descriptor.type,
                smartGroup: descriptor.group,
                entityTypeId,
                templateCategories: templateCategories as Category[],
            });
        }

        // 5. Инвалидация кэшей: online-слепок portal_${domain} (TTL 10ч) и
        // in-memory резолв pbx-сервиса смарта (TTL 10 мин) — иначе flow не
        // увидит свежеустановленный смарт до истечения TTL.
        await this.portalCache.invalidate(domain);
        mirror.invalidate(domain);

        return {
            entityTypeId,
            created,
            fieldsAdded,
            fieldsExisting,
            fieldsFailed,
        };
    }

    /** typeId — id смарт-типа из crm.type.list (НЕ entityTypeId!). */
    private async installFields(
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'],
        typeId: number,
        defs: readonly ConstSmartFieldDef[],
    ): Promise<
        Pick<
            InstallConstSmartResult,
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

        for (const def of defs) {
            const fieldName = `UF_CRM_${typeId}_${def.code}`;
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

    /**
     * Привязка обратных crm-полей (op_zprs/op_presentations) к динамическому
     * типу смарта: по каждому дескрипторному полю находим userfield через
     * типизированный userfieldconfig.list (fieldName + entityId
     * CRM_DEAL/CRM_COMPANY), читаем ПОЛНЫЕ settings через userfieldconfig.get
     * (list settings не отдаёт) и доливаем `DYNAMIC_{entityTypeId}='Y'`
     * merge'ем ({@link mergeDynamicSmartBinding}). Уже привязано — no-op.
     *
     * Ошибки не роняют установку: обратная ссылка — удобство, не инвариант,
     * а повторная установка смарта идемпотентно дольёт привязку.
     */
    private async bindBackRefFields(
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'],
        domain: string,
        backRefFields: readonly ConstSmartBackRefField[],
        entityTypeId: number,
    ): Promise<void> {
        for (const backRef of backRefFields) {
            const entityId =
                backRef.entity === 'deal' ? 'CRM_DEAL' : 'CRM_COMPANY';
            try {
                const listResponse = await bitrix.userFieldConfig.list({
                    moduleId: 'crm',
                    filter: { entityId, fieldName: backRef.ufName },
                });
                const found = listResponse?.result?.fields?.[0];
                if (!found?.id) {
                    this.logger.warn(
                        `Обратное поле ${backRef.ufName} (${entityId}) не установлено ` +
                            `на ${domain} — привязка DYNAMIC_${entityTypeId} пропущена; ` +
                            `установите поля и переустановите смарт (идемпотентно).`,
                    );
                    continue;
                }
                // list не возвращает settings — полные настройки берём get'ом,
                // иначе merge затёр бы существующие привязки поля.
                const getResponse = await bitrix.userFieldConfig.get({
                    moduleId: 'crm',
                    id: found.id,
                });
                const field = getResponse?.result?.field;
                const merged = mergeDynamicSmartBinding(
                    field?.settings,
                    entityTypeId,
                );
                if (!merged.changed) continue;
                await bitrix.userFieldConfig.update({
                    moduleId: 'crm',
                    id: found.id,
                    field: { settings: merged.settings },
                });
                this.logger.log(
                    `Обратное поле ${backRef.ufName} (${entityId}) привязано к ` +
                        `DYNAMIC_${entityTypeId} на ${domain}`,
                );
            } catch (error) {
                this.logger.warn(
                    `Привязка ${backRef.ufName} (${entityId}) к DYNAMIC_${entityTypeId} ` +
                        `не выполнена (${domain}): ${(error as Error).message}`,
                );
            }
        }
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
        def: ConstSmartFieldDef,
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
