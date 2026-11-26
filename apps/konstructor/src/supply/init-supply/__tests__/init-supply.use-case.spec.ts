import { Test } from '@nestjs/testing';
import { PBXService } from '@lib/pbx';
import { InitSupplyDto, InitSupplyFlow } from '../dto/init-supply.dto';
import { InitSupplyUseCase } from '../init-supply.use-case';
import {
    InitSupplyDiskParams,
    InitSupplyDiskResult,
    InitSupplyDiskService,
} from '../services/disk/init-supply-disk.service';
import { InitSupplyDealFileFieldsService } from '../services/file/init-supply-deal-file-fields.service';
import { InitSupplyRpaFieldsService } from '../services/rpa-fields/init-supply-rpa-fields.service';
import { InitSupplyTimelineCommentService } from '../services/rpa-timeline-comment/init-supply-timeline-comment.service';
import { InnerDealService } from '../../../modules/inner-deal/services/inner-deal.service';
import { DocumentVariantDto } from '@app/konstructor/document-generate/dto/document-variant/document-variant.dto';
import { QueueDispatcherService } from '@lib/queue/dispatch/queue-dispatcher.service';
import { SalesDocumentFlowService } from '../../../modules/sales-document-flow/services/sales-document-flow.service';
import {
    DispatchMock,
    eventOfCall,
    failingDispatch,
    okDispatch,
} from '../../../modules/sales-document-flow/__tests__/sales-document.fixtures';

/** Комментарий RPA: заголовок записи — первой жирной строкой описания. */
interface RpaTimelineRequest {
    typeId: number;
    itemId: number;
    fields: { description: string };
}

const titleOf = (page: RpaTimelineRequest): string =>
    page.fields.description.split('\n')[0];

interface DealCommentRequest {
    ENTITY_ID: number;
    ENTITY_TYPE: string;
    COMMENT: string;
    AUTHOR_ID: string;
}

const FOLDER_URL = 'https://gsr.bitrix24.ru/workgroups/group/12/disk/path/300/';
const DISK_OK: InitSupplyDiskResult = {
    folderUrl: FOLDER_URL,
    fileNames: ['Отчёт.docx', 'Договор 1.docx', 'Договор 1 (1).docx'],
};
const RPA_LINK = 'https://gsr.bitrix24.ru/rpa/item/9/77/';

const ENTITY_TYPE_ID = 1046;

/** Стадия варианта по умолчанию: черновик в воронке №3. */
const DRAFT_STAGE = `DT${ENTITY_TYPE_ID}_3:DRAFT`;

interface ItemUpdateFields {
    stageId: string;
}

/**
 * Шаги заявки: RPA → участники → файлы сделки → Диск → страницы таймлайна RPA →
 * комментарий сделки. Диск дополняет заявку: ссылка на папку идёт в таймлайн,
 * сбой Диска заявку не роняет.
 *
 * Варианты сделки: `dealVariants` — строки слепков сделки (listVariants),
 * `stageById` — текущая стадия элемента смарта; по умолчанию черновик.
 */
