import { LeadIntakeRescueService } from '../intake/lead-intake-rescue.service';

/**
 * Страховка входа: лид пришёл, а хук назначения не отработал (Битрикс
 * вебхуки не повторяет). Проверяем три инварианта:
 *  - дожимаются ТОЛЬКО необработанные лиды (ошибочный дожим увёл бы заявку
 *    у работающего менеджера);
 *  - ГДЕ искать решает портал: сопоставлена стадия «Очередь в ХО» — берём
 *    только из неё и без ограничений по датам; не сопоставлена — окно
 *    создания, как раньше;
 *  - из очереди берём только то, что МОЖЕМ разобрать: робот оставил либо
 *    ответственного ХО, либо отдел строкой.
 */

/** UF-имена полей маршрутизации, которые пишет робот перед очередью. */
const UF = {
    responsible: 'UF_CRM_XO_RESPONSIBLE',
    department: 'UF_CRM_DEPARTMENT_STRING',
    name: 'UF_CRM_XO_NAME',
    date: 'UF_CRM_XO_DATE',
} as const;

const FIELD_BY_CODE: Record<string, string> = {
    op_lead_assigned_at: 'OP_LEAD_ASSIGNED_AT',
    to_base_sales: 'TO_BASE_SALES',
    op_lead_site_status: 'OP_LEAD_SITE_STATUS',
    op_lead_site_stage: 'OP_LEAD_SITE_STAGE',
    xo_responsible: 'XO_RESPONSIBLE',
    department_string: 'DEPARTMENT_STRING',
    xo_name: 'XO_NAME',
    xo_date: 'XO_DATE',
};

const makePortal = (
    withFields = true,
    queueStatusId: string | null = null,
) => ({
    getLeadStatusIdByCode: (code: string) =>
        code === 'lead_xo_queue' ? (queueStatusId ?? undefined) : undefined,
    getEntityFieldByCode: (_entity: string, code: string) => {
        if (!withFields) return undefined;
        const bitrixId = FIELD_BY_CODE[code];
        return bitrixId ? { bitrixId, items: [] } : undefined;
    },
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
    getTimezone: () => 'Europe/Moscow',
});

const makeDeps = (input: {
    /** Лиды окна создания (режим `window`). */
    leads: Record<string, unknown>[];
    withFields?: boolean;
    /** STATUS_ID стадии-очереди ХО; null — стадия на портале не сопоставлена. */
    queueStatusId?: string | null;
    /** Содержимое стадии-очереди (режим `queue`). */
    queuedLeads?: Record<string, unknown>[];
    /** Сколько элементов отдаёт Битрикс за один запрос (штатно 50). */
    pageSize?: number;
    /** Выборка по стадии-очереди падает (портал недоступен). */
    queueFails?: boolean;
}) => {
    /*
     * Отдаём выборку ПО ФИЛЬТРУ, а не по порядку вызовов: тест не должен
     * знать, сколько запросов делает сервис — иначе «лишний» запрос к окну
     * создания в режиме очереди прошёл бы незамеченным. Очередь честно
     * страничная (keyset по `>ID`) — так проверяется добор длинной очереди.
     */
    const pageSize = input.pageSize ?? 50;
    const leadGetList = jest.fn((filter: Record<string, unknown>) => {
        if (!filter.STATUS_ID) return Promise.resolve({ result: input.leads });
        if (input.queueFails) {
            return Promise.reject(new Error('rest timeout'));
        }
        const after = Number(filter['>ID'] ?? 0);
        const page = (input.queuedLeads ?? [])
            .filter(row => Number(row.ID) > after)
            .sort((a, b) => Number(a.ID) - Number(b.ID))
            .slice(0, pageSize);
        return Promise.resolve({ result: page });
    });
    const leadUpdate = jest.fn().mockResolvedValue({ result: true });
    const dispatch = {
        accept: jest.fn().mockResolvedValue({ operationId: 'op-1' }),
    };
    const idempotency = { fingerprint: jest.fn().mockReturnValue('fp') };
    const pbx = {
        init: jest.fn().mockResolvedValue({
            bitrix: { lead: { getList: leadGetList, update: leadUpdate } },
            PortalModel: makePortal(
                input.withFields ?? true,
                input.queueStatusId ?? null,
            ),
        }),
    };
    const service = new LeadIntakeRescueService(
        pbx as never,
        dispatch as never,
        idempotency as never,
    );
    return { service, leadGetList, leadUpdate, dispatch };
};

