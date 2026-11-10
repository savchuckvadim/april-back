import type { PortalTranscriptionRoute } from '@lib/portal-lib/store/ai-settings/portal-transcription-route.types';
import {
    planTranscription,
    transcriptionLongMinSec,
    transcriptionStepName,
    type TranscriptionPlanInput,
} from '../provider/transcription-route.util';

/**
 * План распознавания звонка: кого и в каком порядке пробовать. Без маршрута
 * портала план повторяет прежние режимы роутера (их держит спека роутера), с
 * маршрутом — роли «длинные», «короткие», «запасные», «для скорости», «для
 * точности» (решение владельца 10.11.2026).
 */
const EMPTY_ROUTE: PortalTranscriptionRoute = {
    longMinSec: null,
    long: null,
    short: null,
    fallbacks: null,
    fast: null,
    precise: null,
    priority: null,
};

const route = (
    over: Partial<PortalTranscriptionRoute>,
): PortalTranscriptionRoute => ({ ...EMPTY_ROUTE, ...over });

const plan = (over: Partial<TranscriptionPlanInput>) =>
    planTranscription({
        durationSec: 120,
        mode: 'auto',
        route: null,
        defaultLongMinSec: 600,
        whisperConfigured: true,
        ...over,
    });

const providers = (over: Partial<TranscriptionPlanInput>) =>
    plan(over).steps.map(step => step.provider);

describe('planTranscription: режимы без маршрута — как раньше', () => {
    it('auto: короткий — VibeCode, затем Яндекс и свой Whisper', () => {
        expect(providers({ durationSec: 120 })).toEqual([
            'bitrix-vibecode',
            'yandex',
            'local-whisper',
        ]);
    });

    it('auto: длинный — Яндекс, затем VibeCode и свой Whisper', () => {
        expect(providers({ durationSec: 900 })).toEqual([
            'yandex',
            'bitrix-vibecode',
            'local-whisper',
        ]);
    });

    it('длительность неизвестна — звонок считается коротким', () => {
        expect(plan({ durationSec: undefined }).callClass).toBe('short');
    });

    it('своего Whisper нет — из запасных он выпадает', () => {
        expect(
            providers({ durationSec: 900, whisperConfigured: false }),
        ).toEqual(['yandex', 'bitrix-vibecode']);
    });

    it('auto-whisper: короткий — свой Whisper, затем Яндекс, VibeCode не зовём', () => {
        expect(providers({ mode: 'auto-whisper', durationSec: 120 })).toEqual([
            'local-whisper',
            'yandex',
        ]);
    });

    it('auto-whisper: длинный — Яндекс, затем свой Whisper; без Whisper — VibeCode', () => {
        expect(providers({ mode: 'auto-whisper', durationSec: 900 })).toEqual([
            'yandex',
            'local-whisper',
        ]);
        expect(
            providers({
                mode: 'auto-whisper',
                durationSec: 900,
                whisperConfigured: false,
            }),
        ).toEqual(['yandex', 'bitrix-vibecode']);
    });

    it('принудительные режимы: yandex и whisper — без запасных, vibecode — с запасными', () => {
        expect(providers({ mode: 'yandex' })).toEqual(['yandex']);
        expect(
            providers({ mode: 'whisper', whisperConfigured: false }),
        ).toEqual(['local-whisper']);
        expect(providers({ mode: 'vibecode', durationSec: 900 })).toEqual([
            'bitrix-vibecode',
            'yandex',
            'local-whisper',
        ]);
    });
});

