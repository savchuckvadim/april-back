import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    PRESENTATION_SMART_FIELDS,
    PRESENTATION_SMART_SURVEY_MIRROR,
    PresentationSmartFieldCode,
    PresentationSmartFieldDef,
} from '@lib/portal-lib/pbx/pbx-presentation-smart';
import {
    presentationSurveyAnswersByCode,
    PresentationSurveyValues,
} from '../../shared/presentation-survey';

/** Снимок анкеты: код поля смарта → готовое к записи значение. */
export type PresentationSurveySnapshot = Partial<
    Record<PresentationSmartFieldCode, string>
>;

/** Тип поля смарта по коду — нужен для нормализации булевых ответов. */
const FIELD_TYPE_BY_CODE = new Map<string, PresentationSmartFieldDef['type']>(
    (PRESENTATION_SMART_FIELDS as readonly PresentationSmartFieldDef[]).map(
        def => [def.code, def.type],
    ),
);

/** Значения, которые Bitrix отдаёт для «да» в булевых UF разных сущностей. */
const TRUTHY = new Set(['1', 'y', 'yes', 'true']);

export interface PresentationSurveyInput {
    portal: PortalModel;
    /**
     * ПРИОРИТЕТНЫЙ источник — ответы анкеты из PAYLOAD отчёта
     * (`presentation.survey`, нормализованные контекстом). Их прислал тот
     * самый отчёт, который сейчас исполняется: свежее них по определению
     * ничего нет. Нет блока в payload (старые сборки фрейма) — снимок
     * собирается по сущностям, как раньше.
     */
    survey?: PresentationSurveyValues | null;
    /** Сырая строка лида: там живут «5К» (в т.ч. девять детальных ответов). */
    lead: Record<string, unknown> | null;
    /** Сырая строка БАЗОВОЙ сделки: там живут вопросы «Разговора» (op_xvost_*). */
    baseDeal: Record<string, unknown> | null;
}

/**
 * Снимок анкеты презентации («5К» + «Хвост») для элемента смарта.
 *
 * ПОРЯДОК ИСТОЧНИКОВ — явный, первое непустое значение побеждает:
 *  1. PAYLOAD отчёта — новый путь. Анкета едет вместе с отчётом (как и
 *     ответы портальных анкет), поэтому здесь НЕТ ловушки «анкету
 *     отправили после отчёта — снимок пуст» и не нужен фолбэк на сущности:
 *     значения приходят даже когда лид и базовая сделка пусты (встройка в
 *     сделку, где лида нет вовсе, — todo3108 №1).
 *  2. ЛИД — легаси-путь: старый React-фронт шлёт анкету отдельным запросом
 *     в ручку /presentation-survey, и та пишет ответы в лид.
 *  3. БАЗОВАЯ СДЕЛКА — фолбэк того же легаси-пути: с 31.08 ручка зеркалит
 *     тот же состав и в сделки, а поля «Хвоста» (op_xvost_*) живут ТОЛЬКО
 *     там (на лиде их нет вовсе) — эти шесть приходят только отсюда, на
 *     любом пути.
 *
 * Сущности читаются УЖЕ ЗАГРУЖЕННЫЕ контекстом — ни одного лишнего вызова
 * Bitrix; карта {@link PRESENTATION_SMART_SURVEY_MIRROR} нужна ОБОИМ путям:
 * payload адресует ответ кодом реестра (`op_5k_*`), а элементу смарта нужен
 * его собственный код поля — перевод одного в другой и есть карта.
 *
 * Пустые ответы не переносятся: снимок фиксирует то, что заполнили, и не
 * затирает элемент пустотой. Поле не установлено на портале — молча
 * пропускается (мягкая деградация, как во всём event-report).
 */
