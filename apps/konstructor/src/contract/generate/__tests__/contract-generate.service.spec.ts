import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { ContractGenerateDto } from '../dto/contract-generate.dto';
import { ContractGenerateService } from '../services/contract-generate.service';
import { ContractTemplateOrigin } from '../services/contract-template-source.service';

// docxtemplater читает реальный .docx, поэтому и zip, и шаблонизатор
// подменяются целиком: проверяем выбор файла и форму ответа, а не рендер.
const render = jest.fn();
const toBuffer = jest.fn().mockReturnValue(Buffer.from('docx'));

jest.mock('pizzip', () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('docxtemplater', () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
        render,
        toBuffer,
    })),
}));

const TEMPLATE_PATH =
    'storage/app/konstructor/templates/contract/template.docx';
const APP_URL = 'https://api.konstructor.april-app.ru';
const ROOT_LINK = '/api/files/abc123';

const dto = (): ContractGenerateDto =>
    ({
        domain: 'gsr.bitrix24.ru',
        userId: 5,
        providerId: 12,
        contractType: CONTRACT_LTYPE.ABON,
        clientType: ClientTypeEnum.ORG,
        contractNumber: '77',
        contract: { contract: { name: 'Абонентский' }, prepayment: 1 },
        total: { shortName: 'abonYear', name: 'Комплект' },
        rows: [],
        complect: [],
        regions: {},
        contractSpecificationState: {},
        bxrq: { fields: [] },
        supply: { type: 'internet' },
    }) as unknown as ContractGenerateDto;

describe('ContractGenerateService', () => {
    let readFile: jest.Mock;
    let saveFile: jest.Mock;
    let countFilesInDirectory: jest.Mock;
    let createPublicLink: jest.Mock;
    let findById: jest.Mock;
    let resolveTemplate: jest.Mock;
    let service: ContractGenerateService;

    beforeEach(() => {
        render.mockClear();
        readFile = jest.fn().mockResolvedValue(Buffer.from('template'));
        saveFile = jest.fn().mockResolvedValue('saved/path.docx');
        countFilesInDirectory = jest.fn().mockResolvedValue(0);
        createPublicLink = jest.fn().mockResolvedValue(ROOT_LINK);
        findById = jest.fn().mockResolvedValue({ id: 12, name: 'ООО Гарант' });
        resolveTemplate = jest.fn().mockResolvedValue({
            path: TEMPLATE_PATH,
            origin: ContractTemplateOrigin.LEGACY,
            templateId: null,
        });

        service = new ContractGenerateService(
            { readFile, saveFile, countFilesInDirectory } as never,
            { createPublicLink } as never,
            { get: jest.fn().mockReturnValue(APP_URL) } as never,
            { findById } as never,
            { getInfoblocks: jest.fn().mockReturnValue({}) } as never,
            { getProducts: jest.fn().mockReturnValue([]) } as never,
            // тексты поставок: payload проходит как есть
            {
                enrichRows: jest.fn(async (rows: unknown[]) => rows),
                enrichRow: jest.fn(async (row: unknown) => row),
            } as never,
            { getContractHeaderText: jest.fn().mockReturnValue('') } as never,
            { getRqs: jest.fn().mockReturnValue({}) } as never,
            { getSpecification: jest.fn().mockReturnValue({}) } as never,
            { resolve: resolveTemplate } as never,
        );
    });

    it('файл шаблона берётся у ContractTemplateSourceService и читается АСИНХРОННО', async () => {
        await service.generateContract(dto());

        expect(resolveTemplate).toHaveBeenCalledTimes(1);
        // раньше здесь был блокирующий fs.readFileSync
        expect(readFile).toHaveBeenCalledWith(TEMPLATE_PATH);
    });

    it('в ответе есть file и document — их ждёт фронт и читает init-supply', async () => {
        const result = await service.generateContract(dto());

        const link = `${APP_URL}${ROOT_LINK}`;
        expect(result.link).toBe(link);
        expect(result.file).toBe(link);
        expect(result.document).toBe(link);
    });

    it('data и provider сохранены: по коду обоих репозиториев их читателей нет, но ручка публичная', async () => {
        const result = await service.generateContract(dto());

        expect(result.data).toBeDefined();
        expect(result.provider).toEqual({ id: 12, name: 'ООО Гарант' });
        expect(result.documentName).toContain('Договор');
    });

    it('без поставщика документ не собирается', async () => {
        findById.mockResolvedValue(null);

        await expect(service.generateContract(dto())).rejects.toThrow(
            'Provider not found',
        );
        // шаблон при этом даже не читается
        expect(readFile).not.toHaveBeenCalled();
    });
});
