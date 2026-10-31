// =============================================================
// Harf Avcıları - görsellik ve anlatım
// Oyunun kuralları game.js'te; bu dosya sadece "ne oldu, ne işe yarar" sorusunu
// ekranda göstermek için var:
//   - kart yüzleri (renkli çerçeve, büyük simge, kısa açıklama)
//   - kart oynanınca ortada beliren büyük kart
//   - eldeki harf/kart/puan değişince yanıp sönen taşlar
//   - geçiş afişleri (KELİME TURU!, Sıra sende!)
//   - Nasıl oynanır? rehberi, kart rehberi, kare bilgisi, ilk oyun ipuçları
// =============================================================

// ---------- Kart türleri: çerçeve rengi kartın ne işe yaradığını söyler ----------
const KART_TURLERI = {
  saldiri: { ad: 'Saldırı', ikon: '⚔️', aciklama: 'Rakiplerine zarar verir' },
  yardim:  { ad: 'Yardım',  ikon: '💚', aciklama: 'Sana yardım eder' },
  savunma: { ad: 'Savunma', ikon: '🛡️', aciklama: 'Seni korur' },
  tahta:   { ad: 'Tahta',   ikon: '🧱', aciklama: 'Tahtaya bir şey koyar' },
};

// Her kartın türü ve kart yüzünde yazan kısa açıklaması
const KART_EK = {
  zarEksi2:      ['saldiri', 'Rakip 2 kare az gider'],
  harfKap:       ['saldiri', 'Rakipten 1 harf çal'],
  harfKaristir:  ['saldiri', 'Rakibin 1 harfi değişir'],
  kalkan:        ['savunma', 'İlk saldırıyı engeller'],
  tekHarfDegis:  ['saldiri', 'Rakiple 1 harf takası'],
  kartTakasi:    ['saldiri', 'Kartlarınız yer değişir'],
  harfTakasi:    ['saldiri', 'Tüm harfler yer değişir'],
  hileliZar:     ['saldiri', 'Rakip 0–3 kare gider'],
  zarArti3:      ['yardim',  'Zarına +3 ekle'],
  ciftZar:       ['yardim',  'Bu tur 4 zar at'],
  yerDegistir:   ['saldiri', 'Rakiple yerini değiş'],
  kasirga:       ['saldiri', 'Rastgele 2 kişi yer değişir'],
  tuzak:         ['tahta',   'Kareye tuzak kur'],
  istenenHarf:   ['yardim',  'İstediğin harfi al'],
  dondur:        ['saldiri', 'Rakip 1 tur bekler'],
  geriGit:       ['saldiri', 'Rakip 3 kare geri'],
  tekrarAt:      ['yardim',  'Zarı yeniden atabilirsin'],
  roket:         ['yardim',  'Yol ayrımına uç'],
  ekstraTur:     ['yardim',  'Bir tur daha oyna'],
  miknatis:      ['yardim',  'En yakın 💎 taşı çek'],
  harfVergisi:   ['saldiri', 'Herkes sana 1 harf verir'],
  sihirliDegnek: ['yardim',  'Bir harfin ★ joker olur'],
  sesliYagmuru:  ['yardim',  '2 sesli harf al'],
  harfBombasi:   ['saldiri', 'Herkes 1 harf kaybeder'],
  ayna:          ['savunma', 'Saldırıyı geri yansıtır'],
  casus:         ['saldiri', 'Rakibin 1 kartını çöpe at'],
  tuzakTemizle:  ['savunma', 'Tuzak/kutu/duvar kaldır'],
  ciftPuan:      ['yardim',  'Sonraki kelime ×2 puan'],
  ekSure:        ['yardim',  'Kelime turunda +30 sn'],
  sureHirsizi:   ['saldiri', 'Rakibe sadece 30 sn'],
  surprizKutusu: ['tahta',   'Kareye şans kutusu koy'],
  duvar:         ['tahta',   'Kareye duvar ör'],
  indirim:       ['yardim',  'Market %50 ucuz'],
};
const kartTuru = k => KART_EK[k]?.[0] ?? 'yardim';
const kartKisa = k => KART_EK[k]?.[1] ?? '';

