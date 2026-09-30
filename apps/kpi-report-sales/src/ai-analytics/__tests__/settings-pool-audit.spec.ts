import { RequesterAccess } from '../domain/access/perimeter.util';
import {
    AI_POOL_CONSENT_AUDIT_CODE,
    poolConsentChangeOf,
} from '../domain/use-cases/settings-pool.util';
import {
    auditPayload,
    settingsSaveHarness,
} from './fixtures/settings-save.fixture';

/**
 * Согласие на пул в аудите сохранения настроек (Фаза 4): выдача и отзыв
 * пишутся отдельным изменением с автором правки, чтобы по данным можно было
 * установить, кто и когда включил портал в пул или вывел из него.
 */

/** 07.09.2026 00:30 МСК = 06.09 21:30Z — в TZ портала уже 7-е. */
const NOW = new Date('2026-09-06T21:30:00Z');
const DOMAIN = 'april.bitrix24.ru';
const op: RequesterAccess = { role: 'op', visibleManagerIds: ['10'] };
const base = { domain: DOMAIN, requesterUserId: '447' };

describe('poolConsentChangeOf', () => {
    it('блока нет или значение не изменилось — изменения нет', () => {
        expect(
            poolConsentChangeOf({ optIn: false, consentAt: null }, null),
        ).toBeNull();
        expect(
            poolConsentChangeOf(
                { optIn: false, consentAt: null },
                { optIn: false, consentAt: '' },
            ),
        ).toBeNull();
        // Дата прежнего согласия с временем — тот же день, изменения нет.
        expect(
            poolConsentChangeOf(
                { optIn: true, consentAt: '2026-01-15T10:00:00+03:00' },
                { optIn: true, consentAt: '2026-01-15' },
            ),
        ).toBeNull();
    });

    it('выдача и отзыв — было/стало, ряд не рвёт', () => {
        expect(
            poolConsentChangeOf(
                { optIn: false, consentAt: null },
                { optIn: true, consentAt: '2026-09-07' },
            ),
        ).toEqual({
            code: AI_POOL_CONSENT_AUDIT_CODE,
            before: JSON.stringify({ optIn: false, consentAt: '' }),
            after: JSON.stringify({ optIn: true, consentAt: '2026-09-07' }),
            breaksSeries: false,
        });
        expect(
            poolConsentChangeOf(
                { optIn: true, consentAt: '2026-01-15' },
                { optIn: false, consentAt: '' },
            ),
        ).toMatchObject({
            before: JSON.stringify({ optIn: true, consentAt: '2026-01-15' }),
            after: JSON.stringify({ optIn: false, consentAt: '' }),
        });
    });
});

describe('SettingsSaveUseCase: согласие на пул в аудите', () => {
    it('сохранение только блока pool — в аудите изменение согласия с автором', async () => {
        const { useCase, savePool, create } = settingsSaveHarness({
            poolOptIn: false,
            poolConsentAt: null,
        });

        const result = await useCase.execute(
            { ...base, pool: { optIn: true } },
            op,
            NOW,
        );

        expect(savePool).toHaveBeenCalledWith(DOMAIN, {
            optIn: true,
            consentAt: '2026-09-07',
        });
        const payload = auditPayload(create);
        expect(payload.author).toBe('447');
        expect(payload.changed).toEqual([
            {
                code: AI_POOL_CONSENT_AUDIT_CODE,
                before: JSON.stringify({ optIn: false, consentAt: '' }),
                after: JSON.stringify({ optIn: true, consentAt: '2026-09-07' }),
                breaksSeries: false,
            },
        ]);
        // Согласие ряд не рвёт: граница сравнимости и ответ не меняются.
        expect(result.breaksSeries).toEqual([]);
        expect(payload.comparableFromAfter).toBe(payload.comparableFromBefore);
    });

    it('отзыв согласия — в аудите прежняя дата согласия и пустая после', async () => {
        const { useCase, create } = settingsSaveHarness({
            poolOptIn: true,
            poolConsentAt: '2026-01-15',
        });

        await useCase.execute({ ...base, pool: { optIn: false } }, op, NOW);

        expect(auditPayload(create).changed).toEqual([
            expect.objectContaining({
                code: AI_POOL_CONSENT_AUDIT_CODE,
                before: JSON.stringify({
                    optIn: true,
                    consentAt: '2026-01-15',
                }),
                after: JSON.stringify({ optIn: false, consentAt: '' }),
            }),
        ]);
    });

    it('повторное включение при данном согласии — изменения в аудите нет', async () => {
        const { useCase, create } = settingsSaveHarness({
            poolOptIn: true,
            poolConsentAt: '2026-01-15',
        });

        await useCase.execute({ ...base, pool: { optIn: true } }, op, NOW);

        expect(auditPayload(create).changed).toEqual([]);
    });
});
