import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { BillingService, htmlEscape as h } from './billing.service.js';
import { BillingLoginDto, ReviewPaymentDto } from './dto/subscription.dto.js';

const cookieName = 'invoicekilat_billing_admin';
const page = (content: string) =>
  '<!doctype html><html lang="id"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Review Langganan — InvoiceKilat</title><style>body{margin:0;background:#f5f3ff;color:#171333;font:16px system-ui}main{max-width:820px;margin:32px auto;padding:24px;background:white;border-radius:24px}input,textarea,button{box-sizing:border-box;padding:14px;border-radius:12px;border:1px solid #ddd;width:100%;margin:8px 0}button{background:#5728f5;color:white;font-weight:bold;cursor:pointer}a{color:#5728f5}article{border-bottom:1px solid #eee;padding:16px 0}.badge{background:#eee8ff;padding:8px;border-radius:8px}img{max-width:100%;max-height:600px;object-fit:contain}label{display:block;margin-top:16px}.reject{background:#aa2444}small{color:#6f6884}</style></head><body><main>' +
  content +
  '</main></body></html>';
interface AdminClaims {
  csrf: string;
  typ: string;
}
function equal(a: string, b: string) {
  return timingSafeEqual(
    createHash('sha256').update(a).digest(),
    createHash('sha256').update(b).digest(),
  );
}

@SetMetadata('skipApiResponse', true)
@Controller('subscriptions/admin')
export class BillingAdminController {
  constructor(
    private readonly billing: BillingService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}
  private secret() {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    )
      .update('billing-admin-session')
      .digest('hex');
  }
  private claims(req: Request): AdminClaims {
    const token = req.headers.cookie
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith(cookieName + '='))
      ?.slice(cookieName.length + 1);
    if (!token) throw new UnauthorizedException('Login admin diperlukan.');
    try {
      const claims = this.jwt.verify<AdminClaims>(token, {
        secret: this.secret(),
        audience: 'billing-admin',
      });
      if (claims.typ !== 'billing-admin') throw new Error('Invalid type');
      return claims;
    } catch {
      throw new UnauthorizedException('Sesi admin kedaluwarsa. Login kembali.');
    }
  }
  private loginHtml(error = '') {
    return page(
      '<h1>Admin InvoiceKilat</h1><p>Masuk untuk meninjau pengajuan Pro.</p>' +
        (error ? '<p>' + h(error) + '</p>' : '') +
        '<form method="post" action="./login"><label>Email admin</label><input name="email" type="email" autocomplete="username" required><label>Password admin</label><input name="password" type="password" autocomplete="current-password" required><button>Masuk</button></form><small>Password admin diatur melalui BILLING_ADMIN_PASSWORD pada backend.</small>',
    );
  }
  private html(res: Response, body: string) {
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(body);
  }
  @Get('login') loginPage(@Res() res: Response) {
    this.html(res, this.loginHtml());
  }
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(@Body() dto: BillingLoginDto, @Res() res: Response) {
    const email = this.config.get<string>('BILLING_REVIEW_EMAIL') ?? '';
    const password = this.config.get<string>('BILLING_ADMIN_PASSWORD') ?? '';
    if (
      !email ||
      !password ||
      !equal(dto.email.trim().toLowerCase(), email.toLowerCase()) ||
      !equal(dto.password, password)
    ) {
      res.status(401);
      this.html(res, this.loginHtml('Email atau password admin salah.'));
      return;
    }
    const token = await this.jwt.signAsync(
      { typ: 'billing-admin', csrf: randomBytes(24).toString('hex') },
      { secret: this.secret(), audience: 'billing-admin', expiresIn: '1h' },
    );
    res.cookie(cookieName, token, {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'strict',
      path: '/api/v1/subscriptions/admin',
      maxAge: 3600000,
    });
    res.redirect(303, '/api/v1/subscriptions/admin');
  }
  @Get() async list(@Req() req: Request, @Res() res: Response) {
    try {
      this.claims(req);
    } catch {
      res.redirect('/api/v1/subscriptions/admin/login');
      return;
    }
    const rows = await this.billing.adminList();
    this.html(
      res,
      page(
        '<h1>Review Langganan</h1><p>Pengajuan terbaru. Pembayaran demo tidak memerlukan transfer.</p>' +
          rows
            .map(
              (row) =>
                '<article><span class="badge">' +
                h(row.status) +
                ' · ' +
                h(row.mode.toUpperCase()) +
                '</span><h3>' +
                h(row.name) +
                '</h3><p>' +
                h(row.email) +
                '<br>' +
                h(row.reference) +
                ' · Rp ' +
                row.amount.toLocaleString('id-ID') +
                '</p><a href="/api/v1/subscriptions/admin/' +
                row.id +
                '">Tinjau pengajuan</a></article>',
            )
            .join('') +
          (rows.length ? '' : '<p>Belum ada pengajuan.</p>'),
      ),
    );
  }
  @Get(':id/proof') async proof(
    @Req() req: Request,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    this.claims(req);
    const row = await this.billing.adminGet(id, true);
    res.setHeader('Cache-Control', 'no-store');
    res.type(row.proofMime ?? 'image/png').send(row.proof);
  }
  @Get(':id') async details(
    @Req() req: Request,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    let claims: AdminClaims;
    try {
      claims = this.claims(req);
    } catch {
      res.redirect('/api/v1/subscriptions/admin/login');
      return;
    }
    const row = await this.billing.adminGet(id);
    this.html(
      res,
      page(
        '<a href="/api/v1/subscriptions/admin">← Semua pengajuan</a><h1>' +
          h(row.reference) +
          '</h1><p>' +
          h(row.name) +
          ' · ' +
          h(row.email) +
          '</p><p>Rp ' +
          row.amount.toLocaleString('id-ID') +
          ' · Pro 1 bulan</p><p class="badge">' +
          h(row.status) +
          ' · ' +
          h(row.mode.toUpperCase()) +
          '</p><p>' +
          (row.mode === 'demo'
            ? 'DEMO: setujui untuk menguji akses Pro. Tidak ada transaksi uang.'
            : 'Pastikan nominal dan transaksi masuk cocok di aplikasi merchant QRIS sebelum menyetujui.') +
          '</p>' +
          (row.submittedAt
            ? '<img src="/api/v1/subscriptions/admin/' +
              row.id +
              '/proof" alt="Bukti pengajuan">'
            : '<p>Bukti belum diunggah.</p>') +
          (row.status === 'AWAITING_REVIEW'
            ? '<form method="post" action="/api/v1/subscriptions/admin/' +
              row.id +
              '/review"><input type="hidden" name="csrf" value="' +
              h(claims.csrf) +
              '"><label>Catatan / alasan penolakan</label><textarea name="reason" maxlength="500"></textarea><button name="decision" value="approve">Setujui — Aktifkan Pro</button><button class="reject" name="decision" value="reject">Tolak</button></form>'
            : '<p>' + h(row.reviewReason) + '</p>'),
      ),
    );
  }
  @Post(':id/review') async review(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: ReviewPaymentDto,
    @Res() res: Response,
  ) {
    const claims = this.claims(req);
    if (!equal(dto.csrf, claims.csrf))
      throw new UnauthorizedException('Form verifikasi tidak valid.');
    await this.billing.review(id, dto.decision, dto.reason);
    res.redirect(303, '/api/v1/subscriptions/admin/' + id);
  }
}
