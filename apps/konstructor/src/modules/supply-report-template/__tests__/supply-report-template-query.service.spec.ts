import { NotFoundException } from '@nestjs/common';
import type { SupplyReportTemplate } from 'generated/prisma';
import {
    ClientTypeEnum,
    SupplyTypeEnum,
} from '../dto/supply-report-template.enums';
import { SupplyReportTemplateQueryService } from '../services/supply-report-template-query.service';
import { type Payload, mockFn, row } from './supply-report-template.fixtures';

describe('SupplyReportTemplateQueryService', () => {
    let findById: jest.Mock<Promise<SupplyReportTemplate | null>, [bigint]>;
    let findMany: jest.Mock<
        Promise<{ rows: SupplyReportTemplate[]; total: number }>,
        [Payload]
    >;
    let findAll: jest.Mock<Promise<SupplyReportTemplate[]>, [Payload]>;
    let configGet: jest.Mock<string | undefined, [string]>;
    let service: SupplyReportTemplateQueryService;

    beforeEach(() => {
        findById = mockFn();
        findById.mockResolvedValue(row());

        findMany = mockFn();
        findMany.mockResolvedValue({ rows: [], total: 0 });

        findAll = mockFn();
        findAll.mockResolvedValue([]);

        configGet = mockFn();
        configGet.mockReturnValue('https://back.example.ru/');

        service = new SupplyReportTemplateQueryService(
            { findById, findMany, findAll } as never,
            { get: configGet } as never,
        );
    });

    describe('toDto (маппер)', () => {
        it('все bigint уходят наружу строками — BigInt не сериализуется в JSON', () => {
            const dto = service.toDto(
                row({
                    id: 9007199254740993n,
                    portal_id: 7n,
                    agent_id: 42n,
                    creator_bitrix_user_id: 1n,
                }),
            );
            expect(dto.id).toBe('9007199254740993');
            expect(dto.portal_id).toBe('7');
            expect(dto.agent_id).toBe('42');
            expect(dto.creator_bitrix_user_id).toBe('1');
        });

        it('пустая область отдаётся как null, а не как строка "null"', () => {
            const dto = service.toDto(row({ portal_id: null, agent_id: null }));
            expect(dto.portal_id).toBeNull();
            expect(dto.agent_id).toBeNull();
        });

        it('ссылка на шаблон собирается по id, хвостовой слэш APP_URL срезается', () => {
            expect(service.toDto(row()).template_url).toBe(
                'https://back.example.ru/api/supply-report-templates/42/download',
            );
        });

        it('демо-ссылка есть только при загруженном демо', () => {
            expect(service.toDto(row()).demo_url).toBeNull();
            expect(service.toDto(row({ demo_path: 'x.docx' })).demo_url).toBe(
                'https://back.example.ru/api/supply-report-templates/42/download?demo=1',
            );
        });

        it('без APP_URL ссылка относительная, а не "undefined/api/..."', () => {
            configGet.mockReturnValue(undefined);
            expect(service.toDto(row()).template_url).toBe(
                '/api/supply-report-templates/42/download',
            );
        });

        it('списки из колонок LongText разбираются в массивы', () => {
            const dto = service.toDto(
                row({
                    client_types: JSON.stringify([ClientTypeEnum.ORG_STATE]),
                    supply_types: JSON.stringify([SupplyTypeEnum.INTERNET]),
                    required_fields: JSON.stringify(['sale_date']),
                }),
            );
            expect(dto.client_types).toEqual([ClientTypeEnum.ORG_STATE]);
            expect(dto.supply_types).toEqual([SupplyTypeEnum.INTERNET]);
            expect(dto.required_fields).toEqual(['sale_date']);
            // NULL — «для любого / как в форме», а не пустой массив.
            expect(dto.optional_fields).toBeNull();
        });

        it('мусорный код в колонке читается fail-open, а не ломает ответ', () => {
            const dto = service.toDto(
                row({
                    required_fields: JSON.stringify(['sale_date', 'sale_dat']),
                }),
            );
            expect(dto.required_fields).toEqual(['sale_date']);
        });
    });

    describe('getRowOrFail', () => {
        it('отдаёт строку', async () => {
            await expect(service.getRowOrFail(42n)).resolves.toMatchObject({
                id: 42n,
            });
        });

        it('нет строки — 404', async () => {
            findById.mockResolvedValue(null);
            await expect(service.getRowOrFail(42n)).rejects.toThrow(
                NotFoundException,
            );
        });
    });

    describe('список на ПУСТОЙ таблице', () => {
        it('отдаёт пустую страницу, а не ошибку: строка шаблона опциональна', async () => {
            const page = await service.findMany({});
            expect(page.items).toEqual([]);
            expect(page.total).toBe(0);
            expect(findMany).toHaveBeenCalledTimes(1);
        });

        it('дефолтные take/skip попадают в ответ', async () => {
            const page = await service.findMany({});
            expect(page.take).toBe(50);
            expect(page.skip).toBe(0);
        });

        it('findCommon ищет только общие (portal_id IS NULL)', async () => {
            await service.findCommon({});
            expect(findMany).toHaveBeenCalledWith(
                expect.objectContaining({ portal_id: null }),
            );
        });

        it('findByPortal берёт портал ВМЕСТЕ с общими', async () => {
            await service.findByPortal(7n, {});
            const filters: Payload = findMany.mock.calls[0][0];
            expect(filters).toEqual(
                expect.objectContaining({ portal_id_or_common: 7n }),
            );
            expect(filters).not.toHaveProperty('portal_id', 7n);
        });

        it('findByPortal игнорирует присланный portal_id: решает маршрут', async () => {
            await service.findByPortal(7n, { portal_id: '9' });
            expect(findMany.mock.calls[0][0].portal_id_or_common).toBe(7n);
        });
    });

    describe('фильтр по типам считается в TypeScript', () => {
        it('выборка идёт без пагинации, иначе total соврал бы', async () => {
            findAll.mockResolvedValue([
                row({ id: 1n, client_types: JSON.stringify(['org']) }),
                row({ id: 2n, client_types: JSON.stringify(['fiz']) }),
                row({ id: 3n, client_types: null }),
            ]);

            const page = await service.findMany({
                client_type: ClientTypeEnum.FIZ,
            });

            expect(findMany).not.toHaveBeenCalled();
            expect(findAll).toHaveBeenCalledTimes(1);
            // id=3 с NULL подходит любому типу клиента.
            expect(page.items.map(item => item.id)).toEqual(['2', '3']);
            expect(page.total).toBe(2);
        });

        it('страница нарезается ПОСЛЕ фильтрации', async () => {
            findAll.mockResolvedValue([
                row({ id: 1n, supply_types: JSON.stringify(['internet']) }),
                row({ id: 2n, supply_types: JSON.stringify(['internet']) }),
                row({ id: 3n, supply_types: JSON.stringify(['proxima']) }),
            ]);

            const page = await service.findMany({
                supply_type: SupplyTypeEnum.INTERNET,
                take: 1,
                skip: 1,
            });

            expect(page.items.map(item => item.id)).toEqual(['2']);
            expect(page.total).toBe(2);
        });
    });
});
