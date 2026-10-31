// =============================================================
// Harf Avcıları - online oyun (2-6 kişi, oda koduyla)
// Bağlantı PeerJS ile cihazlar arasında doğrudan kurulur (kendi sunucumuz yok).
// Herkes odayı açan cihaza bağlanır (yıldız şeklinde):
//
//   Ev (odayı açan): oyunun kurallarını çalıştırır. Misafirlerden gelen hamleleri uygular;
//                    her değişiklikte hepsine durumu ve ses/animasyon olaylarını gönderir.
//   Misafir:         hamlelerini (zar at, kart oyna...) eve gönderir; gelen durumu ekrana
//                    çizer, gelen olayları (ses, zar, yükselen yazılar) aynen oynatır.
//
// Mesajlar:
//   misafir → ev: { tip: 'katil', ad, renk, surum }  { tip: 'eylem', ad, args }
//   ev → misafir: { tip: 'kabul', no, surum }  { tip: 'lobi', oyuncular }  { tip: 'red', neden }  { tip: 'basla', tahta }
//                 { tip: 'durum', ... }  { tip: 'olay', ad, args }
// =============================================================

// Online oyunun sürümü: ev ve misafirlerde aynı olmalı. Online kısmı her değiştiğinde 1 artır;
// eski sürümle (önbellekte kalmış dosyalarla) gelen oyuncu odaya alınmaz, güncellemesi istenir.
const SURUM = 5;
const ODA_ONEKI = 'harf-avcilari-oda-';
const KOD_HARFLERI = 'ABCDEFGHJKLMNPRSTUVYZ23456789';  // karışabilecek O/0, I/1 yok
const ODA_KODU_UZUNLUK = 5;
const EN_FAZLA_OYUNCU = 6;
const ag = {
  peer: null,
  baglanti: null,     // misafirde: eve olan bağlantı
  misafirler: [],     // evde: { baglanti, no, ad, renk, sonMesaj }
  basladi: false,     // evde: oyun başladıysa yeni gelen alınmaz
  uyari: '',          // evde: bekleme odasında gösterilecek uyarı (eski sürümle gelen oldu vb.)
  gonderimBekliyor: false,
  tahtaKuruldu: false,
  sonMesaj: 0,
};

// Bir taraf sekmeyi/uygulamayı aniden kapatırsa bağlantı "kapandım" diyemeyebilir.
// Bu yüzden taraflar birbirine düzenli "nabız" atar; uzun süre ses gelmezse bağlantı kopmuş sayılır.
const NABIZ_ARALIGI = 3000;
const NABIZ_ZAMAN_ASIMI = 30000;

// Misafirin eve gönderebileceği hamleler; başka bir şey gelirse yok sayılır
const EYLEMLER = new Set([
  'zarAt', 'yolSec', 'onZarKartiSec', 'saldiriKartSec', 'saldiriHedefSec', 'saldiriVazgec',
  'secimIptal', 'ozelHarfAl', 'degnekSec', 'kareTiklandi', 'casusAt', 'marketAl', 'marketKapat',
  'tekrarCevapla', 'harfSec', 'harfSil', 'pasGec', 'kelimeyiGonder', 'oyla', 'jokerHarfiSec',
  'jokerIptal', 'taslariKaristir', 'tahtayaDevam', 'marketBirak', 'marketDegisimIptal',
]);
const KELIME_EYLEMLERI = new Set([
  'harfSec', 'harfSil', 'pasGec', 'kelimeyiGonder', 'jokerHarfiSec', 'jokerIptal', 'taslariKaristir',
]);

// Evde çalışıp misafirlerde de aynen oynatılan ses/animasyon olayları
const OLAYLAR = ['sesCal', 'efekt', 'kayit', 'konfeti', 'zarSonucunuGoster', 'zarSonucunuGizle',
  'kartGosterisi', 'gecisAfisi'];
const TAHTA_OLAYLARI = ['zarAt', 'carkCevir', 'harfToplandi', 'nesneTetiklendi', 'zarlariGoster', 'piyonEfekti'];

