import type { PublicInvoicePageData } from './public-invoice-page.js';

const escape = (value: unknown) =>
  (typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : ''
  ).replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char]!,
  );
const date = (value: Date | string) =>
  new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value));

export const customerToolsStyles = `
  .customer-tools{display:grid;gap:18px;margin-top:24px}.tool-card{padding:26px;background:#fff;border:1px solid var(--line);border-radius:20px}.tool-card h2{font-size:18px;margin-bottom:7px}.tool-card .intro{font-size:13px;color:var(--muted);margin-bottom:20px;line-height:1.65}.tool-head{display:flex;justify-content:space-between;gap:16px;align-items:center}.tool-tag{font-size:11px;color:#777988;background:#f4f5f7;border:1px solid #e8e9ed;border-radius:8px;padding:5px 9px;white-space:nowrap}.tool-form{display:grid;gap:14px}.tool-form label{display:grid;gap:7px;font-size:12px;font-weight:650;color:var(--ink)}.tool-input,.tool-form textarea{width:100%;font:inherit;font-size:14px;color:var(--ink);padding:13px 14px;border:1px solid #e2e4e9;border-radius:11px;background:#fafbfc;outline:none}.tool-input:focus,.tool-form textarea:focus{border-color:#7c67b2;box-shadow:0 0 0 3px #6036e90a}.tool-form textarea{resize:vertical;min-height:86px}.tool-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.money-input{display:flex;align-items:center;gap:9px;background:#fafbfc;border:1px solid #e2e4e9;border-radius:11px;padding-left:14px}.money-input span{font-size:13px;color:var(--muted);font-weight:500}.money-input input{border:0;background:transparent;padding-left:0;box-shadow:none!important}.upload-area{position:relative;display:grid!important;place-items:center;gap:5px!important;min-height:110px;padding:20px;border:1px dashed #cfd2db;border-radius:12px;background:#fafbfc;text-align:center;cursor:pointer}.upload-area input{position:absolute;width:1px;height:1px;opacity:0}.upload-area:focus-within{outline:2px solid #8873be;outline-offset:3px}.upload-area strong{font-size:14px;font-weight:650}.upload-area span{font-size:12px;color:var(--muted);font-weight:400;overflow-wrap:anywhere}.tool-button{appearance:none;font:inherit;font-size:13px;font-weight:650;cursor:pointer;border-radius:11px;min-height:46px;padding:12px 18px;border:1px solid #e1e3e8;background:#fff;color:#343644}.tool-button.primary{background:var(--accent);color:white;border-color:var(--accent)}.tool-button:disabled{opacity:.55;cursor:default}.tool-button:focus-visible{outline:3px solid #b5a1e8;outline-offset:3px}.tool-note{font-size:12px;color:var(--muted);line-height:1.7}.tool-feedback{font-size:13px;line-height:1.6;margin:0}.tool-feedback.error{color:#ad383e}.tool-feedback.success{color:#237954}.tool-details{margin-top:18px;border-top:1px solid var(--line);padding-top:18px}.tool-details summary{font-size:13px;font-weight:650;color:#515360;cursor:pointer}.tool-details[open] summary{margin-bottom:18px}.service-facts{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px}.service-fact{padding:14px;background:#f7f8fa;border-radius:12px}.service-fact small{display:block;font-size:11px;color:var(--muted);margin-bottom:5px}.service-fact p{font-size:13px;font-weight:650;overflow-wrap:anywhere}.service-summary{color:#515360;font-size:13px;white-space:pre-line;margin-top:16px}.service-photos{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:18px}.service-photos img{width:100%;aspect-ratio:4/3;object-fit:cover;border:1px solid var(--line);border-radius:12px}.bank-account{position:relative;padding-right:78px}.copy-bank{position:absolute;right:12px;top:16px;border:1px solid #e2e4e9;border-radius:8px;background:white;color:#5a5c69;font-size:11px;padding:6px 9px;cursor:pointer}.bank-icon{display:none}.balance dd{color:var(--ink)}.item-index{display:none}.item{gap:0}.tool-footer{margin-top:14px;font-size:12px;color:var(--muted)}
  @media(max-width:600px){.tool-card{padding:22px 20px}.tool-grid{grid-template-columns:1fr}.tool-head{align-items:flex-start}.service-facts{grid-template-columns:1fr 1fr}.tool-card h2{font-size:16px}.item{display:flex}.customer-tools{gap:14px;margin-top:18px}}@media print{.customer-tools,.copy-bank{display:none}}
`;

