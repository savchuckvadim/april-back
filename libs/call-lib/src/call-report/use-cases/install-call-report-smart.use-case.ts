import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';
import { BitrixOwnerTypeId } from '@lib/bitrix';
import { mapFieldTypeToBitrixType } from '@lib/portal-lib/pbx-domain';
import { PortalSmartService } from '@lib/portal-lib/pbx-domain/portal-smart';
import { PbxAicallSmartService } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import {
    EUserFieldType,
    IUserFieldConfig,
    IUserFieldConfigEnumerationItem,
} from '@/modules/bitrix';
import {
    buildCallReportItemFieldName,
    buildCallReportUfName,
    CALL_REPORT_CARD_SECTIONS,
    CALL_REPORT_SMART_CODE,
    CALL_REPORT_SMART_FIELDS,
    CALL_REPORT_SMART_GROUP,
    CALL_REPORT_SMART_TITLE,
    CALL_REPORT_SMART_TYPE,
    CallReportSmartFieldDef,
} from '../config/call-report-smart.config';
import { CallReportSmartResolverService } from '../services/call-report-smart-resolver.service';

export interface InstallCallReportSmartResult {
    entityTypeId: number;
    created: boolean;
    fieldsAdded: string[];
    fieldsExisting: string[];
    fieldsFailed: string[];
}

/**
 * Установка смарт-процесса «AI-анализ звонков» на портал по const-конфигу
 * (по принципу pbx-install, но без Excel и без таблицы smarts).
 *
 * Идемпотентна: повторный запуск не создаёт дубликатов типа и добавляет
 * только отсутствующие поля — так расширяется состав полей смарта
 * (обновите CALL_REPORT_SMART_FIELDS и вызовите установку повторно).
 *
 * Поля создаются ОДИНОЧНЫМИ userfieldconfig.add (POST JSON), не батчем:
 * batch-путь библиотеки не URL-кодирует значения, и русские label'ы /
 * enum-значения могут молча сломать команду.
 */
@Injectable()
export class InstallCallReportSmartUseCase {
    private readonly logger = new Logger(InstallCallReportSmartUseCase.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly smartResolver: CallReportSmartResolverService,
        private readonly portalSmartService: PortalSmartService,
        private readonly aicallSmartService: PbxAicallSmartService,
    ) {}

