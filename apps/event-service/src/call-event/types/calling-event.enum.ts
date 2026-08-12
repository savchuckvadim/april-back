/**
 * Енумы входного события звонка (отдел сервиса). Убирают магические строки из
 * DTO и flow-сервисов. Коды коммуникации/инициативы/типа события соответствуют
 * кодам списка ОРК-история без префиксов `ec_ork_`/`ei_ork_`/`et_ork_`
 * (см. libs/portal-lib/pbx/pbx-ork-history-bx-list).
 */

/** Итоговый статус отчёта по звонку. */
export enum CallingResultStatus {
    /** Результативный звонок */
    result = 'result',
    /** Нерезультативный звонок */
    noresult = 'noresult',
    /** Просрочен */
    expired = 'expired',
    /** Новый */
    new = 'new',
    /** Отменён */
    cancel = 'cancel',
}

/** Тип коммуникации (DTO-код, маппится в `ec_ork_<code>`). */
export enum CallingCommunicationType {
    call = 'call',
    face = 'face',
    mail = 'mail',
    edo = 'edo',
    signal = 'signal',
}

/** Инициатива коммуникации (DTO-код, маппится в `ei_ork_<code>`). */
export enum CallingInitiative {
    incoming = 'incoming',
    outgoing = 'outgoing',
}

/**
 * Тип события плана/отчёта (DTO-код, маппится в `et_ork_<code>`).
 * Часть кодов исторически переименовывается перед записью в ОРК-историю:
 * `pere_long → complect_up_work`, `commer → info` (см. {@link CALLING_EVENT_TYPE_ALIASES}).
 */
export enum CallingEventType {
    signal = 'signal',
    info = 'info',
    presentation = 'presentation',
    edu = 'edu',
    edu_first = 'edu_first',
    complect_up_work = 'complect_up_work',
    pere_long = 'pere_long',
    commer = 'commer',
}

/**
 * Алиасы DTO-кодов типа события → коды ОРК-истории (legacy normalize).
 */
export const CALLING_EVENT_TYPE_ALIASES: Readonly<Record<string, string>> =
    Object.freeze({
        [CallingEventType.pere_long]: CallingEventType.complect_up_work,
        [CallingEventType.commer]: CallingEventType.info,
    });

/** Нормализует DTO-код типа события в код ОРК-истории (без префикса). */
export function normalizeCallingEventType(code: string): string {
    return CALLING_EVENT_TYPE_ALIASES[code] ?? code;
}

/** Флаги результатов отчёта (легаси-четвёрка). */
export interface ICallingResultFlags {
    edu: boolean;
    edu_first: boolean;
    presentation: boolean;
    signal: boolean;
}

/** Элемент ворклиста спонтанных записей («Запланирован» + «Состоялся»). */
export interface ICallingResultWorkItem {
    code: string;
    name: string;
    /** true — из легаси-флагов results, false — из report.spontaneous */
    legacy: boolean;
}

const LEGACY_RESULT_FLAGS: ReadonlyArray<{
    flag: keyof ICallingResultFlags;
    name: string;
}> = [
    { flag: 'edu', name: 'Обучение' },
    { flag: 'edu_first', name: 'Обучение первичное' },
    { flag: 'presentation', name: 'Презентация' },
    { flag: 'signal', name: 'Сервисный сигнал' },
];

/**
 * Собирает ворклист спонтанных событий: 4 легаси-флага results + элементы
 * report.spontaneous (любой доступный тип), с дедупом по коду и пропуском
 * типа текущей задачи. Тип текущей задачи сравнивается и по исходному, и по
 * ремапнутому коду — legacy record_noresult мутирует eventType на месте.
 */
export function collectCallingResultWorklist(
    results: ICallingResultFlags,
    spontaneous: Array<{ code: string; name: string }> | undefined,
    currentTaskEventType: string | undefined,
): ICallingResultWorkItem[] {
    const isCurrent = (code: string): boolean =>
        currentTaskEventType !== undefined &&
        [code, normalizeCallingEventType(code)].includes(currentTaskEventType);

    const worklist = new Map<string, ICallingResultWorkItem>();
    for (const { flag, name } of LEGACY_RESULT_FLAGS) {
        if (results[flag] && !isCurrent(flag)) {
            worklist.set(flag, { code: flag, name, legacy: true });
        }
    }
    for (const item of spontaneous ?? []) {
        if (worklist.has(item.code) || isCurrent(item.code)) continue;
        worklist.set(item.code, {
            code: item.code,
            name: item.name,
            legacy: false,
        });
    }
    return [...worklist.values()];
}
