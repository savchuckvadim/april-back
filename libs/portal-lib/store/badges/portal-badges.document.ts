import {
    BADGE_MODES,
    BADGE_OUTCOMES,
    BADGE_PLAN_TYPES,
    BADGE_TARGETS,
    BADGE_TONES,
    BadgeCatalogDocument,
    BadgeRecord,
    EnumBadgeMode,
    EnumBadgeOutcome,
    EnumBadgePlanType,
    EnumBadgeTarget,
    EnumBadgeTone,
} from './portal-badges.schema';

/**
 * Разбор документа каталога из JSON-колонки настроек портала.
 *
 * JSON мог писаться кем угодно и другой версией кода, поэтому читаем
 * терпимо: не-объект → документа нет; строка без узнаваемых полей → не
 * бейджик, выбрасывается. Полуразобранный документ хуже отсутствующего —
 * но здесь отсев идёт по строкам, и портал не теряет весь набор из-за
 * одной испорченной записи.
 */

type Raw = Record<string, unknown>;

const isRaw = (value: unknown): value is Raw =>
    !!value && typeof value === 'object' && !Array.isArray(value);

const oneOf = <Value extends string>(
    value: unknown,
    allowed: readonly Value[],
): Value | null =>
    typeof value === 'string' && (allowed as readonly string[]).includes(value)
        ? (value as Value)
        : null;

const manyOf = <Value extends string>(
    value: unknown,
    allowed: readonly Value[],
): Value[] =>
    Array.isArray(value)
        ? value
              .map(item => oneOf(item, allowed))
              .filter((item): item is Value => item !== null)
        : [];

const text = (value: unknown): string =>
    typeof value === 'string' ? value.trim() : '';

const integer = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value)
        ? Math.trunc(value)
        : fallback;

/** Одна запись бейджика из JSON; не узнали код, текст или цель — null. */
export const parseBadgeRecord = (value: unknown): BadgeRecord | null => {
    if (!isRaw(value)) return null;
    const code = text(value.code);
    const body = text(value.text);
    const target = oneOf<EnumBadgeTarget>(value.target, BADGE_TARGETS);
    if (!code || !body || !target) return null;
    return {
        code,
        text: body,
        target,
        tone:
            oneOf<EnumBadgeTone>(value.tone, BADGE_TONES) ??
            EnumBadgeTone.neutral,
        outcomes: manyOf<EnumBadgeOutcome>(value.outcomes, BADGE_OUTCOMES),
        planTypes: manyOf<EnumBadgePlanType>(value.planTypes, BADGE_PLAN_TYPES),
        isDefault: value.isDefault === true,
        sort: integer(value.sort, 0),
        isActive: value.isActive !== false,
    };
};

/** Документ каталога из JSON; документа нет или это мусор — null. */
export const parseBadgeDocument = (
    value: unknown,
): BadgeCatalogDocument | null => {
    if (!isRaw(value)) return null;
    const mode = oneOf<EnumBadgeMode>(value.mode, BADGE_MODES);
    if (!mode) return null;
    const items = Array.isArray(value.items)
        ? value.items
              .map(parseBadgeRecord)
              .filter((item): item is BadgeRecord => item !== null)
        : [];
    const updatedBy = integer(value.updatedBy, 0);
    return {
        mode,
        items,
        version: Math.max(0, integer(value.version, 0)),
        updatedAt: text(value.updatedAt) || null,
        updatedBy: updatedBy > 0 ? updatedBy : null,
    };
};
