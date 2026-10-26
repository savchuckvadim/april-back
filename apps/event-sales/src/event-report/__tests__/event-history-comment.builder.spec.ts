import {
    buildEventHistoryEntry,
    buildEventHistoryParts,
} from '../services/history/event-history-comment.builder';
import { toBatchSafeText } from '@lib/bitrix/consts/batch.consts';

/**
 * Формат записи истории события (op_history / op_mhistory карточки и
 * gsirk-таймлайн): без слова «Отчёт», типы склоняются русскими фразами,
 * план — с человекочитаемой датой, переносы — batch-safe (%0A).
 */
describe('buildEventHistoryParts', () => {
    const deadline = { toRuHumanDateTime: () => '28 мая 14:30' } as never;

    it('склоняет отчёт и план: «Звонок совершён», «Запланирована Презентация на …»', () => {
        const parts = buildEventHistoryParts({
            reportEventType: 'warm',
            planEventType: 'presentation',
            reportComment: 'Комментарий менеджера',
            planDeadline: deadline,
        });

        expect(parts).toEqual([
            'Звонок совершён: Комментарий менеджера',
            'Запланирована Презентация на 28 мая 14:30',
        ]);
    });

    it('не пишет сырые английские коды и слово «Отчёт»', () => {
        const joined = buildEventHistoryParts({
            reportEventType: 'moneyAwait',
            planEventType: 'hot',
            reportComment: '',
            planDeadline: null,
        }).join(' ');

        expect(joined).toBe(
            'Звонок по оплате совершён Запланирован Звонок по решению',
        );
        expect(joined).not.toMatch(/moneyAwait|hot|Отчёт|План:/);
    });

    it('переносы внутри комментария менеджера заменяет на %0A (batch-safe)', () => {
        const parts = buildEventHistoryParts({
            reportEventType: 'presentation',
            planEventType: null,
            reportComment: 'Первая строка\r\nВторая строка\nТретья',
        });

        expect(parts).toEqual([
            'Презентация проведена: Первая строка%0AВторая строка%0AТретья',
        ]);
    });

    it('без типа отчёта, но с комментарием — комментарий не теряется', () => {
        expect(
            buildEventHistoryParts({
                reportEventType: null,
                planEventType: 'warm',
                reportComment: 'Недозвон',
                planDeadline: deadline,
            }),
        ).toEqual(['Недозвон', 'Запланирован Звонок на 28 мая 14:30']);
    });

    it('план без дедлайна — фраза плана без «на …»', () => {
        expect(
            buildEventHistoryParts({
                reportEventType: null,
                planEventType: 'xo',
                reportComment: '',
                planDeadline: null,
            }),
        ).toEqual(['Запланирован Холодный звонок']);
    });
});

/*
 * Владелец 26.10.2026: «ОП История» — с переносами. Многострочный
 * комментарий раньше превращался в «12 — 312 — 3 — …».
 */
describe('buildEventHistoryEntry', () => {
    const deadline = { toRuHumanDateTime: () => '27 октября 10:00' } as never;

    it('дата и что сделано — первой строкой, комментарий построчно, план — последней', () => {
        const entry = buildEventHistoryEntry('26.10.2026 11:06:59', {
            reportEventType: 'warm',
            planEventType: 'warm',
            reportComment:
                'Говорил с бухгалтером\n\n  перезвонить после 10  \nнужен счёт',
            planDeadline: deadline,
        });

        expect(entry).toBe(
            '26.10.2026 11:06:59 — Звонок совершён: Говорил с бухгалтером\n' +
                'перезвонить после 10\n' +
                'нужен счёт\n' +
                'Запланирован Звонок на 27 октября 10:00',
        );
        // На провод переносы уезжают batch-символом %0A.
        expect(toBatchSafeText(entry)).toContain('бухгалтером%0Aперезвонить');
    });

    it('без комментария и плана — только дата и событие', () => {
        expect(
            buildEventHistoryEntry('26.10.2026 11:00:00', {
                reportEventType: 'warm',
                planEventType: null,
                reportComment: '',
                planDeadline: null,
            }),
        ).toBe('26.10.2026 11:00:00 — Звонок совершён');
    });
});
