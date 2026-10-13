# InvoiceKilat — Backend API

REST API NestJS untuk aplikasi Flutter, portal invoice pelanggan, dan panel admin langganan. Penjelasan produk, seluruh fitur, paket, alur email/WhatsApp, dan deployment ada di [README utama](../README.md).

## Teknologi dan arsitektur

Node.js 24, TypeScript 6, NestJS 12/Express, Mongoose 9, MongoDB, Redis, BullMQ, JWT, PDFKit, dan Resend melalui HTTPS API. Versi lengkap ada di [package.json](package.json) dan [package-lock.json](package-lock.json).

```text
Controller + DTO → Service → Repository → Schema MongoDB
```

Modul berada di `src/modules`, komponen lintas modul di `src/common`. DTO global memvalidasi input dan menolak field tidak diizinkan. Service menerapkan aturan bisnis/kuota. Scope data internal memakai bisnis pengguna yang terautentikasi.

## Menjalankan dari awal

### Prasyarat

Pastikan perangkat memiliki:

- Node.js 24 dan npm.
- Docker Desktop di macOS/Windows, atau Docker Engine + Docker Compose plugin
  di Linux.
- Git jika source code diambil dari repository.

Periksa instalasi:

```sh
node --version
npm --version
docker --version
docker compose version
```

Backend membutuhkan MongoDB dan Redis. Keduanya bisa dijalankan melalui Docker
atau memakai service/cloud sendiri. Docker tidak wajib jika MongoDB dan Redis
sudah tersedia di luar komputer ini.

### Instalasi dependency Node.js

Jalankan dari folder `backend_apk_invoice`:

```sh
npm ci
cp .env.example .env
```

`npm ci` memasang versi dependency yang terkunci pada `package-lock.json`.
Jangan commit file `.env`; file tersebut berisi secret. Yang boleh dibagikan
adalah `.env.example` yang hanya berisi placeholder.

### Menjalankan MongoDB dan Redis dengan Docker

File Compose ada satu level di atas folder backend:

```text
project-root/docker-compose.yml
project-root/backend_apk_invoice/
```

Dari folder backend, jalankan:

```sh
docker compose -f ../docker-compose.yml up -d mongodb redis
docker compose -f ../docker-compose.yml ps
```

Compose lokal menyediakan:

| Container | Port lokal | Fungsi |
|---|---:|---|
| MongoDB 7 | `127.0.0.1:27017` | Database akun, bisnis, pelanggan, invoice, pembayaran, dan langganan. |
| Redis 7 | `127.0.0.1:6379` | OTP, cooldown, BullMQ, dan antrean pengingat. |

Docker di sini berfungsi menjalankan dependency infrastructure secara konsisten
tanpa perlu memasang MongoDB dan Redis manual. **Compose root hanya menjalankan
MongoDB dan Redis, bukan NestJS backend.** Backend dijalankan dari terminal lain
dengan `npm run start:dev`.

Lihat status dan log jika perlu:

```sh
docker compose -f ../docker-compose.yml logs -f mongodb redis
docker compose -f ../docker-compose.yml exec redis redis-cli ping
```

Perintah terakhir harus menghasilkan `PONG`.

### Mengisi `.env`

Minimal isi development:

```dotenv
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/invoicekilat
REDIS_HOST=localhost
REDIS_PORT=6379
CORS_ORIGINS=http://localhost:3000
JWT_ACCESS_SECRET=ganti-dengan-secret-acak-minimal-32-karakter
JWT_REFRESH_SECRET=ganti-dengan-secret-acak-yang-berbeda
PUBLIC_INVOICE_BASE_URL=http://localhost:3000/api/v1/public/invoices
```

Generate dua JWT secret berbeda:

```sh
openssl rand -hex 32
openssl rand -hex 32
```

Ganti nilai placeholder pada `.env`. Backend sengaja gagal startup jika secret
masih diawali `replace-with-`, panjangnya kurang dari 32 karakter, atau kedua
secret sama.

