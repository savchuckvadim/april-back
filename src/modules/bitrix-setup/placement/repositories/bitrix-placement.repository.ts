import { BitrixPlacementEntity } from '../model/bitrix-placement.model';

export abstract class BitrixPlacementRepository {
    // BitrixPlacement methods
    abstract storePlacements(appId: bigint, placements: Partial<BitrixPlacementEntity>[]): Promise<BitrixPlacementEntity[]>;
    abstract findById(id: bigint): Promise<BitrixPlacementEntity | null>;
    abstract findByAppId(appId: bigint): Promise<BitrixPlacementEntity[]>;
    abstract deleteByAppId(appId: bigint): Promise<boolean>;
    abstract delete(id: bigint): Promise<boolean>;
}