describe('planTranscription: маршрут портала', () => {
    it('роль «короткие» с моделью — основной, запасные — от режима без повтора основного', () => {
        const result = plan({
            durationSec: 120,
            route: route({
                short: {
                    provider: 'local-whisper',
                    model: 'whisper-large-v3-turbo',
                },
            }),
        });
        expect(result.steps).toEqual([
            { provider: 'local-whisper', model: 'whisper-large-v3-turbo' },
            { provider: 'bitrix-vibecode', model: null },
            { provider: 'yandex', model: null },
        ]);
        expect(result.fromRoute).toBe(true);
        expect(result.callClass).toBe('short');
    });

    it('роль «длинные» задана, «короткие» нет — короткий идёт по режиму', () => {
        const longRoute = route({
            long: { provider: 'bitrix-vibecode', model: 'bitrix/x' },
        });
        expect(plan({ durationSec: 900, route: longRoute }).steps[0]).toEqual({
            provider: 'bitrix-vibecode',
            model: 'bitrix/x',
        });
        const short = plan({ durationSec: 120, route: longRoute });
        expect(short.steps[0]).toEqual({
            provider: 'bitrix-vibecode',
            model: null,
        });
        expect(short.fromRoute).toBe(false);
    });

    it('порог «длинного» из маршрута важнее порога приложения', () => {
        const r = route({ longMinSec: 300 });
        expect(plan({ durationSec: 400, route: r }).callClass).toBe('long');
        expect(transcriptionLongMinSec(r, 600)).toBe(300);
        expect(transcriptionLongMinSec(null, 600)).toBe(600);
    });

    it('свой список запасных заменяет запасные режима; пустой — без запасных', () => {
        expect(
            providers({
                route: route({
                    fallbacks: [{ provider: 'yandex', model: null }],
                }),
            }),
        ).toEqual(['bitrix-vibecode', 'yandex']);
        expect(providers({ route: route({ fallbacks: [] }) })).toEqual([
            'bitrix-vibecode',
        ]);
    });

    it('основной в списке запасных не повторяется', () => {
        expect(
            providers({
                route: route({
                    short: { provider: 'yandex', model: null },
                    fallbacks: [
                        { provider: 'yandex', model: null },
                        { provider: 'bitrix-vibecode', model: null },
                    ],
                }),
            }),
        ).toEqual(['yandex', 'bitrix-vibecode']);
    });

    it('тот же транскрибатор с другой моделью — разные шаги', () => {
        expect(
            plan({
                route: route({
                    short: { provider: 'local-whisper', model: 'turbo' },
                    fallbacks: [{ provider: 'local-whisper', model: 'large' }],
                }),
            }).steps,
        ).toEqual([
            { provider: 'local-whisper', model: 'turbo' },
            { provider: 'local-whisper', model: 'large' },
        ]);
    });

    it('приоритет «точность» — роль «для точности» на любой звонок', () => {
        const result = plan({
            durationSec: 120,
            route: route({
                priority: 'precise',
                precise: { provider: 'yandex', model: null },
                fast: { provider: 'local-whisper', model: 'turbo' },
            }),
        });
        expect(result.steps[0]).toEqual({ provider: 'yandex', model: null });
        expect(result.callClass).toBe('precise');
    });

    it('приоритет «скорость» без роли «для скорости» — обычная развилка по длительности', () => {
        const result = plan({
            durationSec: 900,
            route: route({ priority: 'fast' }),
        });
        expect(result.steps[0].provider).toBe('yandex');
        expect(result.callClass).toBe('long');
        expect(result.fromRoute).toBe(false);
    });

    it('роль «свой Whisper» без настроенного сервиса остаётся основной — её ошибка понятна', () => {
        expect(
            providers({
                whisperConfigured: false,
                route: route({
                    short: { provider: 'local-whisper', model: null },
                }),
            }),
        ).toEqual(['local-whisper', 'bitrix-vibecode', 'yandex']);
    });
});

describe('transcriptionStepName', () => {
    it('название для журнала — с моделью, если она задана', () => {
        expect(
            transcriptionStepName({
                provider: 'local-whisper',
                model: 'turbo',
            }),
        ).toBe('свой Whisper (turbo)');
        expect(transcriptionStepName({ provider: 'yandex', model: null })).toBe(
            'Yandex',
        );
    });
});
