# DTO Conventions

Правила оформления DTO-классов в проекте `april-next/back`.
Эталон, на котором основан этот документ — [parse-field.dto.ts](../src/modules/install/shared/parse-field-excel/dto/parse-field.dto.ts).

DTO в проекте решают **две задачи одновременно**:

1. Документация API (Swagger / OpenAPI) через `@nestjs/swagger`.
2. Runtime-валидация входящих запросов через `class-validator` + `class-transformer`.

Поэтому каждое поле DTO почти всегда несёт **минимум два декоратора**: `@ApiProperty(...)` и валидатор.

---

## 1. Расположение и именование

- Файлы лежат в директории `dto/` рядом с модулем / use-case, который их использует.
  Пример: [src/modules/install/shared/parse-field-excel/dto/parse-field.dto.ts](../src/modules/install/shared/parse-field-excel/dto/parse-field.dto.ts).
- Имя файла — `<область>.dto.ts` в kebab-case (`create-bitrixfield.dto.ts`, `parse-field.dto.ts`).
- Имя класса — PascalCase + суффикс `Dto`: `InstallEntityFieldDto`, `ListItemDto`.
- Bulk-варианты получают суффикс `BulkDto` или префикс `Create/Update`: `InstallEntityFieldsBulkDto`, `CreateBitrixFieldsBulkDto`.

## 2. Имплементация доменного типа

Если DTO повторяет существующий доменный интерфейс — пометьте это через `implements`:

```ts
export class InstallEntityFieldDto implements Field { ... }
export class ListItemDto implements ListItem { ... }
```

Это даёт компилятору гарантию, что DTO не уезжает от модели, и подсветит расхождение, как только интерфейс изменится.

## 3. `@ApiProperty` — обязательное полное описание

Каждое публичное поле документируется. Минимальный набор атрибутов:

| Атрибут       | Когда обязателен                                                 |
| ------------- | ---------------------------------------------------------------- |
| `description` | **Всегда.** Полное предложение на русском, с большой буквы.      |
| `example`     | Всегда, кроме случая когда указан `enum` с очевидным дефолтом.   |
| `type`        | Всегда для скаляров и массивов. Указывайте конструктор: `String`, `Number`, `Boolean`, либо класс. |
| `enum`        | Для полей с фиксированным набором значений.                      |
| `required`    | `false` — для опциональных полей (или используйте `@ApiPropertyOptional`). |
| `minimum` / `maximum` | Для числовых полей с явными границами.                   |
| `default`     | Если есть осмысленное значение по умолчанию.                     |

### 3.1 `type` — это **значение**, а не TS-тип

Самая частая ошибка — передать в `type` TS-алиас:

```ts
// ❌ TS2693: 'FieldType' only refers to a type, but is being used as a value here.
@ApiProperty({ type: FieldType })
type: FieldType;
```

Swagger требует runtime-значение. Допустимо:

- Конструктор-примитив: `String`, `Number`, `Boolean`.
- Класс DTO: `ListItemDto`, `[ListItemDto]` для массивов.
- Для union-типов из литералов — используйте `enum: SOME_RUNTIME_ARRAY`,
  а само поле помечайте `type: String` (или опускайте `type`).

```ts
// ✅
@ApiProperty({ type: String, enum: FIELD_TYPE_VALUES, example: 'enumeration' })
@IsString()
@IsIn(FIELD_TYPE_VALUES as unknown as string[])
type: FieldType;
```

### 3.2 Описание должно отвечать на «что» и «зачем»

Плохо: `description: 'Тип поля'` — повторяет имя свойства.
Хорошо: даёт контекст использования, перечисляет связанные ограничения, поясняет неочевидные инварианты.

```ts
@ApiProperty({
    description:
        'Тип поля Bitrix. Соответствует одному из значений ' +
        '`PbxSalesEventFieldType | PbxSalesKonstructorFieldType`. ' +
        'Определяет, как поле будет создано в портале (UF_*).',
    example: 'enumeration',
    enum: FIELD_TYPE_VALUES,
})
```

### 3.3 Опциональные поля

Два равноправных стиля, выбирайте один на DTO:

```ts
// Стиль A — явный required:false
@ApiProperty({ description: '…', required: false, type: [ListItemDto] })
@IsOptional()
list?: ListItem[];

// Стиль B — отдельный декоратор
@ApiPropertyOptional({ description: '…', type: [ListItemDto] })
@IsOptional()
list?: ListItem[];
```

## 4. Валидация — обязательно

Каждое поле получает валидатор `class-validator`. Без валидатора `ValidationPipe`
поле **пройдёт молча** и попадёт в use-case в любом виде.

### 4.1 Базовые валидаторы по типам

| Тип поля        | Декораторы                                            |
| --------------- | ----------------------------------------------------- |
| `string`        | `@IsString()` + `@IsNotEmpty()` если непустая         |
| `number` (целое)| `@IsInt()` + `@Min(0)` если неотрицательное           |
| `number` (любое)| `@IsNumber()`                                         |
| `boolean`       | `@IsBoolean()`                                        |
| Литералы союза  | `@IsString()` + `@IsIn([...])`                        |
| `'Y' \| 'N'`    | `@IsString()` + `@IsIn(['Y', 'N'])`                   |
| Дата ISO        | `@IsISO8601()` или `@IsDateString()`                  |
| Массив скаляров | `@IsArray()` + `@IsString({ each: true })` и т.д.     |
| Массив объектов | `@IsArray()` + `@ValidateNested({ each: true })` + `@Type(() => InnerDto)` |
| Опциональное    | `@IsOptional()` **первым** среди валидаторов          |

