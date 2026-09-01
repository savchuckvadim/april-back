import { Logger } from '@nestjs/common';
import { PresElementFieldsBuilder } from '../services/pres-element-fields.builder';
import {
    BxRow,
    PresentationFlowRun,
} from '../types/presentation-flow-run.type';

/**
 * Раскладка СНИМКА анкеты по полям элемента презентации.
 *
 * Снимок приезжает в джобе готовым (см. presentation-survey-snapshot):
 * ключ — код поля НАШЕГО реестра, значение — ответ. Здесь проверяем
 * последнюю милю: перевод кода в фактический camel-ключ портала и мягкую
 * деградацию, когда поля смарта на портале нет.
 */
const makeRun = (survey: Record<string, string>): PresentationFlowRun =>
    ({
        info: {
            ufKeyByCode: {
                PRES_5K_SUMMARY: 'ufCrm85kSummary',
                PRES_XVOST: 'ufCrm8Xvost',
            },
            enumItems: {},
        },
        job: { domain: 'd.b24.ru', survey },
    }) as unknown as PresentationFlowRun;

describe('PresElementFieldsBuilder.applySurvey', () => {
    it('снимок раскладывается по фактическим ключам полей смарта', () => {
        const fields: BxRow = {};

        new PresElementFieldsBuilder(
            makeRun({
                PRES_5K_SUMMARY: 'Решает директор',
                PRES_XVOST: 'Дожать через неделю',
            }),
        ).applySurvey(fields);

        expect(fields.ufCrm85kSummary).toBe('Решает директор');
        expect(fields.ufCrm8Xvost).toBe('Дожать через неделю');
    });

    /*
     * Поля нет на портале (старая установка смарта) — записать ответ
     * некуда. Раньше он пропадал молча; теперь пропуск виден в логах, а
     * остальные ответы пишутся: мягкая деградация, а не падение.
     */
    it('поле смарта не установлено — пропуск с warning, остальное пишется', () => {
        const warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        const fields: BxRow = {};

        new PresElementFieldsBuilder(
            makeRun({
                PRES_5K_SUMMARY: 'Решает директор',
                PRES_TALK_IMPRESSION: 'Слушали внимательно',
            }),
        ).applySurvey(fields);

        expect(fields.ufCrm85kSummary).toBe('Решает директор');
        expect(Object.keys(fields)).toEqual(['ufCrm85kSummary']);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('PRES_TALK_IMPRESSION'),
        );
        warn.mockRestore();
    });

    it('снимка нет — ни поля, ни warning', () => {
        const warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        const fields: BxRow = {};

        new PresElementFieldsBuilder(makeRun({})).applySurvey(fields);

        expect(fields).toEqual({});
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });
});
