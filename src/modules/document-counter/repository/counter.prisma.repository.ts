import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/core/prisma';
import { rq_counter } from 'generated/prisma';
import { CounterRepository } from './counter.repository';
import {
    CounterWithRqs,
    RqSelectItem,
    RqWithCounters,
} from '../lib/counter.types';
import { CounterType } from '../lib/counter-type.enum';
import { CreateCounterDto } from '../document-counter.dto';

@Injectable()
export class CounterPrismaRepository implements CounterRepository {
    constructor(private readonly prisma: PrismaService) {}

    async create(dto: CreateCounterDto): Promise<CounterWithRqs> {
        const counter = await this.prisma.counters.create({
            data: {
                name: dto.name,
                title: dto.title,
                created_at: new Date(),
                updated_at: new Date(),
            },
        });

        await this.prisma.rq_counter.create({
            data: {
                rq_id: BigInt(dto.rq_id),
                counter_id: counter.id,
                value: dto.value ?? 0,
                type: dto.type ?? null,
                prefix: dto.prefix ?? null,
                postfix: dto.postfix ?? null,
                day: dto.day ?? false,
                year: dto.year ?? false,
                month: dto.month ?? false,
                count: dto.count ?? 0,
                size: dto.size ?? 1,
            },
        });

        const result = await this.prisma.counters.findUniqueOrThrow({
            where: { id: counter.id },
            include: {
                rq_counter: { include: { rqs: true } },
            },
        });

        return result;
    }

    async findById(counterId: number): Promise<CounterWithRqs | null> {
        return this.prisma.counters.findUnique({
            where: { id: BigInt(counterId) },
            include: {
                rq_counter: { include: { rqs: true } },
            },
        });
    }

    async findAllByRq(rqId: number): Promise<RqWithCounters | null> {
        return this.prisma.rqs.findUnique({
            where: { id: BigInt(rqId) },
            include: {
                rq_counter: { include: { counters: true } },
            },
        });
    }

    async findMany(): Promise<CounterWithRqs[]> {
        return this.prisma.counters.findMany({
            include: {
                rq_counter: { include: { rqs: true } },
            },
        });
    }

    async remove(counterId: number): Promise<void> {
        await this.prisma.rq_counter.deleteMany({
            where: { counter_id: BigInt(counterId) },
        });
        await this.prisma.counters.delete({
            where: { id: BigInt(counterId) },
        });
    }

    async getSelectRqs(rqId?: number): Promise<RqSelectItem[]> {
        if (rqId) {
            const rq = await this.prisma.rqs.findUnique({
                where: { id: BigInt(rqId) },
            });
            if (rq) {
                return [
                    {
                        value: Number(rq.id),
                        label: rq.name ?? rq.shortname ?? rq.id.toString(),
                    },
                ];
            }
        }

        const allRqs = await this.prisma.rqs.findMany({
            select: { id: true, name: true, shortname: true },
            take: 100,
        });

        return allRqs.map(r => ({
            value: Number(r.id),
            label: r.name ?? r.shortname ?? r.id.toString(),
        }));
    }

    async findPivot(
        rqId: number,
        type: CounterType,
    ): Promise<rq_counter | null> {
        return this.prisma.rq_counter.findFirst({
            where: {
                rq_id: BigInt(rqId),
                type,
            },
        });
    }

    /**
     * Atomically increment+read inside an interactive transaction
     * so two concurrent requests can never get the same counter value.
     */
    async incrementAndGet(
        rqId: bigint,
        counterId: bigint,
        size: number,
    ): Promise<number> {
        return this.prisma.$transaction(async tx => {
            const pivot = await tx.rq_counter.findUniqueOrThrow({
                where: {
                    rq_id_counter_id: { rq_id: rqId, counter_id: counterId },
                },
                select: { count: true },
            });

            const newCount = pivot.count + size;

            await tx.rq_counter.update({
                where: {
                    rq_id_counter_id: { rq_id: rqId, counter_id: counterId },
                },
                data: { count: newCount },
            });

            return newCount;
        });
    }
}