// Kart oynanınca 3D tahtada piyonun üstünde çıkan efekt (yoksa türüne göre)
// (Yer değiştiren kartların dönme efektini game.js'teki yerleriDegistir kendisi yapar)
const KART_PIYON_EFEKTI = {
  yerDegistir: null, kasirga: null, dondur: null, harfBombasi: null, harfVergisi: null,
  hileliZar: 'zehir', zarEksi2: 'zehir', sureHirsizi: 'zehir', casus: 'zehir', geriGit: 'patlama',
};

// Bir kartın yüzü. tikla verilirse buton olur (oynamak/almak için), verilmezse
// dokununca büyük açıklaması açılır. mini: yan paneldeki küçük hali.
// uyari: kartın altında görünen kısa not (Elin dolu, Mürekkep yetmiyor...) — telefonda üstüne gelinemediği için
function kartYuzu(k, { tikla = '', fiyat = null, kapali = false, ipucu = '', mini = false, yeni = false, uyari = '' } = {}) {
  const b = KARTLAR[k];
  const etiket = tikla ? 'button' : 'div';
  const tiklama = tikla || `kartDetay('${k}')`;
  return `<${etiket} class="kartYuz tur-${kartTuru(k)}${mini ? ' mini' : ''}${yeni ? ' yeniKart' : ''}"
      title="${guvenli(ipucu || b.aciklama)}" onclick="${tiklama}" ${kapali ? 'disabled' : ''}>
    <span class="kartIkon">${b.ikon}</span><b class="kartAd">${b.ad}</b>`
    + (mini ? '' : `<small class="kartKisa">${kartKisa(k)}</small>`)
    + (b.pasif && !mini ? '<small class="kartPasif">elde durur, kendiliğinden çalışır</small>' : '')
    + (fiyat !== null ? `<span class="fiyat">${fiyat} 🖋️</span>` : '')
    + (uyari ? `<small class="kartUyari">${uyari}</small>` : '')
    + `</${etiket}>`;
}

// Rakibin gizli kartları: sadece arkası görünür
function kartArkasi(yeni = false) {
  return `<div class="kartYuz arka mini${yeni ? ' yeniKart' : ''}"><span class="kartIkon">🃏</span></div>`;
}

// ---------- Bilgi penceresi (kart detayı, rehber) ----------
function bilgiPenceresi(icerik, genis = false) {
  $('bilgiIcerik').innerHTML = icerik;
  $('bilgiPencere').classList.toggle('genis', genis);
  $('bilgiPerde').classList.remove('gizli');
}

function bilgiKapat() {
  $('bilgiPerde').classList.add('gizli');
}

function kartDetay(k) {
  const b = KARTLAR[k];
  const tur = KART_TURLERI[kartTuru(k)];
  bilgiPenceresi(`
    <div class="kartYuz tur-${kartTuru(k)} buyuk"><span class="kartIkon">${b.ikon}</span><b class="kartAd">${b.ad}</b>
      <small class="kartKisa">${kartKisa(k)}</small></div>
    <p class="turEtiketi tur-${kartTuru(k)}">${tur.ikon} ${tur.ad} kartı · ${tur.aciklama}</p>
    <p>${b.aciklama}</p>
    ${b.pasif ? '<p class="soluk kucuk">Bu kart oynanmaz: elinde durduğu sürece kendiliğinden çalışır.</p>' : ''}
    <div class="butonlar"><button class="ana" onclick="bilgiKapat()">Tamam</button></div>`);
}

// ---------- Kart oynanınca ortada beliren büyük kart ----------
// Peş peşe oynanan kartlar sıraya girer, üst üste binmez. Tıklayınca hemen geçer.
const kartKuyrugu = [];
let kartGosteriliyor = false;
const KART_GOSTERI_SURESI = 1900;

function kartGosterisi(k, oynayanNo, hedefNo = null, not = '') {
  kartKuyrugu.push({ k, oynayanNo, hedefNo, not });
  if (!kartGosteriliyor) siradakiKartiGoster();
}

