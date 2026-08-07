import { DuplicateScoreService } from '../duplicate-score.service';
import {
    DUPLICATE_MATCH_WEIGHTS,
    DuplicateEntityType,
    DuplicateRawHit,
    DuplicateSignalKind,
    SEARCH_VIA,
} from '../../type/duplicate.type';

const hit = (over: Partial<DuplicateRawHit> = {}): DuplicateRawHit => ({
    entityType: DuplicateEntityType.COMPANY,
    id: 10,
    kind: DuplicateSignalKind.PHONE,
    via: 'findbycomm',
    value: '9991234567',
    ...over,
});

describe('DuplicateScoreService', () => {
    const service = new DuplicateScoreService();

    it('схлопывает попадания одной сущности в одну карточку с двумя причинами', () => {
        const result = service.score([
            hit(),
            hit({
                kind: DuplicateSignalKind.INN,
                via: 'UF_CRM_OP_INN',
                value: '7707083893',
                title: 'ООО Ромашка',
            }),
        ]);

        expect(result).toHaveLength(1);
        expect(result[0].reasons).toHaveLength(2);
        expect(result[0].title).toBe('ООО Ромашка');
        // ИНН весомее телефона — он должен идти первой причиной.
        expect(result[0].reasons[0].kind).toBe(DuplicateSignalKind.INN);
    });

    it('score не выходит за 100', () => {
        const result = service.score([
            hit({
                kind: DuplicateSignalKind.INN,
                via: 'UF_CRM_OP_INN',
                value: 'a',
            }),
            hit({ kind: DuplicateSignalKind.PHONE, value: 'b' }),
            hit({ kind: DuplicateSignalKind.EMAIL, value: 'c' }),
        ]);
        expect(result[0].score).toBe(100);
    });

    it('одно и то же значение из двух полей считается один раз', () => {
        const twice = service.score([
            hit({
                kind: DuplicateSignalKind.INN,
                via: 'UF_CRM_OP_INN',
                value: '7707083893',
            }),
            hit({
                kind: DuplicateSignalKind.INN,
                via: 'UF_CRM_INN_2',
                value: '7707083893',
            }),
        ]);
        expect(twice[0].reasons).toHaveLength(1);
    });

    it('исключает источник поиска — себя дублем не считаем', () => {
        const result = service.score(
            [hit({ id: 10 }), hit({ id: 11 })],
            [{ entityType: DuplicateEntityType.COMPANY, id: 10 }],
        );
        expect(result.map(c => c.id)).toEqual([11]);
    });

    it('ИНН, найденный подстрокой в названии, весит как innInTitle, а не как точное поле', () => {
        // Регрессия: builder эмитит via = ключ фильтра Битрикса ('%TITLE');
        // рассинхрон со скорером давал бы такому попаданию вес 100 вместо 40.
        const result = service.score(
            [
                hit({
                    kind: DuplicateSignalKind.INN,
                    via: SEARCH_VIA.TITLE,
                    value: '7707083893',
                }),
                hit({
                    id: 11,
                    kind: DuplicateSignalKind.INN,
                    via: SEARCH_VIA.COMPANY_TITLE,
                    value: '7707083893',
                }),
                hit({
                    id: 12,
                    kind: DuplicateSignalKind.INN,
                    via: SEARCH_VIA.RQ_INN,
                    value: '7707083893',
                }),
            ],
            [],
            0,
        );

        const byId = new Map(result.map(c => [c.id, c]));
        expect(byId.get(10)?.score).toBe(DUPLICATE_MATCH_WEIGHTS.innInTitle);
        expect(byId.get(11)?.score).toBe(DUPLICATE_MATCH_WEIGHTS.innInTitle);
        expect(byId.get(12)?.score).toBe(DUPLICATE_MATCH_WEIGHTS.innRequisite);
    });

    it('отсекает слабых кандидатов по порогу и сортирует по убыванию', () => {
        const result = service.score([
            hit({
                id: 1,
                kind: DuplicateSignalKind.TITLE,
                via: '%TITLE',
                value: 'ромашка',
            }),
            hit({
                id: 2,
                kind: DuplicateSignalKind.INN,
                via: 'UF_CRM_OP_INN',
                value: '7707083893',
            }),
        ]);
        expect(result.map(c => c.id)).toEqual([2, 1]);

        const strictOnly = service.score(
            [
                hit({
                    id: 1,
                    kind: DuplicateSignalKind.TITLE,
                    via: '%TITLE',
                    value: 'ромашка',
                }),
            ],
            [],
            50,
        );
        expect(strictOnly).toHaveLength(0);
    });
});
