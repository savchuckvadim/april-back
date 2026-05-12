/** Доменная модель компании портала (строка `btx_companies`, одна на портал по бизнес-правилу). */
export class PortalCompanyEntity {
    id!: number;
    portalId!: number;
    name!: string;
    title!: string;
    code!: string;
    createdAt!: Date | null;
    updatedAt!: Date | null;
}