// ---------- Hamleler ----------
// Bu oyuncu bu hamleyi şu an yapabilir mi?
function eylemIzniVar(ad, oyuncuNo, args) {
  if (ad === 'tahtayaDevam') return true;
  if (ad === 'oyla') {
    // Sözlükte bulunan kelimede "Devam"a kuran basar; bulunamayanı diğerleri oylar (her biri bir kez)
    const kuran = oyun.finalSira === oyuncuNo;
    if (args[1] === false) return kuran;
    return !kuran && oyun.oylar?.[oyuncuNo] === undefined;
  }
  if (KELIME_EYLEMLERI.has(ad)) return oyun.faz === 'kelime' && oyun.finalSira === oyuncuNo;
  return oyun.faz !== 'kelime' && oyun.sira === oyuncuNo;
}

// Hamleyi uygula. Kelime oylaması ayrı: 3+ kişide oylar toplanır, çoğunluk karar verir.
function eylemUygula(ad, oyuncuNo, args) {
  if (!eylemIzniVar(ad, oyuncuNo, args)) return;
  if (ad === 'oyla' && args[1] !== false) oyVer(oyuncuNo, args[0]);
  else window[ad](...args);
}

// game.js'teki eylem() online için değişir
eylem = function (ad, ...args) {
  if (AG.mod === 'misafir') gonder({ tip: 'eylem', ad, args });
  else if (AG.mod === 'ev') eylemUygula(ad, AG.benimNo, args);
  else window[ad](...args);
};

// ---------- 🗳️ Kelime oylaması ----------
// Kelimeyi kuran dışında, hâlâ oyunda olan herkes oy verir. Yarısı ya da fazlası "geçerli"
// derse kabul (berabere kalırsa kelime sahibi kazanır), yarıdan fazlası "geçersiz" derse ret.
function secmenler() {
  return oyun.oyuncular.map((_, i) => i).filter(i => i !== oyun.finalSira && !oyun.oyuncular[i].koptu);
}

function oyVer(oyuncuNo, gecerli) {
  oyun.oylar ??= {};
  oyun.oylar[oyuncuNo] = !!gecerli;
  oyKontrol();
}

function oyKontrol() {
  if (!oyun.oylar || $('oylama').classList.contains('gizli')) return;
  const kisiler = secmenler();
  const evet = kisiler.filter(i => oyun.oylar[i] === true).length;
  const hayir = kisiler.filter(i => oyun.oylar[i] === false).length;
  if (evet * 2 >= kisiler.length || hayir * 2 > kisiler.length) {
    const sonuc = evet * 2 >= kisiler.length;
    if (kisiler.length > 1) kayit(`🗳️ Oylama: ${evet} geçerli, ${hayir} geçersiz → <b>${sonuc ? 'kabul' : 'ret'}</b>`);
    oyun.oylar = null;
    oyla(sonuc);
    return;
  }
  const bekleyen = kisiler.filter(i => oyun.oylar[i] === undefined).map(i => guvenli(oyun.oyuncular[i].ad));
  $('oyDurumu').innerHTML = `🗳️ Oylar: ✓ ${evet} · ✗ ${hayir} · bekleniyor: ${bekleyen.join(', ')}`;
  finalYetkiAyarla();
  durumDegisti();
}

// ---------- Durum ve olay aktarımı (evden misafirlere) ----------
function gonder(mesaj) {
  if (AG.mod === 'misafir') {
    if (ag.baglanti?.open) ag.baglanti.send(mesaj);
    return;
  }
  ag.misafirler.forEach(m => {
    if (m.baglanti.open) m.baglanti.send(mesaj);
  });
}

// Aynı anda birçok değişiklik olursa tek mesajda gönderilsin diye kısa bir bekleme
durumDegisti = function () {
  if (AG.mod !== 'ev' || !ag.misafirler.length || ag.gonderimBekliyor) return;
  ag.gonderimBekliyor = true;
  setTimeout(() => {
    ag.gonderimBekliyor = false;
    durumGonder();
  }, 0);
};

