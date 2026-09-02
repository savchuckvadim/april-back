import {
    composeRefineReason,
    OBJECTION_NONE_CODE,
    REFINE_REASON_MAX_LENGTH,
    RefineReasonSource,
} from '../services/entity/refine-reason';

/**
 * Причина «на доработке» — фолбэк для пустого поля `op_refined_reason`:
 * возражения (справочник + формулировка), иначе комментарий отчёта; на
 * переносе задачи комментарий в причину не идёт. Чистый сборщик, без
 * экранирования — оно в точке записи.
 */
const src = (over: Partial<RefineReasonSource> = {}): RefineReasonSource => ({
    objections: [],
    objectionComment: '',
    reportComment: '',
    isTransfer: false,
    ...over,
});

const NOMONEY = { code: 'op_objection_nomoney', name: 'Нет денег' };
const LPR = { code: 'op_objection_lpr', name: 'ЛПР против' };
const NONE = { code: OBJECTION_NONE_CODE, name: 'Нет возражений' };

describe('composeRefineReason', () => {
    it('только имена возражений — через запятую', () => {
        expect(composeRefineReason(src({ objections: [NOMONEY, LPR] }))).toBe(
            'Нет денег, ЛПР против',
        );
    });

    it('имена + формулировка клиента — через « — » в кавычках', () => {
        expect(
            composeRefineReason(
                src({
                    objections: [NOMONEY, LPR],
                    objectionComment: ' дорого и не сейчас ',
                }),
            ),
        ).toBe('Нет денег, ЛПР против — «дорого и не сейчас»');
    });

    it('только формулировка — без тире', () => {
        expect(
            composeRefineReason(src({ objectionComment: 'дорого' })),
        ).toBe('«дорого»');
    });

    it('возражений нет — комментарий отчёта', () => {
        expect(
            composeRefineReason(src({ reportComment: ' ждут бюджет ' })),
        ).toBe('ждут бюджет');
    });

    it('возражения сильнее комментария отчёта', () => {
        expect(
            composeRefineReason(
                src({ objections: [NOMONEY], reportComment: 'комментарий' }),
            ),
        ).toBe('Нет денег');
    });

    it('перенос задачи: без возражений причины нет даже при комментарии', () => {
        expect(
            composeRefineReason(
                src({ isTransfer: true, reportComment: 'недозвон' }),
            ),
        ).toBeNull();
    });

    it('перенос задачи с возражениями — причина из возражений', () => {
        expect(
            composeRefineReason(src({ isTransfer: true, objections: [LPR] })),
        ).toBe('ЛПР против');
    });

    it('«Нет возражений» в причину как имя не попадает', () => {
        expect(
            composeRefineReason(
                src({ objections: [NONE], objectionComment: 'дорого' }),
            ),
        ).toBe('«дорого»');
        expect(
            composeRefineReason(
                src({ objections: [NONE], reportComment: 'комментарий' }),
            ),
        ).toBe('комментарий');
    });

    it('всё пусто — null (поле не трогаем, это не обнуление)', () => {
        expect(composeRefineReason(src())).toBeNull();
        expect(
            composeRefineReason(
                src({ objections: [{ code: 'x', name: '  ' }] }),
            ),
        ).toBeNull();
    });

    it('длиннее лимита — обрезка с «…» в лимит', () => {
        const long = 'а'.repeat(REFINE_REASON_MAX_LENGTH + 50);
        const out = composeRefineReason(src({ reportComment: long }));
        expect(out).toHaveLength(REFINE_REASON_MAX_LENGTH);
        expect(out?.endsWith('…')).toBe(true);
    });
});
