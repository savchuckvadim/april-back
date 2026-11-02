/**
 * Проверка, что модули ссылок на КП поднимаются: UnknownDependenciesException
 * сборка не ловит, он вылезает только в рантайме (ai/rules/app-api-surface.md).
 *
 * Админский модуль здесь не поднимаем целиком: его контроллер закрыт
 * JwtAuthGuard, а AuthModule.forRoot() регистрируется один раз в корне
 * apps/admin — как у всех прочих *AdminModule. Вместо этого проверяем, что
 * модуль отдаёт сервис, а состав контроллеров разошёлся правильно.
 */
import { Test } from '@nestjs/testing';
import { PrismaService } from '@lib/core/prisma/prisma.service';
import {
    RenewalOfferLinkAdminModule,
    RenewalOfferLinkService,
    RenewalOfferModule,
    RenewalOfferPublicModule,
} from '@lib/renewal-offer';
import { PublicRenewalOfferController } from '../controllers/public-renewal-offer.controller';
import { RenewalOfferLinkController } from '../controllers/renewal-offer-link.controller';

const prismaStub = {
    renewalOfferLink: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
    },
};

const compile = async (module: unknown) =>
    Test.createTestingModule({ imports: [module as never] })
        .overrideProvider(PrismaService)
        .useValue(prismaStub)
        .compile();

describe('модули ссылок на КП поднимаются', () => {
    it('сервисный модуль резолвит PrismaService через свой импорт', async () => {
        const moduleRef = await compile(RenewalOfferModule);
        expect(moduleRef.get(RenewalOfferLinkService)).toBeDefined();
        await moduleRef.close();
    });

    it('публичный модуль (apps/pbx) поднимается с контроллером', async () => {
        const moduleRef = await compile(RenewalOfferPublicModule);
        expect(moduleRef.get(PublicRenewalOfferController)).toBeDefined();
        expect(moduleRef.get(RenewalOfferLinkService)).toBeDefined();
        await moduleRef.close();
    });
});

describe('раскол модулей: контроллеры не текут в чужой Swagger', () => {
    const controllersOf = (module: unknown): unknown[] => {
        const list: unknown = Reflect.getMetadata(
            'controllers',
            module as object,
        );
        return Array.isArray(list) ? list : [];
    };

    it('сервисный модуль не публикует ни одного контроллера', () => {
        expect(controllersOf(RenewalOfferModule)).toEqual([]);
    });

    it('в pbx едет только публичная ручка', () => {
        expect(controllersOf(RenewalOfferPublicModule)).toEqual([
            PublicRenewalOfferController,
        ]);
    });

    it('в admin едет только управление ссылками', () => {
        // Публичная ручка в админском модуле означала бы дубль роута
        // в Swagger admin и в сгенерированном клиенте.
        expect(controllersOf(RenewalOfferLinkAdminModule)).toEqual([
            RenewalOfferLinkController,
        ]);
    });
});
