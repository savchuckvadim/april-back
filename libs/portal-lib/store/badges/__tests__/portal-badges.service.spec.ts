import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DEFAULT_BADGES } from '../portal-badges.defaults';
import { PortalBadgesRepository } from '../portal-badges.repository';
import {
    BadgeCatalogDocument,
    BadgeRecord,
    EnumBadgeMode,
    EnumBadgeOutcome,
    EnumBadgePlanType,
    EnumBadgeTarget,
    EnumBadgeTone,
} from '../portal-badges.schema';
import { BadgeDraft, PortalBadgesService } from '../portal-badges.service';

const DOMAIN = 'gsr.bitrix24.ru';
const PORTAL_ID = 7;

const makeRedis = () => {
    const store = new Map<string, string>();
    return {
        store,
        client: {
            get: jest.fn((key: string) =>
                Promise.resolve(store.get(key) ?? null),
            ),
            set: jest.fn((key: string, value: string) => {
                store.set(key, value);
                return Promise.resolve('OK');
            }),
            del: jest.fn((key: string) => {
                store.delete(key);
                return Promise.resolve(1);
            }),
        },
    };
};

const makeDeps = (document: BadgeCatalogDocument | null = null) => {
    let stored = document;
    // Моки — отдельными константами: по ним и проверяем вызовы, не
    // обращаясь к методам класса (unbound-method).
    const findByDomain = jest.fn(() => Promise.resolve(stored));
    const save = jest.fn(
        (_portalId: number, _domain: string, next: BadgeCatalogDocument) => {
            stored = next;
            return Promise.resolve(next);
        },
    );
    const repository = {
        findByDomain,
        save,
    } as unknown as PortalBadgesRepository;
    const portalRepository = {
        findById: jest.fn((id: number) =>
            Promise.resolve(id === PORTAL_ID ? { id, domain: DOMAIN } : null),
        ),
    };
    const redis = makeRedis();
    const service = new PortalBadgesService(
        repository,
        portalRepository as never,
        { getClient: () => redis.client } as never,
    );
    return { service, findByDomain, save, portalRepository, redis };
};

const draft = (over: Partial<BadgeDraft> = {}): BadgeDraft => ({
    code: 'aside_call_later',
    text: 'Просил перезвонить позже',
    target: EnumBadgeTarget.comment,
    tone: EnumBadgeTone.warning,
    outcomes: [EnumBadgeOutcome.setAside],
    planTypes: [],
    isDefault: false,
    sort: 10,
    isActive: true,
    ...over,
});

const ownDocument = (items: BadgeRecord[]): BadgeCatalogDocument => ({
    mode: EnumBadgeMode.own,
    items,
    version: 2,
    updatedAt: '2026-10-27T10:00:00.000Z',
    updatedBy: 447,
});

describe('PortalBadgesService — чтение для фрейма', () => {
    it('портал без документа — общий набор, режим default, версия 0', async () => {
        const { service } = makeDeps(null);

        const catalog = await service.resolve(DOMAIN);

        expect(catalog.mode).toBe(EnumBadgeMode.default);
        expect(catalog.version).toBe(0);
        expect(catalog.items).toHaveLength(DEFAULT_BADGES.length);
        expect(catalog.hash).toMatch(/^[0-9a-f]{40}$/);
    });

    it('режим own — только активные свои, отсортированные по sort', async () => {
        const { service } = makeDeps(
            ownDocument([
                {
                    ...draft({ code: 'b', sort: 20 }),
                    target: EnumBadgeTarget.comment,
                    tone: EnumBadgeTone.warning,
                    outcomes: [EnumBadgeOutcome.setAside],
                    planTypes: [],
                },
                {
                    ...draft({ code: 'a', sort: 10 }),
                    target: EnumBadgeTarget.comment,
                    tone: EnumBadgeTone.warning,
                    outcomes: [EnumBadgeOutcome.setAside],
                    planTypes: [],
                },
                {
                    ...draft({ code: 'off', sort: 5, isActive: false }),
                    target: EnumBadgeTarget.comment,
                    tone: EnumBadgeTone.warning,
                    outcomes: [],
                    planTypes: [],
                },
            ]),
        );

        const catalog = await service.resolve(DOMAIN);

        expect(catalog.mode).toBe(EnumBadgeMode.own);
        expect(catalog.items.map(item => item.code)).toEqual(['a', 'b']);
        expect(catalog.version).toBe(2);
    });

    /*
     * Свой набор сохранён, но режим — default: действует общий. Так
     * переключение туда-обратно ничего не теряет.
     */
    it('режим default при сохранённом своём наборе — действует общий', async () => {
        const { service } = makeDeps({
            ...ownDocument([
                {
                    ...draft(),
                    target: EnumBadgeTarget.comment,
                    tone: EnumBadgeTone.warning,
                    outcomes: [],
                    planTypes: [],
                },
            ]),
            mode: EnumBadgeMode.default,
        });

        const catalog = await service.resolve(DOMAIN);

        expect(catalog.items).toHaveLength(DEFAULT_BADGES.length);
    });

    it('второе чтение — из кэша, репозиторий не дёргается', async () => {
        const { service, findByDomain } = makeDeps(null);

        await service.resolve(DOMAIN);
        await service.resolve(DOMAIN);

        expect(findByDomain).toHaveBeenCalledTimes(1);
    });

    it('version отдаёт тот же hash, что полный каталог', async () => {
        const { service } = makeDeps(null);

        const full = await service.resolve(DOMAIN);
        const version = await service.getVersion(DOMAIN);

        expect(version).toEqual({ version: full.version, hash: full.hash });
    });

    it('hash не зависит от порядка привязок', async () => {
        const base = {
            ...draft(),
            target: EnumBadgeTarget.comment,
            tone: EnumBadgeTone.warning,
            planTypes: [],
        };
        const a = makeDeps(
            ownDocument([
                {
                    ...base,
                    outcomes: [
                        EnumBadgeOutcome.setAside,
                        EnumBadgeOutcome.inJob,
                    ],
                },
            ]),
        );
        const b = makeDeps(
            ownDocument([
                {
                    ...base,
                    outcomes: [
                        EnumBadgeOutcome.inJob,
                        EnumBadgeOutcome.setAside,
                    ],
                },
            ]),
        );

        expect((await a.service.resolve(DOMAIN)).hash).toBe(
            (await b.service.resolve(DOMAIN)).hash,
        );
    });
});

