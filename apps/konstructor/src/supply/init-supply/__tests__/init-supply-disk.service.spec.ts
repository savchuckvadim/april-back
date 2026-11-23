jest.mock('@lib/shared/lib', () => ({
    ...jest.requireActual<Record<string, unknown>>('@lib/shared/lib'),
    delay: jest.fn().mockResolvedValue(undefined),
}));

import { Test } from '@nestjs/testing';
import { PBXService } from '@lib/pbx';
import { BitrixDocumentSaveFlowService } from '@app/konstructor/offer-word/services/bitrix/bitrix-document-save-flow.service';
import { InitSupplyDto, InitSupplyFlow } from '../dto/init-supply.dto';
import { InitSupplyDiskService } from '../services/disk/init-supply-disk.service';
import { InitSupplyFileService } from '../services/file/init-supply-file.service';

interface UploadRequest {
    id: number;
    data: { NAME: string };
    generateUniqueName?: boolean;
}

interface UploadResponse {
    result: { ID: string; NAME: string; DETAIL_URL: string };
}

/**
 * Документы заявки на Диске: подпапка `Поставка {id}` в папке сделки, в ней
 * отчёт и все файлы менеджера. Диск — дополнение, сбой не бросает исключение.
 */
const setup = async (
    options: {
        dealFolderExists?: boolean;
        subfolderExists?: boolean;
        storages?: { ID: string }[];
        failUpload?: (name: string) => boolean;
        reportDownload?: () => Promise<[string, string]>;
    } = {},
) => {
    const {
        dealFolderExists = true,
        subfolderExists = true,
        storages = [{ ID: '100' }],
        failUpload = () => false,
        reportDownload = () => Promise.resolve(['Отчёт.docx', 'UkVQT1JU']),
    } = options;

    const storage = {
        getlist: jest.fn().mockResolvedValue({ result: storages }),
        getchildren: jest.fn().mockResolvedValue({
            result: dealFolderExists
                ? [{ ID: '200', DETAIL_URL: 'deal-folder' }]
                : [],
        }),
        addfolder: jest.fn().mockResolvedValue({
            result: { ID: '201', DETAIL_URL: 'new-deal-folder' },
        }),
    };
    let uploadNumber = 0;
    const folder = {
        getchildren: jest.fn().mockResolvedValue({
            result: subfolderExists
                ? [{ ID: '300', DETAIL_URL: 'supply-folder' }]
                : [],
        }),
        addsubfolder: jest.fn().mockResolvedValue({
            result: { ID: '301', DETAIL_URL: 'new-supply-folder' },
        }),
        uploadfile: jest.fn<Promise<UploadResponse>, [UploadRequest]>(
            request => {
                if (failUpload(request.data.NAME)) {
                    return Promise.reject(new Error('Диск отказал'));
                }
                uploadNumber += 1;
                return Promise.resolve({
                    result: {
                        ID: String(900 + uploadNumber),
                        NAME: request.data.NAME,
                        DETAIL_URL: `file-${uploadNumber}`,
                    },
                });
            },
        ),
    };
    const downloadFileAndConvertToBase64 = jest.fn<
        Promise<[string, string]>,
        [string]
    >(() => reportDownload());

    const moduleRef = await Test.createTestingModule({
        providers: [
            InitSupplyDiskService,
            BitrixDocumentSaveFlowService,
            {
                provide: PBXService,
                useValue: {
                    init: jest.fn().mockResolvedValue({
                        bitrix: { disk: { storage, folder } },
                        PortalModel: { getSalesTaskGroupId: () => 12 },
                    }),
                },
            },
            {
                provide: InitSupplyFileService,
                useValue: { downloadFileAndConvertToBase64 },
            },
        ],
    }).compile();

    return {
        service: moduleRef.get(InitSupplyDiskService),
        storage,
        folder,
        downloadFileAndConvertToBase64,
    };
};