function durumGonder() {
  const ekran = document.querySelector('.ekran:not(.gizli)').id;
  if (ekran === 'kurulum') return;
  gonder({
    tip: 'durum',
    ekran,
    // Tahta her yerde aynı tanımdan kurulur, gönderilmez; zamanlayıcı numarası da işe yaramaz
    oyun: JSON.parse(JSON.stringify(oyun, (k, v) => (k === 'tahta' || k === 'sayac' ? undefined : v))),
    // Kelime turu ve sonuç ekranları olduğu gibi kopyalanır
    html: ekran === 'final' || ekran === 'sonuc' ? $(ekran).innerHTML : null,
  });
}

agOyunBasladi = function () {
  if (AG.mod !== 'ev') return;
  ag.basladi = true;
  ag.tahtaTipi = $('tahtaSecimi').value;
  gonder({ tip: 'basla', tahta: ag.tahtaTipi });
};

// Olay fonksiyonlarını sar: evde çağrılınca misafirlere de gönderilsin
OLAYLAR.forEach(ad => {
  const asil = window[ad];
  window[ad] = (...args) => {
    if (AG.mod === 'ev') gonder({ tip: 'olay', ad, args });
    return asil(...args);
  };
});
if (typeof Tahta3D !== 'undefined' && Tahta3D.hazirMi()) {
  TAHTA_OLAYLARI.forEach(ad => {
    const asil = Tahta3D[ad];
    Tahta3D[ad] = (...args) => {
      if (AG.mod === 'ev') gonder({ tip: 'olay', ad: `Tahta3D.${ad}`, args });
      return asil(...args);
    };
  });
}

// ---------- Ev: oda açma ----------
function odaKoduUret() {
  return [...Array(ODA_KODU_UZUNLUK)].map(() => KOD_HARFLERI[rastgele(0, KOD_HARFLERI.length - 1)]).join('');
}

// Online'da herkesin adı olmalı (kim kim belli olsun). Yoksa ad kutusu kırmızı parlar.
function onlineAdi() {
  const kutu = $('onlineAd');
  const ad = kutu.value.trim();
  if (!ad) {
    kutu.classList.remove('eksik');
    void kutu.offsetWidth;
    kutu.classList.add('eksik');
    kutu.focus();
    onlineDurum('✏️ Önce adını yaz, sonra tekrar bas.');
    return null;
  }
  kutu.classList.remove('eksik');
  $('isimAlanlari').querySelector('input').value = ad;
  return ad;
}

function odaAc() {
  if (!onlineAdi() || !peerVarMi()) return;
  const kod = odaKoduUret();
  onlineDurum('⏳ Oda açılıyor...');
  ag.peer = new Peer(ODA_ONEKI + kod);
  ag.peer.on('open', () => {
    if (AG.mod === 'ev') return;  // internet gidip gelince tekrar "open" gelir; oda zaten açık
    AG.mod = 'ev';
    AG.benimNo = 0;
    ag.kod = kod;
    $('oyuncuSayisi').disabled = true;
    onlineKilitle();
    odaKodunuGoster(kod);
    lobiyiCiz();
    nabziBaslat();
  });
  sunucuyaYenidenBaglan(ag.peer);
  ag.peer.on('connection', baglanti => {
    // Oyun başlamadan oda dolduysa yeni gelen giremez (oyun başladıysa sadece kopan geri girebilir)
    if (!ag.basladi && ag.misafirler.length >= EN_FAZLA_OYUNCU - 1) {
      baglanti.on('open', () => reddet(baglanti, `Oda dolu (${EN_FAZLA_OYUNCU} kişi).`));
      return;
    }
    const misafir = { baglanti, no: null, ad: '', renk: null, sonMesaj: Date.now() };
    baglanti.on('data', m => {
      misafir.sonMesaj = Date.now();
      if (m?.tip !== 'nabiz') evMesaji(misafir, m);
    });
    baglanti.on('close', () => misafirKoptu(misafir));
    baglanti.on('error', () => misafirKoptu(misafir));
  });
  ag.peer.on('error', e => {
    if (e.type === 'unavailable-id') odaAc();  // aynı kod kullanılıyormuş, yenisini dene
    else if (AG.mod !== 'ev') onlineDurum(`❌ Oda açılamadı (${e.type}). İnternet bağlantını kontrol et.`);
  });
}

