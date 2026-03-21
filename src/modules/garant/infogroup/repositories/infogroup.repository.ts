import { InfogroupEntity } from '../entity/infogroup.entity';

export abstract class InfogroupRepository {
    abstract create(
        infogroup: Partial<InfogroupEntity>,
    ): Promise<InfogroupEntity | null>;
    abstract update(
        infogroup: Partial<InfogroupEntity>,
    ): Promise<InfogroupEntity | null>;
    abstract findById(id: number): Promise<InfogroupEntity | null>;
    abstract findMany(): Promise<InfogroupEntity[] | null>;

    // Методы для управления связями с инфоблоками
    abstract addInfoblocks(
        infogroupId: string,
        infoblockIds: string[],
    ): Promise<InfogroupEntity | null>;
    abstract removeInfoblocks(
        infogroupId: string,
        infoblockIds: string[],
    ): Promise<InfogroupEntity | null>;
    abstract setInfoblocks(
        infogroupId: string,
        infoblockIds: string[],
    ): Promise<InfogroupEntity | null>;
}
