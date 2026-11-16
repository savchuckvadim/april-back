import {
    BuilderEntityKey,
    PortalScope,
} from '../repositories/portal-aggregate.types';

/**
 * Части портала, которые можно запросить по отдельности. Имена совпадают с
 * ключами полной модели (POST front/portal), поэтому фронт может собрать из
 * частей тот же объект. `deals` и `bitrixSmart` сюда не входят: в полной
 * модели это повторы `bitrixDeal` и одного из `smarts`.
 */
export const PORTAL_PARTS = [
    'bitrixDeal',
    'company',
    'contact',
    'lead',
    'rpas',
    'smarts',
    'bitrixLists',
    'user',
    'departament',
    'bitrixCallingTasksGroup',
] as const;

export type PortalPartName = (typeof PORTAL_PARTS)[number];

/** Часть → сущность, чьи строки, поля и воронки для неё читаются */
const PART_ENTITY: Partial<Record<PortalPartName, BuilderEntityKey>> = {
    bitrixDeal: 'deal',
    company: 'company',
    contact: 'contact',
    lead: 'lead',
    rpas: 'rpa',
    smarts: 'smart',
    bitrixLists: 'list',
    user: 'user',
};

/**
 * Что читать из БД под запрошенные части: только их сущности, а из смартов —
 * только названные типы. Всё остальное не читается вовсе — в этом и смысл
 * узкой ручки.
 */
export const portalScopeOf = (
    parts: ReadonlySet<PortalPartName>,
    smartTypes?: readonly string[],
    withoutFields?: readonly PortalPartName[],
): PortalScope => {
    const entitiesOf = (wanted: (part: PortalPartName) => boolean) =>
        PORTAL_PARTS.flatMap(part => {
            const entity = PART_ENTITY[part];
            return wanted(part) && entity ? [entity] : [];
        });
    const rowsOnly = entitiesOf(
        part => parts.has(part) && (withoutFields ?? []).includes(part),
    );
    return {
        entities: entitiesOf(part => parts.has(part)),
        departaments: parts.has('departament'),
        callings: parts.has('bitrixCallingTasksGroup'),
        ...(parts.has('smarts') && smartTypes?.length ? { smartTypes } : {}),
        ...(rowsOnly.length ? { rowsOnly } : {}),
    };
};
