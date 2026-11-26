import {
    ContractGenerateUseCase,
    CONTRACT_DISK_FOLDER,
} from '../use-case/contract-generate.use-case';
import type { ContractGenerateDto } from '../dto/contract-generate.dto';
import type { ContractGenerateResult } from '../type/contract-generate.type';

const SERVER_LINK = 'https://api.konstructor.example/api/files/abc';
const DISK_LINK =
    'https://april-garant.bitrix24.ru/docs/path/Договоры/Договор Бухгалтер-2.docx';

const dto = {
    domain: 'april-garant.bitrix24.ru',
    companyId: '32442',
    dealId: '35018',
    userId: 1,
} as unknown as ContractGenerateDto;

const result: ContractGenerateResult = {
    link: SERVER_LINK,
    file: SERVER_LINK,
    document: SERVER_LINK,
    documentName: 'Договор Бухгалтер-2.docx',
    data: {} as ContractGenerateResult['data'],
    provider: {} as ContractGenerateResult['provider'],
    bitrixLink: null,
    savedToDisk: false,
};

const makeUseCase = (
    saveDocuments: jest.Mock,
    salesDocumentFlow: { publish: jest.Mock } = {
        publish: jest.fn().mockResolvedValue(false),
    },
) => {
    const setInBitrix = jest.fn().mockResolvedValue(undefined);
    const useCase = new ContractGenerateUseCase(
        {
            generateContractFile: jest.fn().mockResolvedValue({
                result,
                absolutePath: '/storage/Договор Бухгалтер-2.docx',
            }),
        } as never,
        { setInBitrix } as never,
        { saveDocuments } as never,
        salesDocumentFlow as never,
    );
    return { useCase, setInBitrix };
};

describe('ContractGenerateUseCase: договор на Диск Битрикса', () => {
    it('файл уходит в папку сделки / «Договоры» без перезаписи; таймлайн и ответ — со ссылкой Диска', async () => {
        const saveDocuments = jest.fn().mockResolvedValue({
            portalFolderId: 7,
            documents: [
                {
                    link: DISK_LINK,
                    name: result.documentName,
                    type: 'contract',
                },
            ],
            files: [],
        });
        const { useCase, setInBitrix } = makeUseCase(saveDocuments);

        const response = await useCase.getContract(dto);

        expect(saveDocuments).toHaveBeenCalledWith(
            expect.objectContaining({
                dealId: '35018',
                onlyBitrixSave: true,
                disk: { subfolder: CONTRACT_DISK_FOLDER, uniqueNames: true },
                documents: [
                    expect.objectContaining({
                        absolutePath: '/storage/Договор Бухгалтер-2.docx',
                        type: 'contract',
                    }),
                ],
            }),
        );
        expect(setInBitrix).toHaveBeenCalledWith(
            dto,
            DISK_LINK,
            result.documentName,
        );
        expect(response).toMatchObject({
            link: DISK_LINK,
            bitrixLink: DISK_LINK,
            savedToDisk: true,
        });
        // машинам (init-supply) — файл на сервере
        expect(response.file).toBe(SERVER_LINK);
    });

    it('Диск недоступен — договор не теряется: ссылка на сервер в таймлайне и ответе', async () => {
        const saveDocuments = jest
            .fn()
            .mockRejectedValue(new Error('Root folder ID is not found'));
        const { useCase, setInBitrix } = makeUseCase(saveDocuments);

        const response = await useCase.getContract(dto);

        expect(setInBitrix).toHaveBeenCalledWith(
            dto,
            SERVER_LINK,
            result.documentName,
        );
        expect(response).toMatchObject({
            link: SERVER_LINK,
            bitrixLink: null,
            savedToDisk: false,
        });
    });
});

describe('ContractGenerateUseCase: событие в поток продаж', () => {
    const contractDto = (over: Record<string, unknown> = {}) =>
        ({
            ...dto,
            supply: { name: 'Интернет 5 ОД' },
            total: {
                name: 'Итого',
                price: { sum: 36000, current: 3000, quantity: 12 },
            },
            rows: [
                {
                    name: 'Гарант-Бухгалтер',
                    type: 'general',
                    supply: { name: 'Интернет 5 ОД' },
                    price: { sum: 36000, current: 3000, quantity: 12 },
                },
            ],
            ...over,
        }) as unknown as ContractGenerateDto;

    const saved = {
        portalFolderId: 7,
        documents: [
            { link: DISK_LINK, name: result.documentName, type: 'contract' },
        ],
        files: [],
    };

    it('salesFlow: true — после записи в таймлайн ставится событие с видом contract', async () => {
        const publish = jest.fn().mockResolvedValue(true);
        const saveDocuments = jest.fn().mockResolvedValue(saved);
        const { useCase, setInBitrix } = makeUseCase(saveDocuments, {
            publish,
        });
        const request = contractDto({ salesFlow: true });

        await useCase.getContract(request);

        expect(publish).toHaveBeenCalledTimes(1);
        expect(publish).toHaveBeenCalledWith(
            expect.objectContaining({
                salesFlow: true,
                domain: 'april-garant.bitrix24.ru',
                userId: 1,
                companyId: '32442',
                dealId: '35018',
                kinds: ['contract'],
            }),
        );
        // событие уходит после комментария в таймлайн
        expect(setInBitrix.mock.invocationCallOrder[0]).toBeLessThan(
            publish.mock.invocationCallOrder[0],
        );
    });

    it('данные события: итог набора, строки и поставка договора', async () => {
        const publish = jest.fn().mockResolvedValue(true);
        const { useCase } = makeUseCase(jest.fn().mockResolvedValue(saved), {
            publish,
        });

        await useCase.getContract(contractDto({ salesFlow: true }));

        const [{ sources }] = publish.mock.calls[0] as [
            { sources: Array<Record<string, unknown>> },
        ];
        expect(sources).toHaveLength(1);
        expect(sources[0]).toMatchObject({
            supply: { name: 'Интернет 5 ОД' },
            total: { price: { sum: 36000 } },
        });
        expect(sources[0].rows).toHaveLength(1);
    });

    it('без salesFlow событие не ставится: publish не вызывается с признаком true', async () => {
        const publish = jest.fn().mockResolvedValue(false);
        const { useCase } = makeUseCase(jest.fn().mockResolvedValue(saved), {
            publish,
        });

        await useCase.getContract(contractDto());

        // сервис сам отсекает запрос без признака
        expect(publish).toHaveBeenCalledWith(
            expect.objectContaining({ salesFlow: undefined }),
        );
    });

    it('сбой Диска договор не отменяет и событие всё равно ставится', async () => {
        const publish = jest.fn().mockResolvedValue(true);
        const { useCase } = makeUseCase(
            jest.fn().mockRejectedValue(new Error('Диск недоступен')),
            { publish },
        );

        const response = await useCase.getContract(
            contractDto({ salesFlow: true }),
        );

        expect(response.savedToDisk).toBe(false);
        expect(publish).toHaveBeenCalledTimes(1);
    });
});
