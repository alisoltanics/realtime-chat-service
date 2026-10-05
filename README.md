# چت متنی بلادرنگ — MVP

یک چت متنی واقعی‌زمان با سه سرویس مستقل: API با Django، لایهٔ WebSocket با Node.js و
فرانت‌اند React. پیام‌ها در PostgreSQL ذخیره می‌شوند، وضعیت آنلاین در حافظه نگهداری
می‌شود و هیچ Redis/Kafka/Channels در این نسخه وجود ندارد.

```
┌──────────────┐   REST (JWT)   ┌──────────────┐   ORM    ┌────────────┐
│   frontend   │───────────────▶│  django-api  │─────────▶│ postgres   │
│ React + MUI  │                │  DRF + JWT   │          │            │
│              │◀───────────────▶│              │◀─────────│            │
└──────────────┘  Socket.IO      └──────▲───────┘          └────────────┘
                 (WebSocket)           │ internal API
┌──────────────┐                        │
│   realtime   │────────────────────────┘
│ Node + Socket │
└──────────────┘
```

## اجرا

```bash
cp .env.example .env          # سپس DJANGO_SECRET_KEY و INTERNAL_SERVICE_TOKEN را عوض کنید
docker compose up -d --build
docker compose exec django-api python manage.py seed_demo --messages 80   # اختیاری: دادهٔ نمونه
```

| سرویس | آدرس پیش‌فرض | متغیر پورت |
|-------|---------------|-------------|
| frontend | http://localhost:5173 | `FRONTEND_PORT` |
| django-api | http://localhost:8000 | `DJANGO_API_PORT` |
| realtime | http://localhost:4000 | `REALTIME_PORT` |
| postgres | localhost:5433 | `POSTGRES_PORT_HOST` |

کاربران ساخته‌شده توسط `seed_demo`: `ali / ali12345` و `sara / sara12345`.

تست دستی دو کاربر: صفحه را در دو مرورگر جدا باز کنید، با این دو کاربر وارد شوید و هر دو
وارد «عمومی» شوید. پیام‌ها بدون رفرش می‌رسند، شمارندهٔ آنلاین‌ها بین دو صفحه مشترک است و
با بستن یک تب به‌روزرسانی می‌شود.

## تست

```bash
# واحد و یکپارچهٔ Django (داخل کانتینر، روی دیتابیس تستی)
docker compose exec -T django-api python manage.py test chat -v 2

# واحد سرویس realtime
docker compose exec -T realtime npm test

# سرتاسری با دو کاربر واقعی روی سرویس‌های در حال اجرا
docker compose --profile test run --rm smoke
```

اجرای smoke نیازمند وجود کاربران نمونه است (`seed_demo`). این تست هشت گام را می‌سنجد:
ورود، رد اتصال بدون توکن، join و presence، تحویل زندهٔ پیام، idempotency، صفحه‌بندی
تاریخچه، اشتراک اتاق خصوصی توسط ادمین و حذف presence هنگام قطع اتصال.

## ساختار پروژه

```
backend/            Django + DRF (auth، اتاق‌ها، پیام‌ها، endpointهای داخلی)
  chat/models.py    Room، Membership، Message
  chat/views.py     API عمومی و داخلی
  chat/tests/       ۳۵ تست
realtime/           Node.js + Socket.IO
  src/socketHandlers.js   احراز هویت اتاق و fan-out پیام
  src/presence.js         حضور در حافظه با TTL
  src/heartbeat.js        نگه‌داشتن TTL حضور
  tests/           ۱۴ تست
  scripts/smoke_test.mjs  تست دو کاربر
frontend/           React + MUI + TanStack Query
docs/API_CONTRACT.md قرارداد REST و رویدادهای WebSocket
docs/DECISIONS.md   تصمیم‌های معماری و بده‌بستان‌ها
```

## تصمیم‌های کلیدی

