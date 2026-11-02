import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { EventReportContext } from '../../event-report/services/context/event-report.context';
import {
    ADD_RPA_PRESENTATION_CMD,
    TmcPresentationRequestService,
} from '../services/tmc-presentation-request.service';

/**
 * Заявка ТМЦ на презентацию в РПА: поля и форматы легаси
 * (`BitrixRPAPresFlowService`), автор — постановщик плана, ТМЦ-сделка —
 * реальный id либо подстановка батча. Без РПА на портале команды нет.
 */
const RPA = { bitrixId: 7, code: 'presentation' };

const makePortal = (withRpa = true, missingFields: string[] = []) =>
    ({
        getRpaByCode: (code: string) =>
            withRpa && code === 'presentation' ? RPA : undefined,
        getRpaFieldBitrixIdByCode: (_rpa: string, code: string) =>
            missingFields.includes(code)
                ? undefined
                : `UF_RPA_7_${code.toUpperCase()}`,
    }) as unknown as PortalModel;

const makeCtx = (over: Record<string, unknown> = {}): EventReportContext =>
    ({
        domain: 'gsr.bitrix24.ru',
        isPlanned: true,
        planEventType: 'presentation',
        planEventName: 'Демо СПС',
        planCreatedById: 7,
        planResponsibleId: 251,
        planDeadline: { toCrmDateTime: () => '15.11.2026 14:30:00' },
        planContact: { NAME: 'Иван', LAST_NAME: 'Иванов' },
        reportComment: 'Директор ждёт показ & прайс',
        entityType: 'company',
        entityId: 431,
        company: { ID: '431' },
        dto: { plan: { contact: { ID: 9 } } },
        dateTime: { nowCrmDateTime: () => '02.11.2026 10:00:00' },
        ...over,
    }) as unknown as EventReportContext;

const makeService = (portal: PortalModel = makePortal()) => {
    const add = jest.fn<
        void,
        [string, { typeId: number; fields: Record<string, unknown> }]
    >();
    const service = new TmcPresentationRequestService(
        { batch: { rpaItem: { add } } } as unknown as BitrixService,
        portal,
    );
    return { service, add };
};

describe('TmcPresentationRequestService', () => {
    it('план «Презентация» → элемент РПА с полями легаси, автором-постановщиком и ТМЦ-сделкой', () => {
        const { service, add } = makeService();

        const cmd = service.queue(makeCtx(), '$result[set_tmc_deal]');

        expect(cmd).toBe(ADD_RPA_PRESENTATION_CMD);
        expect(add).toHaveBeenCalledTimes(1);
        const [cmdCode, dto] = add.mock.calls[0] as [
            string,
            { typeId: number; fields: Record<string, unknown> },
        ];
        expect(cmdCode).toBe(ADD_RPA_PRESENTATION_CMD);
        expect(dto.typeId).toBe(7);
        expect(dto.fields).toEqual({
            createdBy: 7,
            UF_RPA_7_NAME: 'Заявка Демо СПС Иванов Иван от 02.11.2026 10:00:00',
            UF_RPA_7_NEXT_PRES_PLAN_DATE: '15.11.2026 14:30:00',
            UF_RPA_7_LAST_PRES_PLAN_RESPONSIBLE: 251,
            UF_RPA_7_OWNER_OP: 7,
            UF_RPA_7_RPA_CRM_COMPANY: 431,
            UF_RPA_7_RPA_CRM_CONTACT: 9,
            UF_RPA_7_RPA_TMC_COMMENT: [
                expect.stringContaining('Директор ждёт показ'),
            ],
            UF_RPA_7_RPA_CRM_TMC_DEAL: '$result[set_tmc_deal]',
        });
        // Комментарий уезжает batch-безопасной строкой: сырой «&» рвёт cmd.
        expect(
            (dto.fields.UF_RPA_7_RPA_TMC_COMMENT as string[])[0],
        ).not.toContain('&');
    });

    it('без постановщика автор и руководитель — сам ответственный; без контакта и комментария поля пропущены', () => {
        const { service, add } = makeService();

        service.queue(
            makeCtx({
                planCreatedById: 0,
                planContact: null,
                reportComment: '',
                dto: { plan: { contact: null } },
            }),
            '500',
        );

        const fields = (
            add.mock.calls[0][1] as { fields: Record<string, unknown> }
        ).fields;
        expect(fields.createdBy).toBe(251);
        expect(fields.UF_RPA_7_OWNER_OP).toBe(251);
        expect(fields.UF_RPA_7_NAME).toBe(
            'Заявка Демо СПС от 02.11.2026 10:00:00',
        );
        expect(fields).not.toHaveProperty('UF_RPA_7_RPA_CRM_CONTACT');
        expect(fields).not.toHaveProperty('UF_RPA_7_RPA_TMC_COMMENT');
        expect(fields.UF_RPA_7_RPA_CRM_TMC_DEAL).toBe('500');
    });

    it('неустановленное поле РПА пропускается, остальные пишутся', () => {
        const { service, add } = makeService(
            makePortal(true, ['rpa_crm_tmc_deal']),
        );

        service.queue(makeCtx(), '500');

        const fields = (
            add.mock.calls[0][1] as { fields: Record<string, unknown> }
        ).fields;
        expect(fields).not.toHaveProperty('UF_RPA_7_RPA_CRM_TMC_DEAL');
        expect(fields.UF_RPA_7_RPA_CRM_COMPANY).toBe(431);
    });

    it('не презентация, план выключен или РПА не установлен — команды нет', () => {
        const warm = makeService();
        expect(
            warm.service.queue(makeCtx({ planEventType: 'warm' }), '500'),
        ).toBeNull();
        expect(warm.add).not.toHaveBeenCalled();

        const unplanned = makeService();
        expect(
            unplanned.service.queue(makeCtx({ isPlanned: false }), '500'),
        ).toBeNull();

        const noRpa = makeService(makePortal(false));
        expect(noRpa.service.queue(makeCtx(), '500')).toBeNull();
        expect(noRpa.add).not.toHaveBeenCalled();
    });
});