export function renderCustomerTools(
  data: PublicInvoicePageData,
  publicId: string,
  interactive: boolean,
) {
  const { invoice } = data;
  if (['VOID', 'CANCELLED'].includes(invoice.status)) return '';
  const service = invoice.serviceRecord;
  const serviceHtml = service
    ? `<section class="tool-card">
    <h2>Catatan layanan & garansi</h2>
    ${service.workSummary ? `<p class="service-summary">${escape(service.workSummary)}</p>` : ''}
    <div class="service-facts">
      ${service.serialNumber ? `<div class="service-fact"><small>Perangkat / nomor seri</small><p>${escape(service.serialNumber)}</p></div>` : ''}
      ${service.warrantyUntil ? `<div class="service-fact"><small>Garansi sampai</small><p>${date(service.warrantyUntil)}</p></div>` : ''}
      ${service.warrantyStartsAt ? `<div class="service-fact"><small>Mulai garansi</small><p>${date(service.warrantyStartsAt)}</p></div>` : ''}
      ${service.nextServiceAt ? `<div class="service-fact"><small>Layanan berikutnya</small><p>${date(service.nextServiceAt)}</p></div>` : ''}
    </div>
    ${service.photoCount ? `<div class="service-photos">${Array.from({ length: Math.min(service.photoCount, 3) }, (_, i) => `<a href="./service-photos/${i}" target="_blank" rel="noopener"><img loading="lazy" src="./service-photos/${i}" alt="Dokumentasi layanan ${i + 1}"></a>`).join('')}</div>` : ''}
  </section>`
    : '';
  if (!interactive)
    return serviceHtml
      ? `<div class="customer-tools">${serviceHtml}</div>`
      : '';
  const unpaid =
    invoice.status !== 'PAID' && invoice.total > (invoice.paidAmount ?? 0);
  const today = new Date().toLocaleDateString('en-CA', {
    timeZone: 'Asia/Jakarta',
  });
  void publicId;
  return `<div class="customer-tools">
    <noscript><p class="tool-note">Aktifkan JavaScript untuk mengirim bukti transfer dan permintaan melalui halaman ini.</p></noscript>
    ${
      unpaid
        ? `<section class="tool-card">
      <div class="tool-head"><h2>Sudah transfer?</h2><span class="tool-tag">Pembayaran manual</span></div>
      <p class="intro">Kirim bukti transfer agar ${escape(data.business.name)} dapat memeriksa pembayaran Anda.</p>
      <form id="proof-form" class="tool-form" method="post" action="./payment-proof">
        <div class="tool-grid">
          <label>Nominal transfer<div class="money-input"><span>Rp</span><input class="tool-input" name="amount" inputmode="numeric" required maxlength="15" placeholder="Contoh 150.000" autocomplete="off"></div></label>
          <label>Nama pengirim<input class="tool-input" name="senderName" maxlength="120" placeholder="Nama pemilik rekening"></label>
        </div>
        <label class="upload-area"><strong id="proof-label">Pilih bukti transfer</strong><span id="proof-help">JPG atau PNG, maksimal 2 MB</span><input id="proof-file" type="file" accept="image/jpeg,image/png" required aria-label="Pilih bukti transfer"></label>
        <label>Catatan <span class="tool-note">Opsional</span><textarea name="note" maxlength="500" placeholder="Contoh: pembayaran DP"></textarea></label>
        <p class="tool-note">Pembayaran tercatat setelah pemilik usaha mengonfirmasi dana masuk.</p>
        <button class="tool-button primary" type="submit">Kirim bukti transfer</button>
        <p class="tool-feedback" role="status" aria-live="polite"></p>
      </form>
      <details class="tool-details"><summary>Belum transfer? Sampaikan tanggal pembayaran</summary>
        <form id="promise-form" class="tool-form" method="post" action="./promise">
          <label>Rencana tanggal pembayaran<input class="tool-input" type="date" name="date" min="${today}" required></label>
          <label>Pesan singkat<textarea name="note" maxlength="500" placeholder="Opsional, misalnya menunggu pencairan dana"></textarea></label>
          <button class="tool-button" type="submit">Simpan janji bayar</button><p class="tool-feedback" role="status" aria-live="polite"></p>
        </form>
      </details>
      ${invoice.promisedPaymentDate ? `<p class="tool-footer">Rencana pembayaran terakhir: ${date(invoice.promisedPaymentDate)}</p>` : ''}
    </section>`
        : ''
    }
    ${serviceHtml}
    <section class="tool-card"><h2>Butuh layanan atau pesanan yang sama?</h2><p class="intro">Kirim permintaan pesan ulang. Pemilik usaha akan menghubungi Anda untuk memastikan rincian dan harga terbaru.</p>
      <form id="repeat-form" class="tool-form" method="post" action="./repeat-order"><label>Detail permintaan<textarea name="message" maxlength="1000" placeholder="Contoh: servis perangkat yang sama minggu depan"></textarea></label><button class="tool-button" type="submit">Minta pesan ulang</button><p class="tool-feedback" role="status" aria-live="polite"></p></form>
    </section>
  </div>`;
}

