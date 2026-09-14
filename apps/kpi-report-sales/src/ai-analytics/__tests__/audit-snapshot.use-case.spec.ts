import {
    DEFAULT_WORK_CALENDAR,
    defaultDefinitions,
    type AiPortalDefinitions,
} from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_AUDIT_SNAPSHOT_MONTHS } from '../constants/ai-analytics.const';
import { AuditSnapshotUseCase } from '../domain/use-cases/audit-snapshot.use-case';

const NOW = new Date('2026-09-01T01:10:00Z');

function makeUseCase(overrides?: Partial<AiPortalDefinitions>) {
    const audit = {
        run: jest.fn().mockResolvedValue({
            generatedAt: NOW.toISOString(),
            report: { totals: { calls: 12, analyzed: 7 } },
        }),
    };
    const settings = {
        load: jest.fn().mockResolvedValue({
            calendar: { ...DEFAULT_WORK_CALENDAR, timeZone: 'Europe/Moscow' },
            definitions: { ...defaultDefinitions(), ...overrides },
            modelParams: {},
        }),
    };
    return {
        useCase: new AuditSnapshotUseCase(audit as never, settings as never),
        audit,
        settings,
    };
}

describe('AuditSnapshotUseCase — месячный снапшот аудита Фазы 0', () => {
    afterEach(() => jest.clearAllMocks());

    it('окно, TZ портала и итоги отчёта попадают в результат', async () => {
        const { useCase, audit } = makeUseCase();

        const result = await useCase.execute(
            { domain: 'april.bitrix24.ru', monthKey: '2026-09' },
            NOW,
        );

        expect(result).toEqual({
            domain: 'april.bitrix24.ru',
            monthKey: '2026-09',
            generatedAt: NOW.toISOString(),
            calls: 12,
            analyzed: 7,
        });
        expect(audit.run).toHaveBeenCalledWith(
            'april.bitrix24.ru',
            expect.objectContaining({
                months: AI_ANALYTICS_AUDIT_SNAPSHOT_MONTHS,
                timeZone: 'Europe/Moscow',
                save: true,
                source: 'cron',
                now: NOW,
            }),
        );
    });

    // Решение владельца А.1 (план §14.5 п.1): порог у пульса, конвейера
    // разбора и аудита Фазы 0 — один; в аудит уходит минимум карты, потому
    // что тип звонка в доле коротких не участвует (находка M12).
    it('портальный порог доезжает до отчёта: минимум карты min_duration_sec_by_type', async () => {
        const { useCase, audit } = makeUseCase({
            minDurationSecByType: {
                ...defaultDefinitions().minDurationSecByType,
                cold: 60,
            },
        });

        await useCase.execute(
            { domain: 'april.bitrix24.ru', monthKey: '2026-09' },
            NOW,
        );

        expect(audit.run).toHaveBeenCalledWith(
            'april.bitrix24.ru',
            expect.objectContaining({ shortCallSec: 60 }),
        );
    });

    it('портал ничего не решал — прежний порог 300 с', async () => {
        const { useCase, audit } = makeUseCase();

        await useCase.execute(
            { domain: 'april.bitrix24.ru', monthKey: '2026-09' },
            NOW,
        );

        expect(audit.run).toHaveBeenCalledWith(
            'april.bitrix24.ru',
            expect.objectContaining({ shortCallSec: 300 }),
        );
    });
});
