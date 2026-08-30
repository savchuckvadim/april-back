import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { EventReportContext } from '../services/context/event-report.context';
import { DealFlowResult } from '../services/deal/event-report-deal-flow.service';
import {
    SideFlowJobBuildInput,
    sideJobId,
} from '../services/post-flow/side-flow-job.base';
import { buildZprFlowJobs } from '../services/post-flow/zpr-flow-job.builder';
import { buildPresentationFlowJobs } from '../services/post-flow/presentation-flow-job.builder';

/**
 * Сборка джобов сайд-очередей.
 *
 * Раньше эти два десятка полей были продублированы в двух методах use-case,
 * а созданная отчётом план-задача до потоков не доезжала вовсе: элемент
 * плана оставался без привязки к задаче до СЛЕДУЮЩЕГО отчёта по ней.
 * Проверяем ровно это: состав kind'ов (включая перенос), единую базу полей
 * у обоих потоков и то, что `planTaskId` доехал в оба типа джоба.
 *
 * Спека одна на три файла сборки (`side-flow-job.base` + два билдера
 * потоков) намеренно: главный её кейс — «база совпадает у ЗПР и презентаций
 * поле в поле» — по определению перекрёстный, и разложить его по спекам
 * отдельных файлов нельзя, не потеряв сам инвариант.
 */
// В рантайме плагины dayjs расширяются при импорте @lib/shared/lib/date;
// юнит-тест воспроизводит это состояние явно (дедлайн плана форматируется
// в таймзоне портала).
dayjs.extend(utc);
dayjs.extend(timezone);

const makePortal = () => ({
    getTimezone: () => 'Europe/Moscow',
    // Снимок анкеты презентации читает поля портала; в этих кейсах
    // ни лида, ни базовой сделки нет — до полей дело не доходит.
    getEntityFieldByCode: () => undefined,
    getFieldBitrixId: () => '',
    getPortal: () => ({ domain: 'test.bitrix24.ru' }),
});

const makeCtx = (dto: Record<string, unknown>, init: object = {}) =>
    new EventReportContext(
        {
            domain: 'test.bitrix24.ru',
            operationId: 'op-1',
            ...dto,
        } as never,
        makePortal() as never,
        {
            entityType: 'company',
            entityId: 7,
            company: { ID: '7' },
            lead: null,
            currentBaseDeal: { ID: '101' },
            currentPresDeal: null,
            currentTmcDeal: null,
            currentTmcFromPresentation: null,
            currentTask: { id: 555 },
            ...init,
        } as never,
        new Date('2026-08-30T09:00:00.000Z'),
    );

const DEALS: DealFlowResult = {
    baseDealId: null,
    newPlanPresDealId: null,
    newUnplannedPresDealId: null,
};

const makeInput = (
    ctx: EventReportContext,
    planTaskId: number | null = 900,
): SideFlowJobBuildInput => ({
    ctx,
    deals: DEALS,
    planTaskId,
    questionnaire: null,
    socketId: 'socket-1',
});

/** Отчёт по ЗПР-задаче + план следующего ЗПР — оба kind'а сразу. */
const zprReportAndPlanCtx = () =>
    makeCtx({
        currentTask: { eventType: 'hot', name: 'ООО Ромашка' },
        report: {
            resultStatus: 'result',
            description: 'дозвонились',
            workStatus: { current: { code: 'inJob' } },
        },
        plan: {
            isPlanned: true,
            isActive: true,
            type: { current: { code: 'hot' } },
            name: 'Решение',
            deadline: '02.09.2026 10:00:00',
            responsibility: { ID: 12 },
            createdBy: { ID: 34 },
            contact: { ID: 77 },
        },
    });

describe('buildZprFlowJobs', () => {
    it('отчёт по ЗПР + план ЗПР дают два джоба в порядке report → plan', () => {
        const jobs = buildZprFlowJobs(makeInput(zprReportAndPlanCtx()));

        expect(jobs.map(job => job.kind)).toEqual(['report', 'plan']);
    });

    it('перенос даёт ОДИН джоб report с isMove — второй открытый элемент не заводится', () => {
        const ctx = makeCtx({
            currentTask: { eventType: 'hot' },
            // Не результат и не финал, план не выключен — это перенос.
            report: {
                resultStatus: 'noresult',
                workStatus: { current: { code: 'inJob' } },
            },
            plan: {
                isPlanned: true,
                isActive: true,
                type: { current: { code: 'hot' } },
            },
        });

        const jobs = buildZprFlowJobs(makeInput(ctx));

        expect(jobs).toHaveLength(1);
        expect(jobs[0].kind).toBe('report');
        expect(jobs[0].isMove).toBe(true);
    });

    it('перенос план-only (отчёт не по ЗПР) двигает элемент по плану', () => {
        const ctx = makeCtx({
            currentTask: { eventType: 'warm' },
            report: {
                resultStatus: 'noresult',
                workStatus: { current: { code: 'inJob' } },
            },
            plan: {
                isPlanned: true,
                isActive: true,
                type: { current: { code: 'hot' } },
            },
        });

        const jobs = buildZprFlowJobs(makeInput(ctx));

        expect(jobs.map(job => job.kind)).toEqual(['report']);
        expect(jobs[0].isMove).toBe(true);
    });

    it('событие не «Решение» — очередь не трогаем', () => {
        const ctx = makeCtx({
            currentTask: { eventType: 'warm' },
            report: {
                resultStatus: 'result',
                workStatus: { current: { code: 'inJob' } },
            },
            plan: {
                isPlanned: true,
                isActive: true,
                type: { current: { code: 'warm' } },
            },
        });

        expect(buildZprFlowJobs(makeInput(ctx))).toEqual([]);
    });

    it('план-задача уезжает в ОБА джоба — плановый элемент привяжется сразу', () => {
        const jobs = buildZprFlowJobs(makeInput(zprReportAndPlanCtx(), 900));

        expect(jobs.map(job => job.planTaskId)).toEqual([900, 900]);
        // Закрываемая задача при этом остаётся отдельным полем.
        expect(jobs.map(job => job.taskId)).toEqual([555, 555]);
    });

    it('плана в отчёте не было — planTaskId едет как null, а не теряется', () => {
        const jobs = buildZprFlowJobs(makeInput(zprReportAndPlanCtx(), null));

        expect(jobs[0].planTaskId).toBeNull();
    });

    it('отказ (в т.ч. «не ЦА») закрывает звонок своей стадией', () => {
        const ctx = makeCtx({
            currentTask: { eventType: 'hot' },
            report: {
                resultStatus: 'result',
                workStatus: { current: { code: 'fail' } },
            },
            leadSync: { notCaTypeCode: 'not_ca' },
            plan: { isPlanned: false, isActive: false },
        });

        const jobs = buildZprFlowJobs(makeInput(ctx));

        expect(jobs).toHaveLength(1);
        expect(jobs[0].isFail).toBe(true);
    });
});