function reddet(baglanti, neden) {
  baglanti.send({ tip: 'red', neden });
  setTimeout(() => baglanti.close(), 500);
}

// Bekleme odası: ev sahibi + katılanlar isim kutularında görünür (misafirlerinkiler değiştirilemez)
function lobiyiCiz() {
  const kutular = $('isimAlanlari').querySelectorAll('input');
  const benimAdim = kutular[0]?.value ?? '';
  const isimler = [benimAdim, ...ag.misafirler.map(m => m.ad)];
  const renkler = [kurulumRenkleri[0], ...ag.misafirler.map(m => m.renk)];
  // Henüz kimse yoksa 2. satır "bekleniyor" olarak durur
  $('oyuncuSayisi').value = String(Math.max(2, isimler.length));
  isimAlanlariniCiz(isimler, renkler);
  const yeni = $('isimAlanlari').querySelectorAll('input');
  yeni.forEach((kutu, i) => {
    if (i === 0) return;
    kutu.disabled = true;
    if (i > ag.misafirler.length) {
      kutu.value = '';
      kutu.placeholder = 'Arkadaşların bekleniyor...';
    }
  });
  // Misafirlerin renkleri sadece kendileri tarafından seçilir
  document.querySelectorAll('#isimAlanlari .oyuncuSatiri').forEach((satir, i) => {
    if (i > 0) satir.querySelector('.renkSecimi').classList.add('izleyici');
  });
  $('baslaBtn').disabled = !ag.misafirler.length;
  const kisi = ag.misafirler.length + 1;
  onlineDurum(ag.uyari + `Oda kodun: <b class="odaKodu">${ag.kod}</b><br>`
    + `Bu kodu arkadaşlarına söyle, "Katıl" kısmına yazsınlar. 👥 <b>${kisi}/${EN_FAZLA_OYUNCU}</b> kişi`
    + (ag.misafirler.length ? '<br>Herkes geldiyse ayarları seçip "Oyunu Başlat"a bas.' : '<br>⏳ Bekleniyor...'));
  gonder({ tip: 'lobi', oyuncular: isimler.map((ad, i) => ({ ad: ad || 'Oda sahibi', renk: renkler[i] })) });
}

function evMesaji(misafir, m) {
  if (m?.tip === 'katil' && misafir.no === null) {
    // Eski sürümle gelen oyuncu oyunu bozar (kendini yanlış oyuncu sanır): güncellemesi istenir
    if (m.surum !== SURUM) {
      const ad = guvenli(String(m.ad ?? '').slice(0, 12) || 'Biri');
      reddet(misafir.baglanti, 'Uygulaman eski sürümde kalmış. Uygulamayı tamamen kapatıp yeniden aç (tarayıcıdaysan sayfayı yenile), sonra tekrar katıl.');
      if (ag.basladi) {
        kayit(`⚠️ ${ad} eski sürümle bağlanmaya çalıştı: uygulamayı kapatıp yeniden açsın`);
      } else {
        ag.uyari = `⚠️ <b>${ad}</b> eski sürümle bağlanmaya çalıştı: uygulamayı kapatıp yeniden açsın, sonra tekrar katılsın.<br>`;
        lobiyiCiz();
      }
      return;
    }
    if (ag.basladi) {
      oyunaGeriAl(misafir, m);
      return;
    }
    if (ag.misafirler.length >= EN_FAZLA_OYUNCU - 1) {
      reddet(misafir.baglanti, `Oda dolu (${EN_FAZLA_OYUNCU} kişi).`);
      return;
    }
    misafir.ad = String(m.ad ?? '').slice(0, 12) || `Oyuncu ${ag.misafirler.length + 2}`;
    // İstediği renk alınmışsa boştaki ilk renk verilir
    const alinan = [kurulumRenkleri[0], ...ag.misafirler.map(x => x.renk)];
    misafir.renk = RENKLER.includes(m.renk) && !alinan.includes(m.renk)
      ? m.renk : RENKLER.find(r => !alinan.includes(r));
    ag.misafirler.push(misafir);
    ag.uyari = '';
    numaralariDagit();
    lobiyiCiz();
    onlineDurum(`✅ <b>${guvenli(misafir.ad)}</b> odaya katıldı!<br>` + $('onlineDurum').innerHTML);
    sesCal('bonus');
    return;
  }
  if (m?.tip === 'eylem' && misafir.no !== null && EYLEMLER.has(m.ad) && Array.isArray(m.args)) {
    eylemUygula(m.ad, misafir.no, m.args);
  }
}

