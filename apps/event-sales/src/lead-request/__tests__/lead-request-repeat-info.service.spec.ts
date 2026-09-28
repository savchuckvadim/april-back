import { LeadRequestRepeatInfoService } from '../services/lead-request-repeat-info.service';

type Row = Record<string, unknown>;

const FIELDS: Record<string, string> = {
    deal_from_lead_id: 'DEAL_FROM_LEAD_ID',
    op_return_stage: 'OP_RETURN_STAGE',
};

const portal = {
    getEntityFieldByCode: (_entity: string, code: string) =>
        FIELDS[code] ? { bitrixId: FIELDS[code] } : undefined,
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
    getDealCategoryByCode: () => ({
        bitrixId: '31',
        stages: [
            { code: 'sales_new', bitrixId: 'NEW', name: 'Новая' },
            { code: 'sales_hot', bitrixId: 'HOT', name: 'Решение' },
        ],
    }),
};

const makeService = (options: {
    active?: number[];
    excluded?: string;
    names?: Record<number, string>;
}) =>
    new LeadRequestRepeatInfoService(
        {
            activeUserIds: jest
                .fn()
                .mockResolvedValue(new Set(options.active ?? [])),
        } as never,
        {
            resolve: jest.fn().mockResolvedValue({
                leadIntakeRoundRobinExcludedUserIds: options.excluded ?? '',
            }),
        } as never,
        {
            resolve: jest.fn().mockResolvedValue(options.names ?? {}),
        } as never,
    );

const bitrixWith = (deal: Row | undefined) => ({
    deal: { get: jest.fn().mockResolvedValue({ result: deal }) },
});

describe('LeadRequestRepeatInfoService', () => {
    it('повторная заявка: прежняя стадия, вернётся после принятия, ответственный в круге', async () => {
        const service = makeService({
            active: [387],
            names: { 387: 'Юлия Воропаева' },
        });
        const block = await service.build(
            'd.b24.ru',
            bitrixWith({
                ID: '42423',
                TITLE: 'МИНИМУЩЕСТВА ВО',
                STAGE_ID: 'C31:NEW',
                ASSIGNED_BY_ID: '387',
                UF_CRM_DEAL_FROM_LEAD_ID: 'L_339193',
                UF_CRM_OP_RETURN_STAGE: 'C31:HOT',
            }) as never,
            portal as never,
            348945,
            42423,
        );
        expect(block).toEqual({
            isRepeat: true,
            mainDealId: 42423,
            mainDealTitle: 'МИНИМУЩЕСТВА ВО',
            stageBeforeName: 'Решение',
            willReturnStage: true,
            responsible: {
                id: 387,
                name: 'Юлия Воропаева',
                active: true,
                inRotation: true,
            },
        });
    });

    it('ответственный уволен или исключён из круга — «нет в карусели»', async () => {
        const fired = await makeService({ active: [] }).build(
            'd.b24.ru',
            bitrixWith({
                ID: '1',
                STAGE_ID: 'C31:HOT',
                ASSIGNED_BY_ID: '461',
                UF_CRM_DEAL_FROM_LEAD_ID: 'L_1',
            }) as never,
            portal as never,
            2,
            1,
        );
        expect(fired?.responsible).toMatchObject({
            active: false,
            inRotation: false,
        });
        expect(fired?.willReturnStage).toBe(false);
        expect(fired?.stageBeforeName).toBe('Решение');

        const excluded = await makeService({
            active: [387],
            excluded: '387',
        }).build(
            'd.b24.ru',
            bitrixWith({
                ID: '1',
                ASSIGNED_BY_ID: '387',
                UF_CRM_DEAL_FROM_LEAD_ID: 'L_1',
            }) as never,
            portal as never,
            2,
            1,
        );
        expect(excluded?.responsible).toMatchObject({
            active: true,
            inRotation: false,
        });
    });

    it('сделка создана из этого же лида — блока нет', async () => {
        const block = await makeService({}).build(
            'd.b24.ru',
            bitrixWith({ ID: '1', UF_CRM_DEAL_FROM_LEAD_ID: 'L_7' }) as never,
            portal as never,
            7,
            1,
        );
        expect(block).toBeNull();
    });

    it('сделки нет или она не прочиталась — null, карточка не падает', async () => {
        expect(
            await makeService({}).build(
                'd.b24.ru',
                bitrixWith(undefined) as never,
                portal as never,
                7,
                1,
            ),
        ).toBeNull();
        expect(
            await makeService({}).build(
                'd.b24.ru',
                bitrixWith(undefined) as never,
                portal as never,
                7,
                null,
            ),
        ).toBeNull();
    });
});
