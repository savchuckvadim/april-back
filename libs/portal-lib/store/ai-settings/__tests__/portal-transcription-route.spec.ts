import { Prisma } from 'generated/prisma';
import {
    AI_TRANSCRIPTION_MAX_FALLBACKS,
    normalizeTranscriptionRoute,
    normalizeTranscriptionSlot,
} from '../portal-transcription-route.types';
import {
    parseAiSettingsJson,
    toOrgNames,
    toProviderOrder,
    toUserIds,
} from '../portal-ai-settings.json.util';

/**
 * Маршрут распознавания портала хранится в JSON-колонке настроек: его пишет
 * админка, но в ту же колонку пишет и Laravel, поэтому разбор обязан
 * переживать мусор и не превращать «ничего не задано» в пустой объект.
 */
describe('normalizeTranscriptionSlot', () => {
    it('известный транскрибатор с моделью — роль; модель обрезается по краям', () => {
        expect(
            normalizeTranscriptionSlot({
                provider: 'local-whisper',
                model: '  whisper-large-v3  ',
            }),
        ).toEqual({ provider: 'local-whisper', model: 'whisper-large-v3' });
    });

    it('у Яндекса модель не хранится — он распознаёт своей', () => {
        expect(
            normalizeTranscriptionSlot({
                provider: 'yandex',
                model: 'general',
            }),
        ).toEqual({ provider: 'yandex', model: null });
    });

    it('незнакомый транскрибатор, не объект, пустая модель', () => {
        expect(normalizeTranscriptionSlot({ provider: 'deepgram' })).toBeNull();
        expect(normalizeTranscriptionSlot('yandex')).toBeNull();
        expect(normalizeTranscriptionSlot(null)).toBeNull();
        expect(
            normalizeTranscriptionSlot({
                provider: 'bitrix-vibecode',
                model: '   ',
            }),
        ).toEqual({ provider: 'bitrix-vibecode', model: null });
    });
});

describe('normalizeTranscriptionRoute', () => {
    it('ничего не задано — null, а не пустой маршрут', () => {
        expect(normalizeTranscriptionRoute(undefined)).toBeNull();
        expect(normalizeTranscriptionRoute({})).toBeNull();
        expect(normalizeTranscriptionRoute([])).toBeNull();
        expect(normalizeTranscriptionRoute({ priority: 'normal' })).toBeNull();
        expect(
            normalizeTranscriptionRoute({ short: { provider: 'deepgram' } }),
        ).toBeNull();
    });

    it('пустой список запасных — осознанное «без запасных», маршрут не пустой', () => {
        expect(normalizeTranscriptionRoute({ fallbacks: [] })).toMatchObject({
            fallbacks: [],
        });
    });

    it('запасные: мусор и повторы выбрасываются, не больше лимита', () => {
        const route = normalizeTranscriptionRoute({
            fallbacks: [
                { provider: 'yandex' },
                { provider: 'yandex', model: 'x' },
                { provider: 'local-whisper', model: 'a' },
                { provider: 'deepgram' },
                { provider: 'local-whisper', model: 'b' },
                { provider: 'bitrix-vibecode' },
            ],
        });
        expect(route?.fallbacks).toEqual([
            { provider: 'yandex', model: null },
            { provider: 'local-whisper', model: 'a' },
            { provider: 'local-whisper', model: 'b' },
        ]);
        expect(route?.fallbacks).toHaveLength(AI_TRANSCRIPTION_MAX_FALLBACKS);
    });

    it('порог «длинного» — целое в границах, иначе не задан', () => {
        expect(
            normalizeTranscriptionRoute({ longMinSec: 299.6 }),
        ).toMatchObject({ longMinSec: 300 });
        expect(normalizeTranscriptionRoute({ longMinSec: 5 })).toBeNull();
        expect(normalizeTranscriptionRoute({ longMinSec: '600' })).toBeNull();
    });

    it('приоритет — только известный; «скорость» без ролей тоже сохраняется', () => {
        expect(normalizeTranscriptionRoute({ priority: 'turbo' })).toBeNull();
        expect(normalizeTranscriptionRoute({ priority: 'fast' })).toMatchObject(
            { priority: 'fast', fast: null },
        );
    });
});

describe('parseAiSettingsJson', () => {
    const json = (value: Record<string, unknown>): Prisma.JsonValue =>
        value as Prisma.JsonValue;

    it('маршрут распознавания читается нормализованным; мусор — как не задан', () => {
        expect(
            parseAiSettingsJson(
                json({
                    transcriptionRoute: {
                        short: { provider: 'local-whisper', model: 'turbo' },
                    },
                }),
            ).transcriptionRoute,
        ).toMatchObject({
            short: { provider: 'local-whisper', model: 'turbo' },
        });
        expect(
            parseAiSettingsJson(json({ transcriptionRoute: 'yandex' }))
                .transcriptionRoute,
        ).toBeUndefined();
    });

    it('не объект в колонке — пустые настройки, чтение не падает', () => {
        expect(parseAiSettingsJson(null)).toEqual({});
        expect(parseAiSettingsJson(json({}))).toMatchObject({
            ownOrgNames: undefined,
        });
    });

    it('вынесенные из репозитория разборы работают как прежде', () => {
        expect(toOrgNames('Альфа-центр, апрель; Апрель\nА')).toEqual([
            'Альфа-центр',
            'апрель',
        ]);
        expect(
            toProviderOrder(['openai-compatible', 'vibecode', 'vibecode', 'x']),
        ).toEqual(['openai-compatible', 'vibecode']);
        expect(toProviderOrder('vibecode')).toBeNull();
        expect(toUserIds('12, 25 7;0')).toEqual([12, 25, 7]);
    });
});
