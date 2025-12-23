import { PortalEntity } from '../portal.entity';
import { PrismaService } from 'src/core/prisma';
import { createProviderEntityFromPrisma } from '../../provider/lib/provider-entity.util';
import { createTemplateBaseEntityFromPrisma } from '../../template-base/lib/template-base-entity.util';
import { Client } from 'generated/prisma';


export type PortalWithRelations = NonNullable<
    Awaited<ReturnType<PrismaService['portal']['findUnique']>>
> & {
    agents?: any[];
    templates?: any[];
    clients?: Client | null;
};

export const createPortalEntityFromPrisma = (
    portal: PortalWithRelations,
): PortalEntity => {

    const clientId = portal.clients?.id ? Number(portal.clients?.id) : null;
    console.log('clientId', clientId);
    const result = new PortalEntity(
        portal.id.toString(),
        portal.created_at,
        portal.updated_at,
        portal.domain,
        portal.key,
        portal.C_REST_CLIENT_ID,
        portal.C_REST_CLIENT_SECRET,
        portal.C_REST_WEB_HOOK_URL,
        portal.number,
        portal.agents?.map(agent => createProviderEntityFromPrisma(agent)) ??
        null,
        portal.templates?.map(template =>
            createTemplateBaseEntityFromPrisma(template),
        ) ?? null,
        clientId,

    );
    return result as unknown as PortalEntity;
};
