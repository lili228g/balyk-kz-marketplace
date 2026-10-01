# Balyk.kz Marketplace Prototype

Современный прототип интернет-магазина морепродуктов на Node.js без внешних зависимостей.

## Запуск

```bash
npm run dev
```

Откройте `http://localhost:3000`.

## Что внутри

- `server.js` - простой Node.js сервер для локального запуска.
- `public/` - витрина магазина: каталог, поиск, карточка товара, корзина, оформление заказа, профиль.
- `database/schema.sql` - структура PostgreSQL.
- `database/seed.sql` - стартовые категории и товары для pgAdmin.

## PostgreSQL / pgAdmin

1. В pgAdmin выберите существующую базу `balykkz`.
2. Выполните `database/schema.sql`, затем `database/seed.sql`.
3. Создайте файл `.env` в корне проекта и укажите пользователя PostgreSQL:

```env
PGHOST=localhost
PGPORT=5432
PGDATABASE=balykkz
PGUSER=ваш_пользователь_pgadmin
PGPASSWORD=ваш_пароль
```

Либо задайте одну переменную `DATABASE_URL`. Пароль не нужно добавлять в git.

После этого запустите `npm run dev` и откройте `http://localhost:3000`.

Сервер автоматически применяет схему при запуске, читает каталог из PostgreSQL, сохраняет заказы, регистрирует пользователей и отдаёт историю заказов по номеру телефона.