const setup = async (
    options: {
        disk?: InitSupplyDiskResult;
        failDiskPage?: boolean;
        dealFileFields?: Record<string, { fileData: [string, string] }>;
        dealVariants?: { smartId: number }[];
        stageById?: Record<number, string>;
        listVariantsError?: Error;
        failItemUpdateFor?: number;
        dispatch?: DispatchMock;
    } = {},
) => {
    const {
        disk = DISK_OK,
        failDiskPage = false,
        dealFileFields = {},
        dealVariants = [],
        stageById = {},
        listVariantsError,
        failItemUpdateFor,
        dispatch = okDispatch(),
    } = options;

    const rpaAdd = jest
        .fn()
        .mockResolvedValue({ result: { item: { id: 77 } } });
    const rpaUpdate = jest
        .fn()
        .mockResolvedValue({ result: { item: { id: 55 } } });
    const apiCall = jest.fn<Promise<void>, [string, RpaTimelineRequest]>(
        (_method, request) =>
            failDiskPage && titleOf(request).startsWith('[b]Документы')
                ? Promise.reject(new Error('RPA отказала'))
                : Promise.resolve(),
    );
    const addTimelineComment = jest.fn<Promise<void>, [DealCommentRequest]>(
        () => Promise.resolve(),
    );
    const dealUpdate = jest.fn().mockResolvedValue({});
    const saveToDisk = jest.fn<
        Promise<InitSupplyDiskResult>,
        [InitSupplyDiskParams]
    >(() => Promise.resolve(disk));

    const itemGet = jest.fn<Promise<unknown>, [string, string, string[]]>(id =>
        Promise.resolve({
            result: {
                item: {
                    id: Number(id),
                    stageId: stageById[Number(id)] ?? DRAFT_STAGE,
                },
            },
        }),
    );
    const itemUpdate = jest.fn<
        Promise<unknown>,
        [number, number, ItemUpdateFields]
    >(id =>
        id === failItemUpdateFor
            ? Promise.reject(new Error('Битрикс отказал'))
            : Promise.resolve({ result: { item: { id } } }),
    );
    const listVariants = jest.fn<
        Promise<{ smartId: number }[]>,
        [string, number]
    >(() =>
        listVariantsError
            ? Promise.reject(listVariantsError)
            : Promise.resolve(dealVariants),
    );

    const moduleRef = await Test.createTestingModule({
        providers: [
            InitSupplyUseCase,
            {
                provide: PBXService,
                useValue: {
                    init: jest.fn().mockResolvedValue({
                        bitrix: {
                            rpaItem: { add: rpaAdd, update: rpaUpdate },
                            api: { call: apiCall },
                            timeline: { addTimelineComment },
                            deal: { update: dealUpdate },
                            item: { get: itemGet, update: itemUpdate },
                        },
                        PortalModel: {
                            getRpaByCode: () => ({ bitrixId: 9 }),
                            getSmartByType: () => ({
                                entityTypeId: ENTITY_TYPE_ID,
                            }),
                        },
                    }),
                },
            },
            {
                provide: InitSupplyRpaFieldsService,
                useValue: { getRpaFields: jest.fn().mockResolvedValue({}) },
            },
            {
                provide: InitSupplyTimelineCommentService,
                useValue: {
                    getTimelineEntries: jest
                        .fn()
                        .mockResolvedValue([
                            { title: 'Поставка', description: '[b]Набор[/b]' },
                        ]),
                },
            },
            {
                provide: InitSupplyDealFileFieldsService,
                useValue: { get: jest.fn().mockReturnValue(dealFileFields) },
            },
            { provide: InitSupplyDiskService, useValue: { save: saveToDisk } },
            { provide: InnerDealService, useValue: { listVariants } },
            // поток продаж: настоящий сервис постановки, очередь подменена
            SalesDocumentFlowService,
            { provide: QueueDispatcherService, useValue: { dispatch } },
        ],
    }).compile();

    return {
        useCase: moduleRef.get(InitSupplyUseCase),
        rpaAdd,
        rpaUpdate,
        apiCall,
        addTimelineComment,
        dealUpdate,
        saveToDisk,
        itemUpdate,
        listVariants,
        dispatch,
    };
};

const dtoOf = (over: Partial<InitSupplyDto> = {}): InitSupplyDto =>
    Object.assign(new InitSupplyDto(), {
        domain: 'gsr.bitrix24.ru',
        dealId: 35018,
        companyId: 32442,
        userId: 12,
        rpa_id: null,
        flow: InitSupplyFlow.SUPPLY,
        ...over,
    });

