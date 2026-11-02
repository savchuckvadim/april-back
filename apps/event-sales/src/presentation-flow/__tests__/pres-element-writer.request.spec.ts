import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PresentationSmartInfo } from '@lib/portal-lib/pbx/pbx-presentation-smart';
import { FlowBitrix } from '../../shared/side-flow';
import { PresentationFlowJobData } from '../dto/presentation-flow-job.dto';
import { PresentationFlowRun } from '../types/presentation-flow-run.type';
import { PresElementWriterService } from '../services/pres-element-writer.service';

/**
 * Заявка ТМЦ в смарте «Презентации» (поток ТМЦ, 02.11.2026): элемент
 * рождается в «Заявка на презентацию» за ТМЦ-менеджером, а план презентации
 * менеджера ОП по той же ТМЦ-сделке ПРОДВИГАЕТ его в «Запланирована», а не
 * заводит второй — все состояния одной презентации в одном элементе.
 */
const INFO = {
    entityTypeId: 1040,
    typeId: 8,
    ufKeyByCode: {
        PRES_BASE_DEAL: 'ufCrm8BaseDeal',
        PRES_DEAL: 'ufCrm8PresDeal',
        PRES_TMC_DEAL: 'ufCrm8TmcDeal',
        PRES_LEAD: 'ufCrm8Lead',
        PRES_COMPANY: 'ufCrm8Company',
        PRES_CONTACT: 'ufCrm8Contact',
        PRES_IS_OUR_REQUEST: 'ufCrm8OurRequest',
        PRES_TMC_RESPONSIBLE: 'ufCrm8TmcResp',
        PRES_OWNER: 'ufCrm8Owner',
        PRES_APPROVE_DATE: 'ufCrm8ApproveDate',
        PRES_REQUEST_COMMENT: 'ufCrm8RequestComment',
        PRES_PLAN_DATE: 'ufCrm8PlanDate',
        PRES_RESPONSIBLE: 'ufCrm8Resp',
        PRES_PLAN_RESPONSIBLE: 'ufCrm8PlanResp',
        PRES_PLAN_COMMENT: 'ufCrm8PlanComment',
        PRES_COMMENTS: 'ufCrm8Comments',
        PRES_NEXT_CALL_DATE: 'ufCrm8NextCall',
    },
    enumItems: {},
    stageIdByCode: {
        pres_new: 'DT1040_11:NEW',
        pres_approve: 'DT1040_11:APPROVE',
        pres_plan: 'DT1040_11:PLAN',
        pres_pending: 'DT1040_11:PENDING',
        pres_success: 'DT1040_11:SUCCESS',
        pres_rejected: 'DT1040_11:REJECTED',
        pres_noresult: 'DT1040_11:NORESULT',
        pres_fail: 'DT1040_11:FAIL',
    },
} as unknown as PresentationSmartInfo;

const NOW = '02.11.2026 10:00:00';

const makeHarness = (openRequests: Array<Record<string, unknown>> = []) => {
    const added: Array<Record<string, unknown>> = [];
    const updated: Array<{ id: number; fields: Record<string, unknown> }> = [];
    const listAllCalls: Array<{
        filter: Record<string, unknown>;
        select?: string[];
    }> = [];
    const bitrix = {
        item: {
            add: (_typeId: string, fields: Record<string, unknown>) => {
                added.push(fields);
                return Promise.resolve({
                    result: { item: { id: 900 + added.length } },
                });
            },
            update: (
                id: number,
                _typeId: never,
                fields: Record<string, unknown>,
            ) => {
                updated.push({ id, fields });
                return Promise.resolve({ result: true });
            },
            listAll: (
                _typeId: string,
                filter: Record<string, unknown>,
                select?: string[],
            ) => {
                listAllCalls.push({ filter, select });
                return Promise.resolve(openRequests);
            },
        },
    } as unknown as FlowBitrix;
    // Поля обратной ссылки на портале нет — backlink молчит.
    const portal = {
        getEntityFieldByCode: () => undefined,
    } as unknown as PortalModel;
    return {
        writer: new PresElementWriterService(bitrix, portal),
        run: (job: PresentationFlowJobData): PresentationFlowRun => ({
            bitrix,
            portal,
            info: INFO,
            job,
            tz: 'Europe/Moscow',
            now: NOW,
            itemFields: null,
        }),
        added,
        updated,
        listAllCalls,
    };
};

const job = (
    over: Partial<PresentationFlowJobData> = {},
): PresentationFlowJobData => ({
    domain: 'gsr.bitrix24.ru',
    operationId: 'op-1',
    kind: 'request',
    outcome: null,
    isResult: true,
    isSpontaneous: false,
    baseDealId: null,
    presDealId: null,
    tmcDealId: 777,
    companyId: 431,
    leadId: null,
    contactId: 9,
    responsibleId: 251,
    planResponsibleId: 7,
    planDeadline: '15.11.2026 14:30:00',
    planName: 'Демо СПС',
    planComment: 'Директор ждёт показ',
    reportComment: null,
    failReasonCode: null,
    survey: {},
    tmcResponsibleId: 251,
    ownerId: 7,
    requestComment: 'Директор ждёт показ',
    ...over,
});

