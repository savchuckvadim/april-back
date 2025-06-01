import { InfogroupEntity } from "./infogroup.entity";

export abstract class InfogroupRepository {
    abstract create(infogroup: Partial<InfogroupEntity>): Promise<InfogroupEntity | null>;
    abstract update(infogroup: Partial<InfogroupEntity>): Promise<InfogroupEntity | null>;
    abstract findById(id: number): Promise<InfogroupEntity | null>;
    abstract findMany(): Promise<InfogroupEntity[] | null>;
} 