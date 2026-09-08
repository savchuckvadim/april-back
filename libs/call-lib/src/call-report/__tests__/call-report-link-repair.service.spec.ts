import { CallReportLinkRepairService } from '../services/call-report-link-repair.service';
import { CallReportSmartInfo } from '../services/call-report-smart-resolver.service';

const SMART_INFO: CallReportSmartInfo = {
    entityTypeId: 1040,
    typeId: 128,
    ufKeyByCode: {},
    enumItems: {},
};

/** Элемент, каким его отдаёт crm.item.list (id строкой — как у Битрикса). */
const ITEM = {
    id: '580',
    xmlId: 'aicall_101',
    parentId2: '555',
    parentId1: null,
    companyId: '232232',
    contactId: '44',
    assignedById: '317',
    ufCrm128DealMain: '555',
    ufCrm128Manager: '317',
    ufCrm128DealPresentation: null,
    ufCrm128DealXo: null,
};

const makeDeps = (item: Record<string, unknown> | null = ITEM) => {
    const list = jest
        .fn()
        .mockResolvedValue({ result: { items: item ? [item] : [] } });
    const bitrix = { item: { list } };
    const service = new CallReportLinkRepairService(
        bitrix as never,
        SMART_INFO,
    );
    return { service, list };
};

/**
 * Ремонт УЖЕ СОЗДАННЫХ карточек (решение владельца 08.09.2026): ночной
 * ревизор пересчитывает связи и ответственного, но шлёт только то, что
 * реально изменилось — лишний update пишет в историю элемента.
 */
describe('CallReportLinkRepairService — пересчёт связей существующего элемента', () => {
    afterEach(() => jest.clearAllMocks());

    it('чужая сделка и чужой ответственный попадают в изменения с причиной', async () => {
        const { service } = makeDeps();

        const plan = await service.plan('101', {
            mainDealId: 175244,
            companyId: 232232,
            contactId: 44,
            managerId: 222,
        });

        expect(plan?.itemId).toBe(580);
        expect(plan?.changes).toEqual({ mainDealId: 175244, managerId: 222 });
        expect(plan?.reasons.join(' ')).toContain('parentId2=555');
        expect(plan?.reasons.join(' ')).toContain('assignedById=317');
    });

    it('всё уже актуально — изменений нет, обновлять нечего', async () => {
        const { service } = makeDeps();

        const plan = await service.plan('101', {
            mainDealId: 555,
            companyId: 232232,
            contactId: 44,
            managerId: 317,
        });

        expect(plan?.changes).toEqual({});
        expect(plan?.reasons).toEqual([]);
    });

    it('значение crm-поля в формате D_555 и массивом считается тем же id', async () => {
        const { service } = makeDeps({
            ...ITEM,
            parentId2: 555,
            ufCrm128DealMain: ['D_555'],
        });

        const plan = await service.plan('101', { mainDealId: 555 });

        expect(plan?.changes).toEqual({});
    });

    it('пустое поле у элемента заполняется (было «—»)', async () => {
        const { service } = makeDeps();

        const plan = await service.plan('101', { presentationDealId: 601 });

        expect(plan?.changes).toEqual({ presentationDealId: 601 });
        expect(plan?.reasons[0]).toContain('было ufCrm128DealPresentation=—');
    });

    it('элемента у звонка нет — плана нет (карточку-пустышку не создаём)', async () => {
        const { service } = makeDeps(null);

        expect(await service.plan('101', { mainDealId: 175244 })).toBeNull();
    });

    it('ошибка чтения элемента не роняет ревизию (fail-open)', async () => {
        const { service, list } = makeDeps();
        list.mockRejectedValue(new Error('bitrix down'));

        expect(await service.plan('101', { mainDealId: 175244 })).toBeNull();
    });

    it('ищет элемент по xmlId звонка и просит только поля связей', async () => {
        const { service, list } = makeDeps();

        await service.plan('101', { mainDealId: 175244 });

        const [entityTypeId, filter, select] = list.mock.calls[0] as [
            string,
            Record<string, unknown>,
            string[],
        ];
        expect(entityTypeId).toBe('1040');
        expect(filter).toEqual({ xmlId: 'aicall_101' });
        expect(select).toEqual(
            expect.arrayContaining([
                'parentId2',
                'assignedById',
                'ufCrm128DealMain',
                'ufCrm128Manager',
            ]),
        );
    });
});
