
import { BXApiSchema } from "../schema/bitirix-api.schema";

export type TBXRequest<
    NAMESPACE extends keyof BXApiSchema,
    ENTITY extends keyof BXApiSchema[NAMESPACE],
    METHOD extends keyof BXApiSchema[NAMESPACE][ENTITY]
> = 'request' extends keyof BXApiSchema[NAMESPACE][ENTITY][METHOD]
    ? BXApiSchema[NAMESPACE][ENTITY][METHOD]['request']
    : never;

export type TBXResponse<
    NAMESPACE extends keyof BXApiSchema,
    ENTITY extends keyof BXApiSchema[NAMESPACE],
    METHOD extends keyof BXApiSchema[NAMESPACE][ENTITY]
> = 'response' extends keyof BXApiSchema[NAMESPACE][ENTITY][METHOD]
    ? BXApiSchema[NAMESPACE][ENTITY][METHOD]['response']
    : never;