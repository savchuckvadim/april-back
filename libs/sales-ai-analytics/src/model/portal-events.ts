/**
 * Автособытия журнала портала (план Фазы 2, P2-28): месячный пересчёт сам
 * дописывает в `ai_analytics_events` то, что человек забывает отметить, —
 * приход новичка, смену версии рубрики, смену методички и сдвиг медианы
 * цены. Через месяц излом тренда объясняет именно журнал, поэтому
 * событие важнее любого пересчёта.
 *
 * Правила намеренно консервативны: событие создаётся только тогда, когда
 * ОБА значения известны и они действительно разошлись. Пустое «раньше»
 * (первый пересчёт портала) событием не считается — иначе журнал раз в
 * жизни получал бы четыре ложные отметки.
 *
 * Чистая математика: без DI, Bitrix и Prisma, без `new Date()` внутри —
 * границы окна и текущие значения приходят параметрами.
 */
import { versionDate } from '../contracts/versions.types';
import type {
    AiPortalEvent,
    AiPortalEventKind,
} from '../settings/ai-settings.types';

/** Дефолты обнаружения (план §4.7): сдвиг медианы цены от 10 %. */
export const PORTAL_EVENT_DEFAULTS = {
    /** Медиана цены сдвинулась не меньше чем на столько процентов. */
    priceShiftPct: 10,
} as const;

/** Источник автособытия — журнал отличает его от ручной отметки. */
export const PORTAL_EVENT_AUTO_SOURCE = 'auto' as const;

/** Менеджер реестра: id и дата начала стажа из паспорта. */
export interface PortalRosterMember {
    readonly managerId: string;
    /** Начало стажа 'YYYY-MM-DD'; null — новичком не объявляем. */
    readonly since: string | null;
}

/** Вход обнаружения автособытий за окно пересчёта. */
export interface PortalEventsInput {
    /** Начало окна 'YYYY-MM-DD' включительно. */
    readonly from: string;
    /** Конец окна 'YYYY-MM-DD' включительно — дата «сегодняшних» событий. */
    readonly to: string;
    /** Реестр менеджеров на конец окна. */
    readonly roster?: readonly PortalRosterMember[];
    /** Версия рубрики разбора сейчас и на прошлом пересчёте. */
    readonly rubricVersion?: string | null;
    readonly previousRubricVersion?: string | null;
    /** Хэш методички (скрипта) сейчас и на прошлом пересчёте. */
    readonly scriptHash?: string | null;
    readonly previousScriptHash?: string | null;
    /** Медиана цены сейчас и на прошлом пересчёте, ₽. */
    readonly priceMedian?: number | null;
    readonly previousPriceMedian?: number | null;
    /** Порог сдвига медианы цены, %; по умолчанию 10. */
    readonly priceShiftPct?: number;
    /** Уже записанные события журнала — повторов не создаём. */
    readonly known?: readonly AiPortalEvent[];
}

/** Порядок видов в выдаче: сначала люди, потом версии, потом цена. */
const KIND_ORDER: readonly AiPortalEventKind[] = [
    'new_hire',
    'rubric_change',
    'script_change',
    'price_change',
];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isDate = (value: string | null | undefined): value is string =>
    typeof value === 'string' && ISO_DATE_RE.test(value);

const isText = (value: string | null | undefined): value is string =>
    typeof value === 'string' && value.trim() !== '';

const isNumber = (value: number | null | undefined): value is number =>
    typeof value === 'number' && Number.isFinite(value);

/** Ключ дедупликации: один вид на одну дату журнал держит один раз. */
const keyOf = (event: AiPortalEvent): string => `${event.kind}|${event.date}`;

function autoEvent(
    date: string,
    kind: AiPortalEventKind,
    note: string,
): AiPortalEvent {
    return { date, kind, note, source: PORTAL_EVENT_AUTO_SOURCE };
}

/**
 * Новички окна: менеджер с датой начала стажа внутри `[from; to]`.
 * Паспорт без даты стажа новичком не объявляется — «не знаем» и «принят
 * в этом месяце» это разные утверждения.
 */
