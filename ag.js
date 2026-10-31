// =============================================================
// Harf Avcıları - online oyun (2 kişi, oda koduyla)
// Bağlantı PeerJS ile iki cihaz arasında doğrudan kurulur (kendi sunucumuz yok).
//
//   Ev (odayı açan): oyunun kurallarını çalıştırır. Misafirden gelen hamleleri uygular;
//                    her değişiklikte misafire durumu ve ses/animasyon olaylarını gönderir.
//   Misafir:         hamlelerini (zar at, kart oyna...) eve gönderir; gelen durumu ekrana
//                    çizer, gelen olayları (ses, zar, yükselen yazılar) aynen oynatır.
//
// Mesajlar:
//   misafir → ev: { tip: 'katil', ad, renk }  { tip: 'eylem', ad, args }
//   ev → misafir: { tip: 'kabul', no }  { tip: 'basla', tahta }  { tip: 'durum', ... }  { tip: 'olay', ad, args }
// =============================================================

const ODA_ONEKI = 'harf-avcilari-oda-';
const KOD_HARFLERI = 'ABCDEFGHJKLMNPRSTUVYZ23456789';  // karışabilecek O/0, I/1 yok
const ODA_KODU_UZUNLUK = 5;
const ag = { peer: null, baglanti: null, gonderimBekliyor: false, tahtaKuruldu: false, sonMesaj: 0 };

// Bir taraf sekmeyi/uygulamayı aniden kapatırsa bağlantı "kapandım" diyemeyebilir.
// Bu yüzden iki taraf birbirine düzenli "nabız" atar; uzun süre ses gelmezse bağlantı kopmuş sayılır.
const NABIZ_ARALIGI = 3000;
const NABIZ_ZAMAN_ASIMI = 20000;

// Misafirin eve gönderebileceği hamleler; başka bir şey gelirse yok sayılır
const EYLEMLER = new Set([
  'zarAt', 'yolSec', 'onZarKartiSec', 'saldiriKartSec', 'saldiriHedefSec', 'saldiriVazgec',
  'secimIptal', 'ozelHarfAl', 'degnekSec', 'kareTiklandi', 'casusAt', 'marketAl', 'marketKapat',
  'tekrarCevapla', 'harfSec', 'harfSil', 'pasGec', 'kelimeyiGonder', 'oyla', 'jokerHarfiSec',
  'jokerIptal', 'taslariKaristir', 'tahtayaDevam',
]);
const KELIME_EYLEMLERI = new Set([
  'harfSec', 'harfSil', 'pasGec', 'kelimeyiGonder', 'jokerHarfiSec', 'jokerIptal', 'taslariKaristir',
]);

// Evde çalışıp misafirde de aynen oynatılan ses/animasyon olayları
const OLAYLAR = ['sesCal', 'efekt', 'kayit', 'konfeti', 'zarSonucunuGoster', 'zarSonucunuGizle'];
const TAHTA_OLAYLARI = ['zarAt', 'carkCevir', 'harfToplandi', 'nesneTetiklendi', 'zarlariGoster'];

// ---------- Hamleler ----------
// Bu oyuncu bu hamleyi şu an yapabilir mi?
function eylemIzniVar(ad, oyuncuNo, args) {
  if (ad === 'tahtayaDevam') return true;
  if (ad === 'oyla') {
    // Sözlükte bulunan kelimede "Devam"a kuran basar; bulunamayana rakip karar verir
    const kuran = oyun.finalSira === oyuncuNo;
    return args[1] === false ? kuran : !kuran;
  }
  if (KELIME_EYLEMLERI.has(ad)) return oyun.faz === 'kelime' && oyun.finalSira === oyuncuNo;
  return oyun.faz !== 'kelime' && oyun.sira === oyuncuNo;
}

// game.js'teki eylem() online için değişir
eylem = function (ad, ...args) {
  if (AG.mod === 'misafir') {
    gonder({ tip: 'eylem', ad, args });
    return;
  }
  if (AG.mod === 'ev' && !eylemIzniVar(ad, AG.benimNo, args)) return;
  window[ad](...args);
};

// ---------- Durum ve olay aktarımı (evden misafire) ----------
function gonder(mesaj) {
  if (ag.baglanti?.open) ag.baglanti.send(mesaj);
}

// Aynı anda birçok değişiklik olursa tek mesajda gönderilsin diye kısa bir bekleme
durumDegisti = function () {
  if (AG.mod !== 'ev' || !ag.baglanti || ag.gonderimBekliyor) return;
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
    // Tahta iki tarafta da aynı tanımdan kurulur, gönderilmez; zamanlayıcı numarası da işe yaramaz
    oyun: JSON.parse(JSON.stringify(oyun, (k, v) => (k === 'tahta' || k === 'sayac' ? undefined : v))),
    // Kelime turu ve sonuç ekranları olduğu gibi kopyalanır
    html: ekran === 'final' || ekran === 'sonuc' ? $(ekran).innerHTML : null,
  });
}

agOyunBasladi = function () {
  if (AG.mod === 'ev') gonder({ tip: 'basla', tahta: $('tahtaSecimi').value });
};

// Olay fonksiyonlarını sar: evde çağrılınca misafire de gönderilsin
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

