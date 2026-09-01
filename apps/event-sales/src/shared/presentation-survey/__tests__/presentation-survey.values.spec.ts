import { PRESENTATION_SURVEY_FIELD_CODES } from '../../../event-report/services/entity/event-report-entity-fields.model';
import {
    isPresentationSurveyEmpty,
    normalizePresentationSurvey,
    presentationSurveyAnswersByCode,
    PRESENTATION_SURVEY_CODES,
    PRESENTATION_SURVEY_FIVE_K_CODES,
    PRESENTATION_SURVEY_SUMMARY_CODES,
    PRESENTATION_SURVEY_TALK_CODES,
    PRESENTATION_SURVEY_VALUE_MAX_LENGTH,
} from '..';

/**
 * Общий whitelist анкеты «5К/Хвост» и её нормализация.
 *
 * Смысл модуля — ОДИН список кодов и ОДИН формат ответа у обоих писателей:
 * легаси-ручки `/event-sales/presentation-survey` и основного потока
 * отчёта, куда ответы приезжают в payload. Разъехавшиеся копии списка и
 * были тем классом ошибок, ради которого анкету увели в payload.
 */
describe('Общий whitelist кодов анкеты', () => {
    it('состав: девять «5К», шесть «Разговора», два сводных', () => {
        expect(PRESENTATION_SURVEY_FIVE_K_CODES).toHaveLength(9);
        expect(PRESENTATION_SURVEY_TALK_CODES).toHaveLength(6);
        expect(Object.values(PRESENTATION_SURVEY_SUMMARY_CODES)).toEqual([
            'op_presentation_xvost',
            'op_presentation_5k',
        ]);
        expect(PRESENTATION_SURVEY_CODES).toHaveLength(17);
        expect(new Set(PRESENTATION_SURVEY_CODES).size).toBe(17);
    });

    it('весь список — объединение сводных, «Разговора» и «5К»', () => {
        expect([...PRESENTATION_SURVEY_CODES]).toEqual([
            PRESENTATION_SURVEY_SUMMARY_CODES.xvost,
            PRESENTATION_SURVEY_SUMMARY_CODES.fiveKSummary,
            ...PRESENTATION_SURVEY_TALK_CODES,
            ...PRESENTATION_SURVEY_FIVE_K_CODES,
        ]);
    });

    /*
     * Поток (перенос «лид → сделки» и запись из payload) и ручка обязаны
     * ходить по ОДНОМУ списку: собственный список у любой из сторон — это
     * поле, которое молча перестаёт доезжать до карточки.
     */
    it('поток и ручка пользуются одним и тем же списком', () => {
        expect(PRESENTATION_SURVEY_FIELD_CODES).toBe(PRESENTATION_SURVEY_CODES);
    });
});

describe('Нормализация ответов анкеты', () => {
    it('оставляет только whitelisted коды, левые отбрасывает молча', () => {
        const values = normalizePresentationSurvey({
            fiveK: {
                op_5k_client_what: 'Хочет замену Консультанта',
                op_talk_impression: 'не тот блок — не пишем',
                UF_CRM_HACK: 'чужое поле',
            },
            talk: {
                op_talk_impression: 'Встретили хорошо',
                op_5k_criteri: 'не тот блок — не пишем',
            },
        });

        expect([...values.fiveK.keys()]).toEqual(['op_5k_client_what']);
        expect([...values.talk.keys()]).toEqual(['op_talk_impression']);
    });

    it('пустые и нестроковые ответы не едут вовсе', () => {
        const values = normalizePresentationSurvey({
            fiveK: {
                op_5k_client_what: '   ',
                op_5k_criteri: undefined as unknown as string,
                op_5k_command: 42 as unknown as string,
                op_5k_concurent: 'Консультант',
            },
            xvost: '\n \t ',
            fiveKSummary: '',
        });

        expect([...values.fiveK.keys()]).toEqual(['op_5k_concurent']);
        expect(values.xvost).toBeNull();
        expect(values.fiveKSummary).toBeNull();
    });

    it('обрезает по общему лимиту и снимает крайние пробелы', () => {
        const long = `  ${'я'.repeat(PRESENTATION_SURVEY_VALUE_MAX_LENGTH + 100)}  `;
        const values = normalizePresentationSurvey({
            xvost: '  Дожать через неделю  ',
            fiveKSummary: long,
        });

        expect(values.xvost).toBe('Дожать через неделю');
        expect(values.fiveKSummary).toHaveLength(
            PRESENTATION_SURVEY_VALUE_MAX_LENGTH,
        );
    });

    it('блока нет вовсе — пустая структура', () => {
        expect(isPresentationSurveyEmpty(normalizePresentationSurvey())).toBe(
            true,
        );
        expect(
            isPresentationSurveyEmpty(normalizePresentationSurvey(null)),
        ).toBe(true);
        expect(
            isPresentationSurveyEmpty(
                normalizePresentationSurvey({ fiveK: { левый: 'ответ' } }),
            ),
        ).toBe(true);
        expect(
            isPresentationSurveyEmpty(
                normalizePresentationSurvey({ xvost: 'Дожать' }),
            ),
        ).toBe(false);
    });
});

/**
 * Ответы одной картой «код поля → ответ»: этим адресом пользуются ВСЕ
 * писатели анкеты — запись в сущности (какой ответ уже пришёл в payload и
 * не нуждается в переносе с лида) и снимок для элемента смарта (перевод
 * кода реестра в код поля смарта по зеркалу).
 */
describe('Ответы анкеты одной картой', () => {
    it('сводные ложатся под своими кодами, детальные — под своими', () => {
        const answers = presentationSurveyAnswersByCode(
            normalizePresentationSurvey({
                xvost: 'Дожать через неделю',
                fiveKSummary: 'Решает директор',
                fiveK: { op_5k_client_what: 'Хочет замену' },
                talk: { op_talk_impression: 'Слушали внимательно' },
            }),
        );

        expect(Object.fromEntries(answers)).toEqual({
            op_presentation_xvost: 'Дожать через неделю',
            op_presentation_5k: 'Решает директор',
            op_5k_client_what: 'Хочет замену',
            op_talk_impression: 'Слушали внимательно',
        });
    });

    it('пустая анкета — пустая карта, без ключей-пустышек', () => {
        expect(
            presentationSurveyAnswersByCode(normalizePresentationSurvey()).size,
        ).toBe(0);
    });
});