// 🔄 Oyun başladıktan sonra gelen: aynı adla oynayan bir oyuncu varsa onun yerine geri girer
// ve kaldığı yerden devam eder (harfleri, kartları, puanı aynen durur).
function oyunaGeriAl(misafir, m) {
  const ad = String(m.ad ?? '').trim().toLocaleLowerCase('tr');
  const no = oyun.oyuncular.findIndex((o, i) => i > 0 && o.ad.trim().toLocaleLowerCase('tr') === ad);
  if (no === -1) {
    reddet(misafir.baglanti, 'Oyun başlamış. Kopan bir oyuncuysan oyundaki adının aynısını yazıp tekrar katıl.');
    return;
  }
  // Eski bağlantısı hâlâ listede görünüyorsa (kopuşu henüz fark edilmediyse) sessizce çıkarılır
  const eski = ag.misafirler.find(x => x.no === no);
  if (eski) {
    ag.misafirler.splice(ag.misafirler.indexOf(eski), 1);
    eski.baglanti.close();
  }
  const o = oyun.oyuncular[no];
  misafir.no = no;
  misafir.ad = o.ad;
  misafir.renk = o.renk;
  ag.misafirler.push(misafir);
  o.koptu = false;
  misafir.baglanti.send({ tip: 'kabul', no, surum: SURUM });
  misafir.baglanti.send({ tip: 'basla', tahta: ag.tahtaTipi });
  kayit(`🔄 ${isim(o)} oyuna geri döndü!`);
  sesCal('bonus');
  durumGonder();
}

// Her misafire oyuncu numarasını bildir (biri ayrılınca numaralar kayar)
function numaralariDagit() {
  ag.misafirler.forEach((m, i) => {
    m.no = i + 1;
    if (m.baglanti.open) m.baglanti.send({ tip: 'kabul', no: m.no, surum: SURUM });
  });
}

function misafirKoptu(misafir) {
  const sira = ag.misafirler.indexOf(misafir);
  if (sira === -1) return;
  // Bekleme odasındaysa sadece listeden çıkar
  if (!ag.basladi) {
    ag.misafirler.splice(sira, 1);
    numaralariDagit();
    lobiyiCiz();
    return;
  }
  ag.misafirler.splice(sira, 1);
  const o = oyun.oyuncular[misafir.no];
  if (!o || o.koptu) return;
  o.koptu = true;
  kayit(`📡 ${isim(o)} bağlantısı koptu. Oda kodu <b>${ag.kod}</b> ve aynı adla geri girebilir; o zamana kadar sırası atlanır.`);
  sesCal('ceza');
  ayrilaninSirasiniGec(misafir.no);
  durumDegisti();
}

