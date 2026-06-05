/** Доменная модель сделки портала (строка `btx_deals`, одна на портал по бизнес-правилу). */
export class PortalDealEntity {
    id!: number;
    portalId!: number;
    name!: string;
    title!: string;
    code!: string;
    createdAt!: Date | null;
    updatedAt!: Date | null;
}