function siradakiKartiGoster() {
  const siradaki = kartKuyrugu.shift();
  const sahne = $('kartSahnesi');
  if (!siradaki) {
    kartGosteriliyor = false;
    sahne.classList.add('gizli');
    return;
  }
  kartGosteriliyor = true;
  const { k, oynayanNo, hedefNo, not } = siradaki;
  const oynayan = oyun.oyuncular[oynayanNo];
  const hedef = hedefNo === null ? null : oyun.oyuncular[hedefNo];
  const kim = hedef ? `${isim(oynayan)} <span class="ok">➜</span> ${isim(hedef)}` : `${isim(oynayan)} oynadı`;
  sahne.innerHTML = `
    <div class="kartGosteri">
      ${kartYuzu(k).replace('class="kartYuz', 'class="kartYuz buyuk')}
      <div class="kartKim">${kim}</div>
      ${not ? `<div class="kartNot">${not}</div>` : ''}
    </div>`;
  sahne.classList.remove('gizli');
  // Animasyonu baştan başlat
  const kutu = sahne.firstElementChild;
  kutu.style.animation = 'none';
  void kutu.offsetWidth;
  kutu.style.animation = '';
  clearTimeout(sahne.zamanlayici);
  sahne.zamanlayici = setTimeout(siradakiKartiGoster, KART_GOSTERI_SURESI);
}

function kartGosterisiniGec() {
  clearTimeout($('kartSahnesi').zamanlayici);
  siradakiKartiGoster();
}

// 3D tahtada piyonun üstünde efekt (CSS tahtasında bir şey yapmaz)
function piyonEfekti(oyuncuNo, tip) {
  if (UC_BOYUT && tip) Tahta3D.piyonEfekti(oyuncuNo, tip);
}

// Kart oynandığında piyonlarda çıkacak efektler
function kartPiyonEfekti(k, oynayanNo, hedefNo) {
  const tip = k in KART_PIYON_EFEKTI ? KART_PIYON_EFEKTI[k]
    : kartTuru(k) === 'saldiri' ? 'patlama' : 'parilti';
  if (hedefNo !== null && hedefNo !== undefined) {
    piyonEfekti(hedefNo, tip);
  } else if (kartTuru(k) !== 'saldiri') {
    piyonEfekti(oynayanNo, tip);
  }
}

// ---------- Elde değişenler: yeni taş yeşil parlar, giden taş kırmızı uçar ----------
// Her çizimde önceki hal ile karşılaştırılır. Animasyonlar zaman damgasıyla saklanır ki
// ekran arada yeniden çizilse de kaldığı yerden devam etsin.
const EL_ANIM_SURESI = 1600;
let elIzleri = [];

function elIzleriniSifirla() {
  elIzleri = [];
}

// Çoklu küme farkı: yeni listede fazladan olanlar ve eskiden olup gidenler
function listeFarki(eski, yeni) {
  const kalan = [...eski];
  const eklenen = [];
  yeni.forEach(x => {
    const i = kalan.indexOf(x);
    if (i === -1) eklenen.push(x);
    else kalan.splice(i, 1);
  });
  return { eklenen, giden: kalan };
}

// Oyuncunun elindeki değişiklikleri kaydeder, süresi dolanları atar
function elDegisiminiIzle(o, i) {
  const simdi = performance.now();
  const onceki = elIzleri[i];
  const iz = {
    harfler: [...o.harfler], kartlar: [...o.kartlar], puan: o.puan, murekkep: o.murekkep,
    yeniHarf: [], gidenHarf: [], yeniKart: [], puanDegisim: null, murekkepDegisim: null,
  };
  if (onceki) {
    const taze = x => simdi - x.t < EL_ANIM_SURESI;
    const h = listeFarki(onceki.harfler, o.harfler);
    const k = listeFarki(onceki.kartlar, o.kartlar);
    iz.yeniHarf = [...onceki.yeniHarf.filter(taze), ...h.eklenen.map(x => ({ x, t: simdi }))];
    iz.gidenHarf = [...onceki.gidenHarf.filter(taze), ...h.giden.map(x => ({ x, t: simdi }))];
    iz.yeniKart = [...onceki.yeniKart.filter(taze), ...k.eklenen.map(x => ({ x, t: simdi }))];
    iz.puanDegisim = o.puan !== onceki.puan ? { fark: o.puan - onceki.puan, t: simdi }
      : onceki.puanDegisim && taze(onceki.puanDegisim) ? onceki.puanDegisim : null;
    iz.murekkepDegisim = o.murekkep !== onceki.murekkep ? { fark: o.murekkep - onceki.murekkep, t: simdi }
      : onceki.murekkepDegisim && taze(onceki.murekkepDegisim) ? onceki.murekkepDegisim : null;
    // Yeni/giden kaydı silinen harfle eşleşiyorsa (geldi-gitti) birbirini götürmesin diye olduğu gibi kalır
  }
  elIzleri[i] = iz;
  return iz;
}

