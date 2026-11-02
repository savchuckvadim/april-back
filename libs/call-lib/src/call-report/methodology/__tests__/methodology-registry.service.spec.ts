import { MethodologyRegistryService } from '../methodology-registry.service';
import type { MethodologyRow } from '../methodology.repository';
import { POLYANSKY_METHODOLOGY } from '../polyansky.methodology';

const DOMAIN = 'gsr.bitrix24.ru';

const row = (over: Partial<MethodologyRow> = {}): MethodologyRow => ({
    id: '7f6a1c2e-0000-4000-8000-000000000007',
    code: 'polyansky',
    title: 'Полянский (gsr)',
    version: '1.2.0',
    scope: 'portal',
    portalDomain: DOMAIN,
    config: { ...POLYANSKY_METHODOLOGY, title: 'из конфига', version: '9.9.9' },
    isActive: true,
    updatedBy: 'vadim',
    updatedAt: new Date('2026-11-01T10:00:00.000Z'),
    ...over,
});

const makeService = (options: {
    code?: string | null;
    settingsError?: boolean;
    row?: MethodologyRow | null;
}) => {
    const repository = {
        findActive: jest.fn().mockResolvedValue(options.row ?? null),
        listAvailable: jest.fn().mockResolvedValue([]),
    };
    const portalAiSettings = {
        getByDomain: options.settingsError
            ? jest.fn().mockRejectedValue(new Error('db down'))
            : jest
                  .fn()
                  .mockResolvedValue(
                      options.code === undefined
                          ? null
                          : { methodologyCode: options.code },
                  ),
    };
    const service = new MethodologyRegistryService(
        repository as never,
        portalAiSettings as never,
    );
    return { service, repository, portalAiSettings };
};

/**
 * Реестр методик: код из настроек портала, строка таблицы важнее
 * встроенного конфига (колонки строки важнее полей конфига), битый конфиг —
 * откат на встроенный, неизвестный код — null, кэш и сброс.
 */
describe('MethodologyRegistryService.resolve', () => {
    it('на портале методика не выбрана — null, таблица не читается', async () => {
        const { service, repository } = makeService({ code: null });
        await expect(service.resolve(DOMAIN)).resolves.toBeNull();
        const blank = makeService({ code: '   ' });
        await expect(blank.service.resolve(DOMAIN)).resolves.toBeNull();
        const noRecord = makeService({});
        await expect(noRecord.service.resolve(DOMAIN)).resolves.toBeNull();
        expect(repository.findActive).not.toHaveBeenCalled();
    });

    it('ошибка чтения настроек — разбор без методики', async () => {
        const { service } = makeService({
            code: 'polyansky',
            settingsError: true,
        });
        await expect(service.resolve(DOMAIN)).resolves.toBeNull();
    });

    it('строки в таблице нет — встроенный конфиг кода с меткой code@version', async () => {
        const { service, repository } = makeService({ code: 'polyansky' });
        const resolved = await service.resolve(DOMAIN);
        expect(repository.findActive).toHaveBeenCalledWith('polyansky', DOMAIN);
        expect(resolved).toEqual({
            methodology: POLYANSKY_METHODOLOGY,
            scope: 'common',
            source: 'builtin',
            versionTag: 'polyansky@1.0.0',
        });
    });

    it('строка таблицы важнее встроенного; код, название и версия — из колонок строки', async () => {
        const { service } = makeService({ code: 'polyansky', row: row() });
        const resolved = await service.resolve(DOMAIN);
        expect(resolved).toMatchObject({
            scope: 'portal',
            source: 'table',
            versionTag: 'polyansky@1.2.0',
            methodology: {
                code: 'polyansky',
                title: 'Полянский (gsr)',
                version: '1.2.0',
                spirals: POLYANSKY_METHODOLOGY.spirals,
            },
        });
        expect(resolved?.methodology.checkpoints).toHaveLength(
            POLYANSKY_METHODOLOGY.checkpoints.length,
        );
    });

    it('битый конфиг строки — предупреждение и встроенный конфиг того же кода', async () => {
        const { service } = makeService({
            code: 'polyansky',
            row: row({ config: { code: 'polyansky', checkpoints: 'нет' } }),
        });
        await expect(service.resolve(DOMAIN)).resolves.toMatchObject({
            source: 'builtin',
            versionTag: 'polyansky@1.0.0',
        });
    });

    it('неизвестный код без строки и без встроенного — null', async () => {
        const { service } = makeService({ code: 'garant-own' });
        await expect(service.resolve(DOMAIN)).resolves.toBeNull();
        expect(service.builtin('garant-own')).toBeNull();
    });

    it('кэш на домен: повторный вызов не ходит в настройки; invalidate сбрасывает', async () => {
        const { service, portalAiSettings, repository } = makeService({
            code: 'polyansky',
        });
        await service.resolve(DOMAIN);
        await service.resolve(DOMAIN);
        expect(portalAiSettings.getByDomain).toHaveBeenCalledTimes(1);
        expect(repository.findActive).toHaveBeenCalledTimes(1);
        service.invalidate(DOMAIN);
        await service.resolve(DOMAIN);
        expect(portalAiSettings.getByDomain).toHaveBeenCalledTimes(2);
        service.invalidate();
        await service.resolve(DOMAIN);
        expect(portalAiSettings.getByDomain).toHaveBeenCalledTimes(3);
    });

    it('resolveByCode — для предпросмотра: таблица, иначе встроенная, без настройки портала', async () => {
        const { service, portalAiSettings } = makeService({ code: null });
        await expect(
            service.resolveByCode(DOMAIN, 'polyansky'),
        ).resolves.toMatchObject({
            source: 'builtin',
        });
        expect(portalAiSettings.getByDomain).not.toHaveBeenCalled();
    });
});

