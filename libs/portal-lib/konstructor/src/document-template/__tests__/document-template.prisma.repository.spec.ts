import { PrismaService } from 'src/core/prisma';
import {
    DocumentTemplateKind,
    TemplateCriteria,
} from '../document-template.criteria';
import { DocumentTemplatePrismaRepository } from '../document-template.prisma.repository';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';

type WhereArg = { where?: Record<string, unknown> };

/**
 * Есть ли где-нибудь в условии оператор `in`.
 *
 * Обход рекурсией, а НЕ через JSON.stringify: в where лежат BigInt-ы, а их
 * `JSON.stringify` не умеет — он кидает `TypeError: Do not know how to
 * serialize a BigInt`. Ровно та ошибка, от которой защищают эндпоинты
 * (наружу id уходит строкой), поэтому и в тесте её надо обходить, а не
 * ловить.
 */
const hasInOperator = (value: unknown): boolean => {
    if (Array.isArray(value)) {
        return value.some(hasInOperator);
    }
    if (value === null || typeof value !== 'object') {
        return false;
    }
    return Object.entries(value as Record<string, unknown>).some(
        ([key, nested]) => key === 'in' || hasInOperator(nested),
    );
};

const criteria = (over: Partial<TemplateCriteria> = {}): TemplateCriteria => ({
    portalId: BigInt(7),
    agentId: null,
    contractType: CONTRACT_LTYPE.ABON,
    clientType: null,
    supplyType: null,
    ...over,
});

