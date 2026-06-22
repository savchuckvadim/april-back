import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import {
    CounterRepository,
    CreateCounterData,
    UpdateCounterData,
} from './counter.repository';
import { CounterEntity } from './counter.entity';
import { createCounterEntityFromPrisma } from './lib/counter-entity.util';

@Injectable()
export class CounterPrismaRepository implements CounterRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findById(id: number): Promise<CounterEntity | null> {
        const result = await this.prisma.counters.findUnique({
            where: { id: BigInt(id) },
            include: {
                template_counter: {
                    include: {
                        templates: true,
                    },
                },
                rq_counter: {
                    include: {
                        rqs: true,
                    },
                },
            },
        });

        if (!result) return null;

        return createCounterEntityFromPrisma(result);
    }

    async findByRq(rqId: number): Promise<CounterEntity | null> {
        const result = await this.prisma.counters.findFirst({
            where: {
                rq_counter: {
                    some: {
                        rq_id: BigInt(rqId),
                    },
                },
            },
            include: {
                template_counter: {
                    include: {
                        templates: true,
                    },
                },
                rq_counter: {
                    include: {
                        rqs: true,
                    },
                },
            },
        });

        if (!result) return null;

        return createCounterEntityFromPrisma(result);
    }

    async findByTemplate(templateId: number): Promise<CounterEntity | null> {
        const result = await this.prisma.counters.findFirst({
            where: {
                template_counter: {
                    some: {
                        template_id: BigInt(templateId),
                    },
                },
            },
            include: {
                template_counter: {
                    include: {
                        templates: true,
                    },
                },
                rq_counter: {
                    include: {
                        rqs: true,
                    },
                },
            },
        });

        if (!result) return null;

        return createCounterEntityFromPrisma(result);
    }

    async findMany(): Promise<CounterEntity[] | null> {
        const result = await this.prisma.counters.findMany();
        if (!result) return null;

        return result.map(counter => createCounterEntityFromPrisma(counter));
    }

    async findManyWithRelations(): Promise<CounterEntity[] | null> {
        const result = await this.prisma.counters.findMany({
            include: {
                template_counter: {
                    include: {
                        templates: true,
                    },
                },
                rq_counter: {
                    include: {
                        rqs: true,
                    },
                },
            },
        });

        if (!result) return null;

        return result.map(counter => createCounterEntityFromPrisma(counter));
    }

    async create(data: CreateCounterData): Promise<CounterEntity> {
        const result = await this.prisma.counters.create({
            data: {
                name: data.name,
                title: data.title,
            },
        });

        return createCounterEntityFromPrisma(result);
    }

    async update(id: number, data: UpdateCounterData): Promise<CounterEntity> {
        const result = await this.prisma.counters.update({
            where: { id: BigInt(id) },
            data: {
                ...(data.name !== undefined && { name: data.name }),
                ...(data.title !== undefined && { title: data.title }),
            },
        });

        return createCounterEntityFromPrisma(result);
    }

    async delete(id: number): Promise<void> {
        await this.prisma.counters.delete({ where: { id: BigInt(id) } });
    }
}