describe('PresElementWriterService — заявка ТМЦ', () => {
    it('createRequested: элемент в «Заявка» за ТМЦ-менеджером, с руководителем, датой заявки, лентой и связями', async () => {
        const { writer, run, added } = makeHarness();

        const result = await writer.createRequested(run(job()));

        expect(result).toEqual({ action: 'requested', elementId: 901 });
        expect(added).toHaveLength(1);
        expect(added[0]).toMatchObject({
            title: 'Заявка на презентацию: Демо СПС',
            stageId: 'DT1040_11:NEW',
            assignedById: 251,
            ufCrm8OurRequest: 'Y',
            ufCrm8TmcResp: 251,
            ufCrm8Owner: 7,
            ufCrm8PlanDate: '15.11.2026 14:30:00',
            ufCrm8NextCall: '15.11.2026 14:30:00',
            ufCrm8TmcDeal: 777,
            ufCrm8Company: 431,
            ufCrm8Contact: 9,
            parentId4: 431,
            parentId3: 9,
            companyId: 431,
            contactIds: [9],
        });
        expect(added[0].ufCrm8RequestComment).toEqual([
            expect.stringContaining('ТМЦ: Директор ждёт показ'),
        ]);
        expect(added[0].ufCrm8Comments).toEqual(added[0].ufCrm8RequestComment);
        // Ни основной сделки, ни «проведена»: заявка — только намерение.
        expect(added[0]).not.toHaveProperty('ufCrm8BaseDeal');
        expect(added[0]).not.toHaveProperty('ufCrm8Resp');
    });

    it('createRequested без комментария и ролей: ответственный — исполнитель джоба, лента всё равно начинается', async () => {
        const { writer, run, added } = makeHarness();

        await writer.createRequested(
            run(
                job({
                    tmcResponsibleId: null,
                    ownerId: null,
                    requestComment: null,
                }),
            ),
        );

        expect(added[0].assignedById).toBe(251);
        expect(added[0].ufCrm8TmcResp).toBe(251);
        expect(added[0]).not.toHaveProperty('ufCrm8Owner');
        expect(added[0].ufCrm8Comments).toEqual([
            expect.stringContaining('ТМЦ: заявка на презентацию'),
        ]);
    });

    it('createPlanned по той же ТМЦ-сделке продвигает ждущую заявку в «Запланирована», а не создаёт второй элемент', async () => {
        const { writer, run, added, updated, listAllCalls } = makeHarness([
            {
                id: 900,
                stageId: 'DT1040_11:NEW',
                ufCrm8TmcDeal: 777,
                ufCrm8Comments: ['01.11.2026 09:00:00 ТМЦ: заявка'],
            },
        ]);

        const result = await writer.createPlanned(
            run(
                job({
                    kind: 'plan',
                    baseDealId: 100,
                    presDealId: 55,
                    responsibleId: 187,
                    planResponsibleId: 1,
                    planComment: 'Согласовано руководителем',
                }),
            ),
        );

        expect(result).toEqual({ action: 'promoted', elementId: 900 });
        expect(added).toHaveLength(0);
        // Ищем только среди заявок на согласовании — по стадиям заявки.
        expect(listAllCalls).toHaveLength(1);
        expect(listAllCalls[0].filter).toEqual({
            stageId: ['DT1040_11:NEW', 'DT1040_11:APPROVE'],
        });
        expect(listAllCalls[0].select).toEqual([
            'id',
            'stageId',
            'ufCrm8TmcDeal',
            'ufCrm8Comments',
        ]);

        expect(updated).toHaveLength(1);
        const { id, fields } = updated[0];
        expect(id).toBe(900);
        expect(fields).toMatchObject({
            stageId: 'DT1040_11:PLAN',
            assignedById: 187,
            ufCrm8Resp: 187,
            ufCrm8PlanResp: 1,
            ufCrm8PlanDate: '15.11.2026 14:30:00',
            ufCrm8PlanComment: 'Согласовано руководителем',
            ufCrm8ApproveDate: NOW,
            ufCrm8BaseDeal: 100,
            ufCrm8PresDeal: 55,
            ufCrm8TmcDeal: 777,
        });
        // Заголовок заявки остаётся — по нему её искали в списке.
        expect(fields).not.toHaveProperty('title');
        // Лента: утверждение → план → прежние записи заявки.
        expect(fields.ufCrm8Comments).toEqual([
            expect.stringContaining(
                'Заявка утверждена: презентация запланирована',
            ),
            expect.stringContaining('План: Согласовано руководителем'),
            '01.11.2026 09:00:00 ТМЦ: заявка',
        ]);
    });

    it('заявки по этой ТМЦ-сделке нет (чужая или нет вовсе) — обычный новый элемент плана', async () => {
        const { writer, run, added, updated } = makeHarness([
            { id: 900, stageId: 'DT1040_11:NEW', ufCrm8TmcDeal: 'D_778' },
        ]);

        const result = await writer.createPlanned(run(job({ kind: 'plan' })));

        expect(result.action).toBe('created');
        expect(added).toHaveLength(1);
        expect(added[0].stageId).toBe('DT1040_11:PLAN');
        expect(updated).toHaveLength(0);
    });

    it('план без ТМЦ-сделки заявок не ищет', async () => {
        const { writer, run, listAllCalls } = makeHarness();

        await writer.createPlanned(run(job({ kind: 'plan', tmcDealId: null })));

        expect(listAllCalls).toHaveLength(0);
    });
});
