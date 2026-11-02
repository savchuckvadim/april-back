import { ConflictException, NotFoundException } from '@nestjs/common';
import { MethodologyAdminService } from '../methodology-admin.service';
import type { MethodologyRow } from '../methodology.repository';
import { POLYANSKY_METHODOLOGY } from '../polyansky.methodology';

const DOMAIN = 'gsr.bitrix24.ru';
const OWN_CONFIG = {
    code: 'garant-own',
    title: 'Своя гаранта',
    version: '2.0.0',
    types: ['presentation'],
    checkpoints: [
        {
            code: 'pres.own',
            title: 'Свой пункт',
            types: ['presentation'],
            evidence: 'fact',
            mandatory: true,
        },
    ],
};

const row = (over: Partial<MethodologyRow> = {}): MethodologyRow => ({
    id: '7f6a1c2e-0000-4000-8000-000000000008',
    code: 'garant-own',
    title: 'Своя гаранта',
    version: '2.0.0',
    scope: 'portal',
    portalDomain: DOMAIN,
    config: OWN_CONFIG,
    isActive: true,
    updatedBy: 'vadim',
    updatedAt: new Date('2026-11-01T10:00:00.000Z'),
    ...over,
});

const makeService = (rows: MethodologyRow[] = []) => {
    const repository = {
        listRows: jest.fn().mockResolvedValue(rows),
        findById: jest.fn((id: string) =>
            Promise.resolve(rows.find(item => item.id === id) ?? null),
        ),
        upsert: jest.fn((input: Record<string, unknown>) =>
            Promise.resolve(
                row({
                    id: (input.id as string | null) ?? 'new-uuid',
                    code: input.code as string,
                    title: input.title as string,
                    version: input.version as string,
                    scope: input.scope as MethodologyRow['scope'],
                    portalDomain: input.portalDomain as string | null,
                    config: input.config,
                    isActive: input.isActive as boolean,
                    updatedBy: input.updatedBy as string | null,
                }),
            ),
        ),
        findActive: jest.fn(),
        listAvailable: jest.fn(),
    };
    const registry = { invalidate: jest.fn() };
    const service = new MethodologyAdminService(
        repository as never,
        registry as never,
    );
    return { service, repository, registry };
};

/**
 * Редактор методик: список из таблицы и встроенных, карточка строки и
 * встроенной, проверка конфига, сохранение с проверкой и сбросом кэша,
 * каталог брифа.
 */
