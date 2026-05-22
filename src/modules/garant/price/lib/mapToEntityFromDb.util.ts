import { ComplectEntity } from '../../complect';
import { PackageEntity } from '../../package';
import { SupplyEntity } from '../../supply';
import { PriceEntity } from '../entity/price.entity';
import { garant_prof_prices } from 'generated/prisma';
type GarantProfPriceType = garant_prof_prices;

export function mapToEntityFromDb(
    data: GarantProfPriceType,
    supply?: SupplyEntity,
    complect?: ComplectEntity,
    garantPackage?: PackageEntity,
): PriceEntity {
    const entity = new PriceEntity();
    entity.id = data.id;
    entity.code = data.code ?? '';
    entity.value = data.value;
    entity.discount = data.discount ?? null;
    entity.created_at = data.created_at ?? null;
    entity.updated_at = data.updated_at ?? null;
    entity.region_type = data.region_type ?? '';
    entity.supply_type = data.supply_type ?? null;
    entity.supply_type_code = data.supply_type_code ?? null;
    entity.supply_code = data.supply_code ?? null;
    entity.complect_code = data.complect_code ?? null;
    entity.garant_package_code = data.garant_package_code ?? null;
    entity.supply_id = data.supply_id ?? null;
    entity.complect_id = data.complect_id ?? null;
    entity.garant_package_id = data.garant_package_id ?? null;
    entity.supply = supply ?? null;
    entity.complect = complect ?? null;
    entity.garant_package = garantPackage ?? null;
    return entity;
}
