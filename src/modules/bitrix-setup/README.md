# Bitrix Setup Module

Этот модуль предоставляет функциональность для работы с Bitrix приложениями, токенами, размещениями и настройками в NestJS приложении.

## Структура модуля

```
src/modules/bitrix-setup/
├── app/                           # Модуль приложений
│   ├── controllers/
│   │   └── bitrix-app.controller.ts
│   ├── dto/
│   │   └── bitrix-app.dto.ts
│   ├── model/
│   │   └── bitrix-app.model.ts
│   ├── repositories/
│   │   ├── bitrix-app.repository.ts
│   │   └── bitrix-app.prisma.repository.ts
│   ├── services/
│   │   └── bitrix-app.service.ts
│   └── app.module.ts
├── token/                         # Модуль токенов
│   ├── controllers/
│   │   └── bitrix-token.controller.ts
│   ├── dto/
│   │   └── bitrix-token.dto.ts
│   ├── model/
│   │   └── bitrix-token.model.ts
│   ├── repositories/
│   │   ├── bitrix-token.repository.ts
│   │   └── bitrix-token.prisma.repository.ts
│   ├── services/
│   │   └── bitrix-token.service.ts
│   └── token.module.ts
├── secret/                        # Модуль секретов
│   ├── controllers/
│   │   └── bitrix-secret.controller.ts
│   ├── dto/
│   │   └── bitrix-secret.dto.ts
│   ├── model/
│   │   └── bitrix-secret.model.ts
│   ├── repositories/
│   │   ├── bitrix-secret.repository.ts
│   │   └── bitrix-secret.prisma.repository.ts
│   ├── services/
│   │   └── bitrix-secret.service.ts
│   └── secret.module.ts
├── placement/                     # Модуль размещений
│   ├── controllers/
│   │   └── bitrix-placement.controller.ts
│   ├── dto/
│   │   └── bitrix-placement.dto.ts
│   ├── model/
│   │   └── bitrix-placement.model.ts
│   ├── repositories/
│   │   ├── bitrix-placement.repository.ts
│   │   └── bitrix-placement.prisma.repository.ts
│   ├── services/
│   │   └── bitrix-placement.service.ts
│   └── placement.module.ts
├── setting/                       # Модуль настроек
│   ├── controllers/
│   │   └── bitrix-setting.controller.ts
│   ├── dto/
│   │   └── bitrix-setting.dto.ts
│   ├── enums/
│   │   └── bitrix-setting-type.enum.ts
│   ├── model/
│   │   └── bitrix-setting.model.ts
│   ├── repositories/
│   │   ├── bitrix-setting.repository.ts
│   │   └── bitrix-setting.prisma.repository.ts
│   ├── services/
│   │   └── bitrix-setting.service.ts
│   └── setting.module.ts
└── bitrix-setup.module.ts         # Главный модуль
```

## API Endpoints

### App Module (`/bitrix-app`)

#### POST `/bitrix-app/store-or-update`
Создает или обновляет Bitrix приложение.

**Тело запроса:**
```json
{
  "domain": "example.bitrix24.ru",
  "code": "app_code",
  "group": "app_group",
  "type": "app_type",
  "status": "active"
}
```

#### GET `/bitrix-app/get`
Получает Bitrix приложение по коду и домену.

**Параметры запроса:**
- `domain`: string - домен портала
- `code`: string - код приложения

#### GET `/bitrix-app/all`
Получает все Bitrix приложения.

#### GET `/bitrix-app/get-by-portal`
Получает все приложения портала.

**Параметры запроса:**
- `domain`: string - домен портала
- `code`: string - код приложения

### Token Module (`/bitrix-token`)

#### POST `/bitrix-token/store-or-update`
Создает или обновляет токен Bitrix приложения.

**Тело запроса:**
```json
{
  "domain": "example.bitrix24.ru",
  "code": "app_code",
  "group": "app_group",
  "type": "app_type",
  "status": "active",
  "token": {
    "access_token": "access_token_value",
    "refresh_token": "refresh_token_value",
    "expires_at": "2024-12-31T23:59:59Z",
    "application_token": "application_token_value",
    "member_id": "member_id_value"
  }
}
```

#### GET `/bitrix-token/get`
Получает токен приложения по коду и домену.

**Параметры запроса:**
- `domain`: string - домен портала
- `code`: string - код приложения

### Secret Module (`/bitrix-secret`)

#### POST `/bitrix-secret/store-or-update`
Создает или обновляет секреты Bitrix приложения.

**Тело запроса:**
```json
{
  "code": "app_code",
  "group": "app_group",
  "type": "app_type",
  "client_id": "client_id_value",
  "client_secret": "client_secret_value"
}
```

#### GET `/bitrix-secret/get-by-code`
Получает секреты приложения по коду.

**Параметры запроса:**
- `code`: string - код приложения

### Placement Module (`/bitrix-placement`)

#### POST `/bitrix-placement/store`
Создает размещения для Bitrix приложения.

**Тело запроса:**
```json
{
  "domain": "example.bitrix24.ru",
  "code": "app_code",
  "placements": [
    {
      "code": "placement_code",
      "type": "placement_type",
      "group": "placement_group",
      "status": "active",
      "bitrix_heandler": "handler_url",
      "public_heandler": "public_handler_url",
      "bitrix_codes": "bitrix_codes"
    }
  ]
}
```

#### GET `/bitrix-placement/get-by-app/:appId`
Получает размещения приложения по ID.

#### DELETE `/bitrix-placement/delete-by-app/:appId`
Удаляет все размещения приложения.

#### DELETE `/bitrix-placement/delete/:id`
Удаляет конкретное размещение.

### Setting Module (`/bitrix-setting`)

#### POST `/bitrix-setting/store`
Создает настройку.

**Тело запроса:**
```json
{
  "settingable_type": "BitrixApp",
  "code": "setting_code",
  "type": "string",
  "status": "active",
  "title": "Setting Title",
  "description": "Setting Description",
  "value": "setting_value"
}
```

**Параметры запроса:**
- `settingable_id`: string - ID связанной сущности

#### GET `/bitrix-setting/get-by-settingable`
Получает настройки по связанной сущности.

**Параметры запроса:**
- `settingable_id`: string - ID связанной сущности
- `settingable_type`: string - тип связанной сущности

#### PUT `/bitrix-setting/update/:id`
Обновляет настройку.

#### DELETE `/bitrix-setting/delete/:id`
Удаляет настройку.

## Типы настроек

- `checkbox` - булево значение
- `number` - числовое значение
- `json` - JSON объект
- `string` - строковое значение

## Шифрование

Все чувствительные данные (токены, client_id, client_secret) автоматически шифруются при сохранении и расшифровываются при получении.

## Использование

1. Импортируйте `BitrixSetupModule` в ваш основной модуль
2. Используйте `BitrixSetupAppService` для работы с данными
3. Все API endpoints готовы к использованию

## Пример использования в коде

```typescript
import { BitrixSetupAppService } from './modules/bitrix-setup/app/services/bitrix-setup-app.service';

@Injectable()
export class SomeService {
  constructor(
    private readonly bitrixSetupAppService: BitrixSetupAppService
  ) {}

  async createApp() {
    const result = await this.bitrixSetupAppService.storeOrUpdateApp({
      domain: 'example.bitrix24.ru',
      code: 'my_app',
      group: 'my_group',
      type: 'my_type',
      status: 'active',
      token: {
        access_token: 'token',
        refresh_token: 'refresh',
        expires_at: '2024-12-31T23:59:59Z',
        application_token: 'app_token',
        member_id: 'member_id'
      }
    });

    return result;
  }
}
```
