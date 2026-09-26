/**
 * Профиль стиля менеджера за месячное окно (`ai-analytics-style`, план
 * §3.1, поток 14b; документ `ai/tasks/ai-analytics-manager-style.md`).
 *
 * Стиль — это КАК человек работает, а не насколько хорошо: оба полюса оси
 * нейтральны, рейтинга по осям нет. Математику (leave-one-out норма
 * коллег, усадка к τ, ROPE и частотный пол, гистерезис подписей) делает
 * библиотека — здесь только перевод разборов в единицы осей.
 *
 * Маркеры осей приходят из двух источников (`manager-style.axes.ts`):
 * разбор звонка даёт оси `inquiry`, `initiative`, `price_position`,
 * `funnel_focus` (единица — звонок), жёсткие счётчики телефонии и CRM —
 * `persistence`, `tempo`, `rhythm` (единицы — лид и рабочий день).
 * Ось `objection_response` (единица — возражение) кормится полем
 * `objections[].reaction` разборов с промпта v2.3 (Фаза 3, П6/П8); у
 * старых разборов поля нет, и ось для них молчит: половина осей «на
 * глазок» была бы хуже честного «данных пока мало».
 *
 * Чистые функции: без DI, Bitrix и `new Date()`.
 */
import {
    buildStyleProfile,
    resolveNumberParam,
    type ParamContext,
    type StyleProfile,
    type StyleProfileOptions,
    type StyleRow,
} from '@lib/sales-ai-analytics';
import type { DatedLiteRow } from '../loaders/lite-row.mapper';
import type { StyleCrmManagerMonth } from '../loaders/style-crm.types';
import { axesOf, crmStyleRows, objectionStyleRows } from './manager-style.axes';
import type {
    AiSnapshotMeta,
    ManagerSnapshotRow,
    ManagerStyleFacts,
    ManagerStylePayload,
} from './manager-snapshot.types';

export {
    axesOf,
    crmStyleRows,
    STYLE_INQUIRY_SECTIONS,
    STYLE_LATE_STAGE_CALL_TYPES,
} from './manager-style.axes';

export interface ManagerStyleInput {
    /** Месяц снапшота 'YYYY-MM' (последний месяц окна). */
    monthKey: string;
    /** Месяцы окна по возрастанию (обычно три). */
    window: string[];
    /** Разборы окна по всем менеджерам: норма коллег — leave-one-out. */
    rows: readonly DatedLiteRow[];
    /** Ростер ОП строками: профиль считается каждому. */
    managerIds: readonly string[];
    registry: ParamContext;
    /** managerId → полоса стажа (оффсет полосы, паспорт из шины). */
    tenureBands: Readonly<Record<string, string>>;
    /** Подписи прошлого окна по менеджеру — гистерезис профиля. */
    previousTags: ReadonlyMap<string, readonly string[]>;
    /**
     * Жёсткие счётчики телефонии и CRM за то же окно (StyleCrmLoader):
     * оси 4, 7, 8. Не передан — эти оси молчат.
     */
    crm?: readonly StyleCrmManagerMonth[];
    meta: AiSnapshotMeta;
}

export interface ManagerStyleAssembly {
    monthKey: string;
    rows: ManagerSnapshotRow<ManagerStylePayload>[];
    /** Профили по менеджеру — для нагрузки месячного снапшота. */
    facts: Map<string, ManagerStyleFacts>;
}

/**
 * Разборы окна и жёсткие счётчики → строки осей стиля. Строка без единиц
 * не участвует; единицы телефонии идут своими строками (лид, рабочий
 * день), потому что их нельзя складывать со звонками.
 */
export function buildStyleRows(
    rows: readonly DatedLiteRow[],
    crm: readonly StyleCrmManagerMonth[] = [],
): StyleRow[] {
    const callRows = rows.flatMap(row => {
        if (row.managerId === null || !row.analysisPresent) return [];
        const axes = axesOf(row);
        return Object.keys(axes).length === 0
            ? []
            : [{ managerId: row.managerId, axes }];
    });
    return [...callRows, ...objectionStyleRows(rows), ...crmStyleRows(crm)];
}

/**
 * Пороги профиля из реестра (слои настроек переопределяют дефолты кода).
 * Значение `undefined` библиотека читает как «дефолт реестра», поэтому
 * отсутствующий код молча остаётся дефолтом, а не нулём.
 */
function styleOptions(registry: ParamContext): StyleProfileOptions {
    return {
        minCalls: resolveNumberParam('style_min_calls', registry),
        minPeers: resolveNumberParam('style_min_peers', registry),
        ropeDelta: resolveNumberParam('style_rope_delta', registry),
        pIn: resolveNumberParam('style_p_in', registry),
        pOut: resolveNumberParam('style_p_out', registry),
        zRaw: resolveNumberParam('style_z_raw', registry),
        intervalZ: resolveNumberParam('style_interval_z', registry),
        tenureKappa: resolveNumberParam('style_tenure_kappa', registry),
    };
}

/** Профиль библиотеки → факты стиля в нагрузке снапшота. */
export function toStyleFacts(
    profile: StyleProfile,
    window: readonly string[],
): ManagerStyleFacts {
    return {
        calls: profile.calls,
        peers: profile.peers,
        vector: profile.vector,
        tags: profile.tags.map(tag => ({
            code: tag.code,
            title: tag.title,
            basis: tag.basis,
            n: tag.n,
        })),
        confidence: profile.confidence.level,
        confidenceReason: profile.confidence.reason ?? null,
        window: [...window],
    };
}

/**
 * Профили стиля всех менеджеров ростера за окно. Разборов меньше
 * `style_min_calls` (по умолчанию 40) или коллег меньше пяти — профиль
 * сохраняется с `confidence: none`, пустыми подписями и пустым вектором:
 * «данных пока мало» честнее любой подписи.
 */
export function buildManagerStylePayload(
    input: ManagerStyleInput,
): ManagerStyleAssembly {
    const styleRows = buildStyleRows(input.rows, input.crm ?? []);
    const options = styleOptions(input.registry);
    const facts = new Map<string, ManagerStyleFacts>();
    const rows = input.managerIds.map(managerId => {
        const profile = buildStyleProfile(styleRows, managerId, {
            ...options,
            tenureBands: input.tenureBands,
            previousTags: [...(input.previousTags.get(managerId) ?? [])],
        });
        const styleFacts = toStyleFacts(profile, input.window);
        facts.set(managerId, styleFacts);
        const payload: ManagerStylePayload = {
            ...styleFacts,
            axes: profile.axes,
            expectedFalseTags: profile.expectedFalseTags,
            funnelShape: profile.funnelShape,
            meta: input.meta,
        };
        return { managerId, payload };
    });
    return { monthKey: input.monthKey, rows, facts };
}
