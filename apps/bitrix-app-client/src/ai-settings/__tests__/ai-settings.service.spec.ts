import { AiSettingsService } from '../services/ai-settings.service';

const CLIENT_ID = 7;
const DOMAIN = 'client.bitrix24.ru';

const makeDeps = () => {
    const portalStore = {
        getPortalsByClientId: jest
            .fn()
            .mockResolvedValue([{ id: 5, domain: DOMAIN }]),
    };
    const knowledgeStorage = {
        listDocuments: jest
            .fn()
            .mockImplementation((domain: string | undefined) =>
                Promise.resolve(
                    domain === undefined
                        ? [
                              {
                                  fileName: 'shared.md',
                                  kind: 'call-classify',
                                  source: 'shared',
                                  absolutePath: '/s',
                              },
                          ]
                        : [
                              {
                                  fileName: 'mine.md',
                                  kind: 'call-classify',
                                  source: DOMAIN,
                                  absolutePath: '/c',
                              },
                          ],
                ),
            ),
        findDocument: jest.fn().mockResolvedValue({
            fileName: 'mine.md',
            kind: 'call-classify',
            source: DOMAIN,
            absolutePath: '/c',
        }),
        saveTextDocument: jest.fn().mockResolvedValue({
            fileName: 'mine.md',
            kind: 'call-classify',
            source: DOMAIN,
        }),
        deleteDocument: jest.fn().mockResolvedValue(undefined),
    };
    const knowledgeContent = {
        readDocument: jest.fn().mockResolvedValue({
            fileName: 'mine.md',
            kind: 'call-classify',
            source: DOMAIN,
            text: 'мой текст',
        }),
    };
    const callTypeRegistry = {
        resolve: jest.fn().mockResolvedValue({
            codes: ['cold'],
            types: {},
            source: 'builtin',
        }),
        invalidate: jest.fn(),
    };
    const service = new AiSettingsService(
        portalStore as never,
        knowledgeStorage as never,
        knowledgeContent as never,
        callTypeRegistry as never,
    );
    return { service, knowledgeStorage, callTypeRegistry };
};

describe('AiSettingsService', () => {
    afterEach(() => jest.clearAllMocks());

    it('чужой домен — 403 на любой операции', async () => {
        const { service } = makeDeps();
        await expect(
            service.listDocuments(CLIENT_ID, 'other.bitrix24.ru', 'general'),
        ).rejects.toThrow('не принадлежит порталам');
        await expect(
            service.upsertDocument(
                CLIENT_ID,
                'other.bitrix24.ru',
                'general',
                'a.md',
                'x',
            ),
        ).rejects.toThrow('не принадлежит порталам');
    });

    it('список: клиентские документы editable, общие — только чтение', async () => {
        const { service } = makeDeps();
        const documents = await service.listDocuments(
            CLIENT_ID,
            DOMAIN,
            'call-classify',
        );
        expect(documents).toEqual([
            expect.objectContaining({ fileName: 'mine.md', editable: true }),
            expect.objectContaining({ fileName: 'shared.md', editable: false }),
        ]);
    });

    it('сохранение пишет в клиентскую базу домена', async () => {
        const { service, knowledgeStorage } = makeDeps();
        await service.upsertDocument(
            CLIENT_ID,
            DOMAIN,
            'call-classify',
            'mine.md',
            'текст',
        );
        expect(knowledgeStorage.saveTextDocument).toHaveBeenCalledWith(
            'call-classify',
            'mine.md',
            'текст',
            DOMAIN,
        );
    });

    it('правка call-type-registry сбрасывает кэш реестра типов', async () => {
        const { service, callTypeRegistry } = makeDeps();
        await service.upsertDocument(
            CLIENT_ID,
            DOMAIN,
            'call-type-registry',
            'types.json',
            '{"types":[]}',
        );
        expect(callTypeRegistry.invalidate).toHaveBeenCalledWith(DOMAIN);
    });

    it('удаление — строго из клиентской базы домена', async () => {
        const { service, knowledgeStorage } = makeDeps();
        await service.deleteDocument(
            CLIENT_ID,
            DOMAIN,
            'call-classify',
            'mine.md',
        );
        expect(knowledgeStorage.deleteDocument).toHaveBeenCalledWith(
            DOMAIN,
            'call-classify',
            'mine.md',
        );
    });
});
