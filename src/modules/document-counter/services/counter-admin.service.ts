import { Injectable, NotFoundException } from '@nestjs/common';
import { CounterRepository } from '../repository/counter.repository';
import { CreateCounterDto } from '../document-counter.dto';
import { SerializedCounter } from '../lib/counter.types';
import {
    serializeCounter,
    serializePivot,
} from '../lib/counter-serialize.util';
import { buildCounterFormInitial } from '../lib/counter-form.const';

@Injectable()
export class CounterAdminService {
    constructor(private readonly repo: CounterRepository) {}

    async create(dto: CreateCounterDto): Promise<SerializedCounter | null> {
        const result = await this.repo.create(dto);
        return serializeCounter(result);
    }

    async findOne(counterId: number): Promise<SerializedCounter> {
        const counter = await this.repo.findById(counterId);
        if (!counter) {
            throw new NotFoundException('Counter not found');
        }
        return serializeCounter(counter) as SerializedCounter;
    }

    async findAllByRq(rqId: number) {
        const rq = await this.repo.findAllByRq(rqId);
        if (!rq) {
            throw new NotFoundException('Rq not found');
        }
        return rq.rq_counter.map(rc => ({
            id: rc.counters.id.toString(),
            name: rc.counters.name,
            title: rc.counters.title,
            pivot: serializePivot(rc),
        }));
    }

    async getAllCounters() {
        const counters = await this.repo.findMany();
        return counters.map(counter => serializeCounter(counter));
    }

    async remove(counterId: number) {
        const counter = await this.repo.findById(counterId);
        if (!counter) {
            throw new NotFoundException('Counter not found');
        }
        await this.repo.remove(counterId);
        return { message: 'Counter and its relations successfully deleted.' };
    }

    async getInitial(rqId?: number) {
        const rqSelect = await this.repo.getSelectRqs(rqId);
        const initialValue = rqSelect.length > 0 ? rqSelect[0] : null;
        return buildCounterFormInitial(rqSelect, initialValue);
    }
}
