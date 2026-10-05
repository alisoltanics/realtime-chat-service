# قرارداد API و رویدادهای WebSocket

این سند شکل درخواست‌ها و پاسخ‌هایی را توضیح می‌دهد که Django، سرویس realtime و رابط کاربری با هم ردوبدل می‌کنند. بدنهٔ همهٔ درخواست‌ها و پاسخ‌ها JSON است. زمان‌ها با قالب ISO 8601 و منطقهٔ زمانی UTC برگردانده می‌شوند.

---

## ۰. قالب خطاها

همهٔ خطاهای REST، چه در کد برنامه ساخته شوند و چه DRF آن‌ها را برگرداند، از قالب زیر پیروی می‌کنند:

```json
{ "error": { "code": "not_found", "detail": "No Room matches the given query." } }
```

مقدار `detail` معمولاً یک رشته است. در خطاهای اعتبارسنجی، جزئیات به تفکیک فیلد برمی‌گردند؛ برای نمونه:
`{"text": ["This field may not be blank."]}` برمی‌گردد. کدهای پرکاربرد:
`not_authenticated`، `invalid_credentials`، `conflict`، `validation_error`،
`not_found`، `permission_denied`، `room_private`، `user_not_found`،
`invalid_cursor`، `service_token_invalid`.

---

## ۱. احراز هویت کاربران

برای دسترسی به endpointهای نیازمند ورود، توکن دسترسی را در هدر زیر بفرستید:

```
Authorization: Bearer <access_token>
```

| متد | مسیر | توضیح |
|-----|------|-------|
| POST | `/api/auth/register/` | `{username, password, display_name?}` → `201` با `user` و `access`/`refresh` |
| POST | `/api/auth/login/` | `{username, password}` → `200` با `user` و `access`/`refresh` |
| POST | `/api/auth/token/` | همان `login` با نام متداول simplejwt |
| POST | `/api/auth/refresh/` | `{refresh}` → `200` با `access` جدید |
| GET | `/api/auth/me/` | کاربر جاری |

پاسخ ورود:

```json
{ "user": { "id": 1, "username": "ali", "display_name": "علی" },
  "access": "eyJ...", "refresh": "eyJ..." }
```

توکن دسترسی پیش‌فرض ۳۰ دقیقه اعتبار دارد (`JWT_ACCESS_MINUTES`).

---

## ۲. اتاق‌ها

| متد | مسیر | توضیح |
|-----|------|-------|
| GET | `/api/rooms/` | اتاق‌های عمومی + اتاق‌های خصوصی که عضو آن هستید |
| POST | `/api/rooms/` | `{name, is_public?}` → سازنده `admin` می‌شود و عضو هم هست |
| GET | `/api/rooms/<slug>/` | جزئیات اتاق؛ غیرعضو اتاق خصوصی `403` |
| POST | `/api/rooms/<slug>/join/` | عضویت در اتاق عمومی |
| POST | `/api/rooms/<slug>/leave/` | خروج از اتاق |
| GET | `/api/rooms/<slug>/members/` | اعضا (فقط برای کسانی که `can_read` دارند) |
| POST | `/api/rooms/<slug>/members/` | **افزودن عضو، فقط ادمین اتاق**: `{username}` یا `{user_id}` |
| GET | `/api/rooms/<slug>/messages/` | تاریخچهٔ پیام‌ها (صفحه‌بندی keyset) |
| POST | `/api/rooms/<slug>/messages/` | مسیر جایگزین REST برای ارسال پیام |

مقدار `slug` به‌طور خودکار از `name` ساخته می‌شود و در میان اتاق‌ها یکتا است.

### شکل اتاق

```json
{ "id": 3, "name": "عمومی", "slug": "general", "is_public": true, "created_at": "...",
  "member_count": 2, "last_message": { "text": "سلام", "sender": "ali", "created_at": "..." } }
```

### دریافت تاریخچه با صفحه‌بندی

```
GET /api/rooms/<slug>/messages/?limit=30&before_id=1234
```

پیام‌ها بر اساس `id` نزولی انتخاب می‌شوند، اما پاسخ آن‌ها را **از قدیمی به جدید** مرتب می‌کند. بنابراین آخرین مورد فهرست، جدیدترین پیام همان صفحه است:

```json
{ "results": [ { "id": 3, "room": 1, "sender": { "id": 1, "username": "ali" },
                 "sender_username": "ali", "text": "سلام", "client_id": "abc",
                 "created_at": "..." } ],
  "has_more": true,
  "next_before_id": 3 }
```

برای دریافت صفحهٔ قدیمی‌تر، مقدار `next_before_id` پاسخ را در درخواست بعدی به‌عنوان `before_id` بفرستید. وقتی `has_more` برابر `false` باشد، مقدار `next_before_id` برابر `null` است.

- `limit` پیش‌فرض ۳۰، بیشینه ۱۰۰.
- `before_id` نامعتبر → `400` با `{"error": {"code": "invalid_cursor"}}`.

### ارسال پیام از راه REST

```
POST /api/rooms/<slug>/messages/
{ "text": "سلام", "client_id": "web-1712-ab" }
```

- پاسخ `201` یعنی پیام تازه‌ای ساخته شده است. پاسخ `200` یعنی پیام دیگری با همان `client_id` قبلاً ثبت شده و همان پیام برگردانده شده است.
- اگر `client_id` ارسال نشود یا خالی باشد، هر درخواست پیام تازه‌ای می‌سازد؛ در این حالت امکان تشخیص ارسال تکراری وجود ندارد.

---

## ۳. API داخلی سرویس realtime

این endpointها فقط برای ارتباط سرویس realtime با Django هستند و با هدر زیر محافظت می‌شوند:

```
X-Service-Token: <INTERNAL_SERVICE_TOKEN>
```

