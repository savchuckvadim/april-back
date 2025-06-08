import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/core/prisma";
import { CounterRepository } from "./counter.repository";
import { CounterEntity } from "./counter.entity";
import { createCounterEntityFromPrisma } from "./lib/counter-entity.util";

@Injectable()
export class CounterPrismaRepository implements CounterRepository {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    async findById(id: number): Promise<CounterEntity | null> {
        const result = await this.prisma.counters.findUnique({
            where: { id: BigInt(id) },
            include: {
                template_counter: {
                    include: {
                        templates: true
                    }
                },
                rq_counter: {
                    include: {
                        rqs: true
                    }
                }
            }
        });

        if (!result) return null;

        return createCounterEntityFromPrisma(result);
    }

    async findByRq(rqId: number): Promise<CounterEntity | null> {
        const result = await this.prisma.counters.findFirst({
            where: {
                rq_counter: {
                    some: {
                        rq_id: BigInt(rqId)
                    }
                }
            },
            include: {
                template_counter: {
                    include: {
                        templates: true
                    }
                },
                rq_counter: {
                    include: {
                        rqs: true
                    }
                }
            }
        });

        if (!result) return null;

        return createCounterEntityFromPrisma(result);
    }

    async findByTemplate(templateId: number): Promise<CounterEntity | null> {
        const result = await this.prisma.counters.findFirst({
            where: {
                template_counter: {
                    some: {
                        template_id: BigInt(templateId)
                    }
                }
            },
            include: {
                template_counter: {
                    include: {
                        templates: true
                    }
                },
                rq_counter: {
                    include: {
                        rqs: true
                    }
                }
            }
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
                        templates: true
                    }
                },
                rq_counter: {
                    include: {
                        rqs: true
                    }
                }
            }
        });

        if (!result) return null;

        return result.map(counter => createCounterEntityFromPrisma(counter));
    }
} 