function newHireEvents(input: PortalEventsInput): AiPortalEvent[] {
    const hired = (input.roster ?? []).flatMap(member =>
        isDate(member.since) &&
        member.since >= input.from &&
        member.since <= input.to
            ? [{ managerId: member.managerId, since: member.since }]
            : [],
    );

    return hired
        .sort((a, b) =>
            `${a.since}|${a.managerId}`.localeCompare(
                `${b.since}|${b.managerId}`,
            ),
        )
        .map(member =>
            autoEvent(
                member.since,
                'new_hire',
                `Новый менеджер: ${member.managerId}`,
            ),
        );
}

/**
 * Дата события смены версии: если версия несёт в себе дату
 * ('focus-v2.1-2026-09-05'), берётся она — так журнал показывает, когда
 * ряд разорвался на самом деле, а не когда это заметил пересчёт.
 */
function versionEventDate(version: string, fallback: string): string {
    return versionDate(version) ?? fallback;
}

/** Смена версии рубрики: обе версии известны и различаются. */
function rubricEvents(input: PortalEventsInput): AiPortalEvent[] {
    const current = input.rubricVersion;
    const previous = input.previousRubricVersion;
    if (!isText(current) || !isText(previous) || current === previous) {
        return [];
    }

    return [
        autoEvent(
            versionEventDate(current, input.to),
            'rubric_change',
            `Версия рубрики: ${previous} → ${current}`,
        ),
    ];
}

/** Смена методички: сравниваются хэши, а не тексты. */
function scriptEvents(input: PortalEventsInput): AiPortalEvent[] {
    const current = input.scriptHash;
    const previous = input.previousScriptHash;
    if (!isText(current) || !isText(previous) || current === previous) {
        return [];
    }

    return [
        autoEvent(
            input.to,
            'script_change',
            `Методичка изменилась: ${previous} → ${current}`,
        ),
    ];
}

/** Сдвиг медианы цены не меньше порога (по умолчанию 10 %). */
function priceEvents(input: PortalEventsInput): AiPortalEvent[] {
    const current = input.priceMedian;
    const previous = input.previousPriceMedian;
    if (!isNumber(current) || !isNumber(previous) || previous <= 0) {
        return [];
    }
    const shiftPct = ((current - previous) / previous) * 100;
    const limit = Math.abs(
        input.priceShiftPct ?? PORTAL_EVENT_DEFAULTS.priceShiftPct,
    );
    if (Math.abs(shiftPct) < limit) {
        return [];
    }

    return [
        autoEvent(
            input.to,
            'price_change',
            `Медиана цены: ${previous} → ${current} (${
                shiftPct > 0 ? '+' : ''
            }${Math.round(shiftPct * 10) / 10} %)`,
        ),
    ];
}

/** Место вида в порядке выдачи; неизвестный вид уходит в конец группы. */
function kindOrder(kind: AiPortalEventKind): number {
    const index = KIND_ORDER.indexOf(kind);

    return index === -1 ? KIND_ORDER.length : index;
}

/** Сортировка выдачи: по дате, затем по порядку видов. */
function compareEvents(a: AiPortalEvent, b: AiPortalEvent): number {
    return (
        a.date.localeCompare(b.date) ||
        kindOrder(a.kind) - kindOrder(b.kind) ||
        (a.note ?? '').localeCompare(b.note ?? '')
    );
}

/**
 * Автособытия окна пересчёта (P2-28): новички реестра, смена версии
 * рубрики, смена методички по хэшу и сдвиг медианы цены. События, уже
 * записанные в журнале (тот же вид на ту же дату), повторно не выдаются —
 * месячный пересчёт идемпотентен.
 */
export function detectPortalEvents(input: PortalEventsInput): AiPortalEvent[] {
    const known = new Set((input.known ?? []).map(keyOf));
    const detected = [
        ...newHireEvents(input),
        ...rubricEvents(input),
        ...scriptEvents(input),
        ...priceEvents(input),
    ];
    const seen = new Set<string>();

    return detected
        .filter(event => {
            const key = keyOf(event);
            if (known.has(key) || seen.has(key)) return false;
            seen.add(key);

            return true;
        })
        .sort(compareEvents);
}

/**
 * Журнал после пересчёта: прежние записи плюс новые автособытия, по
 * возрастанию даты. Ручные отметки не переписываются никогда — вид и
 * дата у автособытия те же, значит дедупликация их сохраняет.
 */
export function mergePortalEvents(
    known: readonly AiPortalEvent[],
    detected: readonly AiPortalEvent[],
): AiPortalEvent[] {
    return [...known, ...detected].sort(compareEvents);
}
