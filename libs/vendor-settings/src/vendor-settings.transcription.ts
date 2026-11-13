import type { VendorSettingDefinition } from './vendor-settings.registry';
import {
    type IntegerSettingRule,
    integerInRange,
} from './vendor-settings.validators';

/**
 * Цена распознавания для подсчёта расхода по порталам в админке
 * (13.11.2026, «какой портал сколько денег съел»). Платный распознаватель
 * один — Yandex SpeechKit; VibeCode и свой Whisper мы не оплачиваем.
 *
 * Цена — в копейках за минуту, а не в рублях за секунду: настройки админки
 * целочисленные. Тариф Яндекса на 13.11.2026 — 0,01 ₽ за секунду
 * асинхронного распознавания (60 копеек за минуту), отложенный режим —
 * 0,0025 ₽ (15 копеек).
 */
export const TRANSCRIPTION_SPEND_SETTING_RULES = {
    YANDEX_STT_KOPECKS_PER_MINUTE: { min: 1, max: 100_000, defaultValue: 60 },
} as const satisfies Record<string, IntegerSettingRule>;

export const TRANSCRIPTION_SPEND_SETTING_KEYS = [
    'YANDEX_STT_KOPECKS_PER_MINUTE',
] as const;

export const TRANSCRIPTION_SPEND_SETTINGS: readonly VendorSettingDefinition[] =
    [
        {
            key: 'YANDEX_STT_KOPECKS_PER_MINUTE',
            group: 'llm-gateway',
            label: 'Яндекс: цена минуты распознавания, копеек',
            description:
                'Сколько стоит минута записи в Yandex SpeechKit. По ней админка считает расход на распознавание по порталам: в сводке статистики и в карточке портала. Звонок короче 15 секунд Яндекс считает как 15 секунд. Остальные распознаватели (VibeCode, свой Whisper) считаются бесплатными. По умолчанию 60 копеек — 0,01 ₽ за секунду, тариф асинхронного распознавания на ноябрь 2026.',
            howTo: 'Цена — в тарифах SpeechKit на yandex.cloud или в детализации счёта. Действует в течение минуты, перезапуск не нужен; пересчитываются и прошлые месяцы.',
            secret: false,
            example: '60',
            defaultValue: '60',
            validate: integerInRange(
                TRANSCRIPTION_SPEND_SETTING_RULES.YANDEX_STT_KOPECKS_PER_MINUTE,
            ),
        },
    ];
