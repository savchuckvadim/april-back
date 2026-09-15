import { CallReportListLinkService } from '../services/call-report-list-link.service';

// Читатель списков — реальный класс ходит в lists.element.get; здесь
// важен только запрос к нему и ранжирование записей кодом.
const mockRead = jest.fn();
jest.mock('@lib/portal-lib/pbx/pbx-sales-list-reader', () => ({
    SALES_LIST_CODES: { kpi: 'sales_kpi', history: 'sales_history' },
    SalesListReaderService: jest.fn().mockImplementation(() => ({
        read: (...args: unknown[]): unknown => mockRead(...args),
    })),
}));

const CALL_AT = new Date('2026-08-14T10:00:00Z');

const record = (overrides: Record<string, unknown>) => ({
    id: '1',
    listCode: 'sales_history',
    name: 'Событие',
    createdAt: '2026-08-14T09:00:00Z',
    eventDate: '2026-08-14T09:30:00Z',
    eventTypeCode: 'call',
    eventTypeName: 'Звонок',
    eventActionCode: 'done',
    eventActionName: 'Проведено',
    responsibleId: '622',
    crmRefs: ['D_601'],
    fields: [],
    ...overrides,
});

const passport = (overrides?: Record<string, unknown>) =>
    ({
        entityType: 'deal',
        entityId: 601,
        crmCompanyId: 77,
        crmContactId: null,
        ...overrides,
    }) as never;

const row = (overrides?: Record<string, unknown>) =>
    ({
        id: '42',
        callStartedAt: CALL_AT,
        userId: '622',
        ...overrides,
    }) as never;

const makeService = (options?: {
    kpi?: Record<string, unknown>[];
    history?: Record<string, unknown>[];
}) => {
    mockRead.mockReset();
    mockRead.mockImplementation((listCode: string) =>
        Promise.resolve(
            listCode === 'sales_kpi'
                ? (options?.kpi ?? [])
                : (options?.history ?? []),
        ),
    );
    const pbxService = {
        init: jest.fn().mockResolvedValue({ bitrix: {}, PortalModel: {} }),
    };
    return {
        service: new CallReportListLinkService(pbxService as never),
    };
};

describe('CallReportListLinkService — привязка звонка к записям отчётности', () => {
    it('ищет по ссылкам САМОГО ЗВОНКА (сущность-владелец, компания) в окне ±3 дня — без дотянутой семьи сделок', async () => {
        const { service } = makeService();
        await service.find('test.bitrix24.ru', passport(), row(), 'call');
        expect(mockRead).toHaveBeenCalledWith(
            'sales_kpi',
            expect.objectContaining({
                crmRefs: ['D_601', 'CO_77'],
                dateFrom: new Date('2026-08-11T10:00:00Z'),
                dateTo: new Date('2026-08-17T10:00:00Z'),
            }),
        );
        expect(mockRead).toHaveBeenCalledWith(
            'sales_history',
            expect.anything(),
        );
    });

    it('запись о том же событии в тот же день (тип и ответственный совпали) — confirmed; остальные — прочие', async () => {
        const { service } = makeService({
            history: [
                record({ id: '10', eventDate: '2026-08-16T12:00:00Z' }),
                record({ id: '11' }),
                record({ id: '12', eventTypeCode: 'presentation' }),
            ],
            kpi: [record({ id: '20', crmRefs: ['CO_77'] })],
        });
        const links = await service.find(
            'test.bitrix24.ru',
            passport(),
            row(),
            'call',
        );
        expect(links.historyItem).toEqual({
            itemId: '11',
            status: 'confirmed',
        });
        expect(links.kpiItem).toEqual({ itemId: '20', status: 'confirmed' });
        expect(links.relatedReportIds).toEqual(['10', '12']);
    });

    it('тип звонка ведёт выбор: для презентации берётся запись «Презентация», даже если «Звонок» ближе по времени', async () => {
        const { service } = makeService({
            history: [
                record({ id: '11', eventTypeCode: 'call' }),
                record({
                    id: '12',
                    eventTypeCode: 'presentation',
                    eventDate: '2026-08-14T16:00:00Z',
                }),
            ],
        });
        const links = await service.find(
            'test.bitrix24.ru',
            passport(),
            row(),
            'presentation',
        );
        expect(links.historyItem?.itemId).toBe('12');
    });

    it('запись далеко по дате или чужого ответственного и типа — suspected', async () => {
        const { service } = makeService({
            history: [
                record({
                    id: '13',
                    eventDate: '2026-08-16T12:00:00Z',
                    responsibleId: '7',
                    eventTypeCode: 'info',
                }),
            ],
        });
        const links = await service.find(
            'test.bitrix24.ru',
            passport(),
            row(),
            'call',
        );
        expect(links.historyItem).toEqual({
            itemId: '13',
            status: 'suspected',
        });
    });

    it('записи, не ссылающиеся на клиента (сервер проигнорировал фильтр), отбрасываются', async () => {
        const { service } = makeService({
            history: [record({ id: '99', crmRefs: ['D_1'] })],
        });
        const links = await service.find(
            'test.bitrix24.ru',
            passport(),
            row(),
            'call',
        );
        expect(links.historyItem).toBeUndefined();
        expect(links.relatedReportIds).toEqual([]);
    });

    it('лид: поиск по ссылке L_ владельца звонка', async () => {
        const { service } = makeService({
            history: [record({ id: '14', crmRefs: ['L_77'] })],
        });
        const links = await service.find(
            'test.bitrix24.ru',
            passport({ entityType: 'lead', entityId: 77, crmCompanyId: null }),
            row(),
            'site_lead',
        );
        expect(mockRead).toHaveBeenCalledWith(
            'sales_kpi',
            expect.objectContaining({ crmRefs: ['L_77'] }),
        );
        expect(links.historyItem?.itemId).toBe('14');
    });

    it('без даты звонка или без CRM-ссылок — пусто, списки не читаются', async () => {
        const { service } = makeService();
        expect(
            await service.find(
                'test.bitrix24.ru',
                passport(),
                row({ callStartedAt: null }),
                'call',
            ),
        ).toEqual({ relatedReportIds: [] });
        expect(
            await service.find(
                'test.bitrix24.ru',
                passport({
                    entityType: null,
                    entityId: null,
                    crmCompanyId: null,
                }),
                row(),
                'call',
            ),
        ).toEqual({ relatedReportIds: [] });
        expect(mockRead).not.toHaveBeenCalled();
    });

    it('ошибка чтения списков не роняет разбор (fail-open)', async () => {
        const { service } = makeService();
        mockRead.mockRejectedValue(new Error('lists down'));
        expect(
            await service.find('test.bitrix24.ru', passport(), row(), 'call'),
        ).toEqual({ relatedReportIds: [] });
    });
});