// Ayrılan oyuncu tam o an hamle yapıyorsa, onun yerine en zararsız seçimle sıra ilerletilir
function ayrilaninSirasiniGec(no) {
  const ekran = document.querySelector('.ekran:not(.gizli)').id;
  if (ekran === 'final') {
    if (oyun.finalSira === no && !$('kelimeKontrolleri').classList.contains('gizli')) pasGec();
    else oyKontrol();  // oy bekleyen kişi o olabilir
    return;
  }
  if (ekran !== 'oyun' || oyun.sira !== no) return;
  if (oyun.faz === 'yolSecimi') yolSec(oyun.yolSecenekleri[0]);
  else if (oyun.faz === 'market') marketKapat();
  else if (oyun.faz === 'tekrarSorusu') tekrarCevapla(false);
  else if (oyun.faz === 'casusSecimi') casusAt(0);
  else if (oyun.faz === 'saldiri' && oyun.saldiriZamani === 'kare') saldiriVazgec();
  else if (oyun.faz === 'saldiri') saldiriKartSec(null);
  else if (['harfSecimi', 'degnekSecimi', 'kareSecimi'].includes(oyun.faz)) secimIptal();
  if (oyun.faz === 'zar' && oyun.sira === no) sonrakiOyuncu();
}

// ---------- Misafir: odaya katılma ----------
// Misafir: koda bağlanır. Bağlantısı kopan da aynı yolla (aynı kod ve adla) geri girer.
function odayaKatil() {
  if (!onlineAdi() || !peerVarMi()) return;
  const kod = $('odaKodu').value.trim().toUpperCase();
  if (kod.length !== ODA_KODU_UZUNLUK) {
    onlineDurum(`Oda kodu ${ODA_KODU_UZUNLUK} karakter olmalı.`);
    return;
  }
  ag.kod = kod;
  katilmaDurumu('⏳ Odaya bağlanılıyor...');
  try {
    ag.peer?.destroy();
  } catch (e) { /* eski bağlantı zaten kapanmış */ }
  const peer = new Peer();
  ag.peer = peer;
  sunucuyaYenidenBaglan(peer);
  peer.on('open', () => {
    if (ag.peer !== peer || ag.baglanti) return;
    const baglanti = peer.connect(ODA_ONEKI + kod, { reliable: true });
    baglanti.on('open', () => {
      ag.baglanti = baglanti;
      AG.mod = 'misafir';
      gonder({ tip: 'katil', ad: $('onlineAd').value.trim(), renk: kurulumRenkleri[0], surum: SURUM });
      nabziBaslat();
    });
    baglanti.on('data', m => {
      ag.sonMesaj = Date.now();
      if (m?.tip !== 'nabiz') misafirMesaji(m);
    });
    // Yeniden bağlanınca eski bağlantının kapanması yenisini düşürmesin
    baglanti.on('close', () => ag.baglanti === baglanti && baglantiKoptu());
    baglanti.on('error', () => ag.baglanti === baglanti && baglantiKoptu());
  });
  peer.on('error', e => {
    if (ag.peer !== peer || ag.baglanti) return;
    katilmaDurumu(e.type === 'peer-unavailable'
      ? '❌ Bu kodla bir oda bulunamadı. Oda sahibinin oyunu açık mı? Kodu kontrol et.'
      : `❌ Bağlanılamadı (${e.type}). İnternet bağlantını kontrol et.`);
  });
}

// Bağlanma durumu: ana menüdeyse online kutusuna, oyundayken "bağlantı koptu" penceresine yazılır
function katilmaDurumu(html) {
  onlineDurum(html);
  $('kopmaMetni').innerHTML = html;
}

// İnternet gidip gelince PeerJS sunucusuyla bağlantı da kopar; birkaç saniyede bir yeniden denenir.
// (Odayı açanın sunucuya bağlı kalması, kopan arkadaşların geri girebilmesi için şart.)
function sunucuyaYenidenBaglan(peer) {
  peer.on('disconnected', () => {
    setTimeout(() => {
      if (peer.destroyed || !peer.disconnected) return;
      try {
        peer.reconnect();
      } catch (e) { /* bir sonraki denemede yine denenir */ }
    }, 2000);
  });
}

function odaKodunuGoster(kod) {
  $('odaBilgisi').innerHTML = `🔑 Oda: <b>${kod}</b>`;
  $('odaBilgisi').classList.remove('gizli');
}

