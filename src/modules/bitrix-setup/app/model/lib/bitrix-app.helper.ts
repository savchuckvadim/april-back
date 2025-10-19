import { PrismaService } from "src/core/prisma";
import { BitrixAppEntity } from "../bitrix-app.model";
import { createBitrixTokenEntityFromPrisma } from "@/modules/bitrix-setup/token/model/lib/bitrix-token-model.util";
import { BitrixTokenEntity } from "@/modules/bitrix-setup/token/model/bitrix-token.model";
import { BitrixSettingEntity } from "@/modules/bitrix-setup/setting/model/bitrix-setting.model";

export const createBitrixAppEntityFromPrisma = (app: NonNullable<
    Awaited<ReturnType<PrismaService['bitrix_apps']['findFirst']>>
>, bitrix_tokens?: NonNullable<
    Awaited<ReturnType<PrismaService['bitrix_tokens']['findFirst']>> | null
>, bitrix_app_placements?: NonNullable<
    Awaited<ReturnType<PrismaService['bitrix_app_placements']['findFirst']>> | null
>, bitrix_settings?: NonNullable<
    Awaited<ReturnType<PrismaService['bitrix_settings']['findUnique']>> | null
>, portal?: NonNullable<Awaited<ReturnType<PrismaService['portal']['findUnique']>> | null>,): BitrixAppEntity => {


    const entity = new BitrixAppEntity();
    entity.id = app.id;
    entity.created_at = app.created_at || undefined;
    entity.updated_at = app.updated_at || undefined;
    entity.portal_id = app.portal_id;
    entity.group = app.group || '';
    entity.type = app.type || '';
    entity.code = app.code;
    entity.status = app.status || '';
    entity.bitrix_tokens = bitrix_tokens ? createBitrixTokenEntityFromPrisma(bitrix_tokens) : undefined;
    // entity.placements = bitrix_app_placements.map(createBitrixAppPlacementEntityFromPrisma);
    // entity.settings = bitrix_settings.map(createBitrixSettingEntityFromPrisma);
    entity.portal = portal || undefined;
    return entity;
};


export const getRelations = async (
    prisma: PrismaService,
    appId: bigint,
    portalId: bigint,
): Promise<{
    bitrix_tokens?: NonNullable<
        Awaited<ReturnType<PrismaService['bitrix_tokens']['findFirst']>> | null> | undefined,
    bitrix_app_placements?: NonNullable<
        Awaited<ReturnType<PrismaService['bitrix_app_placements']['findFirst']>> | null> | undefined,
    bitrix_settings?: NonNullable<
        Awaited<ReturnType<PrismaService['bitrix_settings']['findFirst']>> | null> | undefined,
    portal?: NonNullable<Awaited<ReturnType<PrismaService['portal']['findFirst']>> | null> | undefined,
}> => {
    const bitrix_tokens = await prisma.bitrix_tokens.findFirst({
        where: { bitrix_app_id: appId },
    }) || undefined;
    const bitrix_app_placements = await prisma.bitrix_app_placements.findFirst({
        where: { bitrix_app_id: appId },
    }) || undefined;
    const bitrix_settings = await prisma.bitrix_settings.findFirst({
        where: { settingable_id: appId },
    }) || undefined;
    const portal = await prisma.portal.findFirst({
        where: { id: portalId },
    }) || undefined;

    return {
        bitrix_tokens,
        bitrix_app_placements,
        bitrix_settings,
        portal,
    }
}
