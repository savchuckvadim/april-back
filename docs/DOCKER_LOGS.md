Как смотреть логи
Для вашего текущего запуска (docker compose v2):
Все логи:
docker compose logs -f
Только Redis:
docker compose logs -f redis
Только API:
docker compose logs -f nest-api
Последние 200 строк:
docker compose logs --tail=200 redis
За последние 10 минут:
docker compose logs --since=10m nest-api
Или напрямую по контейнеру:
docker logs -f redis
docker logs -f nest-api