describe('PortalBadgesService — сохранение из админки', () => {
    it('сохраняет, поднимает версию и сбрасывает кэш домена', async () => {
        const { service, save, redis } = makeDeps(null);
        await service.resolve(DOMAIN); // кэш прогрет

        const saved = await service.save(PORTAL_ID, {
            mode: EnumBadgeMode.own,
            items: [draft()],
            updatedBy: 447,
        });

        expect(save).toHaveBeenCalledTimes(1);
        expect(saved.mode).toBe(EnumBadgeMode.own);
        expect(saved.version).toBe(1);
        expect(saved.updatedBy).toBe(447);
        expect(saved.defaults).toHaveLength(DEFAULT_BADGES.length);
        expect(redis.client.del).toHaveBeenCalledTimes(1);
        // После сброса фрейм видит новый набор.
        const catalog = await service.resolve(DOMAIN);
        expect(catalog.items.map(item => item.code)).toEqual([
            'aside_call_later',
        ]);
    });

    it('чужой портал — 404', async () => {
        const { service } = makeDeps(null);

        await expect(
            service.save(999, {
                mode: EnumBadgeMode.own,
                items: [],
                updatedBy: null,
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each([
        ['режим вне реестра', { mode: 'custom', items: [] }],
        [
            'пустой код',
            { mode: EnumBadgeMode.own, items: [draft({ code: ' ' })] },
        ],
        [
            'пустой текст',
            { mode: EnumBadgeMode.own, items: [draft({ text: '' })] },
        ],
        [
            'цель вне реестра',
            { mode: EnumBadgeMode.own, items: [draft({ target: 'footer' })] },
        ],
        [
            'цвет вне реестра',
            { mode: EnumBadgeMode.own, items: [draft({ tone: 'pink' })] },
        ],
        [
            'итог вне реестра',
            { mode: EnumBadgeMode.own, items: [draft({ outcomes: ['won'] })] },
        ],
        ['повтор кода', { mode: EnumBadgeMode.own, items: [draft(), draft()] }],
        [
            'у комментария типы события',
            {
                mode: EnumBadgeMode.own,
                items: [draft({ planTypes: [EnumBadgePlanType.warm] })],
            },
        ],
        [
            'у названия итоги работы',
            {
                mode: EnumBadgeMode.own,
                items: [
                    draft({
                        target: EnumBadgeTarget.title,
                        outcomes: [EnumBadgeOutcome.fail],
                    }),
                ],
            },
        ],
        [
            'isDefault у комментария',
            { mode: EnumBadgeMode.own, items: [draft({ isDefault: true })] },
        ],
        [
            'два основных на один тип',
            {
                mode: EnumBadgeMode.own,
                items: [
                    draft({
                        code: 't1',
                        target: EnumBadgeTarget.title,
                        outcomes: [],
                        planTypes: [EnumBadgePlanType.warm],
                        isDefault: true,
                    }),
                    draft({
                        code: 't2',
                        target: EnumBadgeTarget.title,
                        outcomes: [],
                        planTypes: [EnumBadgePlanType.warm],
                        isDefault: true,
                    }),
                ],
            },
        ],
    ])('отклоняет: %s', async (_title, input) => {
        const { service } = makeDeps(null);

        await expect(
            service.save(PORTAL_ID, { ...input, updatedBy: null } as never),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    // Выключенный основной не занимает тип: его место может взять другой.
    it('выключенный основной не мешает другому основному того же типа', async () => {
        const { service } = makeDeps(null);

        await expect(
            service.save(PORTAL_ID, {
                mode: EnumBadgeMode.own,
                items: [
                    draft({
                        code: 't1',
                        target: EnumBadgeTarget.title,
                        outcomes: [],
                        planTypes: [EnumBadgePlanType.warm],
                        isDefault: true,
                        isActive: false,
                    }),
                    draft({
                        code: 't2',
                        target: EnumBadgeTarget.title,
                        outcomes: [],
                        planTypes: [EnumBadgePlanType.warm],
                        isDefault: true,
                    }),
                ],
                updatedBy: null,
            }),
        ).resolves.toBeDefined();
    });

    it('обрезает пробелы и убирает повторы привязок', async () => {
        const { service } = makeDeps(null);

        const saved = await service.save(PORTAL_ID, {
            mode: EnumBadgeMode.own,
            items: [
                draft({
                    code: '  aside  ',
                    text: '  Просил перезвонить  ',
                    outcomes: [
                        EnumBadgeOutcome.setAside,
                        EnumBadgeOutcome.setAside,
                    ],
                }),
            ],
            updatedBy: null,
        });

        expect(saved.items[0]).toMatchObject({
            code: 'aside',
            text: 'Просил перезвонить',
            outcomes: [EnumBadgeOutcome.setAside],
        });
    });
});
