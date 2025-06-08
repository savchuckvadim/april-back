import { PrismaService } from "src/core/prisma";
import { ProviderEntity, ProviderEntityWithRq, RqEntity } from "../provider.entity";


export function createProviderEntityFromPrisma(provider: NonNullable<Awaited<ReturnType<PrismaService['agents']['findUnique']>>>): ProviderEntity {
    const entity = new ProviderEntity();

    entity.id = provider.id.toString();
    entity.name = String(provider.name || '');
    entity.rqId = provider.rqId ? provider.rqId.toString() : '0';
    entity.domain = String(provider.code || '');
    entity.withTax = provider.withTax ? true : false;

    return entity;
}
export function createRqEntity(rq: NonNullable<Awaited<ReturnType<PrismaService['rqs']['findUnique']>>>): RqEntity {

    const rqEntity = new RqEntity();
    if (rq) {
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
        rqEntity.docIssuedBy = String(rq.docIssuedBy || '');
        rqEntity.docDepCode = String(rq.docDepCode || '');
        rqEntity.registredAdress = String(rq.registredAdress || '');
        rqEntity.primaryAdresss = String(rq.primaryAdresss || '');
        rqEntity.email = String(rq.email || '');
        rqEntity.garantEmail = String(rq.garantEmail || '');
        rqEntity.phone = String(rq.phone || '');
        rqEntity.assigned = String(rq.assigned || '');
        rqEntity.assignedPhone = String(rq.assignedPhone || '');
        rqEntity.other = String(rq.other || '');
        rqEntity.bank = String(rq.bank || '');
        rqEntity.bik = String(rq.bik || '');
        rqEntity.rs = String(rq.rs || '');
        rqEntity.ks = String(rq.ks || '');
    }
    return rqEntity;
}


export function createProviderEntityWithRqFromPrisma(
    providers: NonNullable<Awaited<ReturnType<PrismaService['agents']['findUnique']>>>[],
    rq: NonNullable<Awaited<ReturnType<PrismaService['rqs']['findUnique']>>>
): ProviderEntityWithRq {
    const provider = providers.find(provider => provider.id == rq.agentId);
    if (!provider) throw new Error('Provider not found createProviderEntityWithRqFromPrisma');
    const entity = new ProviderEntityWithRq();
    const providerEntity = createProviderEntityFromPrisma(provider);
    entity.id = providerEntity.id;
    entity.name = providerEntity.name;
    entity.domain = providerEntity.domain;
    entity.withTax = providerEntity.withTax;
    entity.rq = createRqEntity(rq);
    return entity;
}