export function buildPresentationSurveySnapshot(
    input: PresentationSurveyInput,
): PresentationSurveySnapshot {
    const snapshot: PresentationSurveySnapshot = {};
    const payload = payloadAnswersByCode(input.survey);

    // ===== Источник 1: PAYLOAD отчёта (новый путь) =====
    for (const entry of PRESENTATION_SMART_SURVEY_MIRROR) {
        if (snapshot[entry.target]) continue;
        const raw = payload.get(entry.source);
        if (raw === undefined) continue;
        const value = normalize(raw, FIELD_TYPE_BY_CODE.get(entry.target));
        if (!value) continue;
        snapshot[entry.target] = value;
    }

    /*
     * ===== Источники 2 и 3: ЛИД, затем БАЗОВАЯ СДЕЛКА (легаси-путь) =====
     * Порядок записей карты на один target — порядок фолбэка «лид →
     * сделка»; уже занятый payload'ом target пропускается первым же
     * условием, так что перечитанная сущность НИКОГДА не перебивает ответ
     * этого отчёта.
     */
    for (const entry of PRESENTATION_SMART_SURVEY_MIRROR) {
        if (snapshot[entry.target]) continue;
        const row = entry.from === 'lead' ? input.lead : input.baseDeal;
        if (!row) continue;
        const field = input.portal.getEntityFieldByCode(
            entry.from,
            entry.source,
        );
        if (!field) continue;
        const raw = row[input.portal.getFieldBitrixId(field)];
        const value = normalize(raw, FIELD_TYPE_BY_CODE.get(entry.target));
        if (!value) continue;
        snapshot[entry.target] = value;
    }

    return snapshot;
}

/**
 * Ответы payload одной картой «код поля реестра → ответ».
 *
 * У записи зеркала источник назван тем же кодом реестра (`entry.source`),
 * поэтому payload ложится на карту без единого разветвления по видам
 * вопросов. Саму раскладку делает общий модуль анкеты — тот же, которым
 * поток пишет ответы в сущности: состав снимка не может разъехаться с
 * составом записи.
 */
function payloadAnswersByCode(
    survey: PresentationSurveyValues | null | undefined,
): ReadonlyMap<string, string> {
    if (!survey) return new Map<string, string>();
    return presentationSurveyAnswersByCode(survey);
}

/**
 * Сырое значение Bitrix → строка для crm.item.
 *
 * Булевы UF приезжают из сделки как `'1'`/`'0'` (а из некоторых источников —
 * как `true`), а поля смарта заполняются 'Y'/'N' — тем же способом, что и
 * остальные флаги элементов (ср. ZPR_IS_SPONTANEOUS). Без нормализации
 * `'0'` записалось бы как непустая строка и читалось бы как «да».
 */
function normalize(
    raw: unknown,
    type: PresentationSmartFieldDef['type'] | undefined,
): string | null {
    if (raw === null || raw === undefined) return null;
    if (type === 'boolean') {
        if (typeof raw === 'boolean') return raw ? 'Y' : 'N';
        const text = asText(raw).trim().toLowerCase();
        if (!text) return null;
        return TRUTHY.has(text) ? 'Y' : 'N';
    }
    const text = asText(raw).trim();
    return text ? text : null;
}

/**
 * Сырое значение Bitrix → текст.
 *
 * Скаляры отдаются как есть, множественный UF приезжает МАССИВОМ и
 * склеивается запятой (ровно так его и печатал прежний `String(raw)`).
 * Всё остальное — объект, к тексту не сводимый: слепой `String()` записал
 * бы в анкету `[object Object]`, поэтому такое значение честно считается
 * пустым и поле просто не переносится.
 */
function asText(raw: unknown): string {
    if (typeof raw === 'string') return raw;
    if (
        typeof raw === 'number' ||
        typeof raw === 'boolean' ||
        typeof raw === 'bigint'
    ) {
        return String(raw);
    }
    if (Array.isArray(raw)) {
        return raw.map((item: unknown) => asText(item)).join(',');
    }
    return '';
}