// Animasyonun kaldığı yerden sürmesi için negatif gecikme
const animGecikme = t => `animation-delay:-${Math.round(performance.now() - t)}ms`;

// Elindeki harfler: yeni gelenler parlar, gidenler sonda kırmızı uçarak kaybolur
function elHarfleriniCiz(o, iz) {
  const yeniler = [...iz.yeniHarf];
  const taslar = o.harfler.map(h => {
    const j = yeniler.findIndex(y => y.x === h);
    if (j === -1) return harfTasi(h);
    const [y] = yeniler.splice(j, 1);
    return harfTasi(h).replace('class="harf', `style="${animGecikme(y.t)}" class="harf yeniTas`);
  });
  const gidenler = iz.gidenHarf.map(g =>
    harfTasi(g.x).replace('class="harf', `style="${animGecikme(g.t)}" class="harf gidenTas`));
  return taslar.join('') + gidenler.join('');
}

// Rakibin gizli eli: sadece sayı, değişince yeşil/kırmızı yanıp söner
function gizliSayac(metin, iz) {
  const yeni = iz.yeniHarf.at(-1);
  const giden = iz.gidenHarf.at(-1);
  const son = [yeni && { sinif: 'artiYanip', t: yeni.t }, giden && { sinif: 'eksiYanip', t: giden.t }]
    .filter(Boolean).sort((a, b) => b.t - a.t)[0];
  return `<i class="soluk ${son ? son.sinif : ''}" ${son ? `style="${animGecikme(son.t)}"` : ''}>${metin}</i>`;
}

// Puan/mürekkep değişince sayı büyüyüp parlar, yanında +12 gibi bir yazı uçar
function degisimRozeti(d, birim = '') {
  if (!d) return '';
  return `<span class="ucanFark ${d.fark > 0 ? 'arti' : 'eksi'}" style="${animGecikme(d.t)}">`
    + `${d.fark > 0 ? '+' : '−'}${Math.abs(d.fark)}${birim}</span>`;
}

// ---------- Geçiş afişi: KELİME TURU!, Sıra sende! ----------
// gecisAfisi online'da misafire de gönderilir; afisGoster sadece bu ekranda gösterir.
function gecisAfisi(baslik, alt = '') {
  afisGoster(baslik, alt);
}

function afisGoster(baslik, alt = '', kucuk = false) {
  const afis = $('gecisAfisi');
  afis.innerHTML = `<div class="afisBaslik">${baslik}</div>${alt ? `<div class="afisAlt">${alt}</div>` : ''}`;
  afis.classList.toggle('kucuk', kucuk);
  afis.classList.remove('gizli');
  afis.style.animation = 'none';
  void afis.offsetWidth;
  afis.style.animation = '';
  clearTimeout(afis.zamanlayici);
  afis.zamanlayici = setTimeout(() => afis.classList.add('gizli'), kucuk ? 1300 : 2000);
}

// Sıra değişince kısa bir "Sıra sende!" afişi (her cihaz kendi ekranında gösterir)
let sonSiraAnahtari = '';
function siraAfisiKontrol() {
  if (oyun.faz !== 'zar') return;
  const anahtar = `${oyun.tur}-${oyun.sira}`;
  if (anahtar === sonSiraAnahtari) return;
  sonSiraAnahtari = anahtar;
  const o = aktif();
  if (online()) {
    if (benimSiram()) afisGoster('🎲 Sıra sende!', '', true);
  } else if (oyun.oyuncular.length > 1) {
    afisGoster(`🎲 Sıra: <span style="color:${o.renk}">${guvenli(o.ad)}</span>`, '', true);
  }
}