describe('DocumentTemplatePrismaRepository', () => {
    let contractFindMany: jest.Mock;
    let supplyReportFindMany: jest.Mock;
    let invoiceFindMany: jest.Mock;
    let contractCount: jest.Mock;
    let supplyReportCount: jest.Mock;
    let invoiceCount: jest.Mock;
    let repository: DocumentTemplatePrismaRepository;

    beforeEach(() => {
        contractFindMany = jest.fn().mockResolvedValue([]);
        supplyReportFindMany = jest.fn().mockResolvedValue([]);
        invoiceFindMany = jest.fn().mockResolvedValue([]);
        contractCount = jest.fn().mockResolvedValue(0);
        supplyReportCount = jest.fn().mockResolvedValue(0);
        invoiceCount = jest.fn().mockResolvedValue(0);

        const prisma = {
            contractTemplate: {
                findMany: contractFindMany,
                count: contractCount,
            },
            supplyReportTemplate: {
                findMany: supplyReportFindMany,
                count: supplyReportCount,
            },
            invoiceTemplate: {
                findMany: invoiceFindMany,
                count: invoiceCount,
            },
        } as unknown as PrismaService;

        repository = new DocumentTemplatePrismaRepository(prisma);
    });

    describe('findCandidates — форма where', () => {
        /**
         * РЕГРЕССИЯ. Раньше здесь стояло
         * `portal_id: { in: [portalId, null] }`, а в SQL `IN (7, NULL)` не
         * находит строки с NULL: сравнение с NULL даёт UNKNOWN. Из-за этого
         * общие шаблоны и шаблоны «для любого поставщика» не попадали в
         * кандидаты вообще, и каскад «портал+поставщик → портал → общий»
         * работал только на первом уровне. Тест запрещает возврат к `in`.
         */
        it('НЕ использует in со списком, содержащим null', async () => {
            await repository.findCandidates(
                DocumentTemplateKind.CONTRACT,
                criteria(),
            );

            const [arg] = contractFindMany.mock.calls[0] as [WhereArg];
            expect(hasInOperator(arg.where)).toBe(false);
        });

        it('портал: своя строка ИЛИ общая (portal_id IS NULL)', async () => {
            await repository.findCandidates(
                DocumentTemplateKind.CONTRACT,
                criteria(),
            );

            const [arg] = contractFindMany.mock.calls[0] as [WhereArg];
            expect(arg.where).toMatchObject({
                is_active: true,
                is_archived: false,
                AND: [
                    { OR: [{ portal_id: BigInt(7) }, { portal_id: null }] },
                    { OR: [{ agent_id: null }, { agent_id: null }] },
                ],
            });
        });

        it('поставщик: его строка ИЛИ «для любого поставщика»', async () => {
            await repository.findCandidates(
                DocumentTemplateKind.CONTRACT,
                criteria({ agentId: BigInt(42) }),
            );

            const [arg] = contractFindMany.mock.calls[0] as [WhereArg];
            const and = (arg.where as { AND: unknown[] }).AND;
            expect(and[1]).toEqual({
                OR: [{ agent_id: BigInt(42) }, { agent_id: null }],
            });
        });

        it('два OR обёрнуты в AND — фильтр по порталу не теряется', async () => {
            // Два OR на одном уровне объекта означали бы один ключ `OR`:
            // второй перезаписал бы первый, и шаблоны чужих порталов
            // стали бы кандидатами.
            await repository.findCandidates(
                DocumentTemplateKind.CONTRACT,
                criteria({ agentId: BigInt(42) }),
            );

            const [arg] = contractFindMany.mock.calls[0] as [WhereArg];
            expect(arg.where).not.toHaveProperty('OR');
            expect((arg.where as { AND: unknown[] }).AND).toHaveLength(2);
        });

        it('договор: contract_type — жёсткое равенство', async () => {
            await repository.findCandidates(
                DocumentTemplateKind.CONTRACT,
                criteria({ contractType: CONTRACT_LTYPE.LIC }),
            );

            const [arg] = contractFindMany.mock.calls[0] as [WhereArg];
            expect(arg.where).toMatchObject({
                contract_type: CONTRACT_LTYPE.LIC,
            });
        });

        it('договор без типа — в БД вообще не ходим, кандидатов нет', async () => {
            const result = await repository.findCandidates(
                DocumentTemplateKind.CONTRACT,
                criteria({ contractType: null }),
            );

            expect(result).toEqual([]);
            expect(contractFindMany).not.toHaveBeenCalled();
        });

        it('отчёт: contract_type не фильтруется — колонки нет', async () => {
            await repository.findCandidates(
                DocumentTemplateKind.SUPPLY_REPORT,
                criteria(),
            );

            const [arg] = supplyReportFindMany.mock.calls[0] as [WhereArg];
            expect(arg.where).not.toHaveProperty('contract_type');
        });
    });

    describe('findDefaultRows', () => {
        it('без портала — только is_default/is_active/is_archived', async () => {
            await repository.findDefaultRows(null);

            const [arg] = contractFindMany.mock.calls[0] as [WhereArg];
            expect(arg.where).toEqual({
                is_default: true,
                is_active: true,
                is_archived: false,
            });
        });

        it('архивные строки исключены — резолвер их не видит', async () => {
            await repository.findDefaultRows(BigInt(7));

            const [arg] = contractFindMany.mock.calls[0] as [WhereArg];
            expect(arg.where).toMatchObject({ is_archived: false });
        });

        it('с порталом — его строки ВМЕСТЕ с общими, через OR, без in', async () => {
            await repository.findDefaultRows(BigInt(7));

            const [arg] = contractFindMany.mock.calls[0] as [WhereArg];
            expect(arg.where).toMatchObject({
                OR: [{ portal_id: BigInt(7) }, { portal_id: null }],
            });
            expect(hasInOperator(arg.where)).toBe(false);
        });

        it('опрашивает все три поддержанных вида', async () => {
            await repository.findDefaultRows(null);

            expect(contractFindMany).toHaveBeenCalledTimes(1);
            expect(supplyReportFindMany).toHaveBeenCalledTimes(1);
            expect(invoiceFindMany).toHaveBeenCalledTimes(1);
        });

        it('id приводятся к строкам, bigint наружу не утекает', async () => {
            contractFindMany.mockResolvedValue([
                {
                    id: BigInt(42),
                    portal_id: BigInt(7),
                    agent_id: null,
                    contract_type: CONTRACT_LTYPE.ABON,
                    client_types: null,
                    supply_types: null,
                },
            ]);
            invoiceFindMany.mockResolvedValue([
                {
                    id: 'aaaaaaaa-0000-4000-8000-000000000001',
                    portal_id: null,
                    agent_id: null,
                    client_types: null,
                    supply_types: null,
                },
            ]);

            const rows = await repository.findDefaultRows(null);

            expect(rows).toHaveLength(2);
            expect(rows[0].id).toBe('42');
            expect(rows[0].kind).toBe(DocumentTemplateKind.CONTRACT);
            expect(rows[1].id).toBe('aaaaaaaa-0000-4000-8000-000000000001');
            expect(rows[1].kind).toBe(DocumentTemplateKind.INVOICE);
            // У счёта колонки contract_type нет — должен стать null.
            expect(rows[1].contractType).toBeNull();
        });
    });

    describe('findKindsWithOwnRows', () => {
        it('пустая таблица — ни одного вида', async () => {
            expect(await repository.findKindsWithOwnRows(BigInt(7))).toEqual(
                [],
            );
        });

        it('считает только СВОИ строки портала, без общих', async () => {
            contractCount.mockResolvedValue(3);

            await repository.findKindsWithOwnRows(BigInt(7));

            const [arg] = contractCount.mock.calls[0] as [WhereArg];
            expect(arg.where).toEqual({
                portal_id: BigInt(7),
                is_active: true,
                is_archived: false,
            });
        });

        it('возвращает виды, у которых строки есть', async () => {
            contractCount.mockResolvedValue(1);
            invoiceCount.mockResolvedValue(2);

            const kinds = await repository.findKindsWithOwnRows(BigInt(7));

            expect(kinds).toEqual([
                DocumentTemplateKind.CONTRACT,
                DocumentTemplateKind.INVOICE,
            ]);
        });
    });
});
