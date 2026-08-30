import { Logger } from '@nestjs/common';
import { QuestionnaireCatalog } from '@lib/portal-lib/store/questionnaires';
import { QuestionnaireSmartContextLoader } from '../services/post-flow/questionnaire-smart-context.loader';

/**
 * Загрузчик контекста портальных анкет.
 *
 * Ответственность у него ровно одна — «по отчёту отдать снимок анкет либо
 * честный null», — и вся она про ДЕГРАДАЦИЮ: каталог и настройки живут за
 * Redis-кэшем, падать умеет каждый по отдельности, и цена ошибки разная.
 * Каталог недоступен — адресов полей нет, писать некуда, ответы теряются
 * (и об этом обязан быть лог). Настройки недоступны — выключателя просто
 * нет, и ответ уезжает: терять заполненную менеджером анкету из-за
 * упавшего Redis хуже, чем записать её.
 *
 * Плюс горячий путь: пока ответов анкеты в отчёте нет (обычный случай), не
 * должно быть НИ ОДНОГО чтения — раньше это был единственный способ не
 * удлинять каждый отчёт двумя походами в портал.
 */

/** Пустой каталог: ответ по нему адреса не получит — это и есть потеря. */
const emptyCatalog = (): QuestionnaireCatalog => ({
    contract: 1,
    version: 1,
    hash: 'hash',
    questionnaires: [],
});

const ANSWERS = [
    { questionnaire: 'q_pres', item: 'decision', value: 'Директор' },
];

const makeDto = (answers: unknown[] = ANSWERS) =>
    ({
        domain: 'test.bitrix24.ru',
        questionnaireAnswers: answers,
    }) as never;

/** Отчёт без анкет: поля нет вовсе — как у клиента старого фрейма. */
const makeDtoWithoutAnswers = () => ({ domain: 'test.bitrix24.ru' }) as never;

interface PortalMock {
    resolve: jest.Mock;
}

const makeLoader = (
    questionnaires: PortalMock,
    appSettings: PortalMock,
): QuestionnaireSmartContextLoader =>
    new QuestionnaireSmartContextLoader(
        questionnaires as never,
        appSettings as never,
    );

describe('QuestionnaireSmartContextLoader', () => {
    const warnLogs: string[] = [];

    beforeEach(() => {
        warnLogs.length = 0;
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(((
            message: unknown,
        ): void => {
            warnLogs.push(String(message));
        }) as never);
    });

    afterEach(() => jest.restoreAllMocks());

    it('ответов анкеты нет — ни каталог, ни настройки не читаются', async () => {
        const questionnaires: PortalMock = { resolve: jest.fn() };
        const appSettings: PortalMock = { resolve: jest.fn() };

        const context = await makeLoader(
            questionnaires,
            appSettings,
        ).loadQuestionnaireSmartContext(makeDtoWithoutAnswers());

        expect(context).toBeNull();
        // Горячий путь: ни одного лишнего похода в портал на каждом отчёте.
        expect(questionnaires.resolve).not.toHaveBeenCalled();
        expect(appSettings.resolve).not.toHaveBeenCalled();
    });

    it('каталог и выключатель по типам события едут в один контекст', async () => {
        const catalog = emptyCatalog();
        const questionnaires: PortalMock = {
            resolve: jest.fn().mockResolvedValue(catalog),
        };
        const appSettings: PortalMock = {
            resolve: jest
                .fn()
                .mockResolvedValue({ questionnairesDisabledEventTypes: 'hot' }),
        };

        const context = await makeLoader(
            questionnaires,
            appSettings,
        ).loadQuestionnaireSmartContext(makeDto());

        expect(context).toEqual({
            catalog,
            answers: ANSWERS,
            disabledEventTypes: ['hot'],
        });
    });

    it('каталог недоступен — контекста нет, а в логе видно сколько ответов потеряно', async () => {
        const questionnaires: PortalMock = {
            resolve: jest.fn().mockRejectedValue(new Error('redis недоступен')),
        };
        const appSettings: PortalMock = { resolve: jest.fn() };

        const context = await makeLoader(
            questionnaires,
            appSettings,
        ).loadQuestionnaireSmartContext(makeDto());

        expect(context).toBeNull();
        expect(
            warnLogs.some(
                message =>
                    message.includes('каталог анкет test.bitrix24.ru') &&
                    message.includes('1 ответ(ов)'),
            ),
        ).toBe(true);
    });

    it('настройки недоступны — выключателя нет, но ответы всё равно уезжают', async () => {
        const questionnaires: PortalMock = {
            resolve: jest.fn().mockResolvedValue(emptyCatalog()),
        };
        const appSettings: PortalMock = {
            resolve: jest.fn().mockRejectedValue(new Error('настройки легли')),
        };

        const context = await makeLoader(
            questionnaires,
            appSettings,
        ).loadQuestionnaireSmartContext(makeDto());

        // Ответ менеджера дороже выключателя: контекст остаётся рабочим.
        expect(context?.disabledEventTypes).toEqual([]);
        expect(context?.answers).toEqual(ANSWERS);
        expect(
            warnLogs.some(message =>
                message.includes('настройки test.bitrix24.ru недоступны'),
            ),
        ).toBe(true);
    });

    it('ответ, которого нет в каталоге, попадает в лог потерь с причиной', async () => {
        const questionnaires: PortalMock = {
            resolve: jest.fn().mockResolvedValue(emptyCatalog()),
        };
        const appSettings: PortalMock = {
            resolve: jest.fn().mockResolvedValue({
                questionnairesDisabledEventTypes: null,
            }),
        };

        await makeLoader(
            questionnaires,
            appSettings,
        ).loadQuestionnaireSmartContext(makeDto());

        // Снимок отбрасывает такие ответы молча — расследовать «куда делся
        // ответ» без этой строки было бы нечем.
        const lost = warnLogs.find(message =>
            message.startsWith('[questionnaire] test.bitrix24.ru'),
        );
        expect(lost).toContain('q_pres:decision');
        expect(lost).toContain('такого вопроса в каталоге портала нет');
    });
});
