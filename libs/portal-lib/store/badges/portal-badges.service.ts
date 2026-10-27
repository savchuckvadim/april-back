import { createHash } from 'node:crypto';
import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { RedisService } from '@lib/core/redis/redis.service';
import { PortalRepository } from '../portal.repository';
import { DEFAULT_BADGES } from './portal-badges.defaults';
import { PortalBadgesRepository } from './portal-badges.repository';
import {
    BADGE_CATALOG_CONTRACT,
    BADGE_CODE_MAX_LENGTH,
    BADGE_ITEMS_MAX,
    BADGE_MODES,
    BADGE_OUTCOMES,
    BADGE_PLAN_TYPES,
    BADGE_TARGETS,
    BADGE_TEXT_MAX_LENGTH,
    BADGE_TONES,
    BadgeCatalogDocument,
    BadgeRecord,
    BadgeSchemaPayload,
    EnumBadgeMode,
    EnumBadgePlanType,
    EnumBadgeTarget,
    getBadgeSchema,
} from './portal-badges.schema';

const CACHE_TTL_SECONDS = 300;
const CACHE_VERSION = 'v1';

/** Бейджик на сохранение — ещё не проверен. */
export interface BadgeDraft {
    code: string;
    text: string;
    target: string;
    tone: string;
    outcomes: string[];
    planTypes: string[];
    isDefault: boolean;
    sort: number;
    isActive: boolean;
}

/** Документ на сохранение из админки. */
export interface PortalBadgesSaveInput {
    mode: string;
    items: BadgeDraft[];
    updatedBy: number | null;
}

/** Скомпилированный каталог — то, что уезжает во фрейм. */
export interface BadgeCatalogPayload {
    contract: number;
    mode: EnumBadgeMode;
    version: number;
    hash: string;
    items: BadgeRecord[];
}

/** Документ для админки: свой набор, режим и общий набор для сравнения. */
export interface PortalBadgesAdminPayload {
    mode: EnumBadgeMode;
    items: BadgeRecord[];
    defaults: BadgeRecord[];
    version: number;
    updatedAt: string | null;
    updatedBy: number | null;
}

/**
 * Портальный каталог бейджиков.
 *
 *  - ЧТЕНИЕ (`resolve`, `getVersion`) — горячий путь фрейма: документ
 *    портала → действующий набор (общий из кода либо свой), Redis-кэш 5
 *    минут, `hash` состава для дешёвой сверки «менялся ли каталог»;
 *  - ЗАПИСЬ (`save`) — админка: валидация на СОХРАНЕНИИ, иначе фрейм
 *    получит бейджик с итогом, которого не знает, и молча его не покажет.
 *
 * Портал без документа — режим «по умолчанию»: общий набор действует без
 * единой записи в БД.
 */
@Injectable()
export class PortalBadgesService {
    private readonly logger = new Logger(PortalBadgesService.name);
    private readonly redis: Redis;

    constructor(
        private readonly repository: PortalBadgesRepository,
        private readonly portalRepository: PortalRepository,
        redisService: RedisService,
    ) {
        this.redis = redisService.getClient();
    }

    getSchema(): BadgeSchemaPayload {
        return getBadgeSchema();
    }

    /** Действующий набор домена — для фрейма. */
    async resolve(domain: string): Promise<BadgeCatalogPayload> {
        const cached = await this.readCache(domain);
        if (cached) return cached;

        const document = await this.repository.findByDomain(domain);
        const payload = this.compile(document);
        await this.writeCache(domain, payload);
        return payload;
    }

    async getVersion(
        domain: string,
    ): Promise<{ version: number; hash: string }> {
        const { version, hash } = await this.resolve(domain);
        return { version, hash };
    }

    /** Документ портала для админки вместе с общим набором. */
    async getForPortal(portalId: number): Promise<PortalBadgesAdminPayload> {
        const domain = await this.requireDomain(portalId);
        const document = await this.repository.findByDomain(domain);
        return this.toAdminPayload(document);
    }

