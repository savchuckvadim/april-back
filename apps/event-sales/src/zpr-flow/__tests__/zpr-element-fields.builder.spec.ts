import {
    hasLink,
    itemIdOf,
    ZprElementFieldsBuilder,
} from '../services/zpr-element-fields.builder';
import { BxRow } from '../types/zpr-flow-run.type';
import { answer, dateAnswer, makeInfo, makeRun } from './zpr-flow.fixtures';

/**
 * Правила раскладки полей элемента ЗПР: связи, системные родители, снимок
 * анкеты, ответы портальной анкеты и выбор стадии закрытия. Битрикс сюда
 * не заглядывает вовсе — билдер только наполняет словарь.
 */
describe('ZprElementFieldsBuilder', () => {
    it('setUf пропускает пустые значения и незаведённые поля', () => {
        const builder = new ZprElementFieldsBuilder(makeRun());
        const fields: BxRow = {};

        builder.setUf(fields, 'ZPR_PLAN_COMMENT', null);
        builder.setUf(fields, 'ZPR_REPORT_COMMENT', '');
        builder.setUf(fields, 'ZPR_COMMENTS', []);
        // Поля нет на портале (старая установка смарта) — писать некуда.
        builder.setUf(fields, 'ZPR_OBJECTIONS', 'Дорого');

        expect(fields).toEqual({});
    });

    it('связи клиента раскладываются в формате привязок (D_/CO_/L_/C_)', () => {
        const builder = new ZprElementFieldsBuilder(makeRun());
        const fields: BxRow = {};

        builder.applyLinks(fields);

        expect(fields.ufCrm7BaseDeal).toEqual(['D_100']);
        expect(fields.ufCrm7PresDeal).toEqual(['D_77']);
        expect(fields.ufCrm7Company).toEqual(['CO_431']);
        expect(fields.ufCrm7Lead).toEqual(['L_42']);
        expect(fields.ufCrm7Contact).toEqual(['C_9']);
    });

    it('элемент получает системных РОДИТЕЛЕЙ (вкладка и фильтр в карточке)', () => {
        const builder = new ZprElementFieldsBuilder(makeRun());
        const fields: BxRow = {};

        builder.applyParents(fields);

        // parentId{entityTypeId}: 2 — сделка, 4 — компания, 1 — лид, 3 — контакт.
        expect(fields.parentId2).toBe(100);
        expect(fields.parentId4).toBe(431);
        expect(fields.parentId1).toBe(42);
        expect(fields.parentId3).toBe(9);
    });

    it('снимок анкеты раскладывается по кодам полей смарта', () => {
        // Состав снимка ещё не собирается (см. ZprSurveySnapshot), но
        // контракт обязан работать: поток — зеркало презентационного.
        const builder = new ZprElementFieldsBuilder(
            makeRun({ job: { survey: { ZPR_REPORT_COMMENT: 'Итог' } } }),
        );
        const fields: BxRow = {};

        builder.applySurvey(fields);

        expect(fields.ufCrm7ReportComment).toBe('Итог');
    });

    it('ответы анкеты ложатся по живым полям элемента', () => {
        const builder = new ZprElementFieldsBuilder(
            makeRun({
                job: {
                    answers: [
                        answer({ purpose: 'plan', value: 'Ждут КП' }),
                        dateAnswer(),
                    ],
                },
            }),
        );
        const fields: BxRow = {};

        builder.applyAnswers(fields, ['plan']);

        expect(fields.ufCrm7QObjection).toBe('Ждут КП');
        // Дата приводится к формату портала.
        expect(fields.ufCrm7QDecisionAt).toBe('20.09.2026');
    });

    it('ответ ПЛАНА в отчётный элемент не едет', () => {
        const builder = new ZprElementFieldsBuilder(
            makeRun({ job: { answers: [answer({ purpose: 'plan' })] } }),
        );
        const fields: BxRow = {};

        builder.applyAnswers(fields, ['report']);

        expect(fields.ufCrm7QObjection).toBeUndefined();
    });

    it('живые поля не прочитаны — ответы не пишутся, но об этом есть warning', () => {
        const builder = new ZprElementFieldsBuilder(
            makeRun({
                itemFields: null,
                job: { answers: [answer({ purpose: 'plan' })] },
            }),
        );
        const warn = jest
            .spyOn(builder['logger'], 'warn')
            .mockImplementation(() => undefined);
        const fields: BxRow = {};

        builder.applyAnswers(fields, ['plan']);

        expect(fields.ufCrm7QObjection).toBeUndefined();
        expect(warn).toHaveBeenCalled();
    });

    it('ответов нет — анкета ничего не трогает', () => {
        const builder = new ZprElementFieldsBuilder(makeRun());
        const fields: BxRow = {};

        builder.applyAnswers(fields, ['plan']);

        expect(fields).toEqual({});
    });

    it('не дозвонились → «Не состоялся»', () => {
        const builder = new ZprElementFieldsBuilder(
            makeRun({ job: { isResult: false } }),
        );
        expect(builder.resolveClosingStage()).toBe('DT1038_9:NORESULT');
    });

    it('состоялся + отказ → отдельная стадия «Состоялся: отказ»', () => {
        const builder = new ZprElementFieldsBuilder(
            makeRun({ job: { isResult: true, isFail: true } }),
        );
        // Дозвон СОСТОЯЛСЯ — это не «не состоялся»; но и не успех работы.
        expect(builder.resolveClosingStage()).toBe('DT1038_9:RESULT_FAIL');
    });

    it('состоялся без отказа → «Состоялся: в работе»', () => {
        const builder = new ZprElementFieldsBuilder(
            makeRun({ job: { isResult: true } }),
        );
        expect(builder.resolveClosingStage()).toBe('DT1038_9:SUCCESS');
    });

    it('старая установка без стадии отказа — фолбэк на «Состоялся»', () => {
        const stageIdByCode: Record<string, string> = {
            ...makeInfo().stageIdByCode,
        };
        delete stageIdByCode.zpr_result_fail;
        const builder = new ZprElementFieldsBuilder(
            makeRun({
                info: makeInfo({ stageIdByCode }),
                job: { isResult: true, isFail: true },
            }),
        );

        expect(builder.resolveClosingStage()).toBe('DT1038_9:SUCCESS');
    });

    it('hasLink терпит и привязку D_100, и голый id', () => {
        expect(hasLink(['D_100'], 'D', 100)).toBe(true);
        // Битрикс нормализовал одиночно-типизированное поле до id.
        expect(hasLink(['100'], 'D', 100)).toBe(true);
        expect(hasLink('CO_431', 'CO', 431)).toBe(true);
        expect(hasLink(['D_999'], 'D', 100)).toBe(false);
        expect(hasLink(null, 'D', 100)).toBe(false);
    });

    it('itemIdOf достаёт id созданного элемента, мусор читает как null', () => {
        expect(itemIdOf({ result: { item: { id: 601 } } })).toBe(601);
        expect(itemIdOf({ result: { item: { id: '601' } } })).toBe(601);
        expect(itemIdOf({ result: {} })).toBeNull();
        expect(itemIdOf(null)).toBeNull();
    });
});
