// Публичная поверхность слайса. DTO наружу не экспортируются (как у анкет):
// контроллерам они нужны по глубокому пути
// '@lib/portal-lib/store/badges/portal-badges.dto', а прикладному коду —
// сервис, реестр, общий набор и типы.
export * from './portal-badges.schema';
export { DEFAULT_BADGES } from './portal-badges.defaults';
export { parseBadgeDocument, parseBadgeRecord } from './portal-badges.document';
export * from './portal-badges.repository';
export {
    PortalBadgesService,
    BadgeDraft,
    PortalBadgesSaveInput,
    BadgeCatalogPayload,
    PortalBadgesAdminPayload,
} from './portal-badges.service';
export { PortalBadgesModule } from './portal-badges.module';
export { PortalBadgesAdminModule } from './portal-badges.admin.module';