    /**
     * Сохранение из админки: режим и свой набор целиком. Состав задаётся
     * ЦЕЛИКОМ — бейджика, которого нет в `items`, в документе больше нет
     * (ответов на бейджик никто не хранит, гасить нечего). Версия растёт,
     * кэш домена сбрасывается.
     */
    async save(
        portalId: number,
        input: PortalBadgesSaveInput,
    ): Promise<PortalBadgesAdminPayload> {
        const domain = await this.requireDomain(portalId);
        const mode = this.requireOneOf(input.mode, BADGE_MODES, 'Режим');
        const items = this.validateItems(input.items);
        const current = await this.repository.findByDomain(domain);

        const saved = await this.repository.save(portalId, domain, {
            mode,
            items,
            version: (current?.version ?? 0) + 1,
            updatedAt: new Date().toISOString(),
            updatedBy: input.updatedBy ?? null,
        });
        await this.dropCache(domain);
        return this.toAdminPayload(saved);
    }

    /* ------------------------------------------------------------------ */

    private compile(
        document: BadgeCatalogDocument | null,
    ): BadgeCatalogPayload {
        const mode = document?.mode ?? EnumBadgeMode.default;
        const source =
            mode === EnumBadgeMode.own && document
                ? document.items.filter(item => item.isActive)
                : DEFAULT_BADGES;
        const items = [...source].sort(
            (a, b) => a.sort - b.sort || a.code.localeCompare(b.code),
        );
        return {
            contract: BADGE_CATALOG_CONTRACT,
            mode,
            version: document?.version ?? 0,
            hash: this.hash(mode, items),
            items,
        };
    }

    private toAdminPayload(
        document: BadgeCatalogDocument | null,
    ): PortalBadgesAdminPayload {
        return {
            mode: document?.mode ?? EnumBadgeMode.default,
            items: document?.items ?? [],
            defaults: [...DEFAULT_BADGES],
            version: document?.version ?? 0,
            updatedAt: document?.updatedAt ?? null,
            updatedBy: document?.updatedBy ?? null,
        };
    }

    /**
     * Проверка набора. Один бейджик — одна цель: привязки к итогам есть
     * только у комментария, к типам события и `isDefault` — только у
     * названия. Иначе админка сохранила бы то, чего фрейм не исполнит.
     */
    private validateItems(drafts: BadgeDraft[]): BadgeRecord[] {
        if (!Array.isArray(drafts)) {
            throw new BadRequestException(
                'Набор бейджиков должен быть списком',
            );
        }
        if (drafts.length > BADGE_ITEMS_MAX) {
            throw new BadRequestException(
                `Бейджиков не больше ${BADGE_ITEMS_MAX}, прислано ${drafts.length}`,
            );
        }
        const codes = new Set<string>();
        const defaultByType = new Map<EnumBadgePlanType, string>();
        return drafts.map((draft, index) => {
            const label = `Бейджик №${index + 1}`;
            const code = this.requireText(draft.code, `${label}: код`);
            if (code.length > BADGE_CODE_MAX_LENGTH) {
                throw new BadRequestException(
                    `${label}: код длиннее ${BADGE_CODE_MAX_LENGTH} символов`,
                );
            }
            if (codes.has(code)) {
                throw new BadRequestException(
                    `${label}: код «${code}» повторяется — коды уникальны`,
                );
            }
            codes.add(code);

            const text = this.requireText(draft.text, `${label}: текст`);
            if (text.length > BADGE_TEXT_MAX_LENGTH) {
                throw new BadRequestException(
                    `${label}: текст длиннее ${BADGE_TEXT_MAX_LENGTH} символов`,
                );
            }
            const target = this.requireOneOf(
                draft.target,
                BADGE_TARGETS,
                `${label}: цель`,
            );
            const tone = this.requireOneOf(
                draft.tone,
                BADGE_TONES,
                `${label}: цвет`,
            );
            const outcomes = this.requireEach(
                draft.outcomes,
                BADGE_OUTCOMES,
                `${label}: итоги работы`,
            );
            const planTypes = this.requireEach(
                draft.planTypes,
                BADGE_PLAN_TYPES,
                `${label}: типы события`,
            );

            if (target === EnumBadgeTarget.comment && planTypes.length) {
                throw new BadRequestException(
                    `${label}: бейджик комментария не привязывается к типам события`,
                );
            }
            if (target === EnumBadgeTarget.title && outcomes.length) {
                throw new BadRequestException(
                    `${label}: бейджик названия не привязывается к итогам работы`,
                );
            }
            const isDefault = draft.isDefault === true;
            if (isDefault && target !== EnumBadgeTarget.title) {
                throw new BadRequestException(
                    `${label}: «подставлять сам» есть только у бейджика названия`,
                );
            }
            if (isDefault && draft.isActive !== false) {
                // Основной текст типа — один на тип: два «сам подставится»
                // для «Звонка» оставили бы выбор случаю.
                for (const planType of planTypes) {
                    const taken = defaultByType.get(planType);
                    if (taken) {
                        throw new BadRequestException(
                            `${label}: у типа «${planType}» уже есть основной бейджик «${taken}»`,
                        );
                    }
                    defaultByType.set(planType, code);
                }
            }

            return {
                code,
                text,
                target,
                tone,
                outcomes: this.unique(outcomes),
                planTypes: this.unique(planTypes),
                isDefault,
                sort: Number.isFinite(draft.sort) ? Math.trunc(draft.sort) : 0,
                isActive: draft.isActive !== false,
            };
        });
    }