const dtoOf = (over: Partial<InitSupplyDto> = {}): InitSupplyDto =>
    Object.assign(new InitSupplyDto(), {
        domain: 'gsr.bitrix24.ru',
        dealId: 35018,
        companyId: 32442,
        file: 'https://api.konstructor.april-app.ru/api/files/token',
        flow: InitSupplyFlow.SUPPLY,
        files: [
            {
                code: 'current_contract',
                filename: 'Договор 1.docx',
                base64: 'RE9HMQ==',
            },
            {
                code: 'current_invoice',
                filename: 'Счёт 1.pdf',
                base64: 'SU5WMQ==',
            },
        ],
        ...over,
    });

const uploadedNames = (
    calls: [UploadRequest][],
): { folderId: number; name: string }[] =>
    calls.map(([request]) => ({
        folderId: request.id,
        name: request.data.NAME,
    }));

describe('InitSupplyDiskService', () => {
    it('папка сделки и подпапка есть: отчёт и файлы менеджера лежат в подпапке, ссылка на неё в ответе', async () => {
        const { service, folder, downloadFileAndConvertToBase64 } =
            await setup();
        const dto = dtoOf();

        const result = await service.save({ dto, rpaId: 77 });

        expect(downloadFileAndConvertToBase64).toHaveBeenCalledWith(dto.file);
        expect(folder.getchildren).toHaveBeenCalledWith({
            id: 200,
            filter: { TYPE: 'folder', NAME: 'Поставка 77' },
        });
        expect(folder.addsubfolder).not.toHaveBeenCalled();
        expect(uploadedNames(folder.uploadfile.mock.calls)).toEqual([
            { folderId: 300, name: 'Отчёт.docx' },
            { folderId: 300, name: 'Договор 1.docx' },
            { folderId: 300, name: 'Счёт 1.pdf' },
        ]);
        expect(result).toEqual({
            folderUrl: 'supply-folder',
            fileNames: ['Отчёт.docx', 'Договор 1.docx', 'Счёт 1.pdf'],
        });
    });

    it('папки сделки и подпапки нет: обе создаются, файлы идут в новую подпапку', async () => {
        const { service, storage, folder } = await setup({
            dealFolderExists: false,
            subfolderExists: false,
        });

        const result = await service.save({ dto: dtoOf(), rpaId: 77 });

        expect(storage.addfolder).toHaveBeenCalledWith(
            expect.objectContaining({ id: 100, data: { NAME: '35018' } }),
        );
        expect(folder.addsubfolder).toHaveBeenCalledWith({
            id: 201,
            data: { NAME: 'Поставка 77' },
        });
        expect(
            uploadedNames(folder.uploadfile.mock.calls).every(
                file => file.folderId === 301,
            ),
        ).toBe(true);
        expect(result.folderUrl).toBe('new-supply-folder');
    });

    it('сделки нет: папка называется по компании', async () => {
        const { service, storage } = await setup();

        await service.save({
            dto: dtoOf({ dealId: null }),
            rpaId: 77,
        });

        expect(storage.getchildren).toHaveBeenCalledWith({
            id: '100',
            filter: { TYPE: 'folder', NAME: 'Company_32442' },
        });
    });

    it('два файла с одним code: на Диск идут оба, имена не перезаписываются', async () => {
        const { service, folder } = await setup();
        const dto = dtoOf({
            files: [
                {
                    code: 'current_contract',
                    filename: 'Договор.docx',
                    base64: 'QQ==',
                },
                {
                    code: 'current_contract',
                    filename: 'Договор.docx',
                    base64: 'Qg==',
                },
                {
                    code: 'current_contract',
                    filename: 'Договор 2.docx',
                    base64: 'Qw==',
                },
            ],
        });

        const result = await service.save({ dto, rpaId: 77 });

        expect(
            uploadedNames(folder.uploadfile.mock.calls).map(file => file.name),
        ).toEqual([
            'Отчёт.docx',
            'Договор.docx',
            'Договор.docx',
            'Договор 2.docx',
        ]);
        for (const [request] of folder.uploadfile.mock.calls) {
            expect(request.generateUniqueName).toBe(true);
        }
        expect(result.fileNames).toHaveLength(4);
    });

    it('файл менеджера без содержимого пропускается', async () => {
        const { service, folder } = await setup();
        const dto = dtoOf({
            files: [
                {
                    code: 'current_contract',
                    filename: 'Пустой.docx',
                    base64: '',
                },
            ],
        });

        await service.save({ dto, rpaId: 77 });

        expect(
            uploadedNames(folder.uploadfile.mock.calls).map(file => file.name),
        ).toEqual(['Отчёт.docx']);
    });

    it('перезаключение: подпапка называется «Перезаключение {id}»', async () => {
        const { service, folder } = await setup();

        await service.save({
            dto: dtoOf({ flow: InitSupplyFlow.RENEWAL }),
            rpaId: 78,
        });

        expect(folder.getchildren).toHaveBeenCalledWith({
            id: 200,
            filter: { TYPE: 'folder', NAME: 'Перезаключение 78' },
        });
    });

    it('повторный вызов с тем же id заявки: файлы ложатся в ту же подпапку', async () => {
        const { service, folder } = await setup();

        await service.save({ dto: dtoOf(), rpaId: 77 });
        await service.save({ dto: dtoOf(), rpaId: 77 });

        expect(folder.addsubfolder).not.toHaveBeenCalled();
        const folderIds = new Set(
            uploadedNames(folder.uploadfile.mock.calls).map(
                file => file.folderId,
            ),
        );
        expect([...folderIds]).toEqual([300]);
    });

    describe('сбои Диска не бросают исключение', () => {
        it('нет хранилища группы продаж: ссылки нет, причина в warning', async () => {
            const { service, folder } = await setup({ storages: [] });

            const result = await service.save({ dto: dtoOf(), rpaId: 77 });

            expect(result.folderUrl).toBeNull();
            expect(result.fileNames).toEqual([]);
            expect(result.warning).toContain('Документы не загружены на Диск');
            expect(result.warning).toContain(
                'Root storage folder ID is not found',
            );
            expect(folder.uploadfile).not.toHaveBeenCalled();
        });

        it('отказ загрузки одного файла: остальные на Диске, ссылка есть, имя файла в warning', async () => {
            const { service } = await setup({
                failUpload: name => name === 'Счёт 1.pdf',
            });

            const result = await service.save({ dto: dtoOf(), rpaId: 77 });

            expect(result.folderUrl).toBe('supply-folder');
            expect(result.fileNames).toEqual(['Отчёт.docx', 'Договор 1.docx']);
            expect(result.warning).toContain('«Счёт 1.pdf»: Диск отказал');
        });

        it('Диск не принял ни одного файла: ссылки нет', async () => {
            const { service } = await setup({ failUpload: () => true });

            const result = await service.save({ dto: dtoOf(), rpaId: 77 });

            expect(result.folderUrl).toBeNull();
            expect(result.fileNames).toEqual([]);
            expect(result.warning).toContain('Диск отказал');
        });

        it('отчёт не скачался: файлы менеджера на Диске, причина в warning', async () => {
            const { service } = await setup({
                reportDownload: () => Promise.reject(new Error('404')),
            });

            const result = await service.save({ dto: dtoOf(), rpaId: 77 });

            expect(result.folderUrl).toBe('supply-folder');
            expect(result.fileNames).toEqual(['Договор 1.docx', 'Счёт 1.pdf']);
            expect(result.warning).toContain('отчёт о поставке не скачан: 404');
        });

        it('в ответе Битрикса нет id заявки: Диск не трогаем', async () => {
            const { service, storage } = await setup();

            const result = await service.save({
                dto: dtoOf(),
                rpaId: undefined,
            });

            expect(result.folderUrl).toBeNull();
            expect(result.warning).toContain('нет id заявки');
            expect(storage.getlist).not.toHaveBeenCalled();
        });

        it('нет ни сделки, ни компании: папку назвать нечем', async () => {
            const { service, storage } = await setup();

            const result = await service.save({
                dto: dtoOf({ dealId: null, companyId: null }),
                rpaId: 77,
            });

            expect(result.folderUrl).toBeNull();
            expect(result.warning).toContain('Не указаны сделка и компания');
            expect(storage.getlist).not.toHaveBeenCalled();
        });
    });
});
