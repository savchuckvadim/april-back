import { ProviderEntity } from "../provider/provider.entity";
import { TemplateBaseEntity } from "../template-base";


export class PortalEntity {
    constructor(
        public readonly id: string,
        public readonly createdAt: Date | null,
        public readonly updatedAt: Date | null,
        public readonly domain: string | null,
        public readonly key: string | null,
        public readonly cRestClientId: string | null,
        public readonly cRestClientSecret: string | null,
        public readonly cRestWebHookUrl: string | null,
        public readonly number: number,
        public readonly providers: ProviderEntity[] | null,
        public readonly templates: TemplateBaseEntity[] | null,
    ) { }
} 