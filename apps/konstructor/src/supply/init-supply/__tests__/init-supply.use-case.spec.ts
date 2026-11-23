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

interface RpaTimelineRequest {
    typeId: number;
    itemId: number;
    userId: string;
    fields: { title: string; description: string };
}

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

/**
 * Шаги заявки: RPA → участники → файлы сделки → Диск → страницы таймлайна RPA →
 * комментарий сделки. Диск дополняет заявку: ссылка на папку идёт в таймлайн,
 * сбой Диска заявку не роняет.
 */
const setup = async (
    options: {
        disk?: InitSupplyDiskResult;
        failDiskPage?: boolean;
        dealFileFields?: Record<string, { fileData: [string, string] }>;
    } = {},
) => {
    const {
        disk = DISK_OK,
        failDiskPage = false,
        dealFileFields = {},
    } = options;

    const rpaAdd = jest
        .fn()
        .mockResolvedValue({ result: { item: { id: 77 } } });
    const rpaUpdate = jest
        .fn()
        .mockResolvedValue({ result: { item: { id: 55 } } });
    const apiCall = jest.fn<Promise<void>, [string, RpaTimelineRequest]>(
        (_method, request) =>
            failDiskPage && request.fields.title.startsWith('Документы')
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
                        },
                        PortalModel: {
                            getRpaByCode: () => ({ bitrixId: 9 }),
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
                            { title: 'Поставка', description: '<b>Набор</b>' },
                        ]),
                },
            },
            {
                provide: InitSupplyDealFileFieldsService,
                useValue: { get: jest.fn().mockReturnValue(dealFileFields) },
            },
            { provide: InitSupplyDiskService, useValue: { save: saveToDisk } },
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
        expect(method).toBe('rpa.timeline.add');
        expect(page).toMatchObject({ typeId: 9, itemId: 77, userId: '12' });
        expect(page.fields.title).toBe('Документы поставки');
        expect(page.fields.description).toContain(
            `<a href="${FOLDER_URL}" target="_blank">Папка на Диске</a>`,
        );
        for (const name of DISK_OK.fileNames) {
            expect(page.fields.description).toContain(`<li>${name}</li>`);
        }
        expect(result.diskFolderUrl).toBe(FOLDER_URL);
        expect(result.diskWarning).toBeUndefined();
    });

    it('страница участника идёт раньше страницы Диска', async () => {
        const { useCase, apiCall } = await setup();

        await useCase.initSupply(dtoOf());

        const titles = apiCall.mock.calls.map(([, page]) => page.fields.title);
        expect(titles).toEqual(['Поставка', 'Документы поставки']);
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
        expect(page.fields.title).toBe('Документы перезаключения');
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