describe('MethodologyAdminService', () => {
    it('list: строки таблицы плюс встроенные без строки в общем слое; битая строка помечена', async () => {
        const { service, repository } = makeService([
            row(),
            row({
                id: 'broken',
                code: 'broken',
                title: 'Битая',
                scope: 'common',
                portalDomain: null,
                config: { code: 'broken' },
            }),
        ]);
        const items = await service.list(DOMAIN);
        expect(repository.listRows).toHaveBeenCalledWith(DOMAIN);
        expect(items.map(item => [item.code, item.source, item.valid])).toEqual(
            [
                ['broken', 'table', false],
                ['polyansky', 'builtin', true],
                ['garant-own', 'table', true],
            ],
        );
        expect(items.find(item => item.code === 'garant-own')).toMatchObject({
            checkpoints: 1,
            caps: 0,
            isActive: true,
        });
    });

    it('list: строка общего слоя с кодом встроенной перекрывает встроенную', async () => {
        const { service } = makeService([
            row({
                id: 'p',
                code: 'polyansky',
                title: 'Полянский (таблица)',
                scope: 'common',
                portalDomain: null,
                config: POLYANSKY_METHODOLOGY,
            }),
        ]);
        const items = await service.list(null);
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            source: 'table',
            title: 'Полянский (таблица)',
        });
    });

    it('detail: строка по id с конфигом; встроенная по коду; нет — 404', async () => {
        const { service } = makeService([row()]);
        const own = await service.detail(
            '7f6a1c2e-0000-4000-8000-000000000008',
            null,
        );
        expect(own.config.checkpoints).toHaveLength(1);
        expect(own.errors).toEqual([]);
        expect(own.versionTag).toBe('garant-own@2.0.0');

        const builtin = await service.detail(null, 'polyansky');
        expect(builtin).toMatchObject({
            id: null,
            source: 'builtin',
            versionTag: 'polyansky@1.0.0',
        });
        expect(builtin.config).toEqual(POLYANSKY_METHODOLOGY);

        await expect(service.detail('nope', null)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        await expect(service.detail(null, 'nope')).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it('detail: битый конфиг строки — ошибки и каркас конфига из колонок', async () => {
        const { service } = makeService([
            row({
                id: 'b',
                code: 'broken',
                title: 'Битая',
                config: { code: 'broken', checkpoints: 'нет' },
            }),
        ]);
        const detail = await service.detail('b', null);
        expect(detail.valid).toBe(false);
        expect(detail.errors.length).toBeGreaterThan(0);
        expect(detail.config).toMatchObject({
            code: 'broken',
            title: 'Битая',
            checkpoints: [],
        });
    });

    it('validate: ошибки по-русски либо сводка', () => {
        const { service } = makeService();
        expect(service.validate({ code: 'x' })).toMatchObject({
            ok: false,
            summary: null,
        });
        expect(service.validate(OWN_CONFIG)).toEqual({
            ok: true,
            errors: [],
            summary: {
                code: 'garant-own',
                title: 'Своя гаранта',
                version: '2.0.0',
                types: ['presentation'],
                checkpoints: 1,
                caps: 0,
                spiralsEnabled: false,
            },
        });
    });

    it('save: невалидный конфиг и методика портала без домена — 409; успех — upsert и сброс кэша', async () => {
        const { service, repository, registry } = makeService();
        await expect(
            service.save({
                id: null,
                scope: 'portal',
                portalDomain: DOMAIN,
                isActive: true,
                config: { code: 'x' },
                updatedBy: 'v',
            }),
        ).rejects.toBeInstanceOf(ConflictException);
        await expect(
            service.save({
                id: null,
                scope: 'portal',
                portalDomain: null,
                isActive: true,
                config: OWN_CONFIG,
                updatedBy: 'v',
            }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(repository.upsert).not.toHaveBeenCalled();

        const saved = await service.save({
            id: null,
            scope: 'portal',
            portalDomain: DOMAIN,
            isActive: true,
            config: { ...OWN_CONFIG, extra: 'мусор' },
            updatedBy: 'vadim',
        });
        expect(repository.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                id: null,
                code: 'garant-own',
                title: 'Своя гаранта',
                version: '2.0.0',
                scope: 'portal',
                portalDomain: DOMAIN,
                isActive: true,
                updatedBy: 'vadim',
            }),
        );
        const upsertConfig = repository.upsert.mock.calls[0][0] as {
            config: Record<string, unknown>;
        };
        expect(upsertConfig.config).not.toHaveProperty('extra');
        expect(registry.invalidate).toHaveBeenCalledTimes(1);
        expect(saved).toMatchObject({
            id: 'new-uuid',
            source: 'table',
            valid: true,
        });
    });

    it('save общего слоя: домен не пишется даже если передан', async () => {
        const { service, repository } = makeService();
        await service.save({
            id: 'p',
            scope: 'common',
            portalDomain: DOMAIN,
            isActive: false,
            config: OWN_CONFIG,
            updatedBy: null,
        });
        expect(repository.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'p',
                scope: 'common',
                portalDomain: null,
                isActive: false,
            }),
        );
    });

    it('catalog: подписи для всех фактов и операций, пункты Полянского с пометкой правила, ограничители ядра', () => {
        const { service } = makeService();
        const catalog = service.catalog();
        expect(
            catalog.callTypes.find(t => t.code === 'presentation')?.title,
        ).toBe('Презентация');
        expect(catalog.sections).toHaveLength(7);
        expect(catalog.factFields.every(f => f.title.length > 0)).toBe(true);
        expect(
            catalog.conditionOps.find(o => o.code === 'checkpoint_missed')
                ?.title,
        ).toBe('пункт пропущен');
        expect(catalog.capTargets.find(t => t.code === 'total')?.title).toBe(
            'Итоговая оценка',
        );
        expect(
            catalog.checkpoints.find(c => c.code === 'pres.spirals_min'),
        ).toMatchObject({ byRule: true, source: 'polyansky' });
        expect(
            catalog.checkpoints.find(c => c.code === 'pres.needs_confirmed')
                ?.byRule,
        ).toBe(false);
        expect(catalog.coreCaps.length).toBeGreaterThan(0);
    });
});
