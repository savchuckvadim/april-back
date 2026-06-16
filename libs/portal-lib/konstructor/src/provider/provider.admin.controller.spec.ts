import { ProviderAdminController } from './provider.admin.controller';
import { ProviderService } from './provider.service';
import { PROVIDER_TYPE_OPTIONS, PROVIDER_TYPE_VALUES } from './provider.const';
import {
    CreateProviderWithRqDto,
    ProviderEnumsResponseDto,
    UpdateRqDto,
} from './provider.dto';
import { ProviderEntityWithRq, RqEntity } from './provider.entity';

/** Плоский мок сервиса — поля-jest.fn, чтобы не ловить unbound-method. */
type ServiceMock = Record<keyof ProviderService, jest.Mock>;

describe('ProviderAdminController', () => {
    let service: ServiceMock;
    let controller: ProviderAdminController;

    beforeEach(() => {
        service = {
            findMany: jest.fn(),
            findById: jest.fn(),
            findByDomain: jest.fn(),
            createWithRq: jest.fn(),
            updateRq: jest.fn(),
            delete: jest.fn(),
        };

        controller = new ProviderAdminController(
            service as unknown as ProviderService,
        );
    });

    describe('getEnums', () => {
        it('возвращает все опции типа поставщика для select`а', () => {
            const result = controller.getEnums();

            expect(result).toBeInstanceOf(ProviderEnumsResponseDto);
            expect(result.types).toHaveLength(PROVIDER_TYPE_OPTIONS.length);
            expect(result.types.map(o => o.value)).toEqual([
                ...PROVIDER_TYPE_VALUES,
            ]);
            // подписи не теряются при маппинге
            expect(result.types[0].label).toBe('Организация');
        });
    });

    describe('getAll', () => {
        it('делегирует в service.findMany', async () => {
            const rqs = [{ id: 9 } as RqEntity];
            service.findMany.mockResolvedValue(rqs);

            await expect(controller.getAll()).resolves.toBe(rqs);
            expect(service.findMany).toHaveBeenCalledTimes(1);
        });
    });

    describe('getByDomain', () => {
        it('делегирует домен в service.findByDomain', async () => {
            const providers = [{ id: '5' } as ProviderEntityWithRq];
            service.findByDomain.mockResolvedValue(providers);

            await expect(
                controller.getByDomain('company.bitrix24.ru'),
            ).resolves.toBe(providers);
            expect(service.findByDomain).toHaveBeenCalledWith(
                'company.bitrix24.ru',
            );
        });
    });

    describe('getOne', () => {
        it('делегирует id в service.findById', async () => {
            const rq = { id: 12 } as RqEntity;
            service.findById.mockResolvedValue(rq);

            await expect(controller.getOne(12)).resolves.toBe(rq);
            expect(service.findById).toHaveBeenCalledWith(12);
        });
    });

    describe('create', () => {
        it('делегирует dto в service.createWithRq', async () => {
            const dto = {
                domain: 'company.bitrix24.ru',
            } as CreateProviderWithRqDto;
            const created = { id: '5' } as ProviderEntityWithRq;
            service.createWithRq.mockResolvedValue(created);

            await expect(controller.create(dto)).resolves.toBe(created);
            expect(service.createWithRq).toHaveBeenCalledWith(dto);
        });
    });

    describe('updateRq', () => {
        it('делегирует id и dto в service.updateRq', async () => {
            const dto = { name: 'ООО «Новое»' } as UpdateRqDto;
            const updated = { id: 12 } as RqEntity;
            service.updateRq.mockResolvedValue(updated);

            await expect(controller.updateRq(12, dto)).resolves.toBe(updated);
            expect(service.updateRq).toHaveBeenCalledWith(12, dto);
        });
    });

    describe('remove', () => {
        it('делегирует id в service.delete', async () => {
            service.delete.mockResolvedValue(undefined);

            await expect(controller.remove(12)).resolves.toBeUndefined();
            expect(service.delete).toHaveBeenCalledWith(12);
        });
    });
});
