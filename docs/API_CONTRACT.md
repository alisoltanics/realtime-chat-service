# قرارداد API و رویدادهای WebSocket

این سند قراردادی است که هر دو سرویس بر اساس آن پیاده‌سازی شده‌اند. تمام بدنه‌ها JSON هستند.
زمان‌ها ISO-8601 با منطقهٔ زمانی UTC.

---

## ۰. شکل خطاها

همهٔ خطاهای REST (چه دستی نوشته شده باشند چه توسط DRF تولید شده باشند) یک پوشش دارند:

```json
{ "error": { "code": "not_found", "detail": "No Room matches the given query." } }
```

`detail` همیشه رشته است، مگر در خطاهای اعتبارسنجی فیلد که به شکل
`{"text": ["This field may not be blank."]}` برمی‌گردد. کدهای پرکاربرد:
`not_authenticated`، `invalid_credentials`، `conflict`، `validation_error`،
`not_found`، `permission_denied`، `room_private`، `user_not_found`،
`invalid_cursor`، `service_token_invalid`.

---

## ۱. احراز هویت (عمومی)

تمام endpointهای کاربر با هدر زیر احراز هویت می‌شوند:

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

## ۲. اتاق‌ها (عمومی)

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

`slug` به‌صورت خودکار از `name` ساخته می‌شود و یکتا است.

### شکل اتاق

```json
{ "id": 3, "name": "عمومی", "slug": "general", "is_public": true, "created_at": "...",
  "member_count": 2, "last_message": { "text": "سلام", "sender": "ali", "created_at": "..." } }
```

### صفحه‌بندی تاریخچه

```
GET /api/rooms/<slug>/messages/?limit=30&before_id=1234
```

پیام‌ها بر اساس `id` نزولی انتخاب و سپس **از قدیم به جدید** برگردانده می‌شوند (آخرین آیتم،
جدیدترین پیام صفحه است):

```json
{ "results": [ { "id": 3, "room": 1, "sender": { "id": 1, "username": "ali" },
                 "sender_username": "ali", "text": "سلام", "client_id": "abc",
                 "created_at": "..." } ],
  "has_more": true,
  "next_before_id": 3 }
```

`before_id` نقطهٔ شروع صفحهٔ بعدی است (پیام‌های قدیمی‌تر). `next_before_id` وقتی
`has_more` برابر `false` است `null` خواهد بود.

- `limit` پیش‌فرض ۳۰، بیشینه ۱۰۰.
- `before_id` نامعتبر → `400` با `{"error": {"code": "invalid_cursor"}}`.

### ارسال پیام از طریق REST

```
POST /api/rooms/<slug>/messages/
{ "text": "سلام", "client_id": "web-1712-ab" }
```

- `201` پیام جدید ساخته شد، `200` پیام قبلی با همان `client_id` برگردانده شد
  (idempotency).
- اگر `client_id` خالی باشد، **هر درخواست یک پیام جدید می‌سازد** (چون کلید idempotency
  وجود ندارد).

---

## ۳. API داخلی (فقط سرویس realtime)

این endpointها با هدر زیر محافظت می‌شوند:

```
X-Service-Token: <INTERNAL_SERVICE_TOKEN>
```

مقدار اشتباه یا غایب → `403` (`{"error": {"code": "service_token_invalid"}}`).

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

`authorize-room` همیشه `200` برمی‌گرداند مگر توکن/اتاق نامعتبر باشد؛ مجوز در بدنهٔ پاسخ
می‌آید و سرویس realtime بر اساس `can_read` تصمیم می‌گیرد:

```json
{ "user": { "id": 1, "username": "ali", "display_name": "علی" },
  "room": { "id": 1, "slug": "general", "name": "عمومی", "is_public": true },
  "access": { "can_read": true, "is_member": true } }
```

`room-members` بر اساس `slug` جست‌وجو می‌کند و `{"room_id", "member_ids"}` برمی‌گرداند.

`internal/messages` فرستنده را از بدنه می‌گیرد و **به درخواست‌کنندهٔ عمومی اجازهٔ تعیین آن را
نمی‌دهد**؛ فقط سرویس realtime که توکن مشترک دارد می‌تواند این مسیر را صدا بزند:

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

بدون توکن معتبر، handshake رد می‌شود (`connect_error` با پیام `missing_token` یا
`invalid_token`) و اتصال اصلاً برقرار نمی‌شود.

### رویدادهای کلاینت → سرور

همه با callback تأیید (ack) پاسخ داده می‌شوند: `({ ok, error?, ... })`.

| رویداد | payload | ack موفق |
|--------|---------|----------|
| `room:join` | `{room: "<slug>"}` | `{ok:true, room, presence: [{id:"1"}]}` |
| `room:leave` | `{room: "<slug>"}` | `{ok:true, left: true}` |
| `message:send` | `{room, text, clientId}` | `{ok:true, message}` |
| `presence:heartbeat` | `{}` | `{ok:true}` |

پیام خطا در ack برمی‌گردد: `{ok:false, error:{code}}`. کدهای خطا:
`invalid_room`، `forbidden`، `identity_mismatch`، `unauthenticated`، `not_in_room`،
`invalid_text`، `text_too_long`، `rate_limited`، `persist_failed`، `internal_error`.

`clientId` اختیاری است؛ حداکثر طول آن ۶۴ کاراکتر است و مقادیر نامعتبر به `null` تبدیل
می‌شوند.

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

`presence` در `room:joined` آرایه‌ای از `{id}` است، ولی `onlineUserIds` در
`presence:update` آرایه‌ای از رشته است.

### شکل پیام

```json
{ "id": 42, "room": 1, "sender": { "id": 1, "username": "ali", "display_name": "علی" },
  "sender_username": "ali", "text": "سلام", "client_id": "web-1712-ab",
  "created_at": "2026-10-05T11:24:31.778Z" }
```

---

## ۵. قواعد تضمین‌شده

1. **ذخیره قبل از انتشار:** `message:new` فقط پس از ذخیرهٔ موفق در Django پخش می‌شود.
2. **idempotency:** ارسال دوبارهٔ همان `clientId` پیام جدیدی نمی‌سازد؛ همان پیام قبلی
   با `message:ack` برمی‌گردد. کلاینت باید با `message.id` نمایش را dedupe کند.
3. **هویت از سرور:** `sender` را کلاینت تعیین نمی‌کند.
4. **حریم خصوصی:** عضویت در اتاق خصوصی بدون عضو بودن در آن `403` می‌گیرد، هم در REST و هم
   در `room:join`.
5. **حضور:** کاربر تا `PRESENCE_TTL_MS` پس از آخرین heartbeat در `presence:update` باقی
   می‌ماند؛ قطع اتصال بلافاصله آن را حذف می‌کند.