function odaAc() {
  if (!peerVarMi()) return;
  const kod = odaKoduUret();
  onlineDurum('⏳ Oda açılıyor...');
  ag.peer = new Peer(ODA_ONEKI + kod);
  ag.peer.on('open', () => {
    AG.mod = 'ev';
    AG.benimNo = 0;
    $('oyuncuSayisi').value = '2';
    isimAlanlariniCiz();
    $('oyuncuSayisi').disabled = true;
    const misafirKutusu = $('isimAlanlari').querySelectorAll('input')[1];
    misafirKutusu.value = '';
    misafirKutusu.placeholder = 'Arkadaşın bekleniyor...';
    misafirKutusu.disabled = true;
    $('baslaBtn').disabled = true;
    onlineKilitle();
    onlineDurum(`Oda kodun: <b class="odaKodu">${kod}</b><br>Bu kodu arkadaşına söyle, o "Katıl" kısmına yazsın. ⏳ Bekleniyor...`);
  });
  ag.peer.on('connection', baglanti => {
    if (ag.baglanti) {  // oda 2 kişilik: üçüncü kişi giremez
      baglanti.on('open', () => baglanti.close());
      return;
    }
    ag.baglanti = baglanti;
    baglanti.on('data', mesajGeldi(evMesaji));
    baglanti.on('close', baglantiKoptu);
    baglanti.on('error', baglantiKoptu);
    if (baglanti.open) nabziBaslat();
    else baglanti.on('open', nabziBaslat);
  });
  ag.peer.on('error', e => {
    if (e.type === 'unavailable-id') odaAc();  // aynı kod kullanılıyormuş, yenisini dene
    else onlineDurum(`❌ Oda açılamadı (${e.type}). İnternet bağlantını kontrol et.`);
  });
}

function evMesaji(m) {
  if (m?.tip === 'katil') {
    // Misafirin adı ve rengi 2. oyuncuya yazılır; renk alınmışsa boştaki ilk renk verilir
    const kutu = $('isimAlanlari').querySelectorAll('input')[1];
    kutu.value = String(m.ad ?? '').slice(0, 12) || 'Misafir';
    const renk = RENKLER.includes(m.renk) && m.renk !== kurulumRenkleri[0]
      ? m.renk : RENKLER.find(r => r !== kurulumRenkleri[0]);
    kurulumRenkleri[1] = renk;
    renkKutucuklariniCiz();
    $('baslaBtn').disabled = false;
    gonder({ tip: 'kabul', no: 1 });
    onlineDurum(`✅ <b>${guvenli(kutu.value)}</b> odaya katıldı! Ayarları seçip "Oyunu Başlat"a bas.`);
    sesCal('bonus');
    return;
  }
  if (m?.tip === 'eylem' && EYLEMLER.has(m.ad) && Array.isArray(m.args) && eylemIzniVar(m.ad, 1, m.args)) {
    window[m.ad](...m.args);
  }
}

// ---------- Misafir: odaya katılma ----------
function odayaKatil() {
  if (!peerVarMi()) return;
  const kod = $('odaKodu').value.trim().toUpperCase();
  if (kod.length !== ODA_KODU_UZUNLUK) {
    onlineDurum(`Oda kodu ${ODA_KODU_UZUNLUK} karakter olmalı.`);
    return;
  }
  onlineDurum('⏳ Odaya bağlanılıyor...');
  ag.peer = new Peer();
  ag.peer.on('open', () => {
    const baglanti = ag.peer.connect(ODA_ONEKI + kod, { reliable: true });
    baglanti.on('open', () => {
      ag.baglanti = baglanti;
      AG.mod = 'misafir';
      AG.benimNo = 1;
      const ad = $('isimAlanlari').querySelector('input').value.trim() || 'Misafir';
      gonder({ tip: 'katil', ad, renk: kurulumRenkleri[0] });
      nabziBaslat();
    });
    baglanti.on('data', mesajGeldi(misafirMesaji));
    baglanti.on('close', baglantiKoptu);
    baglanti.on('error', baglantiKoptu);
  });
  ag.peer.on('error', e => {
    onlineDurum(e.type === 'peer-unavailable'
      ? '❌ Bu kodla bir oda bulunamadı. Kodu kontrol et.'
      : `❌ Bağlanılamadı (${e.type}). İnternet bağlantını kontrol et.`);
  });
}

function misafirMesaji(m) {
  if (m?.tip === 'kabul') {
    $('baslaBtn').disabled = true;
    onlineKilitle();
    onlineDurum('✅ Odaya bağlandın! Oyunu oda sahibi başlatacak, bekle...');
    sesCal('bonus');
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
    if (m.ekran === 'final') finalYetkiAyarla();
  }
}

function olayOynat(m) {
  if (typeof m.ad !== 'string' || !Array.isArray(m.args)) return;
  if (m.ad.startsWith('Tahta3D.')) {
    const ad = m.ad.slice('Tahta3D.'.length);
    if (UC_BOYUT && TAHTA_OLAYLARI.includes(ad)) Tahta3D[ad](...m.args);
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

// Gelen her mesaj "karşı taraf hâlâ burada" demektir; nabız mesajlarının başka işi yoktur
function mesajGeldi(isle) {
  return m => {
    ag.sonMesaj = Date.now();
    if (m?.tip !== 'nabiz') isle(m);
  };
}

function nabziBaslat() {
  ag.sonMesaj = Date.now();
  const zamanlayici = setInterval(() => {
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
}

function baglantiKoptu() {
  if (!ag.baglanti) return;
  ag.baglanti = null;
  $('baglantiKoptu').classList.remove('gizli');
  sesCal('ceza');
}

$('odaAcBtn').addEventListener('click', odaAc);
$('katilBtn').addEventListener('click', odayaKatil);
$('odaKodu').addEventListener('keydown', e => {
  if (e.key === 'Enter') odayaKatil();
});