- **بدون Channels:** ترمینیشن WebSocket در سرویس Node است. Django فقط HTTP است و منبع
  حقیقت برای داده.
- **ذخیره قبل از انتشار:** Node پیام را از طریق API داخلی Django ذخیره می‌کند و سپس نسخهٔ
  ذخیره‌شده را پخش می‌کند؛ کاربر هرگز نسخهٔ تأییدنشده را نمی‌بیند.
- **هویت از سمت سرور:** `sender` در پیام ارسالی مرورگر پذیرفته نمی‌شود؛ سرویس realtime
  از JWT، کاربر را تأیید و سپس ذخیره می‌کند.
- **idempotency:** هر پیام یک `client_id` دارد و قید یکتای `(room, sender, client_id)`
  ارسال دوباره را به یک پیام تبدیل می‌کند؛ فرانت‌اند هم با `message.id` از نمایش تکراری
  جلوگیری می‌کند.
- **صفحه‌بندی keyset:** به‌جای `OFFSET` از `before_id` استفاده می‌شود تا با رشد جدول
  جابه‌جایی پیام رخ ندهد.
- **حضور در حافظه:** `Map` داخل هر پروسس، با TTL و sweep. برای چند نود باید به Redis منتقل
  شود.

جزئیات و بده‌بستان‌ها در `docs/DECISIONS.md` آمده است.

## تنظیمات

همهٔ تنظیمات از طریق متغیر محیطی اعمال می‌شوند (`.env.example` را ببینید):

| متغیر | پیش‌فرض | کاربرد |
|-------|---------|--------|
| `DJANGO_SECRET_KEY` | — | **در محیط واقعی حتماً تغییر کند** |
| `INTERNAL_SERVICE_TOKEN` | — | توکن مشترک بین Django و سرویس realtime |
| `CORS_ALLOWED_ORIGINS` | — | originهای مجاز فرانت‌اند |
| `MAX_MESSAGE_LENGTH` | `4000` | حداکثر طول پیام |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX_MESSAGES` | `10000` / `20` | محدودیت نرخ ارسال به‌ازای هر سوکت |
| `PRESENCE_TTL_MS` | `90000` | عمر حضور بدون heartbeat |
| `PRESENCE_SWEEP_INTERVAL_MS` | `15000` | بازهٔ پاک‌سازی حضور |
| `HEARTBEAT_INTERVAL_MS` | `25000` | بازهٔ نگه‌داشتن TTL حضور |

`PRESENCE_TTL_MS` باید به‌وضوح بزرگ‌تر از `HEARTBEAT_INTERVAL_MS` باشد، چون heartbeat
همان چیزی است که TTL یک اتصال سالم را تازه می‌کند.

## سلامت و لاگ

- `GET /healthz` روی هر سرویس: سرویس realtime علاوه بر وضعیت خود، دسترسی به Django را هم
  بررسی می‌کند و در صورت قطع بودن `503` می‌دهد.
- `GET /readyz` و `GET /presence?room=<slug>` برای بررسی و مشاهدهٔ حضور.
- لاگ هر سرویس JSON در یک خط است و شامل `request_id` می‌شود. **متن پیام و توکن‌ها هرگز
  لاگ نمی‌شوند**؛ لاگ فقط طول متن را ثبت می‌کند.

## محدودیت‌های شناخته‌شده

- حضور فقط در حافظهٔ یک نود است؛ با چند نمونه باید به Redis منتقل شود.
- پیام ویرایش/حذف، پیوست و اعلان push پیاده‌سازی نشده است.
- افزودن عضو به اتاق خصوصی فقط از طریق API (`POST /api/rooms/<slug>/members/`) انجام
  می‌شود و در رابط کاربری دکمهٔ دعوت وجود ندارد.
- توکن دسترسی در `localStorage` مرورگر نگهداری می‌شود؛ برای انتشار عمومی باید به
  `httpOnly cookie` یا refresh چرخشی مهاجرت کرد.