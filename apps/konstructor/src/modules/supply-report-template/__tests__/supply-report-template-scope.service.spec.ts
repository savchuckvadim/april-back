import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SupplyReportTemplateScopeService } from '../services/supply-report-template-scope.service';
import { TX, type Payload, mockFn } from './supply-report-template.fixtures';

describe('SupplyReportTemplateScopeService', () => {
    let updateMany: jest.Mock<Promise<number>, [Payload, Payload, unknown?]>;
    let agentsFindUnique: jest.Mock<
        Promise<{ id: bigint; portalId: bigint } | null>,
        [Payload]
    >;
    let service: SupplyReportTemplateScopeService;

    beforeEach(() => {
        updateMany = mockFn();
        updateMany.mockResolvedValue(0);

        agentsFindUnique = mockFn();
        agentsFindUnique.mockResolvedValue({ id: 42n, portalId: 7n });

        service = new SupplyReportTemplateScopeService(
            { updateMany } as never,
            { agents: { findUnique: agentsFindUnique } } as never,
        );
    });

    describe('assertAgentBelongsToPortal', () => {
        it('свой поставщик проходит', async () => {
            await expect(
                service.assertAgentBelongsToPortal(42n, 7n),
            ).resolves.toBeUndefined();
        });

        it('чужой портал — 400: иначе в отчёт попали бы чужие реквизиты', async () => {
            agentsFindUnique.mockResolvedValue({ id: 42n, portalId: 99n });
            await expect(
                service.assertAgentBelongsToPortal(42n, 7n),
            ).rejects.toThrow(BadRequestException);
        });

        it('поставщика нет — 404', async () => {
            agentsFindUnique.mockResolvedValue(null);
            await expect(
                service.assertAgentBelongsToPortal(42n, 7n),
            ).rejects.toThrow(NotFoundException);
        });
    });

    describe('assertPairValid', () => {
        it('общий шаблон (null, null) допустим', async () => {
            await expect(
                service.assertPairValid(null, null),
            ).resolves.toBeUndefined();
            expect(agentsFindUnique).not.toHaveBeenCalled();
        });

        it('портал без поставщика допустим', async () => {
            await expect(
                service.assertPairValid(7n, null),
            ).resolves.toBeUndefined();
            expect(agentsFindUnique).not.toHaveBeenCalled();
        });

        it('поставщик без портала — 400', async () => {
            await expect(service.assertPairValid(null, 42n)).rejects.toThrow(
                BadRequestException,
            );
        });

        it('полная пара проверяется в БД', async () => {
            await service.assertPairValid(7n, 42n);
            expect(agentsFindUnique).toHaveBeenCalledWith({
                where: { id: 42n },
            });
        });
    });

    describe('clearOtherDefaults', () => {
        it('снимает флаг в области, исключая сам шаблон, в переданной транзакции', async () => {
            await service.clearOtherDefaults(7n, 42n, 5n, TX);

            const [where, data, tx] = updateMany.mock.calls[0];
            expect(where).toEqual(
                expect.objectContaining({
                    id: { not: 5n },
                    portal_id: 7n,
                    agent_id: 42n,
                    is_archived: false,
                }),
            );
            expect(data.is_default).toBe(false);
            expect(data.updated_at).toBeInstanceOf(Date);
            expect(tx).toBe(TX);
        });

        it('работает и без транзакции (точечные PATCH-ручки)', async () => {
            await service.clearOtherDefaults(null, null, 5n);
            expect(updateMany.mock.calls[0][2]).toBeUndefined();
        });
    });
});