describe('InitSupplyUseCase: документы заявки на Диске', () => {
    it('поставка: страница «Документы поставки» в таймлайне RPA со ссылкой на папку и списком файлов', async () => {
        const { useCase, apiCall, saveToDisk, rpaAdd } = await setup();
        const dto = dtoOf();

        const result = await useCase.initSupply(dto);

        expect(saveToDisk).toHaveBeenCalledWith({ dto, rpaId: 77 });
        expect(rpaAdd.mock.invocationCallOrder[0]).toBeLessThan(
            saveToDisk.mock.invocationCallOrder[0],
        );
        expect(apiCall).toHaveBeenCalledTimes(2);
        const [method, page] = apiCall.mock.calls[1];
        // запись таймлайна RPA больше не показывает разметку — только комментарий
        expect(method).toBe('rpa.comment.add');
        expect(page).toMatchObject({ typeId: 9, itemId: 77 });
        expect(titleOf(page)).toBe('[b]Документы поставки[/b]');
        expect(page.fields.description).toContain(
            `[url=${FOLDER_URL}]Папка на Диске[/url]`,
        );
        expect(page.fields.description).not.toMatch(/<[a-z]/);
        for (const name of DISK_OK.fileNames) {
            expect(page.fields.description).toContain(`• ${name}`);
        }
        expect(result.diskFolderUrl).toBe(FOLDER_URL);
        expect(result.diskWarning).toBeUndefined();
    });

    it('страница участника идёт раньше страницы Диска', async () => {
        const { useCase, apiCall } = await setup();

        await useCase.initSupply(dtoOf());

        const titles = apiCall.mock.calls.map(([, page]) => titleOf(page));
        expect(titles).toEqual([
            '[b]Поставка[/b]',
            '[b]Документы поставки[/b]',
        ]);
    });

    // gsr 25.11: Битрикс отдаёт DETAIL_URL с пробелом, пробел вырезался —
    // «…/Перезаключение2071» вёл на страницу групп
    it('папка с пробелом в имени: адрес закодирован, а не обрезан', async () => {
        const folderUrl =
            'https://gsr.bitrix24.ru/workgroups/group/41/disk/path/182917/Перезаключение 2071';
        const encoded =
            'https://gsr.bitrix24.ru/workgroups/group/41/disk/path/182917/%D0%9F%D0%B5%D1%80%D0%B5%D0%B7%D0%B0%D0%BA%D0%BB%D1%8E%D1%87%D0%B5%D0%BD%D0%B8%D0%B5%202071';
        const { useCase, apiCall, addTimelineComment } = await setup({
            disk: { ...DISK_OK, folderUrl },
        });

        await useCase.initSupply(dtoOf({ flow: InitSupplyFlow.RENEWAL }));

        const [comment] = addTimelineComment.mock.calls[0];
        expect(comment.COMMENT).toContain(`<a href="${encoded}"`);
        const [, page] = apiCall.mock.calls[1];
        expect(page.fields.description).toContain(`[url=${encoded}]`);
    });

    it('комментарий сделки: ссылка на заявку и ссылка на папку Диска', async () => {
        const { useCase, addTimelineComment } = await setup();

        await useCase.initSupply(dtoOf());

        expect(addTimelineComment).toHaveBeenCalledTimes(1);
        const [comment] = addTimelineComment.mock.calls[0];
        expect(comment).toMatchObject({
            ENTITY_ID: 35018,
            ENTITY_TYPE: 'deal',
            AUTHOR_ID: '12',
        });
        expect(comment.COMMENT).toBe(
            `📝 <a href="${RPA_LINK}"  target="_blank">Поставка</a>\n` +
                `📁 <a href="${FOLDER_URL}" target="_blank">Папка на Диске</a>`,
        );
    });

    it('перезаключение: заголовок страницы и подпись другие, flow идёт в сервис Диска', async () => {
        const { useCase, apiCall, addTimelineComment, saveToDisk } =
            await setup();
        const dto = dtoOf({ flow: InitSupplyFlow.RENEWAL });

        await useCase.initSupply(dto);

        expect(saveToDisk).toHaveBeenCalledWith({ dto, rpaId: 77 });
        const [, page] = apiCall.mock.calls[1];
        expect(titleOf(page)).toBe('[b]Документы перезаключения[/b]');
        const [comment] = addTimelineComment.mock.calls[0];
        expect(comment.COMMENT).toContain('>Перезаключение</a>');
        expect(comment.COMMENT).toContain('Папка на Диске');
    });

    it('обновление заявки: документы идут в Диск с тем же id заявки', async () => {
        const { useCase, rpaAdd, rpaUpdate, saveToDisk } = await setup();
        const dto = dtoOf({ rpa_id: 55 });

        await useCase.initSupply(dto);

        expect(rpaUpdate).toHaveBeenCalledTimes(1);
        expect(rpaAdd).not.toHaveBeenCalled();
        expect(saveToDisk).toHaveBeenCalledWith({ dto, rpaId: 55 });
    });

    it('сбой Диска: заявка создана, diskFolderUrl null, причина в ответе, таймлайн как раньше', async () => {
        const warning = 'Документы не загружены на Диск: нет хранилища';
        const { useCase, apiCall, addTimelineComment, rpaAdd } = await setup({
            disk: { folderUrl: null, fileNames: [], warning },
        });

        const result = await useCase.initSupply(dtoOf());

        expect(rpaAdd).toHaveBeenCalledTimes(1);
        expect(result.id_rpa).toBe(77);
        expect(result.diskFolderUrl).toBeNull();
        expect(result.diskWarning).toBe(warning);
        // только страница участника, без страницы Диска
        expect(apiCall).toHaveBeenCalledTimes(1);
        const [comment] = addTimelineComment.mock.calls[0];
        expect(comment.COMMENT).toBe(
            `📝 <a href="${RPA_LINK}"  target="_blank">Поставка</a>`,
        );
    });

    it('Диск принял не всё: ссылка и причина приходят вместе', async () => {
        const { useCase } = await setup({
            disk: {
                folderUrl: FOLDER_URL,
                fileNames: ['Отчёт.docx'],
                warning: 'Документы загружены на Диск не полностью: «Счёт.pdf»',
            },
        });

        const result = await useCase.initSupply(dtoOf());

        expect(result.diskFolderUrl).toBe(FOLDER_URL);
        expect(result.diskWarning).toContain('не полностью');
    });

    it('страница Диска не записалась в RPA: заявка цела, причина в ответе, комментарий сделки уходит', async () => {
        const { useCase, addTimelineComment } = await setup({
            failDiskPage: true,
        });

        const result = await useCase.initSupply(dtoOf());

        expect(result.id_rpa).toBe(77);
        expect(result.diskWarning).toContain('RPA отказала');
        expect(addTimelineComment).toHaveBeenCalledTimes(1);
    });

    it('файловые поля сделки заполняются как раньше', async () => {
        const fields: Record<string, { fileData: [string, string] }> = {
            UF_CRM_CONTRACT: { fileData: ['Д.docx', 'QQ=='] },
        };
        const { useCase, dealUpdate } = await setup({ dealFileFields: fields });

        const result = await useCase.initSupply(dtoOf());

        expect(dealUpdate).toHaveBeenCalledWith(35018, fields);
        expect(result.dealFileFields).toEqual(['UF_CRM_CONTRACT']);
    });

    it('без пользователя таймлайн не пишется, документы на Диск всё равно уходят', async () => {
        const { useCase, apiCall, addTimelineComment, saveToDisk } =
            await setup();

        const result = await useCase.initSupply(dtoOf({ userId: null }));

        expect(saveToDisk).toHaveBeenCalledTimes(1);
        expect(apiCall).not.toHaveBeenCalled();
        expect(addTimelineComment).not.toHaveBeenCalled();
        expect(result.diskFolderUrl).toBe(FOLDER_URL);
    });
});

