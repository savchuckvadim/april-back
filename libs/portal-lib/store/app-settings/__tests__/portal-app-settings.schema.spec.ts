import {
    EnumPortalAppCode,
    getPortalAppDefaults,
    getStoredAppSettingKeys,
    PORTAL_APP_CODES,
    PORTAL_APP_SETTINGS_SCHEMA,
    PortalAppSettingDescriptor,
} from '../portal-app-settings.schema';

/**
 * Граница реестра с фреймом «Звонки».
 *
 * Фронт (apps/event-sales/modules/app/consts/domain-config.ts) держит те же
 * ключи хардкодом по доменам и кладёт ответ `/app-settings/event-sales`
 * ПОВЕРХ него. Значения приезжают полным набором (дефолты кода слиты с
 * сохранённым), поэтому разошедшийся дефолт реестра молча меняет поведение
 * всех порталов, где ключ не задан: так `with_presentation_animate: false`
 * гасил эхо-кнопку везде, хотя фронт по умолчанию её включает. Тест
 * сторожит именно это: состав ключей, типы и дефолты должны совпадать с
 * фронтом.
 *
 * Вторая половина границы — признак «задано на портале» (storedKeys): он
 * позволяет фрейму применять только реально сохранённое. Как он считается
 * — в __tests__/portal-app-settings.service.spec.ts.
 */

/** Общий дефолт фронта (DEFAULT_CONFIG из domain-config.ts). */
const FRONT_DEFAULTS: Record<string, boolean | number> = {
    withNoPlan: false,
    withNoReschedle: false,
    withPostFail: false,
    withNoCall: false,
    withTM: false,
    withRecords: true,
    withTranscribation: false,
    withAI: false,
    withPresentationAnimate: true,
    withColorRequired: false,
    withCheckPresentation: false,
    withDepartmentModeToggle: false,
    withChecklistRefine: false,
    withChecklistPay: false,
    withChecklistDecision: false,
    withChecklistSale: false,
    withReportQuestions: false,
    withKonstructorSlider: false,
    taskGroupId: 1,
    bossId: 1,
};

/**
 * Единственное намеренное расхождение: у идентификаторов дефолт реестра 0 =
 * «не задано». Фрейм такие значения пропускает (PORTAL_ID_KEYS), поэтому
 * доменные группа задач и руководитель доживают до настройки портала.
 * Дефолт 1 был ловушкой — пустая настройка приезжала настоящей единицей и
 * уводила обзвон в чужую группу (инцидент 27.08).
 */
const ID_KEYS = ['taskGroupId', 'bossId'] as const;

const eventSales = PORTAL_APP_SETTINGS_SCHEMA[
    EnumPortalAppCode.eventSales
] as unknown as Record<string, PortalAppSettingDescriptor>;

describe('PORTAL_APP_SETTINGS_SCHEMA: контракт с фреймом event-sales', () => {
    it('каждый фронтовый ключ заведён в реестре', () => {
        const missing = Object.keys(FRONT_DEFAULTS).filter(
            key => !eventSales[key],
        );
        expect(missing).toEqual([]);
    });

    it('типы совпадают с типами фронтового конфига', () => {
        for (const [key, value] of Object.entries(FRONT_DEFAULTS)) {
            expect(`${key}:${eventSales[key].type}`).toBe(
                `${key}:${typeof value}`,
            );
        }
    });

    it('дефолты равны ОБЩЕМУ дефолту фронта, а не значению домена', () => {
        for (const [key, value] of Object.entries(FRONT_DEFAULTS)) {
            if ((ID_KEYS as readonly string[]).includes(key)) continue;
            expect(`${key}=${String(eventSales[key].default)}`).toBe(
                `${key}=${value}`,
            );
        }
    });

    it('идентификаторы приезжают нулями = «не задано» (инцидент 27.08)', () => {
        for (const key of ID_KEYS) {
            expect(eventSales[key].default).toBe(0);
        }
    });

    it('snake_case-коды уникальны внутри приложения', () => {
        const codes = Object.values(eventSales).map(
            descriptor => descriptor.code,
        );
        expect(new Set(codes).size).toBe(codes.length);
        for (const code of codes) {
            expect(code).toMatch(/^[a-z][a-z0-9_]*$/);
        }
    });

    it('у каждого ключа есть русское название и описание для админки', () => {
        for (const [key, descriptor] of Object.entries(eventSales)) {
            expect(`${key}:${descriptor.name.length > 0}`).toBe(`${key}:true`);
            expect(`${key}:${descriptor.description.length > 0}`).toBe(
                `${key}:true`,
            );
        }
    });

    it('значения — полным набором, «задано на портале» едет рядом', () => {
        // Дефолты кода по-прежнему приезжают наравне с сохранённым (ломать
        // нынешних потребителей нельзя), но теперь фрейму видно, чему
        // верить: storedKeys собирается по фактическому JSON портала, и
        // булев хардкод домена стал настоящим фолбэком.
        const defaults = getPortalAppDefaults(EnumPortalAppCode.eventSales);
        for (const key of Object.keys(FRONT_DEFAULTS)) {
            expect(`${key}:${key in defaults}`).toBe(`${key}:true`);
        }

        expect(
            getStoredAppSettingKeys(EnumPortalAppCode.eventSales, {
                with_tm: true,
            }),
        ).toEqual(['withTM']);
    });

    it('имя storedKeys свободно — с ключом реестра не столкнётся', () => {
        // Признак едет ПЛОСКО рядом со значениями (форму ответа менять
        // нельзя, старые фреймы читают ключи с верхнего уровня), поэтому
        // ни ключа схемы, ни snake_case-кода с таким именем быть не должно
        // ни в одном приложении.
        for (const appCode of PORTAL_APP_CODES) {
            const schema = PORTAL_APP_SETTINGS_SCHEMA[appCode] as Record<
                string,
                PortalAppSettingDescriptor
            >;
            for (const [key, descriptor] of Object.entries(schema)) {
                expect(`${appCode}.${key}`).not.toBe(`${appCode}.storedKeys`);
                expect(`${appCode}.${descriptor.code}`).not.toBe(
                    `${appCode}.storedKeys`,
                );
            }
        }
    });
});
