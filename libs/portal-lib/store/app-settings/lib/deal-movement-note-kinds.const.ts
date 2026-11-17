import type { PortalAppSettingOption } from '../portal-app-settings.schema';

/**
 * Вид записи «движения сделок» в ленте сделки — коды настройки
 * `deal_movement_note_kind` (event-sales). Общие для реестра настроек
 * (выбор в админке) и записи в apps/event-sales.
 */
export const DEAL_MOVEMENT_NOTE_KIND = {
    /** Комментарий ленты (crm.timeline.comment.add) — видят все в сделке. */
    comment: 'comment',
    /** Служебная запись журнала (crm.timeline.logmessage.add). */
    logMessage: 'log_message',
} as const;

export type DealMovementNoteKind =
    (typeof DEAL_MOVEMENT_NOTE_KIND)[keyof typeof DEAL_MOVEMENT_NOTE_KIND];

/** Выбор в админке. */
export const DEAL_MOVEMENT_NOTE_KIND_OPTIONS: readonly PortalAppSettingOption[] =
    [
        {
            code: DEAL_MOVEMENT_NOTE_KIND.comment,
            name: 'Комментарий в ленте сделки',
        },
        {
            code: DEAL_MOVEMENT_NOTE_KIND.logMessage,
            name: 'Служебная запись журнала',
        },
    ];

/** По умолчанию — комментарий (решение 17.11.2026). */
export const DEAL_MOVEMENT_DEFAULT_NOTE_KIND: DealMovementNoteKind =
    DEAL_MOVEMENT_NOTE_KIND.comment;

const NOTE_KINDS: readonly string[] = Object.values(DEAL_MOVEMENT_NOTE_KIND);

/** Значение настройки → вид записи; пусто и мусор — по умолчанию. */
export const toDealMovementNoteKind = (raw: unknown): DealMovementNoteKind =>
    typeof raw === 'string' && NOTE_KINDS.includes(raw)
        ? (raw as DealMovementNoteKind)
        : DEAL_MOVEMENT_DEFAULT_NOTE_KIND;
