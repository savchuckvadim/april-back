import { PortalEntity } from "../portal.entity";
import { PrismaService } from "src/core/prisma";
import { createProviderEntityFromPrisma } from "../../provider/lib/provider-entity.util";
import { createTemplateBaseEntityFromPrisma } from "../../template-base/lib/template-base-entity.util";

type PortalWithRelations = NonNullable<Awaited<ReturnType<PrismaService['portals']['findUnique']>>> & {
    agents?: any[];
    templates?: any[];
};

export const createPortalEntityFromPrisma = (portal: PortalWithRelations): PortalEntity => {
    return new PortalEntity(
        portal.id.toString(),
        portal.created_at,
        portal.updated_at,
        portal.domain,
        portal.key,
        portal.C_REST_CLIENT_ID,
        portal.C_REST_CLIENT_SECRET,
        portal.C_REST_WEB_HOOK_URL,
        portal.number,
        portal.agents?.map(agent => createProviderEntityFromPrisma(agent)) ?? null,
        portal.templates?.map(template => createTemplateBaseEntityFromPrisma(template)) ?? null
    );
}; 