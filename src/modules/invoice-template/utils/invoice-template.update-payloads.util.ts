import type { Prisma } from 'generated/prisma';

/**
 * После отвязки агента: portal остаётся → portal, иначе public.
 * Литералы совпадают с Prisma enum — без обращения к полям сущности в update-литерале.
 */
export function buildDisconnectAgentUpdateInput(
    hasPortal: boolean,
): Prisma.InvoiceTemplateUpdateInput {
    return {
        agent: { disconnect: true },
        visibility: hasPortal ? 'portal' : 'public',
    };
}

export function buildConnectProviderAgentUpdateInput(
    agentId: bigint,
): Prisma.InvoiceTemplateUpdateInput {
    return {
        agent: { connect: { id: agentId } },
        visibility: 'provider',
    };
}
