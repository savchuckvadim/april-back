import type {
    AiTranscriptionSlot,
    PortalTranscriptionRoute,
} from '@lib/portal-lib/store/ai-settings/portal-transcription-route.types';
import type {
    TranscriptionProvider,
    TranscriptionRouterMode,
} from './transcription-provider.types';

/** Шаг маршрута: транскрибатор и модель (null — его модель по умолчанию). */
export interface TranscriptionStep {
    provider: TranscriptionProvider;
    model: string | null;
}

/** Роль, по которой выбран основной транскрибатор звонка. */
export type TranscriptionCallClass = 'long' | 'short' | 'fast' | 'precise';

export interface TranscriptionPlan {
    /** Кого пробовать по порядку: первый — основной, дальше запасные. */
    steps: TranscriptionStep[];
    callClass: TranscriptionCallClass;
    /** Основной взят из маршрута портала, а не из режима приложения. */
    fromRoute: boolean;
}

export interface TranscriptionPlanInput {
    /** Длительность звонка, секунд; неизвестна — звонок считается коротким. */
    durationSec: number | undefined;
    /** Режим портала или приложения — основа, поверх которой ложится маршрут. */
    mode: TranscriptionRouterMode;
    route: PortalTranscriptionRoute | null;
    /** Порог «длинного» звонка приложения, секунд. */
    defaultLongMinSec: number;
    /** Есть ли Whisper-совместимый сервис у портала или приложения. */
    whisperConfigured: boolean;
}

const YANDEX: TranscriptionProvider = 'yandex';
const VIBECODE: TranscriptionProvider = 'bitrix-vibecode';
const WHISPER: TranscriptionProvider = 'local-whisper';

/**
 * Кого и в каком порядке пробует РЕЖИМ (то, как роутер работал до
 * маршрута): первый — основной, остальные — запасные.
 *
 * `auto-whisper` на длинном звонке уходит на свой Whisper, а без него — на
 * VibeCode: режим задуман как «без VibeCode», но оставить длинный звонок
 * вовсе без запасного хуже.
 */
function modeChain(
    mode: TranscriptionRouterMode,
    isLong: boolean,
    whisperConfigured: boolean,
): TranscriptionProvider[] {
    switch (mode) {
        case 'yandex':
            return [YANDEX];
        case 'whisper':
            return [WHISPER];
        case 'vibecode':
            return [VIBECODE, YANDEX, WHISPER];
        case 'auto-whisper':
            if (!isLong) return [WHISPER, YANDEX];
            return whisperConfigured ? [YANDEX, WHISPER] : [YANDEX, VIBECODE];
        default:
            return isLong
                ? [YANDEX, VIBECODE, WHISPER]
                : [VIBECODE, YANDEX, WHISPER];
    }
}

/** Как транскрибатор называется в журнале. */
const PROVIDER_LOG_NAME: Record<TranscriptionProvider, string> = {
    yandex: 'Yandex',
    'bitrix-vibecode': 'Vibecode',
    'local-whisper': 'свой Whisper',
};

/** Шаг для журнала: «свой Whisper (whisper-large-v3)». */
export const transcriptionStepName = (step: TranscriptionStep): string =>
    step.model
        ? `${PROVIDER_LOG_NAME[step.provider]} (${step.model})`
        : PROVIDER_LOG_NAME[step.provider];

const stepKey = (step: TranscriptionStep): string =>
    `${step.provider}|${step.model ?? ''}`;

const toStep = (slot: AiTranscriptionSlot): TranscriptionStep => ({
    provider: slot.provider,
    model: slot.model,
});

/**
 * Порог «длинного» звонка: маршрут портала важнее порога приложения.
 * Отдельной функцией — её же зовёт чек-лист админки.
 */
export const transcriptionLongMinSec = (
    route: PortalTranscriptionRoute | null,
    defaultLongMinSec: number,
): number => route?.longMinSec ?? defaultLongMinSec;

/**
 * План распознавания одного звонка — чистая функция, одна на роутер и на
 * чек-лист админки, чтобы «что действует» считалось одинаково.
 *
 * Основной: при приоритете «скорость» / «точность» — соответствующая роль
 * маршрута (если задана), иначе роль по длительности (`long` / `short`), а
 * если не задана и она — основной режима.
 * Запасные: список маршрута, а если он не задан — запасные режима.
 * Whisper-совместимый сервис, которого нет, из запасных выпадает: звать его
 * незачем, а ошибку должен отдать тот, кто действительно отвечал.
 */
export function planTranscription(
    input: TranscriptionPlanInput,
): TranscriptionPlan {
    const { route, mode, whisperConfigured } = input;
    const isLong =
        input.durationSec !== undefined &&
        input.durationSec >=
            transcriptionLongMinSec(route, input.defaultLongMinSec);
    const base = modeChain(mode, isLong, whisperConfigured).map(
        (provider): TranscriptionStep => ({ provider, model: null }),
    );

    const priority = route?.priority ?? 'normal';
    const prioritySlot =
        priority === 'fast'
            ? (route?.fast ?? null)
            : priority === 'precise'
              ? (route?.precise ?? null)
              : null;
    const durationSlot = (isLong ? route?.long : route?.short) ?? null;
    const primarySlot = prioritySlot ?? durationSlot;
    const callClass: TranscriptionCallClass = prioritySlot
        ? (priority as 'fast' | 'precise')
        : isLong
          ? 'long'
          : 'short';

    const primary = primarySlot ? toStep(primarySlot) : base[0];
    const fallbacks = route?.fallbacks
        ? route.fallbacks.map(toStep)
        : base.filter(step => step.provider !== primary.provider);

    const seen = new Set<string>();
    const steps = [primary, ...fallbacks].filter((step, index) => {
        if (seen.has(stepKey(step))) return false;
        seen.add(stepKey(step));
        // Основной остаётся и ненастроенным: его ошибка — понятный сигнал.
        return index === 0 || step.provider !== WHISPER || whisperConfigured;
    });
    return { steps, callClass, fromRoute: primarySlot !== null };
}
