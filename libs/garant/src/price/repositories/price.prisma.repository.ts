import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import { PriceRepository, PriceStoreManyResult } from './price.repository';
import { PriceEntity } from '../entity/price.entity';
import { mapToEntityFromDb } from '../lib/mapToEntityFromDb.util';
import { PriceCreateType } from '../types/price-from-excel.type';
import { ComplectService } from '../../complect';
import { PackageService } from '../../package';
import { SupplyService } from '../../supply';

@Injectable()
export class PricePrismaRepository implements PriceRepository {
    constructor(
        private readonly prisma: PrismaService,
        private readonly complectService: ComplectService,
        private readonly garantPackageService: PackageService,
        private readonly supplyService: SupplyService,
    ) {}

    private async getPriceData(price: PriceCreateType) {
        const complect = price.complectCode
            ? await this.complectService.findByCode(price.complectCode)
            : null;
        const garantPackage = price.garantPackageCode
            ? await this.garantPackageService.findByCode(
                  price.garantPackageCode,
              )
            : null;
        const supply = price.supplyCode
            ? await this.supplyService.findByCode(price.supplyCode)
            : null;
        const complectId = complect ? BigInt(complect.id.toString()) : null;
        const garantPackageId = garantPackage
            ? BigInt(garantPackage.id.toString())
            : null;
        const supplyId = supply ? BigInt(supply.id.toString()) : null;

        // Преобразуем null в undefined для полей, которые Prisma не принимает как null
        return {
            region_type: price.region_type.toString(), // обязательно
            value: price.value ?? 0,
            complect_id: complectId ?? undefined,
            supply_id: supplyId ?? undefined,
            garant_package_id: garantPackageId ?? undefined,
            supply_type: price.supplyType ?? undefined, // 0 - internet 1 - proxima
            supply_type_code: price.supplyTypeCode ?? undefined, // internet | proxima
            supply_code: price.supplyCode ?? undefined, // 1 - 18 будет найден Supply по code
            complect_code: price.complectCode ?? undefined,
            garant_package_code: price.garantPackageCode ?? undefined,
            discount: price.discount ?? undefined,
        };
    }

    async storeByComplect(price: PriceCreateType): Promise<PriceEntity> {
        if (
            price.complectCode === null ||
            price.supplyCode === null ||
            price.region_type === null
        ) {
            throw new BadRequestException(
                'Complect code, supply type and region type are required',
            );
        }
        const existingPrice = await this.findByUniqueFromComplect(
            price.complectCode,
            price.supplyCode,
            price.region_type,
        );
        if (existingPrice) {
            return this.update(existingPrice.id, price);
        }
        return this.create(price);
    }

    async storeByPackage(price: PriceCreateType): Promise<PriceEntity> {
        if (price.garantPackageCode === null || price.region_type === null) {
            throw new BadRequestException(
                'garantPackageCode code and region type are required',
            );
        }
        const existingPrice = await this.findByUniqueFromGarantPackage(
            price.garantPackageCode,
            price.region_type,
        );
        if (existingPrice) {
            return this.update(existingPrice.id, price);
        }
        return this.create(price);
    }
    /**
     * Пачка цен комплектов одной транзакцией.
     *
     * Связи (комплект, поставка) и уже существующие цены читаются одним
     * запросом на всю пачку, а не на каждую цену — иначе полный прайс это
     * ~1800 последовательных запросов, и загрузка не доходит до конца.
     * Уникального индекса на (complect_code, supply_code, region_type) в
     * базе нет, поэтому upsert неприменим: создаём и обновляем по id.
     */
    async storeManyByComplect(
        prices: PriceCreateType[],
    ): Promise<PriceStoreManyResult> {
        const result: PriceStoreManyResult = {
            created: 0,
            updated: 0,
            unchanged: 0,
            failed: [],
        };
        if (prices.length === 0) return result;

        const keyOf = (p: {
            complect_code?: string | null;
            supply_code?: string | null;
            region_type?: string | null;
        }): string =>
            `${p.complect_code ?? ''}|${p.supply_code ?? ''}|${p.region_type ?? ''}`;

        const complectCodes = [
            ...new Set(prices.map(p => p.complectCode).filter(Boolean)),
        ] as string[];
        const supplyCodes = [
            ...new Set(prices.map(p => p.supplyCode).filter(Boolean)),
        ] as string[];

        const [complects, supplies, existing] = await Promise.all([
            this.prisma.complects.findMany({
                where: { code: { in: complectCodes } },
                select: { id: true, code: true },
            }),
            this.prisma.supplies.findMany({
                where: { code: { in: supplyCodes } },
                select: { id: true, code: true },
            }),
            this.prisma.garant_prof_prices.findMany({
                where: { complect_code: { in: complectCodes } },
                select: {
                    id: true,
                    complect_code: true,
                    supply_code: true,
                    region_type: true,
                    value: true,
                },
            }),
        ]);
        const complectId = new Map(complects.map(c => [c.code, c.id]));
        const supplyId = new Map(supplies.map(s => [s.code, s.id]));
        const existingByKey = new Map(existing.map(e => [keyOf(e), e]));

        const toCreate: Array<Record<string, unknown>> = [];
        const toUpdate: Array<{ id: bigint; value: number }> = [];

        for (const price of prices) {
            const key = `${price.complectCode}/${price.supplyCode}`;
            if (!price.complectCode || !price.supplyCode) {
                result.failed.push({
                    key,
                    reason: 'не указан комплект или вид поставки',
                });
                continue;
            }
            const cId = complectId.get(price.complectCode);
            const sId = supplyId.get(price.supplyCode);
            if (cId === undefined) {
                result.failed.push({
                    key,
                    reason: `комплекта «${price.complectCode}» нет в каталоге`,
                });
                continue;
            }
            if (sId === undefined) {
                result.failed.push({
                    key,
                    reason: `вида поставки «${price.supplyCode}» нет в каталоге`,
                });
                continue;
            }
            const was = existingByKey.get(
                keyOf({
                    complect_code: price.complectCode,
                    supply_code: price.supplyCode,
                    region_type: price.region_type,
                }),
            );
            if (was && was.value === price.value) {
                result.unchanged += 1;
                continue;
            }
            if (was) {
                toUpdate.push({ id: was.id, value: price.value ?? 0 });
                continue;
            }
            toCreate.push({
                region_type: price.region_type.toString(),
                value: price.value ?? 0,
                complect_id: cId,
                supply_id: sId,
                supply_type: price.supplyType ?? undefined,
                supply_type_code: price.supplyTypeCode ?? undefined,
                supply_code: price.supplyCode,
                complect_code: price.complectCode,
                code: price.code ?? undefined,
                discount: price.discount ?? undefined,
                isSpecial: price.isSpecial ?? false,
                created_at: new Date(),
                updated_at: new Date(),
            });
        }

        // Одна транзакция на всю пачку: при обрыве запроса в базе не
        // останется половины прайса — либо весь, либо ничего.
        await this.prisma.$transaction(async tx => {
            if (toCreate.length > 0) {
                await tx.garant_prof_prices.createMany({
                    data: toCreate as never,
                });
            }
            for (const row of toUpdate) {
                await tx.garant_prof_prices.update({
                    where: { id: row.id },
                    data: { value: row.value, updated_at: new Date() },
                });
            }
        });
        result.created = toCreate.length;
        result.updated = toUpdate.length;
        return result;
    }

