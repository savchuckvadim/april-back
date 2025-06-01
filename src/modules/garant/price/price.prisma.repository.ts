import { PrismaService } from "src/core/prisma";
import { PriceRepository } from "./price.repository";
import { PriceEntity } from "./price.entity";

export class PricePrismaRepository implements PriceRepository {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    async create(price: Partial<PriceEntity>): Promise<PriceEntity | null> {
        const result = await this.prisma.garant_prof_prices.create({
            data: {
                region_type: price.region_type!, // обязательно
                value: price.value ?? 0,
                complect_id: price.complect_id ?? null,
                garant_package_id: price.garant_package_id ?? null,
                supply_id: price.supply_id ?? null,
                supply_type: price.supply_type ?? null,
                discount: price.discount ?? null,
                created_at: price.created_at ?? new Date(),
                updated_at: price.updated_at ?? new Date(),
            },
        });
        return result
    }

    async update(price: Partial<PriceEntity>): Promise<PriceEntity | null> {
        return await this.prisma.garant_prof_prices.update({ where: { id: price.id }, data: price });
    }

    async findById(id: number): Promise<PriceEntity | null> {
        return await this.prisma.garant_prof_prices.findUnique(
            {
                where: {
                    id
                }
            }
        )
    }

    async findMany(): Promise<PriceEntity[] | null> {
        return await this.prisma.garant_prof_prices.findMany()

    }




}

