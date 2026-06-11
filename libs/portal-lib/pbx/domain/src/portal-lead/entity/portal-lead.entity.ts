/** Доменная модель лида портала (строка `btx_leads`, одна на портал по бизнес-правилу). */
export class PortalLeadEntity {
    id!: number;
    portalId!: number;
    name!: string;
    title!: string;
    code!: string;
    createdAt!: Date | null;
    updatedAt!: Date | null;
}