    async create(price: PriceCreateType): Promise<PriceEntity> {
        const data = await this.getPriceData(price);

        const result = await this.prisma.garant_prof_prices.create({
            data: {
                ...data,
                created_at: new Date(),
                updated_at: new Date(),
            },
        });
        if (!result) throw new Error('Failed to create price');
        return mapToEntityFromDb(result);
    }

    async update(id: bigint, price: PriceCreateType): Promise<PriceEntity> {
        const data = await this.getPriceData(price);

        const result = await this.prisma.garant_prof_prices.update({
            where: { id },
            data: {
                ...data,
                updated_at: new Date(),
            },
        });
        if (!result) {
            throw new BadRequestException('Price not updated');
        }
        return mapToEntityFromDb(result);
    }
    async findMany(): Promise<PriceEntity[]> {
        const result = await this.prisma.garant_prof_prices.findMany();
        if (!result) {
            throw new NotFoundException('Prices not found');
        }
        return result.map(item => mapToEntityFromDb(item));
    }

    async findById(id: number): Promise<PriceEntity> {
        const result = await this.prisma.garant_prof_prices.findUnique({
            where: { id: id },
        });
        if (!result) {
            throw new NotFoundException('Price not found');
        }
        return mapToEntityFromDb(result);
    }
    async findByUniqueFromComplect(
        complect_code: string,
        supply_code: string,
        region_type: '1' | '0',
    ): Promise<PriceEntity | null> {
        try {
            const result = await this.prisma.garant_prof_prices.findFirst({
                where: {
                    complect_code: complect_code,
                    supply_code: supply_code,
                    region_type: region_type,
                },
            });
            if (!result) return null;
            return mapToEntityFromDb(result);
        } catch (error) {
            console.error('Error finding price by unique:', error);
            return null;
        }
    }
    async findByUniqueFromGarantPackage(
        garant_package_code: string,
        region_type: '1' | '0',
    ): Promise<PriceEntity | null> {
        try {
            const result = await this.prisma.garant_prof_prices.findFirst({
                where: {
                    garant_package_code: garant_package_code,
                    region_type: region_type,
                },
            });
            if (!result) return null;
            return mapToEntityFromDb(result);
        } catch (error) {
            console.error('Error finding price by unique:', error);
            return null;
        }
    }
    async delete(id: number): Promise<boolean> {
        await this.prisma.garant_prof_prices.delete({
            where: { id: id },
        });
        return true;
    }

    async deleteAll(): Promise<boolean> {
        await this.prisma.garant_prof_prices.deleteMany();
        return true;
    }

    async deleteMany(ids: number[]): Promise<boolean> {
        await this.prisma.garant_prof_prices.deleteMany({
            where: { id: { in: ids } },
        });
        return true;
    }
}
