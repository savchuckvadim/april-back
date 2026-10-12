import { DocumentTemplateKind } from '../document-template.criteria';
import {
    DocumentTemplateRepository,
    TemplateDefaultRow,
} from '../document-template.repository';
import { DocumentTemplateDiagnosticsService } from '../document-template-diagnostics.service';

const row = (
    over: Partial<TemplateDefaultRow> & { id: string },
): TemplateDefaultRow => ({
    kind: DocumentTemplateKind.CONTRACT,
    portalId: BigInt(7),
    agentId: null,
    contractType: 'abon',
    clientTypes: null,
    supplyTypes: null,
    ...over,
});

describe('DocumentTemplateDiagnosticsService', () => {
    let findDefaultRows: jest.Mock;
    let findKindsWithOwnRows: jest.Mock;
    let service: DocumentTemplateDiagnosticsService;

    beforeEach(() => {
        findDefaultRows = jest.fn().mockResolvedValue([]);
        findKindsWithOwnRows = jest.fn().mockResolvedValue([]);

        const repository = {
            findDefaultRows,
            findKindsWithOwnRows,
        } as unknown as DocumentTemplateRepository;

        service = new DocumentTemplateDiagnosticsService(repository);
    });

    it('без портала — выборка по всему справочнику, portalId в ответе null', async () => {
        const report = await service.findAmbiguities(null);

        expect(findDefaultRows).toHaveBeenCalledWith(null);
        expect(report.portalId).toBeNull();
        expect(report.ambiguous).toEqual([]);
    });

    it('без портала reliesOnCommon НЕ считается: вопрос про конкретный портал', async () => {
        const report = await service.findAmbiguities(null);

        expect(findKindsWithOwnRows).not.toHaveBeenCalled();
        expect(report.reliesOnCommon).toEqual([]);
    });

    it('с порталом — id отдаётся строкой, а не BigInt', async () => {
        const report = await service.findAmbiguities(BigInt(7));

        expect(findDefaultRows).toHaveBeenCalledWith(BigInt(7));
        expect(report.portalId).toBe('7');
        expect(typeof report.portalId).toBe('string');
        expect(() => JSON.stringify(report)).not.toThrow();
    });

    it('с порталом — виды без своих строк попадают в reliesOnCommon', async () => {
        findKindsWithOwnRows.mockResolvedValue([DocumentTemplateKind.CONTRACT]);

        const report = await service.findAmbiguities(BigInt(7));

        expect(findKindsWithOwnRows).toHaveBeenCalledWith(BigInt(7));
        expect(report.reliesOnCommon).toEqual([
            DocumentTemplateKind.SUPPLY_REPORT,
            DocumentTemplateKind.INVOICE,
        ]);
    });

    it('конфликт из репозитория сгруппирован в ящик', async () => {
        findDefaultRows.mockResolvedValue([row({ id: '1' }), row({ id: '2' })]);

        const report = await service.findAmbiguities(BigInt(7));

        expect(report.ambiguous).toHaveLength(1);
        expect(report.ambiguous[0].templateIds).toEqual(['1', '2']);
        expect(report.ambiguous[0].defaultCount).toBe(2);
    });

    it('строки есть, но конфликта нет — пустой список ящиков', async () => {
        findDefaultRows.mockResolvedValue([
            row({ id: '1', contractType: 'abon' }),
            row({ id: '2', contractType: 'lic' }),
        ]);

        const report = await service.findAmbiguities(BigInt(7));

        expect(report.ambiguous).toEqual([]);
    });
});