    private hash(mode: EnumBadgeMode, items: BadgeRecord[]): string {
        const normalized = items.map(item => ({
            code: item.code,
            text: item.text,
            target: item.target,
            tone: item.tone,
            outcomes: [...item.outcomes].sort(),
            planTypes: [...item.planTypes].sort(),
            isDefault: item.isDefault,
            sort: item.sort,
        }));
        return createHash('sha1')
            .update(JSON.stringify({ mode, items: normalized }))
            .digest('hex');
    }

    private async readCache(
        domain: string,
    ): Promise<BadgeCatalogPayload | null> {
        const raw = await this.redis
            .get(this.cacheKey(domain))
            .catch(() => null);
        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw) as BadgeCatalogPayload;
            // Другая версия кода могла положить иную форму — тогда в БД.
            return parsed.contract === BADGE_CATALOG_CONTRACT &&
                Array.isArray(parsed.items)
                ? parsed
                : null;
        } catch {
            return null;
        }
    }

    private async writeCache(domain: string, payload: BadgeCatalogPayload) {
        await this.redis
            .set(
                this.cacheKey(domain),
                JSON.stringify(payload),
                'EX',
                CACHE_TTL_SECONDS,
            )
            .catch((error: unknown) =>
                this.logger.warn(
                    `Кэш бейджиков ${domain} не записан: ${this.describe(error)}`,
                ),
            );
    }

    private async dropCache(domain: string): Promise<void> {
        await this.redis
            .del(this.cacheKey(domain))
            .catch((error: unknown) =>
                this.logger.warn(
                    `Кэш бейджиков ${domain} не сброшен (${CACHE_TTL_SECONDS} с фрейм видит прежний набор): ${this.describe(error)}`,
                ),
            );
    }

    private cacheKey(domain: string): string {
        return `portal-badges:${CACHE_VERSION}:${domain}`;
    }

    private async requireDomain(portalId: number): Promise<string> {
        const portal = await this.portalRepository.findById(portalId);
        if (!portal?.domain) {
            throw new NotFoundException(`Портал ${portalId} не найден`);
        }
        return portal.domain;
    }

    private requireOneOf<Value extends string>(
        value: string | null | undefined,
        allowed: readonly Value[],
        label: string,
    ): Value {
        if (value && (allowed as readonly string[]).includes(value)) {
            return value as Value;
        }
        throw new BadRequestException(
            `${label}: значение «${value ?? ''}» не из реестра. Допустимо: ${allowed.join(', ')}`,
        );
    }

    private requireEach<Value extends string>(
        values: unknown,
        allowed: readonly Value[],
        label: string,
    ): Value[] {
        if (values === undefined || values === null) return [];
        if (!Array.isArray(values)) {
            throw new BadRequestException(`${label}: ожидается список`);
        }
        return values.map(value =>
            this.requireOneOf(
                typeof value === 'string' ? value : '',
                allowed,
                label,
            ),
        );
    }

    private unique<Value extends string>(values: Value[]): Value[] {
        return [...new Set(values)];
    }

    private requireText(
        value: string | null | undefined,
        label: string,
    ): string {
        const text = (value ?? '').trim();
        if (!text)
            throw new BadRequestException(`${label}: значение обязательно`);
        return text;
    }

    private describe(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