// ---------- Kayıt satırlarının rengi: hangi kartla ilgiliyse o türün rengi ----------
function kayitTuru(metin) {
  for (const [k, b] of Object.entries(KARTLAR)) {
    if (metin.startsWith(b.ikon) || metin.includes(`<b>${b.ad}</b>`)) return kartTuru(k);
  }
  if (/kaybetti|iflas|vergi|tuzağına/.test(metin)) return 'kotu';
  if (/buldu|bonus|hazine|kazandı|topladı|aldı/.test(metin)) return 'iyi';
  return '';
}

// ---------- Kare bilgisi: tahtada bir kareye dokununca ne işe yaradığı ----------
const KARE_ACIKLAMA = {
  baslangic: 'Başlangıç. Üstünden geçince ya da durunca 1 harf alırsın.',
  harf:      'Durursan torbadan 1 harf alırsın.',
  bonus:     'Durursan 2 harf alırsın.',
  hazine:    'Durursan 3 harf alırsın!',
  kart:      `Durursan bir kart çekersin (elinde en fazla ${MAX_KART} kart olur).`,
  saldir:    'Durursan elindeki bir saldırı kartını rakibine kullanabilirsin. Saldırı kartın yoksa bir kart çekersin (elin doluysa 1 harf alırsın).',
  ceza:      'Durursan rastgele 1 harfini kaybedersin.',
  kartKaybi: 'Durursan rastgele 1 kartını kaybedersin.',
  market:    'Üstünden geçerken bile uğrarsın: 3 karttan birini mürekkeple satın alabilirsin.',
  vergi:     'Durursan vergi ödersin. Mürekkebin biterse iflas edip bir tur beklersin.',
};

function kareAciklamasi(tip) {
  if (tip === 'baslangic' && oyun.tahta?.ekonomi) {
    return `Başlangıç. Üstünden her geçişinde +${oyun.tahta.ekonomi.gecisMurekkep} 🖋️ mürekkep alırsın.`;
  }
  if (tip === 'vergi' && oyun.tahta?.ekonomi) {
    return `Durursan ${oyun.tahta.ekonomi.vergi} 🖋️ vergi ödersin. Mürekkebin biterse iflas edip bir tur beklersin.`;
  }
  return KARE_ACIKLAMA[tip];
}

