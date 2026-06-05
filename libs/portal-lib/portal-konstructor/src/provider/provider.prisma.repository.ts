import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import { ProviderRepository } from './provider.repository';
import { ProviderEntityWithRq, RqEntity } from './provider.entity';
import {
    createProviderEntityWithRqFromPrisma,
    createRqEntity,
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
}
