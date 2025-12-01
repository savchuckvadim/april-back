import { UserSelectedTemplate } from '../entities/user-selected-template.entity';

export abstract class UserSelectedTemplateRepository {
    abstract findById(id: bigint): Promise<UserSelectedTemplate | null>;
    abstract findMany(filters?: {
        bitrix_user_id?: bigint;
        portal_id?: bigint;
        offer_template_id?: bigint;
        is_current?: boolean;
        is_favorite?: boolean;
        is_active?: boolean;
    }): Promise<UserSelectedTemplate[]>;
    abstract findWithRelations(
        id: bigint,
    ): Promise<UserSelectedTemplate | null>;
    abstract create(
        data: Partial<UserSelectedTemplate>,
    ): Promise<UserSelectedTemplate>;
    abstract update(
        id: bigint,
        data: Partial<UserSelectedTemplate>,
    ): Promise<UserSelectedTemplate>;
    abstract delete(id: bigint): Promise<void>;
    abstract findByUser(
        user_id: bigint,
        portal_id: bigint,
    ): Promise<UserSelectedTemplate[]>;
    abstract findByUserAndTemplate(
        user_id: bigint,
        portal_id: bigint,
        template_id: bigint,
    ): Promise<UserSelectedTemplate | null>;
    abstract findCurrentByUser(
        user_id: bigint,
        portal_id: bigint,
    ): Promise<UserSelectedTemplate | null>;
    abstract findFavoritesByUser(
        user_id: bigint,
        portal_id: bigint,
    ): Promise<UserSelectedTemplate[]>;
}
