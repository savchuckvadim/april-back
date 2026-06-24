import { PortalMeasurePrismaRepository } from '../portal-measure.prisma.repository';

describe('PortalMeasurePrismaRepository.backfillNullTimestamps', () => {
    it('заполняет NULL created_at и updated_at и возвращает счётчики', async () => {
        const updateMany = jest
            .fn()
            .mockResolvedValueOnce({ count: 3 })
            .mockResolvedValueOnce({ count: 1 });

        const prisma = {
            portal_measure: { updateMany },
        };

        const repository = new PortalMeasurePrismaRepository(prisma as never);
        const result = await repository.backfillNullTimestamps();

        expect(result).toEqual({ createdAtFilled: 3, updatedAtFilled: 1 });
        expect(updateMany).toHaveBeenCalledTimes(2);

        const [createdCall, updatedCall] = updateMany.mock.calls as [
            [{ where: { created_at: null }; data: { created_at: Date } }],
            [{ where: { updated_at: null }; data: { updated_at: Date } }],
        ];
        expect(createdCall[0].where).toEqual({ created_at: null });
        expect(createdCall[0].data.created_at).toBeInstanceOf(Date);
        expect(updatedCall[0].where).toEqual({ updated_at: null });
        expect(updatedCall[0].data.updated_at).toBeInstanceOf(Date);
    });
});