describe('MethodologyRegistryService.listOptions', () => {
    it('встроенные плюс строки таблицы: строка с тем же кодом перекрывает встроенную, битая — пропускается', async () => {
        const repository = {
            findActive: jest.fn(),
            listAvailable: jest.fn().mockResolvedValue([
                row({
                    scope: 'common',
                    portalDomain: null,
                    title: 'Полянский (таблица)',
                    version: '1.1.0',
                }),
                row({
                    id: '7f6a1c2e-0000-4000-8000-000000000008',
                    code: 'garant-own',
                    title: 'Своя гаранта',
                    version: '2.0.0',
                    config: {
                        code: 'garant-own',
                        title: 'Своя',
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
                    },
                }),
                row({
                    id: '7f6a1c2e-0000-4000-8000-000000000009',
                    code: 'broken',
                    title: 'Битая',
                    config: { code: 'broken' },
                }),
            ]),
        };
        const service = new MethodologyRegistryService(
            repository as never,
            { getByDomain: jest.fn() } as never,
        );

        const options = await service.listOptions(DOMAIN);

        expect(repository.listAvailable).toHaveBeenCalledWith(DOMAIN);
        expect(options.map(option => option.code)).toEqual([
            'polyansky',
            'garant-own',
        ]);
        expect(options[0]).toMatchObject({
            title: 'Полянский (таблица)',
            version: '1.1.0',
            scope: 'common',
            source: 'table',
            spiralsEnabled: true,
        });
        expect(options[0].checkpoints).toBe(
            POLYANSKY_METHODOLOGY.checkpoints.length,
        );
        expect(options[1]).toMatchObject({
            scope: 'portal',
            source: 'table',
            types: ['presentation'],
            checkpoints: 1,
            caps: 0,
            spiralsEnabled: false,
        });
    });

    it('таблицы нет — только встроенные', async () => {
        const { service } = makeService({ code: null });
        await expect(service.listOptions(DOMAIN)).resolves.toEqual([
            expect.objectContaining({
                code: 'polyansky',
                source: 'builtin',
                scope: 'common',
            }),
        ]);
    });
});