describe('buildPresentationFlowJobs', () => {
    it('проведённая презентация + план следующей дают report и plan', () => {
        const ctx = makeCtx({
            currentTask: { eventType: 'presentation' },
            presentation: { isPresentationDone: true },
            report: {
                resultStatus: 'result',
                workStatus: { current: { code: 'inJob' } },
            },
            plan: {
                isPlanned: true,
                isActive: true,
                type: { current: { code: 'presentation' } },
            },
        });

        const jobs = buildPresentationFlowJobs(makeInput(ctx));

        expect(jobs.map(job => job.kind)).toEqual(['report', 'plan']);
    });

    it('перенос презентации не создаёт план-джоб — иначе утёк бы второй элемент', () => {
        const ctx = makeCtx({
            currentTask: { eventType: 'presentation' },
            report: {
                resultStatus: 'noresult',
                workStatus: { current: { code: 'inJob' } },
            },
            plan: {
                isPlanned: true,
                isActive: true,
                type: { current: { code: 'presentation' } },
            },
        });

        const jobs = buildPresentationFlowJobs(makeInput(ctx));

        expect(jobs.map(job => job.kind)).toEqual(['report']);
        expect(jobs[0].outcome).toBe('expired');
    });

    it('отчёт не про презентацию — очередь не трогаем', () => {
        const ctx = makeCtx({
            currentTask: { eventType: 'hot' },
            report: {
                resultStatus: 'result',
                workStatus: { current: { code: 'inJob' } },
            },
            plan: {
                isPlanned: true,
                isActive: true,
                type: { current: { code: 'hot' } },
            },
        });

        expect(buildPresentationFlowJobs(makeInput(ctx))).toEqual([]);
    });

    it('план-задача уезжает и в презентационный джоб', () => {
        const ctx = makeCtx({
            currentTask: { eventType: 'warm' },
            report: {
                resultStatus: 'result',
                workStatus: { current: { code: 'inJob' } },
            },
            plan: {
                isPlanned: true,
                isActive: true,
                type: { current: { code: 'presentation' } },
            },
        });

        const jobs = buildPresentationFlowJobs(makeInput(ctx, 901));

        expect(jobs.map(job => job.kind)).toEqual(['plan']);
        expect(jobs[0].planTaskId).toBe(901);
    });
});

describe('общая база полей сайд-джобов', () => {
    /**
     * База собирается ОДНИМ кодом на оба потока: раньше это были две копии,
     * и правка одной из них молча расходилась со второй.
     */
    it('совпадает у ЗПР и презентаций поле в поле', () => {
        const ctx = makeCtx({
            currentTask: { eventType: 'presentation' },
            presentation: { isPresentationDone: true },
            report: {
                resultStatus: 'result',
                description: 'провели',
                workStatus: { current: { code: 'inJob' } },
            },
            plan: {
                isPlanned: true,
                isActive: true,
                type: { current: { code: 'hot' } },
                name: 'Решение',
                deadline: '02.09.2026 10:00:00',
                responsibility: { ID: 12 },
                contact: { ID: 77 },
            },
        });
        const input = makeInput(ctx, 900);

        const zpr = buildZprFlowJobs(input)[0];
        const presentation = buildPresentationFlowJobs(input)[0];

        const base = {
            domain: 'test.bitrix24.ru',
            operationId: 'op-1',
            socketId: 'socket-1',
            baseDealId: 101,
            presDealId: null,
            companyId: 7,
            leadId: null,
            contactId: 77,
            responsibleId: 12,
            taskId: 555,
            planTaskId: 900,
            planDeadline: '02.09.2026 10:00:00',
            planName: 'Решение',
            planComment: 'провели',
            reportComment: 'провели',
            isResult: true,
        };

        expect(zpr).toMatchObject(base);
        expect(presentation).toMatchObject(base);
    });
});

describe('sideJobId', () => {
    it('склеивает детерминированный id из operationId, потока и kind', () => {
        expect(sideJobId('op-1', 'zpr', 'plan')).toBe('op-1:zpr:plan');
    });

    it('без operationId (легаси-клиент) id не выдаёт — поведение прежнее', () => {
        expect(sideJobId(undefined, 'pres', 'report')).toBeUndefined();
    });
});
