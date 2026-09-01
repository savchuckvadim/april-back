import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
    ContactDto,
    ContactMultifieldDto,
} from '../dto/event-sale-flow/contact.dto';
import {
    EventSalesFlowDto,
    ReturnToTmcDto,
} from '../dto/event-sale-flow/event-sales-flow.dto';
import {
    PresentationDto,
    PresentationSurveyAnswersDto,
} from '../dto/event-sale-flow/presentation.dto';
import { QuestionnaireAnswerDto } from '../dto/event-sale-flow/questionnaire-answer.dto';
import { PlanDto, PlanTypeDto } from '../dto/event-sale-flow/plan.dto';
import { ReportDto } from '../dto/event-sale-flow/report.dto';
import {
    EnumEventItemResultType,
    EnumWorkStatusCode,
    EnumWorkStatusName,
} from '../types/report-types';

describe('ContactDto', () => {
    it('валиден при полностью пустом контакте (нет даже ID и имени)', async () => {
        const dto = plainToInstance(ContactDto, {});
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
    });

    it('валиден, если у телефона нет TYPE', async () => {
        const dto = plainToInstance(ContactDto, {
            PHONE: [{ VALUE: '+79991234567' }],
        });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
    });

    it('валиден, если у email нет TYPE и VALUE', async () => {
        const dto = plainToInstance(ContactDto, {
            EMAIL: [{}],
        });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
    });

    it('невалиден, если TYPE телефона не строка', async () => {
        const dto = plainToInstance(ContactMultifieldDto, { TYPE: 123 });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
    });
});

describe('ReturnToTmcDto', () => {
    it('валиден, когда data — объект TmcDealsForReturn (legacy-контракт)', async () => {
        const dto = plainToInstance(ReturnToTmcDto, {
            data: {
                taskId: 1024,
                tmcDeal: { ID: '77', TITLE: 'ТМЦ сделка' },
            },
            isActive: true,
        });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
    });

    it('валиден, когда data — falsy-значение legacy-фронта (false)', async () => {
        const dto = plainToInstance(ReturnToTmcDto, {
            data: false,
            isActive: false,
        });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
    });

    it('валиден при полностью пустом объекте', async () => {
        const dto = plainToInstance(ReturnToTmcDto, {});
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
    });

    it('невалиден, если isActive не boolean', async () => {
        const dto = plainToInstance(ReturnToTmcDto, { isActive: 'yes' });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
    });
});

describe('PlanTypeDto', () => {
    it('валиден, когда тип не выбран (current: null) — недозвон без плана', async () => {
        const dto = plainToInstance(PlanTypeDto, { current: null });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
    });

    it('невалиден, если у выбранного типа неизвестный code', async () => {
        const dto = plainToInstance(PlanTypeDto, {
            current: { id: 1, code: 'unknown', name: 'Что-то' },
        });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
    });
});

describe('PlanDto — флаг «важная» (isImportant, todo2508-02 №10)', () => {
    // Полный валидный план: у PlanDto много обязательных полей, флаг
    // проверяем на нём, а не в вакууме.
    const basePlan = {
        responsibility: { ID: 5 },
        createdBy: { ID: 5 },
        type: { current: null },
        name: 'Перезвонить по КП',
        deadline: '10.06.2026 15:00:00',
        isPlanned: true,
        contact: null,
        isActive: true,
    };

    it('валиден с isImportant: true — поле проходит whitelist-валидацию', async () => {
        const dto = plainToInstance(PlanDto, {
            ...basePlan,
            isImportant: true,
        });
        const errors = await validate(dto, { whitelist: true });
        expect(errors).toHaveLength(0);
        expect(dto.isImportant).toBe(true);
    });

    it('валиден без isImportant (старые сборки фрейма поле не шлют)', async () => {
        const dto = plainToInstance(PlanDto, basePlan);
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
        expect(dto.isImportant).toBeUndefined();
    });

    it('невалиден, если isImportant не boolean', async () => {
        const dto = plainToInstance(PlanDto, {
            ...basePlan,
            isImportant: 'yes',
        });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
    });
});

describe('ReportDto', () => {
    const noCallReport = {
        resultStatus: null,
        description: 'Перенос - не было времени',
        workStatus: {
            current: {
                id: 0,
                code: EnumWorkStatusCode.inJob,
                name: EnumWorkStatusName.inJob,
                isActive: true,
            },
        },
        noresultReason: {
            current: {
                id: 4,
                code: 'noresult_notime',
                name: 'Перенос - не было времени',
                isActive: true,
            },
        },
        failType: {
            current: {
                id: 2,
                code: 'garant',
                name: 'Гарант/Запрет',
                isActive: true,
            },
        },
        failReason: {
            current: {
                id: 0,
                code: 'fail_notime',
                name: 'Не было времени',
                isActive: true,
            },
        },
        isNoCall: true,
    };

    it('валиден при resultStatus: null — отправка недозвона из списка', async () => {
        const dto = plainToInstance(ReportDto, noCallReport);
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
    });

    it('валиден при заполненном resultStatus', async () => {
        const dto = plainToInstance(ReportDto, {
            ...noCallReport,
            resultStatus: EnumEventItemResultType.RESULT,
            isNoCall: false,
        });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
    });

    it('невалиден, если resultStatus не из перечисления', async () => {
        const dto = plainToInstance(ReportDto, {
            ...noCallReport,
            resultStatus: 'done',
        });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
    });
});

