import { Injectable, Logger } from '@nestjs/common';
import { AppCacheService } from '@lib/app-cache';
import { IBXField } from '@lib/bitrix';
import { PBXService } from '@lib/pbx';
import {
    PbxFieldEntityDto,
    PortalCompanyService,
    PortalContactService,
    PortalDealService,
    PortalLeadService,
} from '@lib/portal-lib/pbx-domain';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { fieldTitle, isInnLikeCode, isInnLikeField } from '../lib/inn-field.matcher';
import {
    DuplicateEntityType,
    DuplicateSignalKind,
    PortalSignalFieldMap,
    SignalFieldRef,
    SignalFieldSource,
} from '../type/duplicate.type';

/** Пространство кэша модуля дублей. */
export const DUPLICATE_CACHE_APP = 'crm-duplicate';

const FIELD_MAP_KEY = 'field-map:v1';
const FIELD_MAP_TTL_SEC = 24 * 3600;
/** Ручные вкл/выкл — бессрочно и отдельным ключом, чтобы ре-скан их не стирал. */
const OVERRIDES_KEY = 'field-map-overrides:v1';

/**
 * Коды ИНН-полей из нашей константы-шаблона
 * (`PBX_SALES_KONSTRUCTOR_FIELDS`, «ИНН» → `op_inn` → `OP_INN`).
 * Держим списком здесь, а не импортом константы: либе дублей не нужна вся
 * таблица полей, а совпадение по коду — единственное, что от неё требуется.
 */
const TEMPLATE_INN_FIELD_CODES = ['op_inn'];

/** Штатное поле реквизитов Битрикса, где лежит ИНН у контакта и компании. */
export const REQUISITE_INN_FIELD = 'RQ_INN';

/** Ручное переопределение «поле участвует в поиске». */
interface SignalFieldOverride {
    entityType: DuplicateEntityType;
    fieldName: string;
    enabled: boolean;
}

/**
 * Карта полей-сигналов портала: где на этом конкретном портале лежит ИНН.
 *
 * Зачем: шаблонное `op_inn` установлено не везде, а клиент мог завести своё
 * `UF_CRM_1750854801` с подписью «ИНН контрагента». Поэтому карта склеивается
 * из трёх источников (шаблон/PortalDB → живые UF-поля → реквизиты) и кладётся
 * в app-cache — сканить портал на каждый поиск дублей недопустимо.
 */
@Injectable()
export class SignalFieldMapService {
    private readonly logger = new Logger(SignalFieldMapService.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly cache: AppCacheService,
        private readonly portalStore: PortalStoreService,
        private readonly portalLead: PortalLeadService,
        private readonly portalContact: PortalContactService,
        private readonly portalCompany: PortalCompanyService,
        private readonly portalDeal: PortalDealService,
    ) {}

    /** Карта из кэша; на промахе — скан портала. */
    async getFieldMap(domain: string): Promise<PortalSignalFieldMap> {
        const map = await this.cache.remember<PortalSignalFieldMap>(
            {
                app: DUPLICATE_CACHE_APP,
                domain,
                key: FIELD_MAP_KEY,
                ttlSeconds: FIELD_MAP_TTL_SEC,
                group: 'field-map',
            },
            () => this.scan(domain),
        );
        return this.applyOverrides(domain, map);
    }

    /** Принудительный ре-скан (кнопка в админке / крон). */
    async rescan(domain: string): Promise<PortalSignalFieldMap> {
        const map = await this.scan(domain);
        await this.cache.set({
            app: DUPLICATE_CACHE_APP,
            domain,
            key: FIELD_MAP_KEY,
            ttlSeconds: FIELD_MAP_TTL_SEC,
            group: 'field-map',
            data: map,
        });
        return this.applyOverrides(domain, map);
    }

