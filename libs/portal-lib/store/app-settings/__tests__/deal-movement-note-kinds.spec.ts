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
    dealMovementDigestPeriodDays,
    toDealMovementDigestMode,
    toDealMovementDigestWeekday,
} from '../lib/deal-movement-digest-modes.const';
import {
    DEAL_MOVEMENT_STATUS_LABELS,
    dealMovementStatusQuoted,
} from '../lib/deal-movement-status-titles.const';

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
            DEAL_MOVEMENT_DIGEST_MODE.weekly,
        );
        expect(toDealMovementDigestMode('biweekly')).toBe(
            DEAL_MOVEMENT_DIGEST_MODE.biweekly,
        );
        expect(toDealMovementDigestMode('monthly')).toBe(
            DEAL_MOVEMENT_DIGEST_MODE.newOnly,
        );
        expect(toDealMovementDigestMode(undefined)).toBe(
            DEAL_MOVEMENT_DIGEST_MODE.newOnly,
        );
    });

    it('неделя и две недели: период 7 и 14 дней, у ежедневных периода нет; день недели 1–7, по умолчанию понедельник', () => {
        expect(dealMovementDigestPeriodDays('weekly')).toBe(7);
        expect(dealMovementDigestPeriodDays('biweekly')).toBe(14);
        expect(dealMovementDigestPeriodDays('daily')).toBeNull();
        expect(dealMovementDigestPeriodDays('new_only')).toBeNull();
        expect(SETTINGS.dealMovementDigestWeekday.code).toBe(
            'deal_movement_digest_weekday',
        );
        expect(SETTINGS.dealMovementDigestWeekday.default).toBe(1);
        expect(toDealMovementDigestWeekday(5)).toBe(5);
        expect(toDealMovementDigestWeekday('7')).toBe(7);
        expect(toDealMovementDigestWeekday(0)).toBe(1);
        expect(toDealMovementDigestWeekday(8)).toBe(1);
        expect(toDealMovementDigestWeekday('')).toBe(1);
        expect(
            DEAL_MOVEMENT_DIGEST_MODE_OPTIONS.map(option => option.code),
        ).toEqual(['new_only', 'daily', 'weekly', 'biweekly']);
    });
});

describe('движение сделок: подписи статусов в описаниях настроек', () => {
    it('одно место подписей; в описаниях — новые подписи, без «застряла»', () => {
        expect(DEAL_MOVEMENT_STATUS_LABELS.stuck).toBe('Без продвижения');
        expect(dealMovementStatusQuoted('abandoned')).toBe('«без внимания»');
        const texts = Object.values(SETTINGS)
            .filter(setting => setting.code.startsWith('deal_movement_'))
            .map(setting => `${setting.name} ${setting.description}`)
            .join(' ');
        expect(texts).not.toMatch(/застрял|откатил/i);
        expect(texts).toContain('«без внимания»');
        expect(texts).toContain('«без продвижения»');
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
