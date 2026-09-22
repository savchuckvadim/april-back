import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { RequesterAccess } from '../domain/access/perimeter.util';
import {
    lastArg,
    patchOf,
    settingsSaveHarness,
} from './fixtures/settings-save.fixture';

/** 07.09.2026 00:30 МСК = 06.09 21:30Z — в TZ портала уже 7-е. */
const NOW = new Date('2026-09-06T21:30:00Z');
const DOMAIN = 'april.bitrix24.ru';

const op: RequesterAccess = { role: 'op', visibleManagerIds: ['10', '20'] };
const base = { domain: DOMAIN, requesterUserId: '447' };

describe('SettingsSaveUseCase: уровни (переезд на ключ схемы)', () => {
    it('пишет уровни в ключ схемы и сбрасывает overview/attention/model/plan/settings', async () => {
        const { useCase, savePortalSettings, resetByPattern } =
            settingsSaveHarness();

        const result = await useCase.execute(
            {
                ...base,
                levels: [
                    { managerId: 10, level: 'senior', since: '2025-03-01' },
                    { managerId: 20, level: 'junior' },
                ],
            },
            op,
            NOW,
        );

        expect(savePortalSettings).toHaveBeenCalledTimes(1);
        expect(lastArg(savePortalSettings, 0)).toBe(DOMAIN);
        expect(Object.keys(patchOf(savePortalSettings))).toEqual(['levels']);
        const savedLevels = JSON.parse(
            patchOf(savePortalSettings).levels,
        ) as unknown;
        expect(savedLevels).toEqual([
            {
                managerId: 10,
                level: 'senior',
                since: '2025-03-01',
                source: 'manual',
            },
            { managerId: 20, level: 'junior', since: null, source: 'manual' },
        ]);
        for (const scope of [
            'overview',
            'attention',
            'model',
            'plan',
            'settings',
        ]) {
            expect(resetByPattern).toHaveBeenCalledWith(
                `sales-ai-analytics:v1:${DOMAIN}:${scope}:*`,
            );
        }
        expect(result).toMatchObject({
            id: '90210',
            levels: [
                { managerId: 10, level: 'senior', since: '2025-03-01' },
                { managerId: 20, level: 'junior' },
            ],
            savedAt: NOW.toISOString(),
            resetCount: 10,
            breaksSeries: [],
        });
        expect(result.paramsVersion).toMatch(/^[0-9a-f]{64}$/);
    });

    it('since = сегодня в TZ портала допустим, since > today → 400 без записи', async () => {
        const { useCase, savePortalSettings } = settingsSaveHarness();

        await expect(
            useCase.execute(
                {
                    ...base,
                    levels: [
                        { managerId: 10, level: 'middle', since: '2026-09-07' },
                    ],
                },
                op,
                NOW,
            ),
        ).resolves.toBeDefined();
        await expect(
            useCase.execute(
                {
                    ...base,
                    levels: [
                        { managerId: 10, level: 'middle', since: '2026-09-08' },
                    ],
                },
                op,
                NOW,
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(savePortalSettings).toHaveBeenCalledTimes(1);
    });

    it('managerId вне периметра → 403; дубль managerId → 400', async () => {
        const { useCase, savePortalSettings } = settingsSaveHarness();

        await expect(
            useCase.execute(
                { ...base, levels: [{ managerId: 30, level: 'middle' }] },
                op,
                NOW,
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            useCase.execute(
                {
                    ...base,
                    levels: [
                        { managerId: 10, level: 'middle' },
                        { managerId: 10, level: 'senior' },
                    ],
                },
                op,
                NOW,
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(savePortalSettings).not.toHaveBeenCalled();
    });

    it('cup видит всех; пустой список — сброс; ошибка кэша не отменяет запись', async () => {
        const { useCase, resetByPattern, create } = settingsSaveHarness();
        resetByPattern.mockRejectedValue(new Error('redis down'));

        const result = await useCase.execute(
            { ...base, levels: [] },
            { role: 'cup', visibleManagerIds: null },
            NOW,
        );

        expect(result.levels).toEqual([]);
        expect(result.resetCount).toBe(0);
        expect(create).toHaveBeenCalledTimes(1);
    });
});