function misafirMesaji(m) {
  if (m?.tip === 'kabul' && Number.isInteger(m.no)) {
    if (m.surum !== SURUM) {
      ag.baglanti.close();
      ag.baglanti = null;
      AG.mod = 'yerel';
      onlineDurum('❌ Oda sahibinin uygulaması farklı sürümde. İkiniz de uygulamayı kapatıp yeniden açın, sonra tekrar deneyin.');
      return;
    }
    const ilkKez = AG.benimNo === 0;
    AG.benimNo = m.no;
    odaKodunuGoster(ag.kod);
    $('baglantiKoptu').classList.add('gizli');
    // Son oda hatırlanır: uygulama kapanırsa ana menüden tek tuşla geri dönülür
    try {
      localStorage.setItem(SON_ODA_ANAHTARI, JSON.stringify({ kod: ag.kod, ad: $('onlineAd').value.trim(), zaman: Date.now() }));
    } catch (e) { /* hatırlanamazsa kodu elle yazar */ }
    if (ilkKez) {
      // Oyunun ayarlarını oda sahibi yapar; misafir sadece bekleme listesini görür
      $('kurulumAyarlari').classList.add('gizli');
      onlineKilitle();
      sesCal('bonus');
    }
  } else if (m?.tip === 'lobi' && Array.isArray(m.oyuncular)) {
    onlineDurum(`✅ Odaya bağlandın! Oyunu oda sahibi başlatacak, bekle...<br>`
      + `👥 Odada ${m.oyuncular.length}/${EN_FAZLA_OYUNCU} kişi:`
      + `<ol class="lobiListesi">${m.oyuncular.map((o, i) => `<li><span class="nokta" style="background:${guvenli(String(o.renk))}"></span>`
        + `${i + 1}. ${guvenli(String(o.ad))}${i === 0 ? ' <small class="soluk">(oda sahibi)</small>' : ''}`
        + `${i === AG.benimNo ? ' <b>(sen)</b>' : ''}</li>`).join('')}</ol>`);
  } else if (m?.tip === 'red') {
    ag.baglanti = null;
    if (!ag.tahtaKuruldu) AG.mod = 'yerel';
    katilmaDurumu(`❌ Odaya girilemedi: ${guvenli(String(m.neden ?? ''))}`);
  } else if (m?.tip === 'basla' && TAHTALAR[m.tahta]) {
    oyun.tahta = tahtaKur(TAHTALAR[m.tahta]);
  } else if (m?.tip === 'durum') {
    durumUygula(m);
  } else if (m?.tip === 'olay') {
    olayOynat(m);
  }
}

// Evden gelen durumu ekrana çiz
function durumUygula(m) {
  if (!oyun.tahta) return;
  Object.assign(oyun, m.oyun);
  if (!ag.tahtaKuruldu) {
    ag.tahtaKuruldu = true;
    tahtaEkraniniKur();
  }
  if (m.ekran === 'oyun') {
    ekranGoster('oyun');
    ciz();
  } else if (m.ekran === 'final' || m.ekran === 'sonuc') {
    ekranGoster(m.ekran);
    $(m.ekran).innerHTML = m.html;
    if (m.ekran === 'final') {
      finalYetkiAyarla();
      ipucuKontrol(benimSiram() ? 'kelime' : null, 'kelimeIpucu');
    }
  }
}

function olayOynat(m) {
  if (typeof m.ad !== 'string' || !Array.isArray(m.args)) return;
  if (m.ad.startsWith('Tahta3D.')) {
    const ad = m.ad.slice('Tahta3D.'.length);
    // Oyunun ilk anında tahta henüz kurulmadan gelen olaylar atlanır
    if (UC_BOYUT && ag.tahtaKuruldu && TAHTA_OLAYLARI.includes(ad)) Tahta3D[ad](...m.args);
  } else if (OLAYLAR.includes(m.ad)) {
    window[m.ad](...m.args);
  }
}

// ---------- Ortak ----------
function peerVarMi() {
  if (typeof Peer !== 'undefined') return true;
  onlineDurum('❌ Online bağlantı kütüphanesi yüklenemedi. İnternet bağlantını kontrol et.');
  return false;
}

