import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import { PriceRepository } from './price.repository';
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
            ? await this.complectService.findByCode(price.complectCode!)
            : null;
        const garantPackage = price.garantPackageCode
            ? await this.garantPackageService.findByCode(
                  price.garantPackageCode!,
              )
            : null;
        const supply = price.supplyCode
            ? await this.supplyService.findByCode(price.supplyCode!)
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
        console.log(price.garantPackageCode);
        console.log(price.code);
        const existingPrice = await this.findByUniqueFromGarantPackage(
            price.garantPackageCode,
            price.region_type,
        );
        if (existingPrice) {
            return this.update(existingPrice.id, price);
        }
        return this.create(price);
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
