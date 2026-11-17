import {
    EnumPortalAppCode,
    PORTAL_APP_SETTINGS_SCHEMA,
} from '../portal-app-settings.schema';
import {
    DEAL_MOVEMENT_NOTE_KIND,
    DEAL_MOVEMENT_NOTE_KIND_OPTIONS,
    toDealMovementNoteKind,
} from '../lib/deal-movement-note-kinds.const';

const SETTINGS = PORTAL_APP_SETTINGS_SCHEMA[EnumPortalAppCode.eventSales];

describe('движение сделок: настройки записи в ленту', () => {
    it('всё новое выключено по умолчанию, лимиты ночи — 100 записей и 50 подсказок', () => {
        expect(SETTINGS.dealMovementWriteNotes.code).toBe(
            'deal_movement_write_notes',
        );
        expect(SETTINGS.dealMovementWriteNotes.default).toBe(false);
        expect(SETTINGS.dealMovementNoteKind.default).toBe(
            DEAL_MOVEMENT_NOTE_KIND.comment,
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

    it('значение настройки → вид записи; пусто и мусор — комментарий', () => {
        expect(toDealMovementNoteKind('log_message')).toBe(
            DEAL_MOVEMENT_NOTE_KIND.logMessage,
        );
        expect(toDealMovementNoteKind('comment')).toBe(
            DEAL_MOVEMENT_NOTE_KIND.comment,
        );
        expect(toDealMovementNoteKind('')).toBe(
            DEAL_MOVEMENT_NOTE_KIND.comment,
        );
        expect(toDealMovementNoteKind(42)).toBe(
            DEAL_MOVEMENT_NOTE_KIND.comment,
        );
    });
});
