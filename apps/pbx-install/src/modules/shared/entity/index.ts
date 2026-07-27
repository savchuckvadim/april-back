export * from './field/portal-field-entity-install.service';
export * from './field/bx-entity-field-install.service';
export * from './field/bx-entity-field-manage.service';
// Инсталл user-полей переехал в общую либу (pbx-install + kpi-report-sales)
export {
    AbstractBxFieldsInstallService,
    BxUserFieldsInstallService,
    USER_FIELD_PREFIX,
    type IBxFieldsInstallResult,
    type IBxInstalledFieldResult,
} from '@lib/pbx-user-fields';
export * from './field/bx-task-fields-install.service';
export * from './field/bx-task-field-manage.service';
export * from './field/bx-user-field-manage.service';
export * from './install-entity.module';
export * from './dto/manage-entity-field.dto';
export * from './dto/delete-bx-fields-by-codes.dto';
