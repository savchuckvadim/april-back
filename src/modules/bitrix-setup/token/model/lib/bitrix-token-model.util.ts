import { PrismaService } from "@/core/prisma";
import { BitrixTokenEntity } from "../bitrix-token.model";
import { decrypt } from "@/lib/utils/crypt.util";

export const createBitrixTokenEntityFromPrisma = (token: NonNullable<
    Awaited<ReturnType<PrismaService['bitrix_tokens']['findUnique']>>
>): BitrixTokenEntity => {
    const entity = new BitrixTokenEntity();
    entity.id = token.id;
    entity.created_at = token.created_at || undefined;
    entity.updated_at = token.updated_at || undefined;
    entity.bitrix_app_id = token.bitrix_app_id;
    entity.client_id = decrypt(token.client_id);
    entity.client_secret = decrypt(token.client_secret);
    entity.access_token = decrypt(token.access_token);
    entity.refresh_token = decrypt(token.refresh_token);
    entity.expires_at = token.expires_at || undefined;
    entity.member_id = token.member_id ? decrypt(token.member_id) : undefined;
    entity.application_token = token.application_token ? decrypt(token.application_token) : undefined;

    return entity;
};