اگر هدر وجود نداشته باشد یا توکن آن معتبر نباشد، پاسخ `403` برمی‌گردد:
`{"error": {"code": "service_token_invalid"}}`.

| متد | مسیر | کاربرد |
|-----|------|--------|
| POST | `/api/internal/verify-token/` | `{token}` → هویت کاربر یا `401` |
| POST | `/api/internal/authorize-room/` | `{token, room}` → هویت + مجوز اتاق یا `403` |
| POST | `/api/internal/messages/` | ذخیرهٔ پیام با `sender` تعیین‌شده توسط سرور |
| GET | `/api/internal/room-members/?room=<slug>` | شناسهٔ اعضای اتاق برای presence |

`verify-token`:

```json
// 200
{ "user": { "id": 1, "username": "ali", "display_name": "علی" } }
// 400  توکن نیامده  |  401  توکن نامعتبر یا منقضی
{ "error": { "code": "invalid_token", "detail": "..." } }
```

درخواست معتبر به `authorize-room` پاسخ `200` می‌گیرد. اطلاعات مجوز در بدنهٔ پاسخ است و سرویس realtime بر اساس مقدار `can_read` تصمیم می‌گیرد:

```json
{ "user": { "id": 1, "username": "ali", "display_name": "علی" },
  "room": { "id": 1, "slug": "general", "name": "عمومی", "is_public": true },
  "access": { "can_read": true, "is_member": true } }
```

`room-members` اتاق را با `slug` پیدا می‌کند و `room_id` و `member_ids` را برمی‌گرداند.

در `internal/messages`، شناسهٔ فرستنده در بدنهٔ درخواست قرار دارد. این مسیر فقط با توکن داخلی در دسترس سرویس realtime است و کاربر عادی نمی‌تواند آن را فراخوانی کند:

```json
// درخواست
{ "room_id": 1, "sender_id": 1, "text": "سلام", "client_id": "web-1712-ab" }
// پاسخ
{ "created": true, "message": { "id": 42, "...": "..." } }
```

`created: false` یعنی پیام با همان `client_id` قبلاً ذخیره شده و همان پیام برگردانده
می‌شود.

---

## ۴. رویدادهای Socket.IO

اتصال با یک توکن دسترسی برقرار می‌شود:

```js
io(SOCKET_URL, { auth: { token: accessToken } });
```

اگر توکن وجود نداشته باشد یا معتبر نباشد، فرایند handshake رد می‌شود و اتصال شکل نمی‌گیرد. کلاینت رویداد `connect_error` را با پیام `missing_token` یا `invalid_token` دریافت می‌کند.

### رویدادهای کلاینت → سرور

سرور برای هر رویداد با callback تأیید (ack) پاسخ می‌دهد. شکل کلی پاسخ چنین است: `({ ok, error?, ... })`.

| رویداد | payload | ack موفق |
|--------|---------|----------|
| `room:join` | `{room: "<slug>"}` | `{ok:true, room, presence: [{id:"1"}]}` |
| `room:leave` | `{room: "<slug>"}` | `{ok:true, left: true}` |
| `message:send` | `{room, text, clientId}` | `{ok:true, message}` |
| `presence:heartbeat` | `{}` | `{ok:true}` |

در صورت خطا، ack به شکل `{ok:false, error:{code}}` است. کدهای شناخته‌شده عبارت‌اند از:
`invalid_room`، `forbidden`، `identity_mismatch`، `unauthenticated`، `not_in_room`،
`invalid_text`، `text_too_long`، `rate_limited`، `persist_failed`، `internal_error`.

ارسال `clientId` اختیاری است. طول آن حداکثر ۶۴ نویسه است؛ مقدار نامعتبر به `null` تبدیل می‌شود.

### رویدادهای سرور → کلاینت

| رویداد | payload |
|--------|---------|
| `room:joined` | `{room, roomId, roomName, presence: [{id:"1"}]}` |
| `room:left` | `{room}` |
| `message:new` | `{room, message}` |
| `message:ack` | `{clientId, message}` (فقط برای فرستنده) |
| `message:error` | `{clientId?, code}` |
| `presence:update` | `{room, onlineUserIds: ["1","2"], onlineCount}` |
| `presence:tick` | `{at}` |
| `session:expired` | `{}` |
| `error` | `{event, code}` |

در رویداد `room:joined`، مقدار `presence` آرایه‌ای از شیءهای `{id}` است. در `presence:update`، مقدار `onlineUserIds` آرایه‌ای از رشته‌هاست.

### شکل پیام

```json
{ "id": 42, "room": 1, "sender": { "id": 1, "username": "ali", "display_name": "علی" },
  "sender_username": "ali", "text": "سلام", "client_id": "web-1712-ab",
  "created_at": "2026-10-05T11:24:31.778Z" }
```

---

## ۵. رفتارهای تضمین‌شده

1. **ذخیره قبل از انتشار:** `message:new` فقط پس از ذخیرهٔ موفق در Django پخش می‌شود.
2. **idempotency:** ارسال دوبارهٔ همان `clientId` پیام جدیدی نمی‌سازد؛ همان پیام قبلی
   با `message:ack` برمی‌گردد. کلاینت باید با `message.id` نمایش را dedupe کند.
3. **هویت از سرور:** `sender` را کلاینت تعیین نمی‌کند.
4. **حریم خصوصی:** عضویت در اتاق خصوصی بدون عضو بودن در آن `403` می‌گیرد، هم در REST و هم
   در `room:join`.
5. **وضعیت آنلاین:** کاربر پس از آخرین heartbeat، حداکثر تا `PRESENCE_TTL_MS` آنلاین می‌ماند. با قطع اتصال، وضعیت او بلافاصله حذف می‌شود.
