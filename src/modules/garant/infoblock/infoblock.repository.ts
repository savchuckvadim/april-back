import { InfoblockEntity } from './infoblock.entity';

export abstract class InfoblockRepository {
    abstract create(
        infoblock: Partial<InfoblockEntity>,
    ): Promise<InfoblockEntity>;
    abstract update(
        infoblock: Partial<InfoblockEntity>,
    ): Promise<InfoblockEntity | null>;
    abstract findById(id: number): Promise<InfoblockEntity | null>;
    abstract findByCode(code: string): Promise<InfoblockEntity | null>;
    abstract findByCodes(codes: string[]): Promise<InfoblockEntity[] | null>;
    abstract findMany(): Promise<InfoblockEntity[] | null>;
    abstract delete(id: string): Promise<boolean>;
    // Методы для управления связями
    abstract setGroup(
        infoblockId: string,
        groupId: string | null,
    ): Promise<InfoblockEntity | null>;
    // abstract setParent(infoblockId: string, parentId: string | null): Promise<InfoblockEntity | null>;
    // abstract setRelation(infoblockId: string, relationId: string | null): Promise<InfoblockEntity | null>;
    // abstract setRelated(infoblockId: string, relatedId: string | null): Promise<InfoblockEntity | null>;
    abstract setExcluded(
        infoblockId: string,
        excludedId: string | null,
    ): Promise<InfoblockEntity | null>;
    // Методы для управления инфоблоками в пакете (packageInfoblocks)
    // infoblockId - это пакет, packageIds - инфоблоки, которые входят в пакет
    abstract addPackages(
        infoblockId: string,
        packageIds: string[],
    ): Promise<InfoblockEntity | null>;
    abstract removePackages(
        infoblockId: string,
        packageIds: string[],
    ): Promise<InfoblockEntity | null>;
    // abstract setPackages(infoblockId: string, packageIds: string[]): Promise<InfoblockEntity | null>;

    // Методы для управления пакетами, в которые входит инфоблок (packages)
    // infoblockId - это инфоблок, packageIds - пакеты, в которые он входит
    abstract addInfoblocksToPackage(
        infoblockIds: string[],
        packageId: string,
    ): Promise<InfoblockEntity | null>;
    abstract removeInfoblocksFromPackage(
        infoblockIds: string[],
        packageId: string,
    ): Promise<InfoblockEntity | null>;
    abstract setInfoblocksInPackage(
        infoblockIds: string[],
        packageId: string,
    ): Promise<InfoblockEntity>;
}