// Online başlayınca oda butonları bir daha basılamasın
function onlineKilitle() {
  ['odaAcBtn', 'katilBtn', 'odaKodu'].forEach(id => ($(id).disabled = true));
}

function onlineDurum(html) {
  $('onlineDurum').innerHTML = html;
}

// Düzenli nabız: ev herkese atar ve sessiz kalanı düşürür; misafir eve atar ve ev susarsa kopar
function nabziBaslat() {
  ag.sonMesaj = Date.now();
  clearInterval(ag.nabiz);
  const zamanlayici = setInterval(() => {
    if (AG.mod === 'ev') {
      gonder({ tip: 'nabiz' });
      ag.misafirler.filter(m => Date.now() - m.sonMesaj > NABIZ_ZAMAN_ASIMI).forEach(m => {
        m.baglanti.close();
        misafirKoptu(m);
      });
      return;
    }
    if (!ag.baglanti) {
      clearInterval(zamanlayici);
      return;
    }
    gonder({ tip: 'nabiz' });
    if (Date.now() - ag.sonMesaj > NABIZ_ZAMAN_ASIMI) {
      clearInterval(zamanlayici);
      baglantiKoptu();
    }
  }, NABIZ_ARALIGI);
  ag.nabiz = zamanlayici;
}

// Misafirde: oda sahibiyle bağlantı koptu. "Yeniden bağlan" ile aynı odaya geri girilir.
function baglantiKoptu() {
  if (!ag.baglanti) return;
  ag.baglanti = null;
  $('kopmaMetni').textContent = 'Oda sahibiyle bağlantın kesildi. İnternetin geldiyse yeniden bağlanıp kaldığın yerden devam edebilirsin.';
  $('baglantiKoptu').classList.remove('gizli');
  sesCal('ceza');
}

function yenidenBaglan() {
  if (ag.baglanti) return;
  $('odaKodu').value = ag.kod ?? '';
  odayaKatil();
}

// ---------- Son oda: uygulama kapanıp açılınca geri dönmek için ----------
const SON_ODA_ANAHTARI = 'harfAvcilari.sonOda';
const SON_ODA_SURESI = 6 * 60 * 60 * 1000;  // 6 saatten eski oda hatırlanmaz

function sonOdayiGoster() {
  let son = null;
  try {
    son = JSON.parse(localStorage.getItem(SON_ODA_ANAHTARI));
  } catch (e) { /* kayıt yoksa düğme çıkmaz */ }
  if (!son?.kod || Date.now() - son.zaman > SON_ODA_SURESI) return;
  const dugme = $('sonOdaBtn');
  dugme.textContent = `🔄 Son odana geri dön (${son.kod})`;
  dugme.classList.remove('gizli');
  dugme.addEventListener('click', () => {
    $('odaKodu').value = son.kod;
    if (!$('onlineAd').value.trim() && son.ad) {
      $('onlineAd').value = son.ad;
      $('isimAlanlari').querySelector('input').value = son.ad;
    }
    dugme.classList.add('gizli');
    odayaKatil();
  });
}

// Online ad kutusu ile 1. oyuncunun isim kutusu aynı şeyi gösterir
$('onlineAd').value = $('isimAlanlari').querySelector('input')?.value ?? '';
$('onlineAd').addEventListener('input', () => {
  $('onlineAd').classList.remove('eksik');
  $('isimAlanlari').querySelector('input').value = $('onlineAd').value;
});
$('isimAlanlari').addEventListener('input', e => {
  if (e.target === $('isimAlanlari').querySelector('input')) $('onlineAd').value = e.target.value;
});
$('surumNotu').textContent = `sürüm ${SURUM}`;
$('yenidenBaglanBtn').addEventListener('click', yenidenBaglan);
sonOdayiGoster();

$('odaAcBtn').addEventListener('click', odaAc);
$('katilBtn').addEventListener('click', odayaKatil);
$('odaKodu').addEventListener('keydown', e => {
  if (e.key === 'Enter') odayaKatil();
});