function kareBilgisiGoster(kareNo, x, y) {
  const kare = oyun.tahta.kareler[kareNo];
  const b = kareBilgisi(kare.tip);
  const satirlar = [`<b>${b.ikon} ${b.yazi}</b>`, kareAciklamasi(kare.tip)];
  const nesne = oyun.nesneler[kareNo];
  if (nesne) {
    const sahip = oyun.oyuncular[nesne.sahip];
    const n = TAHTA_NESNELERI[nesne.tip];
    satirlar.push(`${n.ikon} Burada ${isim(sahip)} oyuncusunun ${n.ad} var: ${kartKisa(nesne.tip).toLowerCase()}.`);
  }
  if (kareNo in oyun.toplanacaklar) {
    satirlar.push(`💎 Dönen <b>${oyun.toplanacaklar[kareNo]}</b> taşı: üstünden geçen alır.`);
  }
  const buradakiler = oyun.oyuncular.filter(o => o.konum === kareNo);
  if (buradakiler.length) satirlar.push(`Burada: ${buradakiler.map(isim).join(', ')}`);

  const balon = $('kareBalonu');
  balon.innerHTML = satirlar.join('<br>');
  balon.classList.remove('gizli');
  // Balon parmağın biraz üstünde durur, ekrandan taşmaz
  const w = balon.offsetWidth;
  const h = balon.offsetHeight;
  balon.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, x - w / 2))}px`;
  balon.style.top = `${Math.max(8, y - h - 16)}px`;
  clearTimeout(balon.zamanlayici);
  balon.zamanlayici = setTimeout(() => balon.classList.add('gizli'), 4000);
}

// ---------- İlk oyun ipuçları: her biri bir kez gösterilir ----------
const IPUCU_ANAHTARI = 'harfAvcilari.ipuclari';
const IPUCLARI = {
  zar: '🎲 Sıra sende! <b>Zar At</b> düğmesine bas. Tahtadaki bir kareye dokunursan ne işe yaradığını görürsün.',
  onZar: '🃏 Zar atmadan önce elindeki bir kartı oynayabilirsin. Çerçeve rengi kartın türü: '
    + '<span class="turYazi tur-saldiri">kırmızı saldırı</span>, <span class="turYazi tur-yardim">yeşil yardım</span>, '
    + '<span class="turYazi tur-savunma">mavi savunma</span>, <span class="turYazi tur-tahta">mor tahta</span>.',
  yolSecimi: '🔀 Yol ayrımı! Tahtadaki oklardan birine ya da aşağıdaki yol düğmesine bas.',
  saldiri: '⚔️ Kart kullan karesindesin: önce kartı, sonra kime kullanacağını seç. İstersen saklayabilirsin.',
  market: '🏪 Market: mürekkebinle bir kart alabilirsin. Mürekkep, başlangıçtan geçince ve kelime turu ödülleriyle gelir.',
  kareSecimi: '👆 Tahtada bir kareye dokun. Sarı çerçeve, seçebileceğin kareyi gösterir.',
  kelime: '🔤 Harflerine sırayla dokunarak kelime kur, sonra <b>Gönder</b>. Köşedeki sayı harfin puanı. '
    + `Tüm harflerini kullanıp en az ${BITIRME_MIN_HARF} harfli kelime kurarsan +${BITIRME_BONUSU}!`,
};

function gorulenIpuclari() {
  try {
    return JSON.parse(localStorage.getItem(IPUCU_ANAHTARI)) || [];
  } catch (e) {
    return [];
  }
}

function ipucuKontrol(anahtar, kutuId) {
  const balon = $(kutuId);
  if (!anahtar || gorulenIpuclari().includes(anahtar)) {
    balon.classList.add('gizli');
    return;
  }
  balon.innerHTML = `<span>${IPUCLARI[anahtar]}</span>
    <button onclick="ipucuKapat('${anahtar}', '${kutuId}')">Anladım ✓</button>`;
  balon.classList.remove('gizli');
}

function ipucuKapat(anahtar, kutuId) {
  try {
    localStorage.setItem(IPUCU_ANAHTARI, JSON.stringify([...gorulenIpuclari(), anahtar]));
  } catch (e) { /* hatırlanamazsa bir dahakine yine gösterilir */ }
  $(kutuId).classList.add('gizli');
}

function ipuclariniSifirla() {
  try {
    localStorage.removeItem(IPUCU_ANAHTARI);
  } catch (e) { /* sorun değil */ }
  $('ipucuSifirlandi').textContent = '✓ İpuçları bir sonraki oyunda yeniden gösterilecek';
}

// Tahta ekranında şu an hangi ipucu uygun?
function tahtaIpucuSec() {
  if (!benimSiram()) return null;
  const onZar = oyun.faz === 'zar' && oyun.tahta.onZarKartlari && !oyun.onKartKullanildi
    && onZarKartlari(aktif()).length > 0;
  if (onZar) return 'onZar';
  return { zar: 'zar', yolSecimi: 'yolSecimi', saldiri: 'saldiri', market: 'market', kareSecimi: 'kareSecimi' }[oyun.faz]
    ?? null;
}

// ---------- 📖 Nasıl oynanır? rehberi ----------
const REHBER_SAYFALARI = [
  {
    baslik: '🎯 Amaç',
    metin: `<p>Tahtada zar atarak dolaş, <b>harf topla</b>. Birkaç turda bir <b>kelime turu</b> gelir:
      herkes elindeki harflerle bir kelime kurar ve puan kazanır.</p>
      <p><b>Hedef puana ilk ulaşan kazanır!</b></p>
      <div class="ornekSatir">${['K', 'A', 'L', 'E', 'M'].map(h => harfTasi(h)).join('')} <span>= ${['K', 'A', 'L', 'E', 'M'].reduce((t, h) => t + HARF_PUANI[h], 0)} puan</span></div>`,
  },
  {
    baslik: '🎲 Sıran gelince',
    metin: `<ol>
      <li><b>(İstersen) kart oyna:</b> genişletilmiş tahtada zar atmadan önce elindeki bir kartı kullanabilirsin.</li>
      <li><b>Zar at:</b> piyonun o kadar ilerler. Gidebileceğin kareler sarı çerçeveyle parlar.</li>
      <li><b>Yol ayrımı:</b> oklardan birine basıp yolunu seçersin.</li>
      <li><b>Durduğun kare çalışır:</b> harf, kart, ceza, market...</li>
    </ol>
    <p class="soluk kucuk">Tahtada bir kareye dokunursan ne işe yaradığını görürsün.</p>`,
  },
  {
    baslik: '🃏 Kartlar',
    metin: `<p>🃏 karesinde kart çekersin, marketten kart alırsın. Elinde en fazla ${MAX_KART} kart olur.</p>
      <div class="turListesi">${Object.entries(KART_TURLERI).map(([t, b]) =>
        `<div class="turEtiketi tur-${t}">${b.ikon} <b>${b.ad}</b> — ${b.aciklama}</div>`).join('')}</div>
      <p>Kartın çerçeve rengine bakarak ne işe yaradığını anlarsın. Karta dokunursan açıklaması çıkar.</p>
      <p class="soluk kucuk">🛡️ Kalkan ve 🪞 Ayna gibi bazı kartlar oynanmaz, elinde durup seni kendiliğinden korur.</p>`,
  },
  {
    baslik: '🔤 Kelime turu',
    metin: `<p>Herkes sırayla, süre bitmeden elindeki harflerden bir kelime kurar.</p>
      <ul>
        <li>Kelimenin puanı = harflerin puanları toplamı (taşın köşesinde yazar).</li>
        <li><span class="harf joker">★<sub>0</sub></span> Joker istediğin harf olur, 0 puandır.</li>
        <li>Tüm harflerini kullanıp en az ${BITIRME_MIN_HARF} harfli kelime kurarsan <b>+${BITIRME_BONUSU}</b> bonus!</li>
        <li>Kelime sözlükte yoksa diğerleri 👍/👎 oy verir; online'da son kararı oda kurucusu verir.</li>
        <li>Kullandığın harfler gider, kalanlar seninle tahtaya döner.</li>
      </ul>`,
  },
  {
    baslik: '🖋️ Mürekkep ve market',
    metin: `<p>Genişletilmiş tahtada bir de <b>mürekkep</b> paran var.</p>
      <ul>
        <li>🏁 Başlangıçtan her geçişinde mürekkep kazanırsın.</li>
        <li>🏪 Market karesinden geçerken kart satın alabilirsin.</li>
        <li>💸 Vergi karesi ve 🪤 tuzaklar mürekkebini alır. Biterse <b>iflas</b> edip bir tur beklersin.</li>
        <li>Kelime turunda en çok puan alan en çok mürekkep ödülü kazanır.</li>
      </ul>`,
  },
];

let rehberSayfasi = 0;

function rehberAc(sekme = 'nasil') {
  bilgiPenceresi(`
    <div class="sekmeler">
      <button data-sekme="nasil" onclick="rehberSekme('nasil')">📖 Nasıl oynanır</button>
      <button data-sekme="kartlar" onclick="rehberSekme('kartlar')">🃏 Kartlar</button>
      <button data-sekme="kareler" onclick="rehberSekme('kareler')">🟦 Kareler</button>
    </div>
    <div id="rehberIcerik" class="rehberIcerik"></div>
    <div class="butonlar"><button class="ana" onclick="bilgiKapat()">Kapat</button></div>`, true);
  rehberSayfasi = 0;
  rehberSekme(sekme);
}

function rehberSekme(sekme) {
  document.querySelectorAll('.sekmeler button').forEach(b =>
    b.classList.toggle('secili', b.dataset.sekme === sekme));
  const icerik = $('rehberIcerik');
  if (sekme === 'nasil') {
    const s = REHBER_SAYFALARI[rehberSayfasi];
    icerik.innerHTML = `<h3>${s.baslik}</h3>${s.metin}
      <div class="sayfaGezinti">
        <button ${rehberSayfasi === 0 ? 'disabled' : ''} onclick="rehberGit(-1)">← Önceki</button>
        <span class="soluk">${rehberSayfasi + 1} / ${REHBER_SAYFALARI.length}</span>
        <button ${rehberSayfasi === REHBER_SAYFALARI.length - 1 ? 'disabled' : ''} onclick="rehberGit(1)">Sonraki →</button>
      </div>
      <p class="kucuk"><a href="#" onclick="ipuclariniSifirla(); return false">İlk oyun ipuçlarını yeniden göster</a>
        <span id="ipucuSifirlandi" class="soluk"></span></p>`;
  } else if (sekme === 'kartlar') {
    icerik.innerHTML = Object.entries(KART_TURLERI).map(([t, b]) => `
      <h4 class="turEtiketi tur-${t}">${b.ikon} ${b.ad} kartları — ${b.aciklama}</h4>
      <div class="rehberKartlari">${Object.keys(KARTLAR).filter(k => kartTuru(k) === t).map(k => `
        <div class="rehberKart">${kartYuzu(k)}<p>${KARTLAR[k].aciklama}</p></div>`).join('')}
      </div>`).join('');
  } else {
    const tipler = Object.keys(KARE_BILGI);
    icerik.innerHTML = `<div class="kareListesi">${tipler.map(t => `
      <div class="kareSatiri"><span class="kareOrnek kare-${t}">${KARE_BILGI[t].ikon}</span>
        <div><b>${KARE_BILGI[t].yazi}</b><br><span class="soluk">${kareAciklamasi(t)}</span></div></div>`).join('')}
      <h4>Tahtaya konanlar</h4>
      ${Object.entries(TAHTA_NESNELERI).map(([k, n]) => `
      <div class="kareSatiri"><span class="kareOrnek">${n.ikon}</span>
        <div><b>${KARTLAR[k].ad}</b><br><span class="soluk">${KARTLAR[k].aciklama.replace(' (Genişletilmiş tahta)', '')}</span></div></div>`).join('')}
      <div class="kareSatiri"><span class="kareOrnek">💎</span>
        <div><b>Dönen harf taşı</b><br><span class="soluk">Genişletilmiş tahtada karelerin üstünde döner. Üstünden geçen alır (bazen ★ joker!).</span></div></div>
    </div>`;
  }
}

function rehberGit(yon) {
  rehberSayfasi = Math.max(0, Math.min(REHBER_SAYFALARI.length - 1, rehberSayfasi + yon));
  rehberSekme('nasil');
}

// Kurulum ekranındaki kart listesinde her kartın solunda türünün rengi
function kartSecimiRenklendir() {
  document.querySelectorAll('.kartKutusu').forEach(kutu => {
    kutu.closest('.kartSecenek').classList.add(`tur-${kartTuru(kutu.value)}`);
  });
}

// ---------- 😂 Emoji tepkileri (online) ----------
const TEPKILER = ['👏', '😂', '😱', '😡', '🔥', '👍'];

function tepkiCubugunuCiz() {
  $('tepkiCubugu').innerHTML = TEPKILER.map(e => `<button onclick="tepkiGonder('${e}')">${e}</button>`).join('');
}

// Ekranın altından, oyuncunun adıyla birlikte yükselip kaybolan emoji
function tepkiGoster(oyuncuNo, emoji) {
  const o = oyun.oyuncular?.[oyuncuNo];
  if (!o || !TEPKILER.includes(emoji)) return;
  const el = document.createElement('div');
  el.className = 'tepki';
  el.style.left = `${10 + Math.random() * 75}vw`;
  el.innerHTML = `<span class="tepkiEmoji">${emoji}</span><span class="tepkiAd" style="color:${o.renk}">${guvenli(o.ad)}</span>`;
  $('tepkiAlani').appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// ---------- Bağlantılar ----------
$('bilgiPerde').addEventListener('click', e => {
  if (e.target.id === 'bilgiPerde') bilgiKapat();
});
$('kartSahnesi').addEventListener('click', kartGosterisiniGec);
$('kareBalonu').addEventListener('click', () => $('kareBalonu').classList.add('gizli'));
$('rehberBtn').addEventListener('click', () => rehberAc());
$('rehberUstBtn').addEventListener('click', () => rehberAc());
kartSecimiRenklendir();
tepkiCubugunuCiz();
