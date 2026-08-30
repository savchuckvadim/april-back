import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    PRESENTATION_SMART_FIELDS,
    PRESENTATION_SMART_SURVEY_MIRROR,
    PresentationSmartFieldCode,
    PresentationSmartFieldDef,
} from '@lib/portal-lib/pbx/pbx-presentation-smart';

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
    /** Сырая строка лида: там живут «5К» (в т.ч. девять детальных ответов). */
    lead: Record<string, unknown> | null;
    /** Сырая строка БАЗОВОЙ сделки: там живут вопросы «Разговора» (op_xvost_*). */
    baseDeal: Record<string, unknown> | null;
}

/**
 * Снимок анкеты презентации («5К» + «Хвост») для элемента смарта.
 *
 * Тот же перенос, что делает event-report в pres-сделку
 * (`copyPresentationSurvey` + `copyXvostSnapshot`), только целью выступает
 * элемент смарта. Читаем УЖЕ ЗАГРУЖЕННЫЕ сущности контекста — ни одного
 * лишнего вызова Bitrix; фрейм пишет анкету в карточке клиента до отчёта,
 * поэтому значения на момент отчёта актуальны.
 *
 * Пустые ответы не переносятся: снимок фиксирует то, что заполнили, и не
 * затирает элемент пустотой. Поле не установлено на портале — молча
 * пропускается (мягкая деградация, как во всём event-report).
 */
export function buildPresentationSurveySnapshot(
    input: PresentationSurveyInput,
): PresentationSurveySnapshot {
    const snapshot: PresentationSurveySnapshot = {};

    for (const entry of PRESENTATION_SMART_SURVEY_MIRROR) {
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
