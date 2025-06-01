export class PriceEntity {
    id: bigint;
    complect_id: bigint | null;
    garant_package_id: bigint | null;
    supply_id: bigint | null;
    region_type: string;
    supply_type: string | null;
    value: number;
    discount: number | null;
    created_at: Date | null;
    updated_at: Date | null;
}