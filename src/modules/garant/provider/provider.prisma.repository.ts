import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/core/prisma";
import { ProviderRepository } from "./provider.repository";
import { ProviderEntity, RqEntity } from "./provider.entity";

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
            rqEntity = new RqEntity();
            rqEntity.id = Number(rq.id || 0);
            rqEntity.name = String(rq.name || '');
            rqEntity.number = String(rq.number || '');
            rqEntity.type = String(rq.type || '');
            rqEntity.fullname = String(rq.fullname || '');
            rqEntity.shortname = String(rq.shortname || '');
            rqEntity.director = String(rq.director || '');
            rqEntity.position = String(rq.position || '');
            rqEntity.accountant = String(rq.accountant || '');
            rqEntity.based = String(rq.based || '');
            rqEntity.inn = String(rq.inn || '');
            rqEntity.kpp = String(rq.kpp || '');
            rqEntity.ogrn = String(rq.ogrn || '');
            rqEntity.ogrnip = String(rq.ogrnip || '');
            rqEntity.personName = String(rq.personName || '');
            rqEntity.document = String(rq.document || '');
            rqEntity.docSer = String(rq.docSer || '');
            rqEntity.docNum = String(rq.docNum || '');
            rqEntity.docDate = String(rq.docDate || '');
        
        }
        console.log('rqEntity');
        console.log(rqEntity);
        return rqEntity;
    }


}   