import { PackageEntity } from '../entity/package.entity';

export abstract class PackageRepository {
    abstract create(
        packageEntity: Partial<PackageEntity>,
    ): Promise<PackageEntity | null>;
    abstract update(
        packageEntity: Partial<PackageEntity>,
    ): Promise<PackageEntity | null>;
    abstract findById(id: string): Promise<PackageEntity | null>;
    abstract findMany(): Promise<PackageEntity[] | null>;
    abstract findByCode(code: string): Promise<PackageEntity | null>;
}
