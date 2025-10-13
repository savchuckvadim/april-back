# Bitrix Setup App API Documentation

## Обзор

Модуль `Bitrix Setup App` предоставляет REST API для управления приложениями Bitrix24. Модуль включает в себя полную типизацию, валидацию данных и Swagger документацию.

## Структура модуля

```
src/modules/bitrix-setup/app/
├── controllers/
│   └── bitrix-app.controller.ts    # REST API контроллер
├── services/
│   └── bitrix-app.service.ts       # Бизнес-логика
├── repositories/
│   ├── bitrix-app.repository.ts    # Абстрактный репозиторий
│   └── bitrix-app.prisma.repository.ts # Prisma реализация
├── dto/
│   └── bitrix-app.dto.ts           # DTO для валидации
├── model/
│   └── bitrix-app.model.ts         # Модели и интерфейсы
└── app.module.ts                   # NestJS модуль
```

## API Endpoints

### 1. Создать или обновить приложение

**POST** `/bitrix-app/store-or-update`

Создает новое приложение или обновляет существующее.

#### Запрос:
```json
{
  "domain": "example.bitrix24.ru",
  "code": "my_app",
  "group": "crm",
  "type": "webhook",
  "status": "active"
}
```

#### Ответ:
```json
{
  "resultCode": 0,
  "data": {
    "message": "App created successfully",
    "app_id": 1,
    "app": {
      "id": 1,
      "portal_id": 1,
      "group": "crm",
      "type": "webhook",
      "code": "my_app",
      "status": "active",
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    },
    "domain": "example.bitrix24.ru"
  }
}
```

### 2. Получить приложение

**GET** `/bitrix-app/get?domain=example.bitrix24.ru&code=my_app`

Получает информацию о приложении по домену и коду.

#### Ответ:
```json
{
  "resultCode": 0,
  "data": {
    "id": 1,
    "portal_id": 1,
    "group": "crm",
    "type": "webhook",
    "code": "my_app",
    "status": "active",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z",
    "portal": {
      "id": 1,
      "domain": "example.bitrix24.ru"
    }
  }
}
```

### 3. Получить все приложения

**GET** `/bitrix-app/all`

Получает список всех приложений в системе.

#### Ответ:
```json
{
  "success": true,
  "result": [
    {
      "id": 1,
      "portal_id": 1,
      "group": "crm",
      "type": "webhook",
      "code": "my_app",
      "status": "active",
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    },
    {
      "id": 2,
      "portal_id": 2,
      "group": "crm",
      "type": "application",
      "code": "another_app",
      "status": "inactive",
      "created_at": "2024-01-02T00:00:00.000Z",
      "updated_at": "2024-01-02T00:00:00.000Z"
    }
  ]
}
```

### 4. Получить приложения по порталу

**GET** `/bitrix-app/get-by-portal?domain=example.bitrix24.ru`

Получает все приложения для указанного портала.

#### Ответ:
```json
{
  "success": true,
  "result": {
    "apps": [
      {
        "id": 1,
        "portal_id": 1,
        "group": "crm",
        "type": "webhook",
        "code": "my_app",
        "status": "active",
        "created_at": "2024-01-01T00:00:00.000Z",
        "updated_at": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

### 5. Обновить приложение

**PUT** `/bitrix-app/:id`

Обновляет существующее приложение по ID.

#### Запрос:
```json
{
  "group": "crm",
  "type": "application",
  "status": "inactive"
}
```

#### Ответ:
```json
{
  "success": true,
  "result": {
    "id": 1,
    "portal_id": 1,
    "group": "crm",
    "type": "application",
    "code": "my_app",
    "status": "inactive",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
}
```

### 6. Удалить приложение

**DELETE** `/bitrix-app/:id`

Удаляет приложение по ID.

#### Ответ:
```json
{
  "success": true,
  "result": {
    "message": "App deleted successfully",
    "id": 1
  }
}
```

## Типы данных

### CreateBitrixAppDto
```typescript
{
  domain: string;      // Домен портала Bitrix24
  code: string;        // Уникальный код приложения
  group: string;       // Группа приложения
  type: string;        // Тип: 'webhook' | 'application' | 'bot' | 'widget'
  status: string;      // Статус: 'active' | 'inactive' | 'pending' | 'suspended'
}
```

### UpdateBitrixAppDto
```typescript
{
  group?: string;      // Группа приложения (опционально)
  type?: string;       // Тип приложения (опционально)
  status?: string;     // Статус приложения (опционально)
}
```

### GetBitrixAppDto
```typescript
{
  domain: string;      // Домен портала Bitrix24
  code: string;        // Код приложения
}
```

## Валидация

Все DTO включают в себя валидацию с использованием `class-validator`:

- `@IsString()` - проверка типа string
- `@IsNotEmpty()` - проверка на пустоту
- `@IsIn()` - проверка на вхождение в список допустимых значений
- `@IsOptional()` - опциональные поля

## Swagger документация

Модуль полностью документирован с использованием Swagger:

- `@ApiTags()` - группировка endpoints
- `@ApiOperation()` - описание операций
- `@ApiResponse()` - описание ответов
- `@ApiBody()` - описание тела запроса
- `@ApiParam()` - описание параметров пути
- `@ApiQuery()` - описание query параметров
- `@ApiProperty()` - описание свойств DTO

## Обработка ответов

Все ответы автоматически обрабатываются существующими interceptors и filters из `src/core/`:

### Успешный ответ (ResponseInterceptor):
```json
{
  "resultCode": 0,
  "data": { ... }
}
```

### Ответ с ошибкой (глобальные фильтры):
```json
{
  "resultCode": 1,
  "message": "Описание ошибки"
}
```

**Примечание**: Все ответы автоматически оборачиваются в стандартный формат через `ResponseInterceptor` из `src/core/interceptors/response.interceptor.ts`. Ошибки обрабатываются глобальными фильтрами из `src/core/filters`.

## Коды ошибок

- `400 Bad Request` - Некорректные данные запроса
- `404 Not Found` - Ресурс не найден
- `500 Internal Server Error` - Внутренняя ошибка сервера

## Шифрование

Модуль включает методы шифрования/дешифрования для работы с чувствительными данными:

- `encrypt(text: string): string` - шифрование текста
- `decrypt(encryptedText: string): string` - дешифрование текста

Используется алгоритм AES-256-CBC с ключом из переменной окружения `APP_KEY`.

## Зависимости

- `@nestjs/common` - Основные декораторы NestJS
- `@nestjs/swagger` - Swagger документация
- `class-validator` - Валидация DTO
- `class-transformer` - Трансформация данных
- `crypto` - Шифрование данных
- `PrismaService` - Работа с базой данных
