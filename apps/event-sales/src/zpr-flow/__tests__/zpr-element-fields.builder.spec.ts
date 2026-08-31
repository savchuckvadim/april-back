import { ZprElementFieldsBuilder } from '../services/zpr-element-fields.builder';
import { BxRow } from '../types/zpr-flow-run.type';
import { answer, dateAnswer, makeRun } from './zpr-flow.fixtures';

/**
 * Правила раскладки ПОЛЕЙ элемента ЗПР: адресация UF-ключей, снимок анкеты,
 * ответы портальной анкеты. Стадии — в zpr-stage.resolver.spec, связи — в
 * zpr-element-links.builder.spec. Битрикс сюда не заглядывает вовсе —
 * билдер только наполняет словарь.
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
});
