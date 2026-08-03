import {
    DuplicateEntityType,
    DuplicateSearchLevel,
    DuplicateSignalKind,
    DuplicateSignals,
    FIND_BY_COMM_ENTITY_TYPES,
    SignalFieldRef,
} from '../type/duplicate.type';

/**
 * Одна команда батча + то, как понимать её ответ.
 *
 * Ключ `cmd` намеренно синтетический (`c0`, `c1`, …): он уезжает в URL
 * batch-команды, и любые спецсимволы в нём ломают разбор на стороне Битрикса.
 * Смысл команды несёт `meta`, а не имя.
 */
export interface SearchCommand {
    cmd: string;
    method: string;
    params: Record<string, unknown>;
    meta: SearchCommandMeta;
}

export interface SearchCommandMeta {
    /** Как разбирать ответ. */
    shape: 'findbycomm' | 'entityList' | 'requisiteList';
    kind: DuplicateSignalKind;
    /** Тип, в котором ищем. Для findbycomm — не задан (ищет сразу во всех). */
    entityType?: DuplicateEntityType;
    /** Чем нашли: `findbycomm`, `UF_CRM_OP_INN`, `RQ_INN`, `%TITLE`. */
    via: string;
    /** Значения, которые искали — попадут в причину совпадения. */
    values: string[];
}

/** findbycomm принимает не больше 20 значений за вызов. */
const COMM_CHUNK = 20;

/**
 * До скольких значений шлём их по одному.
 *
 * Ответ findbycomm не говорит, КАКОЕ из отправленных значений совпало. У лида
 * или компании телефонов обычно один-два, поэтому дешевле отправить их
 * раздельно и показать менеджеру конкретный номер, по которому нашёлся дубль.
 * Когда значений много, точность причины не стоит десятка запросов.
 */
const COMM_PRECISE_LIMIT = 5;

/** Поля, которых хватает, чтобы показать карточку кандидата без доп. запроса. */
const LIST_SELECT: Record<DuplicateEntityType, string[]> = {
    [DuplicateEntityType.LEAD]: ['ID', 'TITLE', 'ASSIGNED_BY_ID', 'STATUS_ID'],
    [DuplicateEntityType.CONTACT]: [
        'ID',
        'NAME',
        'LAST_NAME',
        'SECOND_NAME',
        'ASSIGNED_BY_ID',
    ],
    [DuplicateEntityType.COMPANY]: ['ID', 'TITLE', 'ASSIGNED_BY_ID'],
    [DuplicateEntityType.DEAL]: [
        'ID',
        'TITLE',
        'ASSIGNED_BY_ID',
        'STAGE_ID',
        'CATEGORY_ID',
    ],
};

const LIST_METHOD: Record<DuplicateEntityType, string> = {
    [DuplicateEntityType.LEAD]: 'crm.lead.list',
    [DuplicateEntityType.CONTACT]: 'crm.contact.list',
    [DuplicateEntityType.COMPANY]: 'crm.company.list',
    [DuplicateEntityType.DEAL]: 'crm.deal.list',
};

export interface SearchPlanInput {
    signals: DuplicateSignals;
    level: DuplicateSearchLevel;
    /** Карта ИНН-полей портала: сущность → её поля (без реквизитов). */
    innFieldsByEntity: Map<DuplicateEntityType, SignalFieldRef[]>;
    /** Ограничение по типам; пусто — все четыре. */
    targetTypes: DuplicateEntityType[];
}

/**
 * Сигналы → список команд батча.
 *
 * Чистая функция: ничего не знает ни о сети, ни о Битриксе. Благодаря этому
 * «сколько запросов стоит поиск» проверяется тестом, а не наблюдением за
 * продом.
 */
export function buildSearchPlan(input: SearchPlanInput): SearchCommand[] {
    const { signals, level, innFieldsByEntity, targetTypes } = input;
    const commands: SearchCommand[] = [];
    let seq = 0;
    const next = () => `c${seq++}`;

    // --- L1: телефоны и email штатным findbycomm ---
    for (const [kind, values, type] of [
        [DuplicateSignalKind.PHONE, signals.phones, 'PHONE'],
        [DuplicateSignalKind.EMAIL, signals.emails, 'EMAIL'],
    ] as const) {
        const chunkSize =
            values.length <= COMM_PRECISE_LIMIT ? 1 : COMM_CHUNK;
        for (const chunk of chunked(values, chunkSize)) {
            commands.push({
                cmd: next(),
                method: 'crm.duplicate.findbycomm',
                params: { type, values: chunk },
                meta: {
                    shape: 'findbycomm',
                    kind,
                    via: 'findbycomm',
                    values: chunk,
                },
            });
        }
    }

    // --- L1: ИНН по известным полям портала ---
    // Одна команда на (сущность, поле): массив значений Битрикс понимает как IN,
    // поэтому три ИНН не превращаются в три запроса.
    if (signals.inns.length) {
        for (const entityType of targetTypes) {
            for (const field of innFieldsByEntity.get(entityType) ?? []) {
                commands.push({
                    cmd: next(),
                    method: LIST_METHOD[entityType],
                    params: {
                        filter: { [field.fieldName]: signals.inns },
                        select: LIST_SELECT[entityType],
                        start: -1,
                    },
                    meta: {
                        shape: 'entityList',
                        kind: DuplicateSignalKind.INN,
                        entityType,
                        via: field.fieldName,
                        values: signals.inns,
                    },
                });
            }
        }
    }

    if (level < DuplicateSearchLevel.DEEP) return commands;

    // --- L2: ИНН в реквизитах (у контактов и компаний он живёт там) ---
    if (signals.inns.length) {
        commands.push({
            cmd: next(),
            method: 'crm.requisite.list',
            params: {
                filter: { RQ_INN: signals.inns },
                select: ['ID', 'ENTITY_TYPE_ID', 'ENTITY_ID', 'RQ_INN', 'NAME'],
                start: -1,
            },
            meta: {
                shape: 'requisiteList',
                kind: DuplicateSignalKind.INN,
                via: 'RQ_INN',
                values: signals.inns,
            },
        });
    }

    // --- L2: подстрочный поиск по названию ---
    // Только компании и лиды: у контакта названия компании как отдельного
    // поискового поля нет, а по ФИО подстрока даёт слишком много шума.
    for (const title of signals.titles) {
        for (const [entityType, fields] of [
            [DuplicateEntityType.COMPANY, ['%TITLE']],
            [DuplicateEntityType.LEAD, ['%TITLE', '%COMPANY_TITLE']],
        ] as const) {
            if (!targetTypes.includes(entityType)) continue;
            for (const field of fields) {
                commands.push({
                    cmd: next(),
                    method: LIST_METHOD[entityType],
                    params: {
                        filter: { [field]: title },
                        select: LIST_SELECT[entityType],
                        start: -1,
                    },
                    meta: {
                        shape: 'entityList',
                        kind: DuplicateSignalKind.TITLE,
                        entityType,
                        via: field,
                        values: [title],
                    },
                });
            }
        }
    }

    return commands;
}

/** Типы, в которых имеет смысл искать по телефону/email. */
export const findByCommTypes = (): DuplicateEntityType[] => [
    ...FIND_BY_COMM_ENTITY_TYPES,
];

function chunked<T>(items: readonly T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}
