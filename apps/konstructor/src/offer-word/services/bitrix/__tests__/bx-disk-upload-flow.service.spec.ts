jest.mock('@lib/shared/lib', () => ({
    delay: jest.fn().mockResolvedValue(undefined),
}));

import type { BitrixService } from '@lib/bitrix';
import type { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { BxDiskUploadFlowService } from '../bx-disk-upload-flow.service';

const portalModel = { getSalesTaskGroupId: () => 12 } as unknown as PortalModel;

const fakeBitrix = (subfolderExists: boolean) => {
    const disk = {
        storage: {
            getlist: jest.fn().mockResolvedValue({ result: [{ ID: '100' }] }),
            getchildren: jest
                .fn()
                .mockResolvedValue({
                    result: [{ ID: '200', DETAIL_URL: 'deal-folder' }],
                }),
            addfolder: jest.fn(),
        },
        folder: {
            getchildren: jest.fn().mockResolvedValue({
                result: subfolderExists
                    ? [{ ID: '300', DETAIL_URL: 'contracts-folder' }]
                    : [],
            }),
            addsubfolder: jest
                .fn()
                .mockResolvedValue({
                    result: { ID: '301', DETAIL_URL: 'new-contracts-folder' },
                }),
            uploadfile: jest
                .fn()
                .mockResolvedValue({
                    result: { ID: '900', DETAIL_URL: 'file-url' },
                }),
        },
    };
    return { bitrix: { disk } as unknown as BitrixService, disk };
};

const FILE: [string, string] = ['Договор.docx', 'YmFzZTY0'];

describe('BxDiskUploadFlowService', () => {
    it('без опций — как КП: прямо в папку сделки, имя как есть', async () => {
        const { bitrix, disk } = fakeBitrix(true);
        const flow = new BxDiskUploadFlowService(
            bitrix,
            portalModel,
            32442,
            35018,
        );

        const { uploadedFiles, folderUrl } = await flow.upload([FILE]);

        expect(disk.folder.getchildren).not.toHaveBeenCalled();
        expect(disk.folder.uploadfile).toHaveBeenCalledWith({
            id: 200,
            data: { NAME: 'Договор.docx' },
            fileContent: FILE,
        });
        expect(uploadedFiles[0]?.DETAIL_URL).toBe('file-url');
        expect(folderUrl).toBe('deal-folder');
    });

    it('подпапка есть — файл туда, одноимённый не перезаписывается', async () => {
        const { bitrix, disk } = fakeBitrix(true);
        const flow = new BxDiskUploadFlowService(
            bitrix,
            portalModel,
            32442,
            35018,
            {
                subfolder: 'Договоры',
                uniqueNames: true,
            },
        );

        const { folderUrl } = await flow.upload([FILE]);

        expect(disk.folder.getchildren).toHaveBeenCalledWith({
            id: 200,
            filter: { TYPE: 'folder', NAME: 'Договоры' },
        });
        expect(disk.folder.addsubfolder).not.toHaveBeenCalled();
        expect(disk.folder.uploadfile).toHaveBeenCalledWith(
            expect.objectContaining({ id: 300, generateUniqueName: true }),
        );
        expect(folderUrl).toBe('contracts-folder');
    });

    it('подпапки нет — создаётся в папке сделки', async () => {
        const { bitrix, disk } = fakeBitrix(false);
        const flow = new BxDiskUploadFlowService(
            bitrix,
            portalModel,
            32442,
            35018,
            { subfolder: 'Договоры' },
        );

        await flow.upload([FILE]);

        expect(disk.folder.addsubfolder).toHaveBeenCalledWith({
            id: 200,
            data: { NAME: 'Договоры' },
        });
        expect(disk.folder.uploadfile).toHaveBeenCalledWith(
            expect.objectContaining({ id: 301 }),
        );
    });
});
