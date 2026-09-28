/**
 * Решение по повторной заявке — ЧИСТАЯ логика без I/O.
 *
 * Вход собирает RepeatWorkFinder: по каждому сигналу лида (номер заявки,
 * ИНН, телефон, почта, корпоративный домен почты) — куда он привёл: наши
 * основные сделки и клиенты (контакты/компании). Здесь только правило
 * «присоединять или нет» (решения владельца 28.09.2026).
 */

type BxRow = Record<string, unknown>;

/** Сигналы в порядке доверия — первый, у которого есть попадания, решает. */
export const REPEAT_SIGNAL_ORDER = [
    'order',
    'inn',
    'phone',
    'email',
    'email_domain',
] as const;
export type RepeatSignalKind = (typeof REPEAT_SIGNAL_ORDER)[number];

export const REPEAT_SIGNAL_TITLE: Record<RepeatSignalKind, string> = {
    order: 'номер заявки',
    inn: 'ИНН',
    phone: 'телефон',
    email: 'почта',
    email_domain: 'домен почты',
};

/** Основная сделка, к которой привёл сигнал (прочитана файндером). */
export interface IRepeatDealInfo {
    dealId: number;
    closed: boolean;
    stageId: string;
    responsibleId: number | null;
    companyId: number | null;
    title: string;
    row: BxRow;
}

/** Все находки одного сигнала по одному значению. */
export interface IRepeatSignalCandidates {
    signal: RepeatSignalKind;
    value: string;
    deals: IRepeatDealInfo[];
    contactIds: number[];
    companyIds: number[];
}

/** Решение по одному лиду. */
export interface IRepeatResolution {
    kind: 'none' | 'join' | 'reuse-client' | 'ambiguous';
    /** Сигнал, который решил (join/reuse-client/ambiguous). */
    signal?: RepeatSignalKind;
    value?: string;
    /** kind='join': единственная открытая основная сделка клиента. */
    mainDeal?: IRepeatDealInfo;
    /** kind='ambiguous': открытых сделок больше одной. */
    openDealIds?: number[];
    /** kind='reuse-client': найденный клиент без открытой работы. */
    contactId?: number;
    companyId?: number;
    /** Закрытые сделки клиента — в комментарий «уже обращался». */
    closedDealIds?: number[];
}

