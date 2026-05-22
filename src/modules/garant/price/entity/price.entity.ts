import { SupplyEntity } from '../../supply';
import { ComplectEntity } from '../../complect';
import { PackageEntity } from '../../package';

export class PriceEntity {
    id: bigint;
    code: string;

    value: number;
    isSpecial: boolean;
    discount: number | null;

    region_type: string;

    supply_type: string | null;
    supply_type_code: string | null;
    supply_code: string | null;

    complect_code: string | null;
    garant_package_code: string | null;

    supply_id: bigint | null;
    complect_id: bigint | null;
    garant_package_id: bigint | null;

    supply: SupplyEntity | null;
    complect: ComplectEntity | null;
    garant_package: PackageEntity | null;

    created_at: Date | null;
    updated_at: Date | null;
}
