import { SupplyEntity } from "./supply.entity";
import { SupplyUpdate } from "./type/supply.type";

export abstract class SupplyRepository {
    abstract create(supply: Partial<SupplyEntity>): Promise<SupplyEntity | null>;
    abstract update(supply: Partial<SupplyEntity>): Promise<SupplyEntity | null>;
    abstract findById(id: string): Promise<SupplyEntity | null>;
    abstract findMany(): Promise<SupplyEntity[] | null>;
    abstract updateAll(supplies: SupplyUpdate[]): Promise<SupplyEntity[] | null>;
} 