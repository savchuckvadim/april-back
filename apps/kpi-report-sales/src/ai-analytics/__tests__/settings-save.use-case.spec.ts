import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { RequesterAccess } from '../domain/access/perimeter.util';
import { SettingsSaveUseCase } from '../domain/use-cases/settings-save.use-case';
import { settingsLoaderWith } from './fixtures/lite-row.fixture';

/** 07.09.2026 00:30 МСК = 06.09 21:30Z — в TZ портала уже 7-е. */
const NOW = new Date('2026-09-06T21:30:00Z');
const DOMAIN = 'april.bitrix24.ru';

function makeUseCase() {
    const store = {
        saveLevels: jest
            .fn()
            .mockResolvedValue({ id: '90210', savedAt: NOW.toISOString() }),
    };
    const cache = { resetByPattern: jest.fn().mockResolvedValue(2) };
    const useCase = new SettingsSaveUseCase(
        settingsLoaderWith(),
        store as never,
        cache as never,
    );
    return { useCase, store, cache };
}

const op: RequesterAccess = { role: 'op', visibleManagerIds: ['10', '20'] };
const base = { domain: DOMAIN, requesterUserId: '447' };

describe('SettingsSaveUseCase', () => {
    it('сохраняет уровни в стор и сбрасывает overview/attention домена', async () => {
        const { useCase, store, cache } = makeUseCase();
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
        expect(store.saveLevels).toHaveBeenCalledWith(
            DOMAIN,
            [
                { managerId: 10, level: 'senior', since: '2025-03-01' },
                { managerId: 20, level: 'junior', since: null },
            ],
            '447',
            NOW,
        );
        expect(cache.resetByPattern).toHaveBeenCalledWith(
            `sales-ai-analytics:v1:${DOMAIN}:overview:*`,
        );
        expect(cache.resetByPattern).toHaveBeenCalledWith(
            `sales-ai-analytics:v1:${DOMAIN}:attention:*`,
        );
        expect(result).toEqual({
            id: '90210',
            levels: [
                { managerId: 10, level: 'senior', since: '2025-03-01' },
                { managerId: 20, level: 'junior' },
            ],
            savedAt: NOW.toISOString(),
            resetCount: 4,
        });
    });

    it('since = сегодня в TZ портала допустим, since > today → 400, стор не вызывается', async () => {
        const { useCase, store } = makeUseCase();
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
        expect(store.saveLevels).toHaveBeenCalledTimes(1);
    });

    it('managerId вне периметра → 403; дубль managerId → 400', async () => {
        const { useCase, store } = makeUseCase();
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
        expect(store.saveLevels).not.toHaveBeenCalled();
    });

    it('cup видит всех; пустой список — сброс к дефолту; ошибка кэша не отменяет сохранение', async () => {
        const { useCase, cache } = makeUseCase();
        cache.resetByPattern.mockRejectedValue(new Error('redis down'));
        const result = await useCase.execute(
            { ...base, levels: [] },
            { role: 'cup', visibleManagerIds: null },
            NOW,
        );
        expect(result.levels).toEqual([]);
        expect(result.resetCount).toBe(0);
    });
});
