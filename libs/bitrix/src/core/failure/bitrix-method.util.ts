/**
 * Что делает метод REST Битрикса — по одному имени, без знания приложений.
 * Нужно тревоге и журналу сбоев: «не записалась сделка» и «не прочиталась
 * сделка» — разные по тяжести события.
 */

/** Методы чтения целиком, у которых по последнему слову не понять. */
const READ_METHODS: ReadonlySet<string> = new Set([
    'profile',
    'methods',
    'scope',
    'server.time',
    'app.info',
    'user.current',
]);

/** Последнее слово метода, по которому это чтение. */
const READ_ACTIONS: ReadonlySet<string> = new Set([
    'fields',
    'info',
    'current',
    'count',
    'access',
    'instances',
]);

/** Начало или конец последнего слова, по которым это чтение. */
const READ_ACTION_PREFIXES = ['get', 'list', 'find', 'search'] as const;
const READ_ACTION_SUFFIXES = ['list', 'fields'] as const;

/**
 * Чтение или запись. Чтение — `.get/.list/.fields/.search/.find…`; всё
 * остальное (`.add/.update/.delete/.set/.complete/.bind/.start/.send`) и
 * незнакомое — запись: лучше лишний раз назвать сбой записью, чем пропустить
 * потерянную запись.
 */
export function isBitrixWriteMethod(method: string): boolean {
    const name = method.trim().toLowerCase();
    if (READ_METHODS.has(name)) return false;
    const action = name.slice(name.lastIndexOf('.') + 1);
    if (READ_ACTIONS.has(action)) return false;
    if (READ_ACTION_PREFIXES.some(prefix => action.startsWith(prefix))) {
        return false;
    }
    return !READ_ACTION_SUFFIXES.some(suffix => action.endsWith(suffix));
}

/**
 * Человеческое имя сущности по префиксу метода. Порядок важен: длинные
 * префиксы раньше коротких (`crm.item.productrow` раньше `crm.item`).
 */
const ENTITY_LABELS: ReadonlyArray<readonly [string, string]> = [
    ['crm.item.productrow', 'товарная строка'],
    ['crm.timeline.comment', 'комментарий'],
    ['crm.deal', 'сделка'],
    ['crm.company', 'компания'],
    ['crm.contact', 'контакт'],
    ['crm.lead', 'лид'],
    ['crm.item', 'элемент смарт-процесса'],
    ['crm.activity', 'дело'],
    ['tasks.task', 'задача'],
    ['lists.element', 'строка списка'],
    ['im.notify', 'уведомление'],
    ['im.message', 'сообщение'],
    ['bizproc', 'бизнес-процесс'],
];

/** «сделка», «задача», «строка списка»…; незнакомый метод — сам метод. */
export function bitrixEntityLabel(method: string): string {
    const name = method.trim();
    const lower = name.toLowerCase();
    const match = ENTITY_LABELS.find(
        ([prefix]) => lower === prefix || lower.startsWith(`${prefix}.`),
    );
    return match ? match[1] : name;
}

/** Пометка для людей: «запись» / «чтение». */
export const bitrixWriteMark = (write: boolean): string =>
    write ? 'запись' : 'чтение';
