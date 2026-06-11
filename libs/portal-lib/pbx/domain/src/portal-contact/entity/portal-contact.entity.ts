/** Доменная модель контакта портала (строка `btx_contacts`, одна на портал по бизнес-правилу). */
export class PortalContactEntity {
    id!: number;
    portalId!: number;
    name!: string;
    title!: string;
    code!: string;
    createdAt!: Date | null;
    updatedAt!: Date | null;
}
