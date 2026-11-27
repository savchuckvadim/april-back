jest.mock('@lib/shared/lib', () => ({
    delay: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('fs/promises', () => ({
    readFile: jest.fn((path: string) =>
        Promise.resolve(Buffer.from(`содержимое ${path}`)),
    ),
}));

import type { PBXService } from '@lib/pbx/pbx.service';
import type { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import type { IPreparedDocument } from '../../../interface/document.interface';
import { BitrixDocumentSaveFlowService } from '../bitrix-document-save-flow.service';

const portalModel = { getSalesTaskGroupId: () => 12 } as unknown as PortalModel;

const DISK_BASE = 'https://portal.bitrix24.ru/workgroups/group/12/disk/file';

interface UploadParams {
    id: number;
    data: { NAME: string };
    fileContent: [string, string];
    generateUniqueName?: boolean;
}

const setup = (options: { upload?: 'ok' | 'fails' } = {}) => {
    let counter = 0;
    const uploadfile = jest.fn((params: UploadParams) => {
        if (options.upload === 'fails') {
            return Promise.reject(new Error('Не удалось сохранить файл'));
        }
        counter += 1;
        return Promise.resolve({
            result: {
                ID: String(900 + counter),
                NAME: params.data.NAME,
                DETAIL_URL: `${DISK_BASE}/${900 + counter}/${params.data.NAME}`,
            },
        });
    });
    const disk = {
        storage: {
            getlist: jest.fn().mockResolvedValue({ result: [{ ID: '100' }] }),
            getchildren: jest.fn().mockResolvedValue({
                result: [{ ID: '200', DETAIL_URL: 'deal-folder' }],
            }),
            addfolder: jest.fn(),
        },
        folder: {
            getchildren: jest.fn().mockResolvedValue({
                result: [{ ID: '300', DETAIL_URL: 'contracts-folder' }],
            }),
            addsubfolder: jest.fn(),
            uploadfile,
        },
    };
    const pbx = {
        init: jest
            .fn()
            .mockResolvedValue({ bitrix: { disk }, PortalModel: portalModel }),
    } as unknown as PBXService;
    return {
        service: new BitrixDocumentSaveFlowService(pbx),
        disk,
        uploadfile,
    };
};

const offer = (
    overrides: Partial<IPreparedDocument> = {},
): IPreparedDocument => ({
    link: 'https://april-online.ru/api/files/token-1',
    name: 'КП Гарант-Юрист - Интернет 1 ОД',
    type: 'offer',
    diskName: 'КП_Гарант-Юрист_Интернет_1_ОД',
    absolutePath: '/storage/konstructor/offer/offer-1b2c3d.pdf',
    ...overrides,
});

const target = {
    domain: 'portal.bitrix24.ru',
    companyId: '7',
    userId: 15,
    dealId: '100',
};

describe('BitrixDocumentSaveFlowService.saveDocuments', () => {
    it('КП и счёт ложатся на Диск под читаемым именем с расширением своего файла', async () => {
        const { service, uploadfile } = setup();

        await service.saveDocuments({
            ...target,
            documents: [
                offer(),
                offer({
                    type: 'invoice',
                    name: 'Счёт Гарант-Юрист - Интернет 1 ОД',
                    diskName: 'Счёт_311-5527',
                    // перевод счёта в PDF не удался — остался DOCX
                    absolutePath: '/storage/invoice/invoice-9f8e.docx',
                }),
            ],
        });

        expect(
            uploadfile.mock.calls.map(([params]) => params.data.NAME),
        ).toEqual(['КП_Гарант-Юрист_Интернет_1_ОД.pdf', 'Счёт_311-5527.docx']);
        const [{ fileContent }] = uploadfile.mock.calls[0];
        expect(fileContent[0]).toBe('КП_Гарант-Юрист_Интернет_1_ОД.pdf');
        expect(Buffer.from(fileContent[1], 'base64').toString()).toBe(
            'содержимое /storage/konstructor/offer/offer-1b2c3d.pdf',
        );
    });

    it('имена на Диске уникальны: Битрикс сам допишет номер к занятому, второе КП не роняет генерацию', async () => {
        const { service, uploadfile } = setup();

        await service.saveDocuments({ ...target, documents: [offer()] });

        expect(uploadfile).toHaveBeenCalledWith(
            expect.objectContaining({ generateUniqueName: true }),
        );
    });

    it('расширение в diskName не удваивается', async () => {
        const { service, uploadfile } = setup();

        await service.saveDocuments({
            ...target,
            documents: [offer({ diskName: 'КП_Юрист.pdf' })],
        });

        expect(uploadfile.mock.calls[0][0].data.NAME).toBe('КП_Юрист.pdf');
    });

    it('без diskName (договор) имя файла прежнее; подпапка и уникальность из опций вызова', async () => {
        const { service, uploadfile, disk } = setup();

        await service.saveDocuments({
            ...target,
            documents: [
                offer({
                    type: 'contract' as never,
                    diskName: undefined,
                    absolutePath: '/storage/Договор_Юрист_СТАР-11-2.docx',
                }),
            ],
            onlyBitrixSave: true,
            disk: { subfolder: 'Договоры', uniqueNames: true },
        });

        expect(disk.folder.getchildren).toHaveBeenCalledWith(
            expect.objectContaining({ id: 200 }),
        );
        expect(uploadfile).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 300,
                data: { NAME: 'Договор_Юрист_СТАР-11-2.docx' },
                generateUniqueName: true,
            }),
        );
    });

    it('вызывающий может отключить уникальность', async () => {
        const { service, uploadfile } = setup();

        await service.saveDocuments({
            ...target,
            documents: [offer()],
            disk: { uniqueNames: false },
        });

        expect(uploadfile.mock.calls[0][0]).not.toHaveProperty(
            'generateUniqueName',
        );
    });

    it('в результате ссылка на файл Диска и имя на Диске — для текста ссылки в таймлайне', async () => {
        const { service } = setup();

        const result = await service.saveDocuments({
            ...target,
            documents: [offer()],
        });

        expect(result.documents).toEqual([
            {
                link: `${DISK_BASE}/901/КП_Гарант-Юрист_Интернет_1_ОД.pdf`,
                name: 'КП Гарант-Юрист - Интернет 1 ОД',
                type: 'offer',
                diskName: 'КП_Гарант-Юрист_Интернет_1_ОД',
            },
        ]);
    });

    it('документ без diskName не получает лишнего поля', async () => {
        const { service } = setup();

        const result = await service.saveDocuments({
            ...target,
            documents: [offer({ diskName: undefined })],
        });

        expect(result.documents[0]).not.toHaveProperty('diskName');
    });

    it('Диск не принял файл: ссылка на сервер и имя на Диске сохраняются для таймлайна', async () => {
        const { service } = setup({ upload: 'fails' });

        const result = await service.saveDocuments({
            ...target,
            documents: [offer()],
        });

        expect(result.portalFolderId).toBeNull();
        expect(result.documents).toEqual([
            {
                link: 'https://april-online.ru/api/files/token-1',
                name: 'КП Гарант-Юрист - Интернет 1 ОД',
                type: 'offer',
                diskName: 'КП_Гарант-Юрист_Интернет_1_ОД',
            },
        ]);
    });

    it('onlyBitrixSave: сбой Диска не прячется за ссылкой на сервер', async () => {
        const { service } = setup({ upload: 'fails' });

        await expect(
            service.saveDocuments({
                ...target,
                documents: [offer()],
                onlyBitrixSave: true,
            }),
        ).rejects.toThrow('Не удалось сохранить файл');
    });
});
