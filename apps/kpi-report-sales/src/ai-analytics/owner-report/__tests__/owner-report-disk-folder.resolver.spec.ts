import {
    buildOwnerReportDiskFolderKey,
    OWNER_REPORT_DISK_FOLDER_TTL_SECONDS,
    OWNER_REPORT_DISK_FOLDERS,
    OwnerReportDiskFolderResolver,
} from '../owner-report-disk-folder.resolver';

const DOMAIN = 'gsr.bitrix24.ru';

interface DiskMock {
    storage: {
        getlist: jest.Mock;
        getchildren: jest.Mock;
        addfolder: jest.Mock;
    };
    folder: { getchildren: jest.Mock; addsubfolder: jest.Mock };
}

/** Диск группы: хранилище 500, папка «AI-аналитика» уже есть (или нет). */
function diskWith(options: {
    rootExists: boolean;
    storage?: boolean;
}): DiskMock {
    const storage = options.storage ?? true;
    return {
        storage: {
            getlist: jest
                .fn()
                .mockResolvedValue({ result: storage ? [{ ID: '500' }] : [] }),
            getchildren: jest.fn().mockResolvedValue({
                result: options.rootExists ? [{ ID: '600' }] : [],
            }),
            addfolder: jest.fn().mockResolvedValue({ result: { ID: '601' } }),
        },
        folder: {
            getchildren: jest.fn().mockResolvedValue({ result: [] }),
            addsubfolder: jest
                .fn()
                .mockResolvedValue({ result: { ID: '700' } }),
        },
    };
}

function makeResolver(cached: number | null = null) {
    const cache = {
        getJson: jest.fn().mockResolvedValue(cached),
        setJson: jest.fn().mockResolvedValue(undefined),
    };
    const resolver = new OwnerReportDiskFolderResolver(cache as never);
    const portalModel = { getSalesTaskGroupId: () => 41 };
    return { resolver, cache, portalModel };
}

describe('OwnerReportDiskFolderResolver — папка отчёта в группе задач ОП', () => {
    it('находит хранилище группы, берёт существующую «AI-аналитика» и создаёт «Отчёт собственнику»', async () => {
        const { resolver, cache, portalModel } = makeResolver();
        const disk = diskWith({ rootExists: true });
        const id = await resolver.resolve(
            DOMAIN,
            { disk } as never,
            portalModel as never,
        );
        expect(id).toBe(700);
        expect(disk.storage.getlist).toHaveBeenCalledWith({
            ENTITY_TYPE: 'group',
            ENTITY_ID: 41,
        });
        expect(disk.storage.addfolder).not.toHaveBeenCalled();
        expect(disk.folder.addsubfolder).toHaveBeenCalledWith({
            id: 600,
            data: { NAME: OWNER_REPORT_DISK_FOLDERS.reports },
        });
        expect(cache.setJson).toHaveBeenCalledWith(
            buildOwnerReportDiskFolderKey(DOMAIN),
            700,
            OWNER_REPORT_DISK_FOLDER_TTL_SECONDS,
        );
    });

    it('нет папки «AI-аналитика» — создаёт её в хранилище, потом вложенную', async () => {
        const { resolver, portalModel } = makeResolver();
        const disk = diskWith({ rootExists: false });
        const id = await resolver.resolve(
            DOMAIN,
            { disk } as never,
            portalModel as never,
        );
        expect(id).toBe(700);
        expect(disk.storage.addfolder).toHaveBeenCalledWith({
            id: 500,
            data: { NAME: OWNER_REPORT_DISK_FOLDERS.root },
        });
        expect(disk.folder.addsubfolder).toHaveBeenCalledWith({
            id: 601,
            data: { NAME: OWNER_REPORT_DISK_FOLDERS.reports },
        });
    });

    it('кэш отвечает — Диск не трогается', async () => {
        const { resolver, portalModel } = makeResolver(777);
        const disk = diskWith({ rootExists: true });
        const id = await resolver.resolve(
            DOMAIN,
            { disk } as never,
            portalModel as never,
        );
        expect(id).toBe(777);
        expect(disk.storage.getlist).not.toHaveBeenCalled();
    });

    it('у группы нет хранилища или Диск упал — null без исключения', async () => {
        const { resolver, cache, portalModel } = makeResolver();
        const noStorage = diskWith({ rootExists: false, storage: false });
        expect(
            await resolver.resolve(
                DOMAIN,
                { disk: noStorage } as never,
                portalModel as never,
            ),
        ).toBeNull();
        const broken = diskWith({ rootExists: true });
        broken.folder.addsubfolder.mockRejectedValue(
            new Error('Диск недоступен'),
        );
        expect(
            await resolver.resolve(
                DOMAIN,
                { disk: broken } as never,
                portalModel as never,
            ),
        ).toBeNull();
        expect(cache.setJson).not.toHaveBeenCalled();
    });
});
