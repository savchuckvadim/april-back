контроллер
ендпоинты пытаются отдавать закэшированные данные по department что бы каждый раз не дергать битрикс

но иногда надо сбросить кэш

СДЕЛАНО (2026-07-24):
- все эндпоинты (`bx/department`, `bitrix/department/sales`, `bx/team`, `bx/department/structure`)
  принимают необязательный `resetCache: boolean` — кэш игнорируется и перезаписывается свежими данными
- `POST bx/department/cache/reset` — сброс кэша по домену (`{ domain }`) или по всем порталам (пустое тело);
  см. BxDepartmentCacheService (SCAN по паттернам, не KEYS)
