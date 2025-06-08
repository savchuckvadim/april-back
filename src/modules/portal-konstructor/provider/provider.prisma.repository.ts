import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/core/prisma";
import { ProviderRepository } from "./provider.repository";
import { ProviderEntityWithRq, RqEntity } from "./provider.entity";
import { createProviderEntityWithRqFromPrisma, createRqEntity } from "./lib/provider-entity.util";
@Injectable()
export class ProviderPrismaRepository implements ProviderRepository {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    async findById(id: number | bigint): Promise<RqEntity | null> {
        const agent = await this.prisma.agents.findUnique({
            where: { id },
        });
        console.log('agent');
        console.log(id);
        console.log(agent);

        if (!agent) return null;
        const agentId = Number(agent.id);
        console.log('agentId');
        console.log(agentId);

        const rq = await this.prisma.rqs.findFirst({
            where: { agentId },
        });
        console.log('rq');
        console.log(rq);
        let rqEntity: RqEntity | null = null;
        if (rq) {


            // entity = new ProviderEntity();
            rqEntity = createRqEntity(rq);


        }
        console.log('rqEntity');
        console.log(rqEntity);
        return rqEntity;
    }

    async findByDomain(domain: string): Promise<ProviderEntityWithRq[] | null> {
        const portal = await this.prisma.portals.findFirst({
            where: { domain },
            select: { id: true }
        })
        if (!portal) {
            throw new Error('Portal not found');
        };
        const agents = await this.prisma.agents.findMany({
            where: {
                portalId: portal.id
            },
        });
        console.log('agents', agents)
        const rqs = await this.prisma.rqs.findMany({
            where: {
                agentId: {
                    in: agents
                        .map(agent => agent.id)
                }
            }
        })
        return rqs.map(rq => createProviderEntityWithRqFromPrisma(agents, rq));
    }

    async findMany(): Promise<RqEntity[] | null> {
        const rqs = await this.prisma.rqs.findMany();
        return rqs.map(rq => createRqEntity(rq));
    }
}   