/** Участник заявки: из варианта нужен только элемент смарта. */
const participant = (variantSmartId: number): DocumentVariantDto =>
    Object.assign(new DocumentVariantDto(), { variantSmartId });

/** Стадии, которые заявка выставила вариантам: id элемента → суффикс стадии. */
const stagesSet = (
    itemUpdate: jest.Mock<Promise<unknown>, [number, number, ItemUpdateFields]>,
): Record<number, string> =>
    Object.fromEntries(
        itemUpdate.mock.calls.map(([id, , fields]) => [
            id,
            fields.stageId.split(':')[1],
        ]),
    );

/**
 * В поставку идут варианты, которые менеджер продаёт (`variants` заявки):
 * они получают стадию «Поставка». Остальные варианты сделки закрываются
 * стадией «Не состоялся».
 */
describe('InitSupplyUseCase: варианты сделки при поставке', () => {
    const TWO_VARIANTS = [{ smartId: 5001 }, { smartId: 5002 }];

    it('в запросе один вариант из двух — он в «Поставке», второй закрыт «Не состоялся»', async () => {
        const { useCase, itemUpdate, listVariants } = await setup({
            dealVariants: TWO_VARIANTS,
        });

        const result = await useCase.initSupply(
            dtoOf({ variants: [participant(5001)] }),
        );

        expect(listVariants).toHaveBeenCalledWith('gsr.bitrix24.ru', 35018);
        expect(stagesSet(itemUpdate)).toEqual({
            5001: 'SUPPLY',
            5002: 'FAILED',
        });
        expect(result.closedVariantIds).toEqual([5002]);
        expect(result.id_rpa).toBe(77);
    });

    it('закрытие идёт после перевода участников в «Поставку»', async () => {
        const { useCase, itemUpdate } = await setup({
            dealVariants: TWO_VARIANTS,
        });

        await useCase.initSupply(dtoOf({ variants: [participant(5001)] }));

        const order = itemUpdate.mock.calls.map(([id, , fields]) => [
            id,
            fields.stageId.split(':')[1],
        ]);
        expect(order).toEqual([
            [5001, 'SUPPLY'],
            [5002, 'FAILED'],
        ]);
    });

    it('в запросе оба варианта — никто не закрыт', async () => {
        const { useCase, itemUpdate } = await setup({
            dealVariants: TWO_VARIANTS,
        });

        const result = await useCase.initSupply(
            dtoOf({ variants: [participant(5001), participant(5002)] }),
        );

        expect(stagesSet(itemUpdate)).toEqual({
            5001: 'SUPPLY',
            5002: 'SUPPLY',
        });
        expect(result.closedVariantIds).toBeUndefined();
    });

    it('запрос без вариантов ничего не закрывает и варианты сделки не читает', async () => {
        const { useCase, itemUpdate, listVariants } = await setup({
            dealVariants: TWO_VARIANTS,
        });

        const withoutField = await useCase.initSupply(dtoOf());
        const emptyList = await useCase.initSupply(dtoOf({ variants: [] }));

        expect(itemUpdate).not.toHaveBeenCalled();
        expect(listVariants).not.toHaveBeenCalled();
        expect(withoutField.closedVariantIds).toBeUndefined();
        expect(emptyList.closedVariantIds).toBeUndefined();
    });

    it('участник без id не считается вариантом заявки и закрытие не запускает', async () => {
        const { useCase, itemUpdate } = await setup({
            dealVariants: TWO_VARIANTS,
        });

        await useCase.initSupply(
            dtoOf({
                variants: [
                    Object.assign(new DocumentVariantDto(), {
                        variantSmartId: null,
                    }),
                ],
            }),
        );

        expect(itemUpdate).not.toHaveBeenCalled();
    });

    it('варианты с итогом не переписываются: «Успех», «Отклонён» и «Не состоялся» остаются', async () => {
        const { useCase, itemUpdate } = await setup({
            dealVariants: [
                { smartId: 5001 },
                { smartId: 5002 },
                { smartId: 5003 },
                { smartId: 5004 },
                { smartId: 5005 },
            ],
            stageById: {
                5003: `DT${ENTITY_TYPE_ID}_3:SUCCESS`,
                5004: `DT${ENTITY_TYPE_ID}_3:REJECTED`,
                5005: `DT${ENTITY_TYPE_ID}_3:FAILED`,
            },
        });

        const result = await useCase.initSupply(
            dtoOf({ variants: [participant(5001)] }),
        );

        expect(stagesSet(itemUpdate)).toEqual({
            5001: 'SUPPLY',
            5002: 'FAILED',
        });
        expect(result.closedVariantIds).toEqual([5002]);
    });

    it('сделка без вариантов в базе: участники в «Поставке», закрывать нечего', async () => {
        const { useCase, itemUpdate } = await setup({ dealVariants: [] });

        const result = await useCase.initSupply(
            dtoOf({ variants: [participant(5001)] }),
        );

        expect(stagesSet(itemUpdate)).toEqual({ 5001: 'SUPPLY' });
        expect(result.closedVariantIds).toBeUndefined();
    });

    it('заявка без сделки (dealId пуст) вариантов не закрывает', async () => {
        const { useCase, itemUpdate, listVariants } = await setup({
            dealVariants: TWO_VARIANTS,
        });

        await useCase.initSupply(
            dtoOf({ dealId: null, variants: [participant(5001)] }),
        );

        expect(listVariants).not.toHaveBeenCalled();
        expect(stagesSet(itemUpdate)).toEqual({ 5001: 'SUPPLY' });
    });

    it('сбой чтения вариантов сделки заявку не роняет', async () => {
        const { useCase, rpaAdd, addTimelineComment } = await setup({
            dealVariants: TWO_VARIANTS,
            listVariantsError: new Error('БД недоступна'),
        });

        const result = await useCase.initSupply(
            dtoOf({ variants: [participant(5001)] }),
        );

        expect(rpaAdd).toHaveBeenCalledTimes(1);
        expect(result.id_rpa).toBe(77);
        expect(result.closedVariantIds).toBeUndefined();
        expect(addTimelineComment).toHaveBeenCalledTimes(1);
    });

    it('Битрикс отказал на одном варианте — заявка цела, остальные закрываются', async () => {
        const { useCase, itemUpdate, addTimelineComment } = await setup({
            dealVariants: [
                { smartId: 5001 },
                { smartId: 5002 },
                { smartId: 5003 },
            ],
            failItemUpdateFor: 5002,
        });

        const result = await useCase.initSupply(
            dtoOf({ variants: [participant(5001)] }),
        );

        expect(itemUpdate).toHaveBeenCalledTimes(3);
        expect(result.id_rpa).toBe(77);
        // 5002 не закрылся, 5003 закрылся
        expect(result.closedVariantIds).toEqual([5003]);
        expect(addTimelineComment).toHaveBeenCalledTimes(1);
    });
});

