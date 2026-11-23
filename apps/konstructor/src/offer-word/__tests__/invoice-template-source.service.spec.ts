import { Logger, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { InvoiceTemplate } from 'generated/prisma';
import {
    DocumentTemplateService,
    ResolvedTemplate,
    ResolveTemplateInput,
    TemplateCandidate,
    TemplateMatch,
    TemplateResolutionSource,
} from '@lib/portal-lib/konstructor/document-template';
import { InvoiceTemplateService } from '@app/konstructor/modules/invoice-template';
import { ClientTypeEnum } from '../../document-generate/type/client.type';
import { SupplyTypeEnum } from '../../document-generate/type/supply.type';
import {
    InvoiceTemplateRequest,
    InvoiceTemplateSourceService,
} from '../services/invoice-word-core/invoice-template-source.service';

const row = (id: string): InvoiceTemplate => ({
    id,
    created_at: null,
    updated_at: null,
    visibility: 'portal',
    file_path: `konstructor/invoice-templates/${id}.docx`,
    demo_path: null,
    type: 'word',
    name: `Счёт ${id}`,
    code: `invoice-${id}`,
    counter: 0,
    description: null,
    is_default: true,
    is_active: true,
    is_archived: false,
    archived_at: null,
    portal_id: null,
    agent_id: null,
    creator_bitrix_user_id: null,
    client_types: null,
    supply_types: null,
});

const candidate = (id: string): TemplateCandidate => ({
    id,
    filePath: `konstructor/invoice-templates/${id}.docx`,
    portalId: null,
    agentId: null,
    clientTypes: [ClientTypeEnum.ORG_STATE],
    supplyTypes: [SupplyTypeEnum.INTERNET],
    isDefault: true,
    updatedAt: null,
    createdAt: null,
});

const match = (id: string): TemplateMatch => ({
    candidate: candidate(id),
    tuple: {
        portalExact: 0,
        agentExact: 0,
        supplyExact: 1,
        clientExact: 1,
        isDefault: 1,
        recency: 0,
    },
    reason: 'общий шаблон под клиента и поставку',
});

const resolved = (found: TemplateMatch | null): ResolvedTemplate => ({
    source: TemplateResolutionSource.DB,
    match: found,
    criteria: { portalId: null, agentId: null },
});

const request = (
    over: Partial<InvoiceTemplateRequest> = {},
): InvoiceTemplateRequest => ({
    domain: 'gsr.bitrix24.ru',
    providerId: 12,
    clientType: ClientTypeEnum.ORG_STATE,
    invoiceTemplateId: '',
    supply: { type: SupplyTypeEnum.INTERNET },
    ...over,
});

describe('InvoiceTemplateSourceService', () => {
    // Моки — отдельными const: assert на service.method ломает
    // @typescript-eslint/unbound-method.
    let innerFindById: jest.Mock<Promise<InvoiceTemplate>, [string]>;
    let resolveInvoice: jest.Mock<
        Promise<ResolvedTemplate>,
        [ResolveTemplateInput]
    >;
    let service: InvoiceTemplateSourceService;

    beforeAll(() => {
        Logger.overrideLogger(false);
    });

    beforeEach(async () => {
        innerFindById = jest
            .fn<Promise<InvoiceTemplate>, [string]>()
            .mockImplementation(id => Promise.resolve(row(id)));
        resolveInvoice = jest
            .fn<Promise<ResolvedTemplate>, [ResolveTemplateInput]>()
            .mockResolvedValue(resolved(match('auto-1')));

        const moduleRef = await Test.createTestingModule({
            providers: [
                InvoiceTemplateSourceService,
                {
                    provide: InvoiceTemplateService,
                    useValue: { innerFindById },
                },
                {
                    provide: DocumentTemplateService,
                    useValue: { resolveInvoice },
                },
            ],
        }).compile();
        service = moduleRef.get(InvoiceTemplateSourceService);
    });

    it('явный id — шаблон берётся по id, подбор не запускается', async () => {
        const template = await service.resolve(
            request({ invoiceTemplateId: 'explicit-7' }),
        );

        expect(template).toEqual(row('explicit-7'));
        expect(innerFindById).toHaveBeenCalledTimes(1);
        expect(innerFindById).toHaveBeenCalledWith('explicit-7');
        expect(resolveInvoice).not.toHaveBeenCalled();
    });

    it('явный id, которого нет в базе, — ошибка 404 доходит до вызывающего', async () => {
        innerFindById.mockRejectedValue(
            new NotFoundException('Шаблон счёта ghost не найден'),
        );

        await expect(
            service.resolve(request({ invoiceTemplateId: 'ghost' })),
        ).rejects.toThrow('Шаблон счёта ghost не найден');
        expect(resolveInvoice).not.toHaveBeenCalled();
    });

    it('пустой id и найденный шаблон — отдаётся строка, которую назвал подбор', async () => {
        const template = await service.resolve(request());

        expect(template).toEqual(row('auto-1'));
        expect(innerFindById).toHaveBeenCalledWith('auto-1');
    });

    it('в подбор уходят домен, поставщик, тип клиента и тип поставки', async () => {
        await service.resolve(request());

        expect(resolveInvoice).toHaveBeenCalledTimes(1);
        expect(resolveInvoice).toHaveBeenCalledWith({
            domain: 'gsr.bitrix24.ru',
            providerId: 12,
            clientType: ClientTypeEnum.ORG_STATE,
            supplyType: SupplyTypeEnum.INTERNET,
        });
    });

    it('id из одних пробелов считается пустым — шаблон подбирается', async () => {
        const template = await service.resolve(
            request({ invoiceTemplateId: '   ' }),
        );

        expect(resolveInvoice).toHaveBeenCalledTimes(1);
        expect(template).toEqual(row('auto-1'));
    });

    it('пустой id и пустой результат подбора — null, строка шаблона не читается', async () => {
        resolveInvoice.mockResolvedValue(resolved(null));

        const template = await service.resolve(request());

        expect(template).toBeNull();
        expect(innerFindById).not.toHaveBeenCalled();
    });

    it('тип поставки не передан — подбор идёт без него', async () => {
        await service.resolve(request({ supply: undefined }));

        expect(resolveInvoice).toHaveBeenCalledWith(
            expect.objectContaining({ supplyType: undefined }),
        );
    });

    it('сбой подбора доходит до вызывающего', async () => {
        resolveInvoice.mockRejectedValue(new Error('БД недоступна'));

        await expect(service.resolve(request())).rejects.toThrow(
            'БД недоступна',
        );
    });
});