/** Человекочитаемое описание решения — для таймлайна и истории. */
export function describeRepeatResolution(res: IRepeatResolution): string {
    const signal = res.signal
        ? `${REPEAT_SIGNAL_TITLE[res.signal]} ${res.value ?? ''}`.trim()
        : '';
    switch (res.kind) {
        case 'join':
            return `открытая сделка #${res.mainDeal?.dealId} (сигнал: ${signal})`;
        case 'ambiguous':
            return `несколько открытых сделок: ${(res.openDealIds ?? [])
                .map(id => `#${id}`)
                .join(', ')} (сигнал: ${signal})`;
        case 'reuse-client':
            return res.companyId
                ? `существующая компания ${res.companyId} (сигнал: ${signal})`
                : `существующий контакт ${res.contactId} (сигнал: ${signal})`;
        default:
            return 'совпадений нет';
    }
}

/**
 * Правило присоединения.
 *
 * Первый по порядку доверия сигнал С ПОПАДАНИЯМИ решает всё — к слабым
 * сигналам не спускаемся: если номер заявки нашёл клиента, телефон уже
 * не переголосует. Внутри сигнала:
 *  - ровно одна ОТКРЫТАЯ основная → join;
 *  - открытых больше одной → ambiguous (автоматики нет, комментарий);
 *  - открытых нет, ровно одна компания → reuse-client (компания);
 *  - открытых нет, компаний нет, ровно один контакт → reuse-client;
 *  - иначе → none (обычный путь).
 */
export function resolveRepeatWork(
    buckets: readonly IRepeatSignalCandidates[],
): IRepeatResolution {
    const bySignal = new Map<RepeatSignalKind, IRepeatSignalCandidates[]>();
    for (const bucket of buckets) {
        bySignal.set(bucket.signal, [
            ...(bySignal.get(bucket.signal) ?? []),
            bucket,
        ]);
    }

    for (const signal of REPEAT_SIGNAL_ORDER) {
        const group = bySignal.get(signal) ?? [];
        const hits = group.filter(
            bucket =>
                bucket.deals.length ||
                bucket.contactIds.length ||
                bucket.companyIds.length,
        );
        if (!hits.length) continue;

        // Разные значения одного сигнала (два телефона лида) — объединяем:
        // клиент один, значения его же.
        const deals = uniqueDeals(hits.flatMap(bucket => bucket.deals));
        const value = hits.map(bucket => bucket.value).join(', ');
        const open = deals.filter(deal => !deal.closed);
        const closedDealIds = deals
            .filter(deal => deal.closed)
            .map(deal => deal.dealId);

        if (open.length === 1) {
            return {
                kind: 'join',
                signal,
                value,
                mainDeal: open[0],
                closedDealIds,
            };
        }
        if (open.length > 1) {
            return {
                kind: 'ambiguous',
                signal,
                value,
                openDealIds: open.map(deal => deal.dealId),
            };
        }

        const companyIds = unique(hits.flatMap(bucket => bucket.companyIds));
        const contactIds = unique(hits.flatMap(bucket => bucket.contactIds));
        if (companyIds.length === 1) {
            return {
                kind: 'reuse-client',
                signal,
                value,
                companyId: companyIds[0],
                closedDealIds,
            };
        }
        if (!companyIds.length && contactIds.length === 1) {
            return {
                kind: 'reuse-client',
                signal,
                value,
                contactId: contactIds[0],
                closedDealIds,
            };
        }
        // Сигнал сработал, но однозначного клиента нет — автоматики нет.
        return {
            kind: 'none',
            signal,
            value,
            closedDealIds,
        };
    }
    return { kind: 'none' };
}

function uniqueDeals(deals: readonly IRepeatDealInfo[]): IRepeatDealInfo[] {
    const seen = new Set<number>();
    const result: IRepeatDealInfo[] = [];
    for (const deal of deals) {
        if (seen.has(deal.dealId)) continue;
        seen.add(deal.dealId);
        result.push(deal);
    }
    return result;
}

function unique(ids: readonly number[]): number[] {
    return [...new Set(ids.filter(id => Number.isInteger(id) && id > 0))];
}

/** Что известно о лиде до поиска повторной заявки. */
export interface IRepeatCandidateInput {
    /** Намерение после слияния «запрос + карточка». */
    isXo: 'Y' | 'N';
    /** У лида уже есть своя основная сделка (to_base_sales). */
    hasOwnDeal: boolean;
    /** Лид закрыт штатной конвертацией. */
    isConverted: boolean;
    /** Явно названный ответственный (запрос/карточка); нет — 0/undefined. */
    explicitResponsible?: number;
    /** Работает ли явно названный сейчас. */
    explicitActive: boolean;
}

/**
 * Гейт поиска повторной заявки (решения владельца 28.09.2026):
 *  - только ХО-заявка (isXo=Y) — конвертация в новый стиль работы
 *    (isXo=N) не затрагивается НИКОГДА;
 *  - у лида ещё нет своей сделки (иначе это повторный прогон — reuse);
 *  - не конвертирован штатно;
 *  - не адресный ХО: работающий явно названный сотрудник выбран
 *    осознанно — присоединение ему не навязываем.
 */
export function isRepeatCandidate(input: IRepeatCandidateInput): boolean {
    if (input.isXo !== 'Y') return false;
    if (input.hasOwnDeal || input.isConverted) return false;
    if (input.explicitResponsible && input.explicitActive) return false;
    return true;
}