### 4.2 Вложенные DTO

Для массивов и объектов с собственной структурой обязательны **оба** декоратора:

```ts
@ApiProperty({ type: [ListItemDto] })
@IsArray()
@ValidateNested({ each: true })
@Type(() => ListItemDto)   // ← без этого class-transformer не превратит JSON в инстанс
list: ListItemDto[];
```

Забыть `@Type(...)` — типичный баг: валидация молча пропускает любые объекты.

### 4.3 Bulk-обёртки

Для эндпоинтов, принимающих массив, делайте отдельный DTO-обёртку — это
позволяет добавить ограничения уровня коллекции (`@ArrayMinSize`,
`@ArrayMaxSize`) и удобнее документируется в Swagger:

```ts
export class InstallEntityFieldsBulkDto {
    @ApiProperty({ type: [InstallEntityFieldDto] })
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => InstallEntityFieldDto)
    fields: InstallEntityFieldDto[];
}
```

## 5. Runtime-константы для union-литералов

Если есть `type FieldType = 'a' | 'b' | 'c'`, заведите **runtime-массив**:

```ts
export const FIELD_TYPE_VALUES = [
    'string',
    'integer',
    'boolean',
    'date',
    // …
] as const satisfies readonly FieldType[];
```

Это даёт сразу три преимущества:

1. `satisfies readonly FieldType[]` ловит расхождение с union в момент изменения исходного типа.
2. Массив используется в `@IsIn(FIELD_TYPE_VALUES as unknown as string[])` для рантайма.
3. Тот же массив идёт в `enum: FIELD_TYPE_VALUES` для Swagger.

Никогда не дублируйте список вручную в двух местах.

## 6. Порядок декораторов

Сверху вниз:

1. `@ApiProperty(...)` / `@ApiPropertyOptional(...)` — документация.
2. `@IsOptional()` — если применимо (он должен быть **первым** среди валидаторов).
3. `@Type(() => InnerDto)` — для вложенных структур (формально это `class-transformer`, но
   ставится среди валидаторов, чтобы `ValidateNested` мог им воспользоваться).
4. Структурные валидаторы: `@IsArray()`, `@ValidateNested(...)`.
5. Типовые валидаторы: `@IsString()`, `@IsInt()`, `@IsBoolean()`, …
6. Уточняющие валидаторы: `@IsNotEmpty()`, `@IsIn(...)`, `@Min(...)`, `@MaxLength(...)`, …

## 7. Чек-лист перед мерджем

- [ ] Каждое поле имеет `@ApiProperty` с `description` (полное предложение).
- [ ] У всех нелогически-очевидных полей задан `example`.
- [ ] Нет `type: SomeTsAlias` — только runtime-значения.
- [ ] Каждое поле имеет валидатор `class-validator`.
- [ ] Вложенные массивы/объекты обёрнуты `@ValidateNested` + `@Type(() => …)`.
- [ ] Опциональные поля помечены `@IsOptional()` и `required: false` / `@ApiPropertyOptional`.
- [ ] Если DTO повторяет доменный интерфейс — есть `implements <Interface>`.
- [ ] Union-литералы покрыты runtime-константой с `satisfies`.
- [ ] `ValidationPipe` на эндпоинте включён с `{ whitelist: true, transform: true }`
      (обычно глобально — проверить в `main.ts` / `app.module.ts`).

## 8. Антипаттерны

- ❌ `@ApiProperty()` без аргументов — пустая документация бесполезна.
- ❌ `description: 'Имя'` — описание дублирует имя поля.
- ❌ DTO без единого `class-validator`-декоратора — ValidationPipe ничего не отсечёт.
- ❌ `@ValidateNested` без `@Type(() => …)` — молча пропускает любые объекты.
- ❌ Передача TS-типа в `type:` (`type: FieldType`) — ошибка TS2693 на сборке.
- ❌ Ручное дублирование набора литералов в `@IsIn([...])` и `enum: [...]` —
      расходятся при первом же изменении union.
- ❌ Опциональное поле с `@IsString()` без `@IsOptional()` — `undefined` упадёт в валидации.

## 9. Эталонные DTO

- [parse-field.dto.ts](../src/modules/install/shared/parse-field-excel/dto/parse-field.dto.ts) —
  полный пример: вложенный DTO + union-литералы + bulk-обёртка.
- [create-bitrixfields-bulk.dto.ts](../src/apps/admin/portal/bitrixfields/dto/create-bitrixfields-bulk.dto.ts) —
  минимальная bulk-обёртка.
- [offer-settings.dto.ts](../src/apps/konstructor/offer/dto/offer-settings.dto.ts) —
  глубокая вложенность с `@ValidateNested` по нескольким уровням.
