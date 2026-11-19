import {
    EnumPortalAppCode,
    PORTAL_APP_SETTINGS_SCHEMA,
} from '../portal-app-settings.schema';
import {
    DEAL_MOVEMENT_DEFAULT_NOTE_KIND,
    DEAL_MOVEMENT_NOTE_KIND,
    DEAL_MOVEMENT_NOTE_KIND_OPTIONS,
    toDealMovementNoteKind,
} from '../lib/deal-movement-note-kinds.const';
import {
    DEAL_MOVEMENT_DIGEST_MODE,
    DEAL_MOVEMENT_DIGEST_MODE_OPTIONS,
    toDealMovementDigestMode,
} from '../lib/deal-movement-digest-modes.const';

const SETTINGS = PORTAL_APP_SETTINGS_SCHEMA[EnumPortalAppCode.eventSales];

describe('движение сделок: настройки сводки руководителям', () => {
    it('выключена по умолчанию, режим «только новые», 15 сделок под риском', () => {
        expect(SETTINGS.dealMovementDigestEnabled.code).toBe(
            'deal_movement_digest_enabled',
        );
        expect(SETTINGS.dealMovementDigestEnabled.default).toBe(false);
        expect(SETTINGS.dealMovementDigestMode.default).toBe(
            DEAL_MOVEMENT_DIGEST_MODE.newOnly,
        );
        expect(SETTINGS.dealMovementDigestMode.options).toBe(
            DEAL_MOVEMENT_DIGEST_MODE_OPTIONS,
        );
        expect(SETTINGS.dealMovementDigestTop.default).toBe(15);
    });

    it('значение режима: знакомый код — он, мусор — «только новые»', () => {
        expect(toDealMovementDigestMode('daily')).toBe(
            DEAL_MOVEMENT_DIGEST_MODE.daily,
        );
        expect(toDealMovementDigestMode('weekly')).toBe(
            DEAL_MOVEMENT_DIGEST_MODE.newOnly,
        );
        expect(toDealMovementDigestMode(undefined)).toBe(
            DEAL_MOVEMENT_DIGEST_MODE.newOnly,
        );
    });
});

describe('движение сделок: настройки записи в ленту', () => {
    it('всё новое выключено по умолчанию, лимиты ночи — 100 записей и 50 подсказок', () => {
        expect(SETTINGS.dealMovementWriteNotes.code).toBe(
            'deal_movement_write_notes',
        );
        expect(SETTINGS.dealMovementWriteNotes.default).toBe(false);
        expect(SETTINGS.dealMovementNoteKind.default).toBe(
            DEAL_MOVEMENT_NOTE_KIND.logMessage,
        );
        expect(DEAL_MOVEMENT_DEFAULT_NOTE_KIND).toBe(
            DEAL_MOVEMENT_NOTE_KIND.logMessage,
        );
        expect(SETTINGS.dealMovementMaxNotes.default).toBe(100);
        expect(SETTINGS.dealMovementMaxTexts.default).toBe(50);
    });

    it('выбор вида записи — ровно коды перечня, названия по-русски', () => {
        expect(
            DEAL_MOVEMENT_NOTE_KIND_OPTIONS.map(option => option.code),
        ).toEqual(Object.values(DEAL_MOVEMENT_NOTE_KIND));
        expect(SETTINGS.dealMovementNoteKind.options).toBe(
            DEAL_MOVEMENT_NOTE_KIND_OPTIONS,
        );
        for (const option of DEAL_MOVEMENT_NOTE_KIND_OPTIONS) {
            expect(option.name).not.toMatch(/[a-z_]/);
        }
    });

    it('значение настройки → вид записи; пусто и мусор — служебная запись журнала', () => {
        expect(toDealMovementNoteKind('log_message')).toBe(
            DEAL_MOVEMENT_NOTE_KIND.logMessage,
        );
        // Сохранённый на портале комментарий остаётся комментарием.
        expect(toDealMovementNoteKind('comment')).toBe(
            DEAL_MOVEMENT_NOTE_KIND.comment,
        );
        expect(toDealMovementNoteKind('')).toBe(
            DEAL_MOVEMENT_NOTE_KIND.logMessage,
        );
        expect(toDealMovementNoteKind(undefined)).toBe(
            DEAL_MOVEMENT_NOTE_KIND.logMessage,
        );
        expect(toDealMovementNoteKind(42)).toBe(
            DEAL_MOVEMENT_NOTE_KIND.logMessage,
        );
    });

    it('описание настройки: что запись журнала не сдвигает активность, а комментарий сдвигает', () => {
        const { description } = SETTINGS.dealMovementNoteKind;
        expect(description).toContain('не сдвигает «последнюю активность»');
        expect(description).toContain('сдвигает «последнюю активность»');
        expect(description).toContain('18.11.2026');
        expect(description).toContain(
            'По умолчанию — служебная запись журнала',
        );
    });
});