export function customerToolsScript(nonce: string) {
  if (!nonce) return '';
  return `<script nonce="${escape(nonce)}">
  (()=>{
    const base=new URL('./',location.href);
    const feedback=(form,message,error=false)=>{const p=form.querySelector('.tool-feedback');p.textContent=message;p.className='tool-feedback '+(error?'error':'success');};
    const send=async(form,path,data)=>{const button=form.querySelector('button[type=submit]');button.disabled=true;try{const response=await fetch(new URL(path,base),{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await response.json();if(!response.ok||!result.success)throw new Error(result.message||result.error?.message||'Permintaan belum dapat dikirim. Coba lagi.');return true;}catch(error){feedback(form,error.message||'Periksa koneksi dan coba lagi.',true);return false;}finally{button.disabled=false;}};
    document.querySelectorAll('.copy-bank').forEach(button=>button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(button.dataset.copy);button.textContent='Tersalin';setTimeout(()=>button.textContent='Salin',1800);}catch{button.textContent='Salin nomor di atas';}}));
    const proof=document.getElementById('proof-form');let requestId=null;
    if(proof){const input=proof.elements.amount;input.addEventListener('input',()=>{const digits=input.value.replace(/[^0-9]/g,'').slice(0,10);input.value=digits?Number(digits).toLocaleString('id-ID'):'';requestId=null;});document.getElementById('proof-file').addEventListener('change',event=>{const file=event.target.files[0];requestId=null;document.getElementById('proof-help').textContent=file?file.name:'JPG atau PNG, maksimal 2 MB';});proof.addEventListener('submit',async event=>{event.preventDefault();const file=document.getElementById('proof-file').files[0];const amount=Number(input.value.replace(/[^0-9]/g,''));if(!file||!['image/png','image/jpeg'].includes(file.type)||file.size>2097152){feedback(proof,'Pilih gambar JPG/PNG maksimal 2 MB.',true);return;}if(!Number.isSafeInteger(amount)||amount<1){feedback(proof,'Isi nominal transfer yang benar.',true);return;}const button=proof.querySelector('button[type=submit]');if(button.disabled)return;button.disabled=true;try{const content=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(new Error('Gambar belum dapat dibaca.'));reader.readAsDataURL(file);});requestId=requestId||(crypto.randomUUID?crypto.randomUUID():Date.now()+'_'+Math.random().toString(36).slice(2));if(await send(proof,'payment-proof',{amount,proofBase64:content,requestId,senderName:proof.elements.senderName.value,note:proof.elements.note.value})){feedback(proof,'Bukti berhasil dikirim. Menunggu pemeriksaan pemilik usaha.');proof.reset();document.getElementById('proof-help').textContent='JPG atau PNG, maksimal 2 MB';requestId=null;}}catch(error){feedback(proof,error.message,true);}finally{button.disabled=false;}});}
    const promise=document.getElementById('promise-form');if(promise)promise.addEventListener('submit',async event=>{event.preventDefault();if(await send(promise,'promise',{date:promise.elements.date.value+'T00:00:00+07:00',note:promise.elements.note.value}))feedback(promise,'Janji bayar tersimpan dan sudah disampaikan ke pemilik usaha.');});
    const repeat=document.getElementById('repeat-form');if(repeat)repeat.addEventListener('submit',async event=>{event.preventDefault();if(await send(repeat,'repeat-order',{message:repeat.elements.message.value})){feedback(repeat,'Permintaan terkirim. Pemilik usaha akan menghubungi Anda.');repeat.reset();}});
  })();
  </script>`;
}
