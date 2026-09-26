import { toFeedbackSummary } from '../domain/assembler/dossier.assembler';

/**
 * Раздел досье «Обратная связь»: считаются только реакции пользователя
 * (useful / not_useful / disagree / alert_handled) в актуальном статусе.
 * Просмотры, служебные записи доставки/меток и замещённые записи раньше
 * раздували счётчик.
 */
describe('toFeedbackSummary: только реакции пользователя', () => {
    it('view и служебные виды не считаются', () => {
        expect(
            toFeedbackSummary(
                [
                    { kind: 'useful', managerId: '512' },
                    { kind: 'not_useful', managerId: '512' },
                    { kind: 'disagree', managerId: '512' },
                    { kind: 'alert_handled', managerId: '512' },
                    { kind: 'view', managerId: '512' },
                    { kind: 'alert_sent', managerId: '512' },
                    { kind: 'digest_sent', managerId: '512' },
                    { kind: 'agenda_sent', managerId: '512' },
                    { kind: 'rop_mark', managerId: '512' },
                ],
                '512',
            ),
        ).toEqual({
            total: 4,
            byKind: { useful: 1, not_useful: 1, disagree: 1, alert_handled: 1 },
        });
    });

    it('замещённые записи не считаются; статус не передан — запись актуальная', () => {
        expect(
            toFeedbackSummary(
                [
                    { kind: 'disagree', managerId: '512', status: 'done' },
                    {
                        kind: 'disagree',
                        managerId: '512',
                        status: 'superseded',
                    },
                    { kind: 'useful', managerId: '512' },
                ],
                '512',
            ),
        ).toEqual({ total: 2, byKind: { disagree: 1, useful: 1 } });
    });

    it('у менеджера только просмотры и служебные записи → раздела нет (null)', () => {
        expect(
            toFeedbackSummary(
                [
                    { kind: 'view', managerId: '512' },
                    { kind: 'digest_sent', managerId: '512' },
                    { kind: 'useful', managerId: '512', status: 'superseded' },
                ],
                '512',
            ),
        ).toBeNull();
    });
});
