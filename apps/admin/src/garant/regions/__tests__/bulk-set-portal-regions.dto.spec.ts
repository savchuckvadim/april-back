import { ValidationPipe } from '@nestjs/common';
import { BulkSetPortalRegionsDto } from '../dto/request/bulk-set-portal-regions.dto';

/** Те же настройки, что в bootstrap-app: так запрос приходит в сервис */
const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    forbidUnknownValues: false,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
});

const parse = (items: Record<string, unknown>[]) =>
    pipe.transform(
        { portalId: 3, items },
        { type: 'body', metatype: BulkSetPortalRegionsDto },
    ) as Promise<BulkSetPortalRegionsDto>;

describe('BulkSetPortalRegionsDto через ValidationPipe', () => {
    it('строка только с галочкой не превращается в сброс своей цены', async () => {
        const { items } = await parse([{ regionId: 12, enabled: true }]);

        expect(items[0]?.ownAbs).toBeUndefined();
        expect(items[0]?.ownAbsRegionId).toBeUndefined();
    });

    it('явный null сохраняется как сброс', async () => {
        const { items } = await parse([
            { regionId: 12, enabled: true, ownAbs: null },
            { regionId: 13, enabled: true, ownAbsRegionId: null },
        ]);

        expect(items[0]?.ownAbs).toBeNull();
        expect(items[1]?.ownAbsRegionId).toBeNull();
    });

    it('регион-источник приходит числом', async () => {
        const { items } = await parse([
            { regionId: 12, enabled: true, ownAbsRegionId: 47 },
        ]);

        expect(items[0]?.ownAbsRegionId).toBe(47);
    });

    it('нечисловой рабс отклоняется целиком', async () => {
        await expect(
            parse([{ regionId: 12, enabled: true, ownAbs: 'abc' }]),
        ).rejects.toThrow();
    });
});