/**
 * Ответы портальных анкет, адресованные полям ЭЛЕМЕНТА смарта.
 *
 * Поле обязано быть НЕобязательным: бандл фрейма кэшируется встройкой
 * Битрикса, и старый клиент шлёт payload без него — получить 400 он не
 * должен (то же правило, что у `openTasks`).
 */
describe('EventSalesFlowDto.questionnaireAnswers', () => {
    const flow = (over: Record<string, unknown> = {}) => ({
        domain: 'x.bitrix24.ru',
        ...over,
    });

    it('поле не прислано — прежнее поведение (валидно)', async () => {
        const dto = plainToInstance(EventSalesFlowDto, flow());
        const errors = await validate(dto, { skipMissingProperties: true });
        expect(
            errors.some(error => error.property === 'questionnaireAnswers'),
        ).toBe(false);
    });

    it('валиден список пар «анкета, вопрос, ответ»', async () => {
        const dto = plainToInstance(
            EventSalesFlowDto,
            flow({
                questionnaireAnswers: [
                    {
                        questionnaire: 'q_pres',
                        item: 'decision',
                        value: 'Решает директор',
                    },
                    { questionnaire: 'q_pres', item: 'ready', value: 'Y' },
                ],
            }),
        );
        const errors = await validate(dto, { skipMissingProperties: true });

        expect(
            errors.some(error => error.property === 'questionnaireAnswers'),
        ).toBe(false);
        expect(dto.questionnaireAnswers?.[0]).toBeInstanceOf(
            QuestionnaireAnswerDto,
        );
    });

    it('невалиден ответ без кода вопроса', async () => {
        // Проверяем сам пункт: у конверта верхнего уровня валидация идёт
        // со skipMissingProperties (там пропущенные поля — норма).
        const dto = plainToInstance(QuestionnaireAnswerDto, {
            questionnaire: 'q_pres',
            value: 'Решает директор',
        });
        const errors = await validate(dto);

        expect(errors.some(error => error.property === 'item')).toBe(true);
    });

    it('невалидно нестроковое значение ответа', async () => {
        const dto = plainToInstance(
            EventSalesFlowDto,
            flow({
                questionnaireAnswers: [
                    { questionnaire: 'q_pres', item: 'sum', value: 150000 },
                ],
            }),
        );
        const errors = await validate(dto, { skipMissingProperties: true });

        expect(
            errors.some(error => error.property === 'questionnaireAnswers'),
        ).toBe(true);
    });
});

/**
 * Анкета «5К/Хвост» — опциональный блок ВНУТРИ `presentation`.
 *
 * Опциональность обязательна по той же причине, что у
 * `questionnaireAnswers`: бандл фрейма кэшируется встройкой Битрикса, и
 * старая сборка шлёт `presentation` без `survey` — 400 она получить не
 * должна, а поток обязан отработать ровно как раньше.
 */
describe('PresentationDto.survey', () => {
    const presentation = (over: Record<string, unknown> = {}) => ({
        count: { company: 0, smart: 0, deal: 0 },
        isPresentationDone: true,
        isUnplannedPresentation: false,
        ...over,
    });

    it('блок не прислан — валидно (старые сборки фрейма)', async () => {
        const dto = plainToInstance(PresentationDto, presentation());
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
    });

    it('валиден блок ответов: сводные + «5К» + «Разговор»', async () => {
        const dto = plainToInstance(
            PresentationDto,
            presentation({
                survey: {
                    xvost: 'Дожать через неделю',
                    fiveKSummary: 'Клиент готов, решает директор',
                    fiveK: { op_5k_client_what: 'Хочет замену' },
                    talk: { op_talk_impression: 'Встретили хорошо' },
                },
            }),
        );
        const errors = await validate(dto);

        expect(errors).toHaveLength(0);
        expect(dto.survey).toBeInstanceOf(PresentationSurveyAnswersDto);
    });

    it('невалиден нестроковый сводный ответ', async () => {
        const dto = plainToInstance(
            PresentationDto,
            presentation({ survey: { xvost: { text: 'нет' } } }),
        );
        const errors = await validate(dto);

        expect(errors.some(error => error.property === 'survey')).toBe(true);
    });
});
