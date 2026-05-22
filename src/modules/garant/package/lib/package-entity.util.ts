import { PrismaService } from 'src/core/prisma';
import { PackageEntity } from '../entity/package.entity';
import { PackageProductTypeEnum, PackageTypeEnum } from '../types/package.type';

export function createPackageEntityFromPrisma(
    data: NonNullable<
        Awaited<ReturnType<PrismaService['garant_packages']['findUnique']>>
    >,
): PackageEntity {
    const entity = new PackageEntity();
    entity.id = data.id.toString();
    entity.name = data.name;
    entity.fullName = data.fullName;
    entity.shortName = data.shortName;
    entity.description = data.description ?? undefined;
    entity.code = data.code;
    entity.type = data.type as PackageTypeEnum;
    entity.color = data.color ?? undefined;
    entity.weight = data.weight ?? undefined;
    entity.abs = data.abs ?? undefined;
    entity.number = data.number;
    entity.productType = data.productType as PackageProductTypeEnum | undefined;
    entity.withABS = data.withABS;
    entity.isChanging = data.isChanging;
    entity.withDefault = data.withDefault;
    entity.infoblock_id = data.infoblock_id?.toString() ?? null;
    entity.info_group_id = data.info_group_id?.toString() ?? null;
    entity.created_at = data.created_at ?? undefined;
    entity.updated_at = data.updated_at ?? undefined;
    return entity;
}