/**
 * Событие «поставка» в поток продаж event-sales: одно на запуск поставки,
 * только по `salesFlow` из запроса.
 */
describe('InitSupplyUseCase: событие в поток продаж', () => {
    const totalRowOf = (sum: number) =>
        ({
            name: 'Итого',
            price: { sum, current: sum / 12, quantity: 12 },
        }) as unknown as InitSupplyDto['total'][number];

    const supplyOf = (name: string) =>
        ({ name }) as unknown as InitSupplyDto['supply'];

    const salesDto = (over: Partial<InitSupplyDto> = {}): InitSupplyDto =>
        dtoOf({
            salesFlow: true,
            total: [totalRowOf(36000)],
            supply: supplyOf('Интернет 5 ОД'),
            ...over,
        });

    it('salesFlow: true — одно событие supply после создания заявки', async () => {
        const { useCase, dispatch, rpaAdd } = await setup();

        await useCase.initSupply(salesDto());

        expect(dispatch).toHaveBeenCalledTimes(1);
        expect(dispatch.mock.calls[0][0]).toBe('event-sales-document-flow');
        expect(dispatch.mock.calls[0][1]).toBe('event-sales-document-flow');
        expect(rpaAdd.mock.invocationCallOrder[0]).toBeLessThan(
            dispatch.mock.invocationCallOrder[0],
        );
        const event = eventOfCall(dispatch);
        expect(event).toMatchObject({
            domain: 'gsr.bitrix24.ru',
            userId: 12,
            companyId: 32442,
            dealId: 35018,
            kinds: ['supply'],
            sum: 36000,
            summary: 'Поставка: Итого, Интернет 5 ОД, 36 000 ₽',
        });
        expect(dispatch.mock.calls[0][3]).toBe(
            `sales-document:${event.eventId}`,
        );
    });

    it('без salesFlow событие не ставится', async () => {
        const { useCase, dispatch } = await setup();

        await useCase.initSupply(dtoOf());
        await useCase.initSupply(dtoOf({ salesFlow: false }));

        expect(dispatch).not.toHaveBeenCalled();
    });

    it('несколько участников: событие одно, сумма по всем', async () => {
        const { useCase, dispatch } = await setup();
        const variant = (title: string, sum: number): DocumentVariantDto =>
            Object.assign(new DocumentVariantDto(), {
                variantSmartId: null,
                title,
                supply: supplyOf('Интернет 3 ОД'),
                total: totalRowOf(sum),
                rows: [],
                sets: { general: [], alternative: [] },
            });

        await useCase.initSupply(
            salesDto({
                variants: [variant('Юрист', 12000), variant('Бухгалтер', 6000)],
            }),
        );

        expect(dispatch).toHaveBeenCalledTimes(1);
        expect(eventOfCall(dispatch).sum).toBe(18000);
        expect(eventOfCall(dispatch).summary).toBe(
            'Поставка: Юрист, Интернет 3 ОД; Бухгалтер, Интернет 3 ОД, 18 000 ₽',
        );
    });

    it('обновление заявки (rpa_id задан): событие тоже одно', async () => {
        const { useCase, dispatch } = await setup();

        await useCase.initSupply(salesDto({ rpa_id: 55 }));

        expect(dispatch).toHaveBeenCalledTimes(1);
    });

    it('сделки нет: события нет, заявка создаётся', async () => {
        const { useCase, dispatch, rpaAdd } = await setup();

        const result = await useCase.initSupply(salesDto({ dealId: null }));

        expect(rpaAdd).toHaveBeenCalledTimes(1);
        expect(result.id_rpa).toBe(77);
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('сбой постановки заявку не роняет', async () => {
        const { useCase } = await setup({
            dispatch: failingDispatch('Redis недоступен'),
        });

        const result = await useCase.initSupply(salesDto());

        expect(result.id_rpa).toBe(77);
    });
});