    async execute(domain: string): Promise<InstallCallReportSmartResult> {
        const { bitrix } = await this.pbxService.init(domain);

        // 1. Тип смарта: найти по коду или создать.
        const existingTypes = await bitrix.smartType.getListFull({
            filter: { code: CALL_REPORT_SMART_CODE },
            start: -1,
            order: { id: 'asc' },
        });
        let smartType = existingTypes.find(
            type => type.code === CALL_REPORT_SMART_CODE,
        );
        let created = false;

        // relations.parent: разбор звонка появляется вкладкой в карточках
        // сделки, лида, контакта и компании.
        const parentRelations = [
            BitrixOwnerTypeId.DEAL,
            BitrixOwnerTypeId.LEAD,
            BitrixOwnerTypeId.CONTACT,
            BitrixOwnerTypeId.COMPANY,
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
                        title: CALL_REPORT_SMART_TITLE,
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
                    code: CALL_REPORT_SMART_CODE,
                    title: CALL_REPORT_SMART_TITLE,
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
                    `Не удалось создать смарт ${CALL_REPORT_SMART_CODE} на ${domain}`,
                );
            }
            smartType = { ...response.result.type, categories: [] };
            created = true;
            this.logger.log(
                `Создан смарт ${CALL_REPORT_SMART_CODE} (entityTypeId=${smartType.entityTypeId}) на ${domain}`,
            );
        }

        const entityTypeId = Number(smartType.entityTypeId);
        // КРИТИЧНО (по докам userfieldconfig): entityId полей = CRM_{id типа
        // из crm.type.list}, НЕ entityTypeId! (пример доки: id=7,
        // entityTypeId=177 → entityId='CRM_7'). entityTypeId — только для
        // crm.item.* адресации элементов.
        const typeId = Number(smartType.id);

        // 1a. Зеркало в таблицу smarts — видимость в мониторинге админки
        // (/portal/{id}/pbx/smart). Резолв конвейера от таблицы НЕ зависит
        // (идёт в Bitrix + Redis), поэтому сбой зеркала не фатален:
        // маркетплейс-портал может не иметь локальной строки portal.
        try {
            await this.portalSmartService.upsertFromBitrix(
                domain,
                smartType,
                CALL_REPORT_SMART_TYPE,
                CALL_REPORT_SMART_GROUP,
            );
        } catch (error) {
            this.logger.warn(
                `Зеркало smarts не обновлено (${domain}): ${(error as Error).message}`,
            );
        }

        // 2. Поля: добавить отсутствующие (идемпотентно).
        const { fieldsAdded, fieldsExisting, fieldsFailed } =
            await this.installFields(bitrix, typeId);

        // 3. Канонический шаг pbx-flow — зеркало полей в PortalDB
        // (bitrixfields + bitrixfield_items): PortalModel и fallback-резолв
        // видят поля/enum-id без похода в Bitrix. Fail-open.
        try {
            const bxFields = await bitrix.userFieldConfig.getAllWithItems(
                'crm',
                { entityId: `CRM_${typeId}` },
            );
            const mirrored = await this.aicallSmartService.mirrorFields(
                domain,
                typeId,
                bxFields,
                entityTypeId,
            );
            this.logger.log(
                `Зеркало полей aicall в PortalDB: ${mirrored} шт (${domain})`,
            );
        } catch (error) {
            this.logger.warn(
                `Зеркало полей aicall не обновлено (${domain}): ${(error as Error).message}`,
            );
        }

        // 3b. Раскладка карточки по смысловым разделам (общая, scope C):
        // без неё все UF-поля сваливаются в «Об элементе». Fail-open.
        await this.applyCardLayout(bitrix, domain, entityTypeId, typeId);

        // 4. Инвалидация online-кэша портала (portal_${domain}) — иначе
        // PortalModel не увидит новые поля до истечения TTL 10ч.
        await this.smartResolver.invalidate(domain);

        return {
            entityTypeId,
            created,
            fieldsAdded,
            fieldsExisting,
            fieldsFailed,
        };
    }

    /**
     * Общая раскладка карточки элемента по разделам
     * (crm.item.details.configuration.set, scope 'C'): коды UF-полей →
     * camelCase-имена по typeId, системные поля (title…) — как есть.
     * Личные настройки пользователей поверх общей сохраняются.
     */
    private async applyCardLayout(
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'],
        domain: string,
        entityTypeId: number,
        typeId: number,
    ): Promise<void> {
        try {
            const data = CALL_REPORT_CARD_SECTIONS.map(section => ({
                name: section.name,
                title: section.title,
                type: 'section',
                elements: section.codes.map(code => ({
                    name: /^[A-Z0-9_]+$/.test(code)
                        ? buildCallReportItemFieldName(typeId, code)
                        : code,
                })),
            }));
            await bitrix.api.call('crm.item.details.configuration.set', {
                entityTypeId,
                scope: 'C',
                data,
            });
            this.logger.log(
                `Карточка смарта разложена по ${data.length} разделам (${domain})`,
            );
        } catch (error) {
            this.logger.warn(
                `Раскладка карточки не применена (${domain}): ${(error as Error).message}`,
            );
        }
    }

    /** typeId — id смарт-типа из crm.type.list (НЕ entityTypeId!). */
    private async installFields(
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'],
        typeId: number,
    ): Promise<
        Pick<
            InstallCallReportSmartResult,
            'fieldsAdded' | 'fieldsExisting' | 'fieldsFailed'
        >
    > {
        let existing: IUserFieldConfig[];
        try {
            existing = await bitrix.userFieldConfig.getAllWithItems('crm', {
                entityId: `CRM_${typeId}`,
            });
        } catch (error) {
            // userfieldconfig.* требует прав на чтение объекта в moduleId
            // (по докам) — практически прав администратора CRM. Тип уже
            // создан, поля долить нельзя — диагностируем причину user.admin.
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
        const existingByName = new Map(
            existing.map(field => [field.fieldName, field]),
        );

        const fieldsAdded: string[] = [];
        const fieldsExisting: string[] = [];
        const fieldsFailed: string[] = [];

        for (const def of CALL_REPORT_SMART_FIELDS) {
            const fieldName = buildCallReportUfName(typeId, def.code);
            const existingField = existingByName.get(fieldName);
            if (existingField) {
                fieldsExisting.push(fieldName);
                // Поля, созданные ДО 22.07.2026, не имеют settings с
                // привязкой к DEAL — Битрикс молча не сохраняет в них
                // ['D_123'], и «Сделка (основная)» вечно пустая. Пропуск
                // существующего поля этого не чинил: доводим настройку.
                await this.repairCrmFieldSettings(bitrix, def, existingField);
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
     * Доводит привязку существующего crm-поля (DEAL_MAIN и т.п.) до эталона.
     *
     * Симптом без этого: значения ['D_123'] уходят в Битрикс с успехом, а
     * поле в карточке остаётся пустым — у поля не отмечена ни одна сущность
     * (settings.DEAL). Так создавались поля до 22.07.2026; переустановка
     * смарта их не чинила, потому что существующие поля пропускались.
     * Fail-open: сбой одного поля не должен валить установку смарта.
     */
    private async repairCrmFieldSettings(
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'],
        def: CallReportSmartFieldDef,
        field: IUserFieldConfig,
    ): Promise<void> {
        if (def.type !== 'crm' || !def.crmEntities?.length) return;
        // Без id поле не обновить (list его всегда отдаёт — страховка типов).
        if (field.id === undefined) return;
        const settings = field.settings ?? {};
        const missing = def.crmEntities.filter(
            entity => settings[entity] !== 'Y',
        );
        if (!missing.length) return;
        try {
            await bitrix.userFieldConfig.update({
                moduleId: 'crm',
                id: field.id,
                field: {
                    settings: {
                        ...settings,
                        ...Object.fromEntries(
                            def.crmEntities.map(entity => [entity, 'Y']),
                        ),
                    },
                },
            });
            this.logger.log(
                `Поле ${field.fieldName}: восстановлена привязка к [${missing.join(', ')}] — ` +
                    `значения вида D_123 теперь сохраняются`,
            );
        } catch (error) {
            this.logger.warn(
                `Поле ${field.fieldName}: привязку к [${missing.join(', ')}] восстановить не удалось: ` +
                    (error as Error).message,
            );
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
        def: CallReportSmartFieldDef,
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
