import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import { ProviderRepository } from './provider.repository';
import {
    CreateProviderWithRqInput,
    ProviderEntityWithRq,
    RqEntity,
    RqInput,
} from './provider.entity';
import {
    createProviderEntityWithRqFromPrisma,
    createRqEntity,
    mapRqInputToData,
} from './lib/provider-entity.util';
@Injectable()
export class ProviderPrismaRepository implements ProviderRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findById(id: number | bigint): Promise<RqEntity | null> {
        const agent = await this.prisma.agents.findUnique({
            where: { id },
        });

        if (!agent) return null;
        const agentId = Number(agent.id);

        const rq = await this.prisma.rqs.findFirst({
            where: { agentId },
        });

        let rqEntity: RqEntity | null = null;
        if (rq) {
            // entity = new ProviderEntity();
            rqEntity = createRqEntity(rq, agent.withTax);
        }
        return rqEntity;
    }

    async findByDomain(domain: string): Promise<ProviderEntityWithRq[] | null> {
        const portal = await this.prisma.portal.findFirst({
            where: { domain },
            select: { id: true },
        });
        if (!portal) {
            throw new Error('Portal not found');
        }
        const agents = await this.prisma.agents.findMany({
            where: {
                portalId: portal.id,
            },
        });

        const rqs = await this.prisma.rqs.findMany({
            where: {
                agentId: {
                    in: agents.map(agent => agent.id),
                },
            },
        });
        return rqs.map(rq => createProviderEntityWithRqFromPrisma(agents, rq));
    }

    async findMany(): Promise<RqEntity[] | null> {
        const agents = await this.prisma.agents.findMany();

        const results = [] as RqEntity[];
        for (const agent of agents) {
            const rq = await this.prisma.rqs.findFirst({
                where: { agentId: agent.id },
            });
            if (rq) {
                results.push(createRqEntity(rq, agent.withTax));
            }
        }
        return results;
    }

    async createWithRq(
        input: CreateProviderWithRqInput,
    ): Promise<ProviderEntityWithRq> {
        const portal = await this.prisma.portal.findFirst({
            where: { domain: input.domain },
            select: { id: true },
        });
        if (!portal) {
            throw new Error('Portal not found');
        }

        return this.prisma.$transaction(async tx => {
            // 1. Создаём поставщика.
            const agent = await tx.agents.create({
                data: {
                    portalId: portal.id,
                    type: input.type,
                    name: input.name,
                    code: input.code,
                    number: input.number,
                    withTax: input.withTax,
                },
            });

            // 2. Создаём реквизиты, привязанные к поставщику.
            const rq = await tx.rqs.create({
                data: {
                    ...mapRqInputToData(input.rq),
                    type: input.rq.type,
                    agentId: agent.id,
                },
            });

            // 3. Прокидываем обратную связь agents.rqId -> rqs.id.
            const linkedAgent = await tx.agents.update({
                where: { id: agent.id },
                data: { rqId: rq.id },
            });

            return createProviderEntityWithRqFromPrisma([linkedAgent], rq);
        });
    }

    async updateRq(
        id: number | bigint,
        data: Partial<RqInput>,
    ): Promise<RqEntity | null> {
        const existing = await this.prisma.rqs.findUnique({ where: { id } });
        if (!existing) return null;

        const rq = await this.prisma.rqs.update({
            where: { id },
            data: mapRqInputToData(data),
        });

        const agent = rq.agentId
            ? await this.prisma.agents.findUnique({
                  where: { id: rq.agentId },
              })
            : null;

        return createRqEntity(rq, agent?.withTax ?? false);
    }

    async delete(id: number | bigint): Promise<boolean> {
        const agent = await this.prisma.agents.findUnique({ where: { id } });
        if (!agent) return false;

        await this.prisma.$transaction(async tx => {
            // Снимаем связь, чтобы не упереться в внешний ключ rqId.
            await tx.agents.update({
                where: { id: agent.id },
                data: { rqId: null },
            });
            await tx.rqs.deleteMany({ where: { agentId: agent.id } });
            await tx.agents.delete({ where: { id: agent.id } });
        });

        return true;
    }
}