Environment lain seperti Resend, billing, trial suara, dan SingaPay dijelaskan
di bagian [Konfigurasi penting](#konfigurasi-penting).

### Menjalankan backend development

```sh
npm run start:dev
```

Mode ini memakai watch mode dan restart saat file source berubah. Jika berhasil,
akses:

```text
API       http://localhost:3000/api/v1
Swagger   http://localhost:3000/api/docs
Health    http://localhost:3000/api/v1/health
Ready     http://localhost:3000/api/v1/health/ready
Admin     http://localhost:3000/api/v1/subscriptions/admin
```

Tes koneksi:

```sh
curl http://localhost:3000/api/v1/health
```

Status ideal adalah MongoDB `ok`, Redis `ok`, dan status keseluruhan `ok`.

### Menghentikan dan mereset dependency lokal

Menghentikan container tanpa menghapus data:

```sh
docker compose -f ../docker-compose.yml stop mongodb redis
```

Menghapus container tetapi mempertahankan volume:

```sh
docker compose -f ../docker-compose.yml down
```

Menghapus data MongoDB dan Redis lokal secara permanen:

```sh
docker compose -f ../docker-compose.yml down -v
```

Perintah `down -v` hanya untuk reset database development. Data yang terhapus
dari volume tersebut tidak bisa dipulihkan.

### Menjalankan tanpa Docker

Jika memakai MongoDB/Redis cloud atau instalasi lokal sendiri, isi alamatnya:

```dotenv
MONGODB_URI=mongodb+srv://user:password@cluster.example/invoicekilat
REDIS_HOST=redis.example.com
REDIS_PORT=6379
```

Lalu jalankan `npm run start:dev`. Pastikan firewall, credential, TLS, dan
allowlist IP service sudah benar.

Approval langganan Pro memakai transaksi MongoDB. Untuk menguji approval penuh,
gunakan MongoDB Atlas atau MongoDB lokal dengan replica set. MongoDB standalone
dari Compose cukup untuk development invoice biasa, tetapi tidak cocok untuk
memverifikasi transaksi approval Pro secara penuh.

## Konfigurasi penting

Semua contoh tersedia di [.env.example](.env.example).

| Variable | Kegunaan |
|---|---|
| `PORT` | Port API, default `3000`. |
| `NODE_ENV` | `development` atau `production`. |
| `MONGODB_URI` | Connection string MongoDB, wajib. |
| `REDIS_HOST` / `REDIS_PORT` | Lokasi Redis, wajib. |
| `CORS_ORIGINS` | Origin browser dipisahkan koma. |
| `JWT_ACCESS_SECRET` | Secret access token, minimal 32 karakter. |
| `JWT_REFRESH_SECRET` | Secret refresh token yang berbeda. |
| `PASSWORD_RESET_OTP_TTL_MINUTES` | TTL OTP 1–60 menit, default 5. |
| `AI_FREE_VOICE_TRIAL_LIMIT` | Trial draft suara Free sepanjang pemakaian bisnis, default 3. |
| `PUBLIC_INVOICE_BASE_URL` | Base URL portal invoice yang dapat dijangkau pelanggan. Jangan tambahkan `/view`. |
| `RESEND_API_KEY` | API key email Resend; wajib di production. |
| `RESEND_FROM_EMAIL` | Pengirim email; production memakai domain terverifikasi. |
| `RESEND_TEST_RECIPIENT` | Pengalihan OTP development; harus kosong di production. |
| `SUBSCRIPTION_PAYMENT_MODE` | `demo` untuk simulasi atau `manual` untuk review bukti. |
| `SUBSCRIPTION_PRO_PRICE` | Harga Pro dalam rupiah, default `129000`. |
| `BILLING_REVIEW_EMAIL` | Email owner/admin review Pro. |
| `BILLING_ADMIN_PASSWORD` | Password panel review, minimal 16 karakter. |
| `BILLING_PUBLIC_BASE_URL` | Base URL panel review yang dapat dijangkau admin. |
| `PAYMENT_WEBHOOK_SECRET` | Secret webhook jika provider pembayaran diaktifkan. |

SingaPay saat ini nonaktif. Variable `SINGAPAY_*` masih dipertahankan untuk
kompatibilitas konfigurasi lama, tetapi pembayaran invoice operasional memakai
metode manual dan konfirmasi owner.

Untuk production, `NODE_ENV=production` mewajibkan Resend, HTTPS pada URL
billing, email admin, password admin, serta menolak mode subscription `demo`.

## Cara kerja backend

Alur umum setiap request adalah:

```text
HTTP request
  → Helmet, CORS, rate limit
  → JWT guard untuk endpoint privat
  → ValidationPipe: transform + whitelist + reject unknown fields
  → Controller + DTO
  → Service: aturan bisnis, kuota, dan tenant scope
  → Repository: query MongoDB
  → response interceptor / exception filter
```

Struktur backend mengikuti pola:

```text
Controller + DTO → Service → Repository → Schema MongoDB
```

Controller menerima request dan memilih endpoint. DTO memvalidasi input serta
menolak field yang tidak diizinkan. Service menerapkan aturan bisnis seperti
kuota Free/Pro, status invoice, pembayaran, dan ownership. Repository melakukan
query database. Schema mendefinisikan struktur data MongoDB.

Data privat selalu dibatasi dengan `businessId` dari user yang login. Backend
tidak mempercayai `businessId` yang dikirim dari body sebagai sumber otorisasi.
Dengan begitu, user tidak dapat membaca pelanggan, invoice, pembayaran, atau
laporan bisnis lain hanya dengan mengganti ID.

### Pembayaran invoice

- Pembayaran manual yang dibuat atau dikirim pelanggan masuk sebagai `PENDING`.
- Upload bukti transfer tidak langsung mengurangi sisa tagihan.
- Owner harus mencocokkan nominal/pengirim dengan dana yang benar-benar masuk,
  lalu menekan konfirmasi.
- Konfirmasi memakai reference idempotency sehingga retry tidak menggandakan
  pembayaran.
- Bukti transfer disimpan privat dan hanya dapat dibaca owner bisnis terkait.
- SingaPay tidak dipakai dalam alur operasional saat ini.

### Redis, OTP, dan BullMQ

OTP reset password disimpan sementara di Redis dengan hash dan TTL. Redis juga
menjadi koneksi BullMQ. Saat owner membuat pengingat, backend menyimpan data
pengingat di MongoDB dan memasukkan job ke queue Redis.

Worker pengingat kemudian memeriksa invoice dan status Pro, mengirim email lewat
Resend, mencoba ulang kegagalan sampai tiga kali dengan backoff, lalu mencatat
status berhasil/gagal. Ketika backend restart, pengingat yang masih terjadwal
dipulihkan dari MongoDB ke queue. Karena itu backend dan Redis harus tetap hidup
agar pengingat berjalan.

### Draft dari chat dan suara

`POST /api/v1/ai/invoice-draft` memproses teks/chat memakai parser deterministik
Bahasa Indonesia. `POST /api/v1/ai/voice-invoice` menerima transcript dari
speech-to-text perangkat Flutter. Backend hanya menghasilkan draft yang harus
ditinjau; backend tidak otomatis membuat invoice atau mengonfirmasi pembayaran.

Free memiliki trial suara sesuai `AI_FREE_VOICE_TRIAL_LIMIT`; Pro tidak dibatasi.
Gunakan `requestId` yang sama saat retry network agar kuota tidak terpotong dua
kali. Detail grammar ada di [README AI](src/modules/ai/README.md).

### Portal pelanggan

`/invoices/:id/share-link` menghasilkan token menuju
`/public/invoices/:publicId/view`. Pelanggan tidak perlu login untuk melihat
invoice/PDF, mengirim bukti transfer, menyampaikan janji bayar, meminta order
ulang, dan melihat catatan layanan yang dibagikan.

Token publik bersifat rahasia bagi siapa pun yang memilikinya. Saat ini belum
ada expiry atau revoke otomatis, jadi jangan menaruh link pada tempat publik.
Data bukti transfer pelanggan tetap tidak ditampilkan pada endpoint publik.

## Modul

| Kelompok | Fungsi |
|---|---|
| Auth | Register/login, JWT refresh/logout, OTP/reset password. |
| Business, customers, items | Profil bisnis, pelanggan, katalog produk/jasa. |
| Invoices, dashboard | Dokumen, status, perhitungan server, ringkasan, PDF, link publik. |
| Templates | 20 definisi Free/Pro, metadata, marketplace/ownership. |
| AI | Parser aturan teks/transkrip menjadi draft; bukan LLM. |
| Payments, receipts | Pencatatan/konfirmasi pembayaran dan satu kwitansi per invoice. |
| Customer experience | Portal, bukti transfer, janji bayar, order ulang, catatan layanan, aktivitas. |
| Reminders | Pengingat email terjadwal dan persiapan pesan WhatsApp Pro. |
| Reports | Pendapatan/status/piutang/pelanggan sesuai cakupan saat ini. |
| Quotations, sync, analytics | Penawaran, operasi offline idempoten, event produk. |
| Subscriptions | Kuota, Free/Pro, checkout, bukti, review admin, aktivasi. |

Request/query/response terperinci tersedia di Swagger.

## Integrasi dan aturan penting

- Password menggunakan scrypt; refresh token disimpan sebagai hash dan dirotasi.
- OTP enam angka disimpan hash/TTL di Redis. `PASSWORD_RESET_OTP_TTL_MINUTES` default 5, rentang 1–60.
- Draft suara memakai transkrip dari Flutter. `AI_FREE_VOICE_TRIAL_LIMIT` default 3 draft berhasil total per bisnis, rentang 0–100.
- Total invoice dihitung ulang server. Nomor menggunakan counter bisnis/bulan.
- Pendapatan beranda/laporan menggunakan invoice PAID berdasarkan tanggal invoice, bukan tanggal transfer.
- Pembayaran pelanggan baru dihitung setelah konfirmasi, dengan perlindungan pengulangan.
- Kwitansi dibuat eksplisit, satu per invoice; email HTML/teks dapat dikirim saat pembuatan jika email pelanggan tersedia.
- BullMQ/Redis serta proses backend harus terus berjalan untuk pengingat email.

### Email

Backend mengirim empat alur: OTP, pengingat pembayaran, kwitansi, dan bukti Pro ke admin. `RESEND_TEST_RECIPIENT` hanya mengalihkan OTP di nonproduction. Invoice tidak otomatis dikirim lewat email, dan backend tidak mengirim WhatsApp otomatis. Lihat [matriks pengiriman](../README.md#pengiriman-email-dan-whatsapp).

### Portal

`/invoices/:id/share-link` mengembalikan link ke `/public/invoices/:publicId/view`. `PUBLIC_INVOICE_BASE_URL` harus berupa host yang dapat dijangkau penerima dengan akhiran `/api/v1/public/invoices`, tanpa `/view`. PDF tersedia pada endpoint internal/public terkait.

Token publik memberi akses tanpa login; belum tersedia expiry/revoke. Bukti transfer pelanggan perlu review pemilik bisnis dan tidak otomatis melunasi invoice.

### Langganan dan pembayaran

Free: 10 invoice total, 20 pelanggan, template Free, trial suara. Pro: Rp129.000/bulan, kuota tanpa batas, semua template, suara, logo, pengingat, laporan. Akses/kuota diperiksa server.

`SUBSCRIPTION_PAYMENT_MODE=demo` mensimulasikan tanpa transfer; `manual` memakai QRIS dan review. Login admin memakai `BILLING_REVIEW_EMAIL` dan `BILLING_ADMIN_PASSWORD`. Pro aktif setelah approval dalam transaksi MongoDB. Lihat [panduan billing](../docs/SUBSCRIPTIONS.md).

**SingaPay nonaktif.** Permintaan pembayaran baru dan webhook SingaPay ditolak pada mode saat ini. Konfigurasi `SINGAPAY_*` masih dipertahankan; riwayat lama tetap disimpan.

## Pengujian

Perintah validasi utama:

```sh
npm run build
npm run lint
npm test
npm run test:e2e
```

Untuk test HTTP billing yang menjalankan Nest app lengkap:

```sh
npm run build
node test/billing-http-check.mjs
```

Test tersebut dapat membuat MongoDB/Redis sementara melalui Docker. Test
memalsukan pengiriman email dan tidak melakukan transfer uang sungguhan.

## Production dengan Dockerfile

`Dockerfile` membuat image production dua tahap:

1. Stage build memasang seluruh dependency dan menjalankan `npm run build`.
2. Stage runtime hanya memasang dependency production, menyalin `dist`, lalu
   menjalankan `dist/main.js` sebagai user non-root `node`.

Build image:

```sh
docker build -t invoicekilat-backend:local .
```

Dockerfile hanya membuat image backend. Ia tidak otomatis menyediakan MongoDB,
Redis, domain HTTPS, atau Resend. Production sebaiknya memakai MongoDB/Redis
terkelola dan secret manager/platform deployment.

Jika menjalankan image dengan Docker, jangan gunakan `localhost` untuk koneksi
MongoDB/Redis kecuali service tersebut memang berada di container yang sama.
Gunakan hostname service dalam network Docker, `host.docker.internal` untuk
Docker Desktop, atau alamat service cloud yang dapat dijangkau container.

Compose root pada project saat ini hanya menjalankan MongoDB dan Redis. Untuk
development gunakan:

```sh
docker compose -f ../docker-compose.yml up -d mongodb redis
npm run start:dev
```

Untuk production gunakan `npm run start:prod` setelah build lokal, atau image
Docker yang sudah dibuild. Atur network, restart policy, health check, volume,
HTTPS, dan secret dari platform deployment yang digunakan.

Jika `SUBSCRIPTION_PAYMENT_MODE=manual`, aset QRIS
`assets/billing-qris.png` harus tersedia pada deployment. Dockerfile saat ini
berfokus menyalin source hasil build dan belum menyalin folder `assets`; atur
copy atau mount aset tersebut pada deployment mode manual.

## Checklist production

- `NODE_ENV=production`.
- JWT access secret dan refresh secret acak, panjang, serta berbeda.
- MongoDB memakai replica set, backup, dan access control.
- Redis production tersedia dan memiliki persistence/availability yang sesuai.
- `RESEND_API_KEY` terisi dan domain pengirim sudah diverifikasi.
- `RESEND_TEST_RECIPIENT` kosong.
- `SUBSCRIPTION_PAYMENT_MODE=manual`; mode `demo` ditolak saat production.
- `BILLING_REVIEW_EMAIL` dan `BILLING_ADMIN_PASSWORD` aman.
- `PUBLIC_INVOICE_BASE_URL` dan `BILLING_PUBLIC_BASE_URL` memakai HTTPS.
- `CORS_ORIGINS` hanya berisi origin yang dipercaya.
- API berada di belakang HTTPS/reverse proxy dan memiliki monitoring.
- `.env`, API key, JWT secret, private key, backup database, dan file upload
  tidak pernah di-commit.
- Backend direstart setelah perubahan environment atau schema.

## Troubleshooting

### `MongooseServerSelectionError`

MongoDB belum berjalan, port salah, atau URI tidak bisa dijangkau.

```sh
docker compose -f ../docker-compose.yml ps
docker compose -f ../docker-compose.yml logs mongodb
```

Periksa `MONGODB_URI`, credential, firewall, dan allowlist IP jika memakai
MongoDB Atlas.

### Redis connection error

Periksa container dan koneksi Redis:

```sh
docker compose -f ../docker-compose.yml logs redis
docker compose -f ../docker-compose.yml exec redis redis-cli ping
```

Hasil yang benar adalah `PONG`.

### Backend gagal startup karena environment

Validasi environment sengaja fail fast. Periksa JWT secret, URI MongoDB,
`REDIS_HOST`, `RESEND_*`, dan konfigurasi billing production. Nilai JWT contoh
yang masih diawali `replace-with-` pasti ditolak.

### Link invoice tidak bisa dibuka dari HP

`localhost` hanya dapat diakses perangkat yang menjalankan backend. Untuk uji
lintas perangkat gunakan alamat LAN komputer atau tunnel HTTPS, lalu ubah
`PUBLIC_INVOICE_BASE_URL` dan restart backend.

### Pengingat tidak terkirim

Pastikan backend dan Redis aktif, invoice belum lunas/dibatalkan, paket Pro
masih aktif, email pelanggan benar, dan `RESEND_API_KEY`/sender valid. Periksa
status pada `/api/v1/reminders` serta log proses backend.

## Keamanan Git

`.gitignore` backend mengabaikan `.env`, dependency, build output, cache, log,
database lokal, private key, dan credential file. `.env.example` tetap boleh
di-commit sebagai template.

Periksa sebelum commit:

```sh
git status --short --ignored
git check-ignore -v .env dist node_modules
```

Jika secret pernah masuk commit atau remote, menghapus file pada commit terbaru
saja tidak cukup. Segera revoke/rotate secret tersebut dan bersihkan history
repository dengan prosedur yang disepakati tim.

## Dokumentasi lanjutan

- [README utama project](../README.md)
- [Smart invoice dari chat/suara](src/modules/ai/README.md)
- [Langganan Free/Pro dan billing](../docs/SUBSCRIPTIONS.md)
- [Customer experience](../CUSTOMER_EXPERIENCE.md)
- [OpenAPI/Swagger saat backend aktif](http://localhost:3000/api/docs)