    /**
     * Включить/выключить поле в поиске. Переопределение живёт отдельно от
     * карты, поэтому переживает ре-скан — иначе админ выключал бы шумное
     * heuristic-поле после каждого обновления.
     */
    async setOverride(
        domain: string,
        entityType: DuplicateEntityType,
        fieldName: string,
        enabled: boolean,
    ): Promise<PortalSignalFieldMap> {
        const overrides = await this.readOverrides(domain);
        const rest = overrides.filter(
            o => !(o.entityType === entityType && o.fieldName === fieldName),
        );
        rest.push({ entityType, fieldName, enabled });

        await this.cache.set({
            app: DUPLICATE_CACHE_APP,
            domain,
            key: OVERRIDES_KEY,
            group: 'field-map',
            data: rest,
        });
        return this.getFieldMap(domain);
    }

    /** Только включённые ИНН-поля нужной сущности — то, чем пользуется поиск. */
    async getInnFields(
        domain: string,
        entityType: DuplicateEntityType,
    ): Promise<SignalFieldRef[]> {
        const map = await this.getFieldMap(domain);
        return map.fields.filter(
            f =>
                f.entityType === entityType &&
                f.kind === DuplicateSignalKind.INN &&
                f.enabled &&
                f.source !== SignalFieldSource.REQUISITE,
        );
    }

    /* ------------------------------------------------------------------ *
     * Скан
     * ------------------------------------------------------------------ */

    private async scan(domain: string): Promise<PortalSignalFieldMap> {
        const warnings: string[] = [];
        const fields: SignalFieldRef[] = [];

        const portal = await this.portalStore.getPortalByDomain(domain);
        if (!portal) {
            warnings.push(`Портал ${domain} не найден в PortalDB`);
        }

        if (portal) {
            fields.push(
                ...(await this.scanPortalDb(Number(portal.id), warnings)),
            );
        }
        fields.push(...(await this.scanLiveBitrix(domain, warnings)));
        fields.push(...this.requisiteFields());

        return {
            domain,
            scannedAt: new Date().toISOString(),
            fields: this.dedupe(fields),
            warnings,
        };
    }

    /** PortalDB: code → bitrixId → `UF_CRM_{bitrixId}`. Самый достоверный источник. */
    private async scanPortalDb(
        portalId: number,
        warnings: string[],
    ): Promise<SignalFieldRef[]> {
        const loaders: [DuplicateEntityType, () => Promise<PbxFieldEntityDto[]>][] =
            [
                [
                    DuplicateEntityType.LEAD,
                    async () =>
                        (await this.portalLead.findWithFieldsByPortalId(portalId))
                            ?.fields ?? [],
                ],
                [
                    DuplicateEntityType.CONTACT,
                    async () =>
                        (
                            await this.portalContact.findWithFieldsByPortalId(
                                portalId,
                            )
                        )?.fields ?? [],
                ],
                [
                    DuplicateEntityType.COMPANY,
                    async () =>
                        (
                            await this.portalCompany.findWithFieldsByPortalId(
                                portalId,
                            )
                        )?.fields ?? [],
                ],
                [
                    DuplicateEntityType.DEAL,
                    async () =>
                        (await this.portalDeal.findWithFieldsByPortalId(portalId))
                            ?.fields ?? [],
                ],
            ];

        const refs: SignalFieldRef[] = [];
        for (const [entityType, load] of loaders) {
            try {
                const portalFields = await load();
                for (const field of portalFields) {
                    if (!this.looksLikeInnPortalField(field)) continue;
                    refs.push({
                        entityType,
                        kind: DuplicateSignalKind.INN,
                        fieldName: `UF_CRM_${field.bitrixId}`,
                        code: field.code,
                        title: field.title || field.name,
                        source: TEMPLATE_INN_FIELD_CODES.includes(field.code)
                            ? SignalFieldSource.TEMPLATE
                            : SignalFieldSource.PORTAL_DB,
                        enabled: true,
                    });
                }
            } catch (error) {
                warnings.push(
                    `PortalDB ${entityType}: ${this.errorText(error)}`,
                );
            }
        }
        return refs;
    }

