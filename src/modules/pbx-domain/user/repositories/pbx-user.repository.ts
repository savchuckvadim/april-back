import { PbxUserEntity } from '../entity/pbx-user.entity';

export abstract class PbxUserRepository {
    abstract findById(id: string): Promise<PbxUserEntity | null>;
    abstract findByPortalId(id: string): Promise<PbxUserEntity | null>;
    abstract findByPortalDomain(id: string): Promise<PbxUserEntity | null>;
    abstract findAll(): Promise<PbxUserEntity[] | null>;
    abstract create(
        user: Partial<Omit<PbxUserEntity, 'id' | 'createdAt' | 'updatedAt'>>,
        portalId: string,
    ): Promise<PbxUserEntity | null>;
    abstract update(
        id: string,
        user: Partial<Omit<PbxUserEntity, 'id' | 'createdAt' | 'updatedAt'>>,
    ): Promise<PbxUserEntity | null>;
    abstract delete(id: string): Promise<boolean>;
}