/** Данные, ушедшие в хук по n-му дожатому лиду. */
const sentItem = (dispatch: { accept: jest.Mock }, call = 0) => {
    const args = dispatch.accept.mock.calls[call] as [
        string,
        string,
        string,
        { data: Record<string, unknown> }[],
    ];
    return args[3][0].data;
};

/** Заявка лидогена: код партнёра заполнен, назначения не было. */
const LOST_REQUEST = {
    ID: '42',
    TITLE: 'ООО Ромашка',
    UF_CRM_REG_NUMBER: '48-00691',
};

/** Элемент очереди: робот оставил отдел строкой — разобрать можем. */
const QUEUED = {
    ID: '42',
    TITLE: 'ООО Ромашка',
    [UF.department]: 'Отдел продаж №2',
};

describe('LeadIntakeRescueService', () => {
    it('дожимает лид без назначения: ХО-флаги, responsible не навязан', async () => {
        const { service, dispatch } = makeDeps({ leads: [LOST_REQUEST] });

        const run = await service.runForDomain('d.b24.ru', 180, 20, true);

        expect(run.dispatched).toBe(1);
        expect(run.skipped).toBe(0);
        expect(sentItem(dispatch)).toMatchObject({
            leadId: 42,
            isXo: 'Y',
            stageMode: 'new',
            taskMode: 'close',
        });
        // Робот ничего не подсказал — ответственного выбирает хук.
        expect(sentItem(dispatch).responsible).toBeUndefined();
        expect(sentItem(dispatch).department).toBeUndefined();
    });

    /*
     * Фильтр Битрикса по пустоте UF срабатывает не на всех порталах, а в
     * очереди его нет вовсе — перепроверка в коде обязательна, иначе крон
     * переназначит заявку, над которой менеджер уже работает.
     */
    it('не трогает лид с заполненным op_lead_assigned_at', async () => {
        const { service, dispatch } = makeDeps({
            leads: [
                {
                    ...LOST_REQUEST,
                    UF_CRM_OP_LEAD_ASSIGNED_AT: '13.08.2026 10:00:00',
                },
            ],
        });

        const run = await service.runForDomain('d.b24.ru', 180, 20, true);

        expect(run.dispatched).toBe(0);
        expect(run.skipped).toBe(1);
        expect(dispatch.accept).not.toHaveBeenCalled();
    });

    it('не трогает лид, у которого уже есть наша сделка', async () => {
        const { service, dispatch } = makeDeps({
            leads: [{ ...LOST_REQUEST, UF_CRM_TO_BASE_SALES: 'D_1024' }],
        });

        const run = await service.runForDomain('d.b24.ru', 180, 20, true);

        expect(run.dispatched).toBe(0);
        expect(run.skipped).toBe(1);
        expect(dispatch.accept).not.toHaveBeenCalled();
    });

    /*
     * Без наших полей отличить необработанный лид от обработанного нечем:
     * дожимать вслепую нельзя — переназначили бы всех подряд.
     */
    it('поля не установлены → предупреждение и ни одного вызова', async () => {
        const { service, dispatch, leadGetList } = makeDeps({
            leads: [LOST_REQUEST],
            withFields: false,
        });

        const run = await service.runForDomain('d.b24.ru', 180, 20, true);

        expect(run.scanned).toBe(0);
        expect(leadGetList).not.toHaveBeenCalled();
        expect(dispatch.accept).not.toHaveBeenCalled();
        expect(run.warnings.join(' ')).toContain('не установлены');
    });

    describe('стадия «Очередь в ХО» НЕ сопоставлена → окно создания', () => {
        it('выборка ограничена окном создания и лидами в работе', async () => {
            const { service, leadGetList } = makeDeps({
                leads: [],
                queueStatusId: null,
            });

            const run = await service.runForDomain('d.b24.ru', 180, 20, true);

            expect(run.source).toBe('window');
            expect(leadGetList).toHaveBeenCalledTimes(1);
            const [filter] = leadGetList.mock.calls[0];
            expect(filter['>DATE_CREATE']).toBeDefined();
            expect(filter.STATUS_SEMANTIC_ID).toBe('P');
            expect(filter['UF_CRM_OP_LEAD_ASSIGNED_AT']).toBe('');
            expect(filter.STATUS_ID).toBeUndefined();
        });

        it('дожимает лид в любой открытой стадии, в том числе «Новый»', async () => {
            const { service, dispatch } = makeDeps({
                leads: [{ ...LOST_REQUEST, STATUS_ID: 'NEW' }],
                queueStatusId: null,
            });

            const run = await service.runForDomain('d.b24.ru', 180, 20, true);

            expect(run.dispatched).toBe(1);
            expect(run.notReady).toBe(0);
            expect(dispatch.accept).toHaveBeenCalledTimes(1);
        });

        /* Маршрутизация не обязательна, но если робот её оставил — уважаем. */
        it('подхватывает маршрутизацию робота, если она есть', async () => {
            const { service, dispatch } = makeDeps({
                leads: [{ ...LOST_REQUEST, [UF.department]: 'ОП Северный' }],
                queueStatusId: null,
            });

            await service.runForDomain('d.b24.ru', 180, 20, true);

            expect(sentItem(dispatch).department).toBe('ОП Северный');
        });

        it('requestsOnly=true пропускает лид без признаков заявки', async () => {
            const { service, dispatch } = makeDeps({
                leads: [{ ID: '77', TITLE: 'Лид руками' }],
            });

            const run = await service.runForDomain('d.b24.ru', 180, 20, true);

            expect(run.dispatched).toBe(0);
            expect(run.skipped).toBe(1);
            expect(dispatch.accept).not.toHaveBeenCalled();
        });

        it('requestsOnly=false дожимает и лид без признаков заявки', async () => {
            const { service, dispatch } = makeDeps({
                leads: [{ ID: '77', TITLE: 'Лид руками' }],
            });

            const run = await service.runForDomain('d.b24.ru', 180, 20, false);

            expect(run.dispatched).toBe(1);
            expect(dispatch.accept).toHaveBeenCalledTimes(1);
        });

        it('лимит за проход соблюдается, остаток уходит в warning', async () => {
            const { service, dispatch } = makeDeps({
                leads: [
                    { ...LOST_REQUEST, ID: '1' },
                    { ...LOST_REQUEST, ID: '2' },
                    { ...LOST_REQUEST, ID: '3' },
                ],
            });

            const run = await service.runForDomain('d.b24.ru', 180, 2, true);

            expect(run.dispatched).toBe(2);
            expect(dispatch.accept).toHaveBeenCalledTimes(2);
            expect(run.warnings.join(' ')).toContain('Лимит 2');
        });
    });

    describe('стадия «Очередь в ХО» сопоставлена → разбираем только её', () => {
        /*
         * Стадия — очередь: её разбирают целиком. Ни дата создания, ни дата
         * изменения роли не играют — иначе лид, которого регулярно трогают,
         * не дожимался бы неопределённо долго.
         */
        it('фильтр — только стадия и keyset, без всяких дат', async () => {
            const { service, leadGetList } = makeDeps({
                leads: [LOST_REQUEST],
                queueStatusId: 'PBX_XO_QUEUE',
                queuedLeads: [QUEUED],
            });

            const run = await service.runForDomain('d.b24.ru', 180, 20, true);

            expect(run.source).toBe('queue');
            // Мок объявлен с одним параметром — сортировку достаём явно.
            const [filter, , order] = leadGetList.mock.calls[0] as unknown as [
                Record<string, unknown>,
                string[],
                Record<string, string>,
            ];
            expect(filter.STATUS_ID).toBe('PBX_XO_QUEUE');
            expect(filter['>ID']).toBe(0);
            expect(filter['<DATE_MODIFY']).toBeUndefined();
            expect(filter['>DATE_CREATE']).toBeUndefined();
            expect(filter.STATUS_SEMANTIC_ID).toBeUndefined();
            // Фильтра по пустому UF нет: на части порталов он не работает,
            // а его сбой означал бы тихо неразбираемую очередь.
            expect(filter['UF_CRM_OP_LEAD_ASSIGNED_AT']).toBeUndefined();
            expect(order).toEqual({ ID: 'ASC' });
        });

        /*
         * Ядро правки: пока робот не перевёл лид в очередь (и не заполнил
         * маршрутизацию), дожимать его рано — round-robin ушёл бы по всем ОП.
         */
        it('окно создания не запрашивается вовсе — «Новый» игнорируется', async () => {
            const { service, dispatch, leadGetList } = makeDeps({
                leads: [{ ...LOST_REQUEST, ID: '1', STATUS_ID: 'NEW' }],
                queueStatusId: 'PBX_XO_QUEUE',
                queuedLeads: [],
            });

            const run = await service.runForDomain('d.b24.ru', 180, 20, true);

            expect(run.scanned).toBe(0);
            expect(run.dispatched).toBe(0);
            expect(leadGetList).toHaveBeenCalledTimes(1);
            expect(leadGetList.mock.calls[0][0].STATUS_ID).toBe('PBX_XO_QUEUE');
            expect(dispatch.accept).not.toHaveBeenCalled();
        });

        it('дожимает по отделу строкой: department уходит в хук', async () => {
            const { service, dispatch } = makeDeps({
                leads: [],
                queueStatusId: 'PBX_XO_QUEUE',
                queuedLeads: [QUEUED],
            });

            const run = await service.runForDomain('d.b24.ru', 180, 20, true);

            expect(run.dispatched).toBe(1);
            expect(sentItem(dispatch)).toMatchObject({
                leadId: 42,
                department: 'Отдел продаж №2',
                isXo: 'Y',
            });
            expect(sentItem(dispatch).responsible).toBeUndefined();
        });

        it('дожимает по ответственному ХО, с названием и дедлайном', async () => {
            const { service, dispatch } = makeDeps({
                leads: [],
                queueStatusId: 'PBX_XO_QUEUE',
                queuedLeads: [
                    {
                        ID: '7',
                        TITLE: 'ООО Ромашка',
                        [UF.responsible]: '15',
                        [UF.name]: 'Восстановление из Отказников',
                        [UF.date]: '20.09.2026 10:00:00',
                    },
                ],
            });

            const run = await service.runForDomain('d.b24.ru', 180, 20, true);

            expect(run.dispatched).toBe(1);
            expect(sentItem(dispatch)).toMatchObject({
                leadId: 7,
                responsible: 15,
                name: 'Восстановление из Отказников',
                deadline: '20.09.2026 10:00:00',
            });
        });

        /*
         * Обязательна только пара «кому». Название и дата — с дефолтами в
         * хуке, иначе элемент завис бы в очереди из-за необязательного поля.
         */
        it('без xo_name и xo_date дожимает всё равно', async () => {
            const { service, dispatch } = makeDeps({
                leads: [],
                queueStatusId: 'PBX_XO_QUEUE',
                queuedLeads: [QUEUED],
            });

            const run = await service.runForDomain('d.b24.ru', 180, 20, true);

            expect(run.dispatched).toBe(1);
            expect(sentItem(dispatch).name).toBeUndefined();
            expect(sentItem(dispatch).deadline).toBeUndefined();
        });

        /*
         * Ни ответственного, ни отдела — назначать некому. Такой лид
         * остаётся в очереди на ручной разбор, а не уезжает round-robin'ом
         * по случайному отделу.
         */
        it('без ответственного и отдела оставляет в очереди', async () => {
            const { service, dispatch } = makeDeps({
                leads: [],
                queueStatusId: 'PBX_XO_QUEUE',
                queuedLeads: [
                    { ID: '5', TITLE: 'Без маршрута' },
                    // '0' у employee-поля Битрикса означает «не заполнено».
                    { ID: '6', TITLE: 'Нулевой', [UF.responsible]: '0' },
                    QUEUED,
                ],
            });

            const run = await service.runForDomain('d.b24.ru', 180, 20, true);

            expect(run.scanned).toBe(3);
            expect(run.notReady).toBe(2);
            expect(run.dispatched).toBe(1);
            expect(sentItem(dispatch).leadId).toBe(42);
        });

        /*
         * Очередь наполняет робот — он и решает, заявка это или обычный лид
         * на обзвон. Второй раз отсеивать детектором нельзя: половина
         * очереди («просто лиды») не разобралась бы никогда.
         */
        it('фильтр «только заявки» в очереди не применяется', async () => {
            const { service, dispatch } = makeDeps({
                leads: [],
                queueStatusId: 'PBX_XO_QUEUE',
                queuedLeads: [
                    {
                        ID: '9',
                        TITLE: 'Холодный лид руками',
                        [UF.department]: 'ОП',
                    },
                ],
            });

            const run = await service.runForDomain('d.b24.ru', 180, 20, true);

            expect(run.dispatched).toBe(1);
            expect(run.skipped).toBe(0);
            expect(dispatch.accept).toHaveBeenCalledTimes(1);
        });

        it('уже назначенный элемент очереди пропускается', async () => {
            const { service, dispatch } = makeDeps({
                leads: [],
                queueStatusId: 'PBX_XO_QUEUE',
                queuedLeads: [
                    {
                        ...QUEUED,
                        UF_CRM_OP_LEAD_ASSIGNED_AT: '13.08.2026 10:00:00',
                    },
                ],
            });

            const run = await service.runForDomain('d.b24.ru', 180, 20, true);

            expect(run.skipped).toBe(1);
            expect(run.dispatched).toBe(0);
            expect(dispatch.accept).not.toHaveBeenCalled();
        });

        /*
         * Битрикс отдаёт максимум 50 за запрос: очередь длиннее приходится
         * добирать страницами, иначе хвост не разберётся никогда.
         */
        it('очередь длиннее страницы дочитывается keyset-пагинацией', async () => {
            const queue = [1, 2, 3, 4, 5].map(id => ({
                ...QUEUED,
                ID: String(id),
            }));
            const { service, leadGetList } = makeDeps({
                leads: [],
                queueStatusId: 'PBX_XO_QUEUE',
                queuedLeads: queue,
                pageSize: 2,
            });

            const run = await service.runForDomain('d.b24.ru', 180, 20, true);

            expect(run.scanned).toBe(5);
            expect(run.dispatched).toBe(5);
            // 3 страницы с данными + пустая, на которой чтение кончается.
            expect(leadGetList).toHaveBeenCalledTimes(4);
            expect(leadGetList.mock.calls.map(call => call[0]['>ID'])).toEqual([
                0, 2, 4, 5,
            ]);
        });

        it('набрав порцию, лишних страниц не читает', async () => {
            const queue = [1, 2, 3, 4, 5].map(id => ({
                ...QUEUED,
                ID: String(id),
            }));
            const { service, dispatch, leadGetList } = makeDeps({
                leads: [],
                queueStatusId: 'PBX_XO_QUEUE',
                queuedLeads: queue,
                pageSize: 2,
            });

            const run = await service.runForDomain('d.b24.ru', 180, 2, true);

            expect(run.dispatched).toBe(2);
            expect(dispatch.accept).toHaveBeenCalledTimes(2);
            expect(leadGetList).toHaveBeenCalledTimes(1);
            expect(run.warnings.join(' ')).toContain('Порция 2');
        });

        it('чтение очереди упало → warning, без дожима вслепую', async () => {
            const { service, dispatch } = makeDeps({
                leads: [LOST_REQUEST],
                queueStatusId: 'PBX_XO_QUEUE',
                queueFails: true,
            });

            const run = await service.runForDomain('d.b24.ru', 180, 20, true);

            expect(run.scanned).toBe(0);
            expect(dispatch.accept).not.toHaveBeenCalled();
            expect(run.warnings.join(' ')).toContain(
                'Чтение очереди ХО прервано',
            );
        });

        it('карточку лида не правит: только читает и дожимает', async () => {
            const { service, leadUpdate } = makeDeps({
                leads: [],
                queueStatusId: 'PBX_XO_QUEUE',
                queuedLeads: [QUEUED],
            });

            await service.runForDomain('d.b24.ru', 180, 20, true);

            expect(leadUpdate).not.toHaveBeenCalled();
        });
    });
});