    /** Живой Битрикс: все UF-поля сущности, отбор по названию/коду. */
    private async scanLiveBitrix(
        domain: string,
        warnings: string[],
    ): Promise<SignalFieldRef[]> {
        let bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'];
        try {
            ({ bitrix } = await this.pbx.init(domain));
        } catch (error) {
            warnings.push(`Bitrix ${domain}: ${this.errorText(error)}`);
            return [];
        }

        const loaders: [DuplicateEntityType, () => Promise<{ result: IBXField[] }>][] =
            [
                [DuplicateEntityType.LEAD, () => bitrix.lead.getFieldsList()],
                [
                    DuplicateEntityType.CONTACT,
                    () => bitrix.contact.getFieldsList(),
                ],
                [
                    DuplicateEntityType.COMPANY,
                    () => bitrix.company.getFieldsList(),
                ],
                [DuplicateEntityType.DEAL, () => bitrix.deal.getFieldsList()],
            ];

        const refs: SignalFieldRef[] = [];
        for (const [entityType, load] of loaders) {
            try {
                const response = await load();
                for (const field of response?.result ?? []) {
                    if (!isInnLikeField(field)) continue;
                    refs.push({
                        entityType,
                        kind: DuplicateSignalKind.INN,
                        fieldName: field.FIELD_NAME,
                        title: fieldTitle(field),
                        source: SignalFieldSource.HEURISTIC,
                        enabled: true,
                    });
                }
            } catch (error) {
                warnings.push(
                    `Bitrix ${entityType}: ${this.errorText(error)}`,
                );
            }
        }
        return refs;
    }

    /** Реквизиты — фиксированное `RQ_INN`, сканить нечего. */
    private requisiteFields(): SignalFieldRef[] {
        return [DuplicateEntityType.CONTACT, DuplicateEntityType.COMPANY].map(
            entityType => ({
                entityType,
                kind: DuplicateSignalKind.INN,
                fieldName: REQUISITE_INN_FIELD,
                title: 'ИНН из реквизитов',
                source: SignalFieldSource.REQUISITE,
                enabled: true,
            }),
        );
    }

    private looksLikeInnPortalField(field: PbxFieldEntityDto): boolean {
        if (!field.bitrixId) return false;
        return (
            TEMPLATE_INN_FIELD_CODES.includes(field.code) ||
            isInnLikeCode(field.code) ||
            isInnLikeCode(field.name) ||
            isInnLikeCode(field.title)
        );
    }

    /* ------------------------------------------------------------------ *
     * Склейка и переопределения
     * ------------------------------------------------------------------ */

    /**
     * Одно поле = одна запись. При конфликте побеждает более достоверный
     * источник: шаблон > PortalDB > реквизиты > эвристика.
     */
    private dedupe(refs: SignalFieldRef[]): SignalFieldRef[] {
        const priority: Record<SignalFieldSource, number> = {
            [SignalFieldSource.MANUAL]: 5,
            [SignalFieldSource.TEMPLATE]: 4,
            [SignalFieldSource.PORTAL_DB]: 3,
            [SignalFieldSource.REQUISITE]: 2,
            [SignalFieldSource.HEURISTIC]: 1,
        };

        const byKey = new Map<string, SignalFieldRef>();
        for (const ref of refs) {
            const key = `${ref.entityType}:${ref.fieldName}`;
            const current = byKey.get(key);
            if (!current || priority[ref.source] > priority[current.source]) {
                // Название из эвристики полезнее пустого — переносим его.
                byKey.set(key, {
                    ...ref,
                    title: ref.title ?? current?.title,
                    code: ref.code ?? current?.code,
                });
            }
        }
        return [...byKey.values()];
    }

    private async readOverrides(
        domain: string,
    ): Promise<SignalFieldOverride[]> {
        const stored = await this.cache.get<SignalFieldOverride[]>({
            app: DUPLICATE_CACHE_APP,
            domain,
            key: OVERRIDES_KEY,
        });
        return stored ?? [];
    }

    private async applyOverrides(
        domain: string,
        map: PortalSignalFieldMap,
    ): Promise<PortalSignalFieldMap> {
        const overrides = await this.readOverrides(domain);
        if (!overrides.length) return map;

        const fields = map.fields.map(field => {
            const override = overrides.find(
                o =>
                    o.entityType === field.entityType &&
                    o.fieldName === field.fieldName,
            );
            if (!override) return field;
            return {
                ...field,
                enabled: override.enabled,
                source: SignalFieldSource.MANUAL,
            };
        });
        return { ...map, fields };
    }

    private errorText(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
