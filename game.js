// =============================================================
// Harf Avcıları - oyunun tüm mantığı bu dosyada
// Bölümler: 1) Ayarlar   2) Oyun durumu   3) Yardımcılar
//           4) Kurulum   5) Tur akışı     6) Kart kullanma
//           7) Çizim     8) Kelime turu   9) Ara sonuç / kazanan
//
// Oyunun döngüsü:
//   tahta (birkaç tur) → kelime turu → ara sonuç → tahtaya devam → ...
//   ... ta ki biri hedef puana ulaşana kadar.
// =============================================================

// ---------- 1) AYARLAR ----------
// Oyunu dengelemek için genelde sadece bu bölümle oynaman yeterli.

const KARE_BILGI = {
  baslangic: { ikon: '🏁', yazi: 'Geçen +1' },
  harf:      { ikon: '🔤', yazi: '+1 harf' },
  bonus:     { ikon: '✨', yazi: '+2 harf' },
  hazine:    { ikon: '💰', yazi: '+3 harf' },
  kart:      { ikon: '🃏', yazi: 'Kart çek' },
  saldir:    { ikon: '⚔️', yazi: 'Kart kullan' },
  ceza:      { ikon: '💥', yazi: '−1 harf' },
  kartKaybi: { ikon: '🗑️', yazi: '−1 kart' },
  market:    { ikon: '🏪', yazi: 'Market' },
  vergi:     { ikon: '💸', yazi: '−300 🖋️' },
};

// Kare bilgisi; ekonomili tahtada başlangıç karesi harf yerine mürekkep verir
function kareBilgisi(tip) {
  if (tip === 'baslangic' && oyun.tahta?.ekonomi) {
    return { ikon: '🏁', yazi: `+${oyun.tahta.ekonomi.gecisMurekkep} 🖋️` };
  }
  return KARE_BILGI[tip];
}

// ---------- Tahtalar ----------
// Her tahta "yollar"dan oluşur. Bir yol, [sütun, satır, tip] noktalarının listesidir;
// ardışık noktalar birbirine bağlanır ve oyuncular yolun yönünde ilerler.
// Aynı nokta birden çok yolda geçerse orası yol ayrımı (veya birleşme) olur:
// bir karenin birden fazla "sonraki" karesi varsa oyuncu hangi yoldan gideceğini seçer.
// Bir noktanın tipi ilk yazıldığı yerde belirlenir; tekrar geçtiği yerde tip yazmaya gerek yok.

// Klasik tahta: 7x7'lik karenin kenarında 24 kare, saat yönünde tek yol
const KLASIK_KARELER = [
  'baslangic', 'harf', 'harf', 'kart', 'harf', 'saldir', 'bonus',
  'harf', 'ceza', 'harf', 'kart', 'harf', 'saldir',
  'bonus', 'harf', 'harf', 'kart', 'harf', 'ceza',
  'saldir', 'harf', 'kart', 'harf', 'bonus',
];

const TAHTALAR = {
  // zarSayisi: kaç tane 6'lık zar atılır (sonuçları toplanır)
  // onZarKartlari: kartlar zar atmadan önce de kullanılabilir mi (yoksa sadece ⚔️ karesinde)
  // baslangicKarti: oyun başında herkese kaç kart dağıtılır (yoksa 0)
  // hedefGoster: zar atılınca gelinecek kareler önceden işaretlensin mi
  // toplanacakHarf: karelerin üstünde, üstünden geçenin topladığı dönen harf taşları olsun mu
  klasik: {
    ad: 'Klasik (24 kare, tek yol)',
    zarSayisi: 1,
    onZarKartlari: false,
    hedefGoster: false,
    toplanacakHarf: false,
    genislik: 7,
    yukseklik: 7,
    levha: [1, 1, 5, 5],  // ortadaki yazı levhası: sütun, satır, genişlik, yükseklik
    yollar: [[
      ...KLASIK_KARELER.map((tip, i) => {
        const [satir, sutun] = kareKonumu(i);
        return [sutun - 1, satir - 1, tip];
      }),
      [0, 0],  // başa dön
    ]],
  },

  // Genişletilmiş tahta (13x9): dış halka + iki "dolambaçlı yol". Kestirme yok:
  // iki yol da halkaya başlangıçtan uzak bir yerde geri bağlanır, başlangıca hızlı dönülemez.
  //
  //   🏁 → → [Y1] → → → → → → → [B1] → →
  //   ↑       ↓                 ↑       ↓
  //   ↑       ↓ → → → → → → → → ↑       ↓     Y1/B1: üst yol ayrımı ve birleşme
  //   ↑                                 ↓
  //   🏪          (orta levha)          🏪    iki market, sol ve sağ kenarın ortasında
  //   ↑                                 ↓
  //   ↑       ↑ ← ← ← ← ← ← ← ← ↓       ↓
  //   ↑       ↑                 ↓       ↓     Y2/B2: alt yol ayrımı ve birleşme
  //   ← ← ← [B2] ← ← ← ← ← ← ← [Y2] ← ← ←
  //
  // Her ayrımda seçim: kenardan KISA yol (8 adım, ama 💸 vergi karesi var) ya da içeriden
  // UZUN yol (12 adım): 💰 hazine ve ✨ bonuslar var ama 💥 cezalar da var ve tur daha geç biter.
  //
  // ekonomi: 🖋️ mürekkep sistemi (başlangıç mürekkebi, başlangıçtan geçince kazanılan,
  //          💸 vergi, 🪤 tuzağın çaldığı ve kelime turu sıralama ödülleri)
  genis: {
    ad: 'Genişletilmiş (62 kare, yol ayrımlı, marketli)',
    zarSayisi: 2,
    onZarKartlari: true,
    baslangicKarti: 1,
    hedefGoster: true,
    toplanacakHarf: true,
    ekonomi: {
      baslangicMurekkep: 2000,
      gecisMurekkep: 300,
      vergi: 300,
      tuzakMurekkep: 200,
      odul: [1200, 1000, 800, 600, 400, 200],  // kelime turunda 1., 2., 3. ... olana
    },
    genislik: 13,
    yukseklik: 9,
    levha: [1, 3, 11, 3],
    yollar: [
      // Dış halka, saat yönünde (40 kare)
      [
        // üst kenar
        [0, 0, 'baslangic'], [1, 0, 'harf'], [2, 0, 'harf'], [3, 0, 'kart'], [4, 0, 'harf'], [5, 0, 'ceza'],
        [6, 0, 'vergi'], [7, 0, 'harf'], [8, 0, 'saldir'], [9, 0, 'harf'], [10, 0, 'harf'],
        [11, 0, 'bonus'], [12, 0, 'harf'],
        // sağ kenar
        [12, 1, 'kart'], [12, 2, 'harf'], [12, 3, 'ceza'], [12, 4, 'market'], [12, 5, 'harf'],
        [12, 6, 'saldir'], [12, 7, 'vergi'], [12, 8, 'kart'],
        // alt kenar (sağdan sola)
        [11, 8, 'harf'], [10, 8, 'harf'], [9, 8, 'harf'], [8, 8, 'kartKaybi'], [7, 8, 'harf'],
        [6, 8, 'ceza'], [5, 8, 'vergi'], [4, 8, 'harf'], [3, 8, 'bonus'], [2, 8, 'harf'],
        [1, 8, 'harf'], [0, 8, 'kart'],
        // sol kenar (aşağıdan yukarı)
        [0, 7, 'harf'], [0, 6, 'saldir'], [0, 5, 'harf'], [0, 4, 'market'], [0, 3, 'bonus'],
        [0, 2, 'harf'], [0, 1, 'kart'], [0, 0],
      ],
      // Üst dolambaç: (2,0)'dan aşağı iner, içeriden sağa gider, (10,0)'da halkaya çıkar
      [
        [2, 0], [2, 1, 'kart'], [2, 2, 'harf'], [3, 2, 'bonus'], [4, 2, 'ceza'], [5, 2, 'harf'],
        [6, 2, 'hazine'], [7, 2, 'harf'], [8, 2, 'ceza'], [9, 2, 'kart'], [10, 2, 'harf'],
        [10, 1, 'saldir'], [10, 0],
      ],
      // Alt dolambaç: (10,8)'den yukarı çıkar, içeriden sola gider, (2,8)'de halkaya iner
      [
        [10, 8], [10, 7, 'harf'], [10, 6, 'saldir'], [9, 6, 'bonus'], [8, 6, 'ceza'], [7, 6, 'harf'],
        [6, 6, 'hazine'], [5, 6, 'harf'], [4, 6, 'kartKaybi'], [3, 6, 'bonus'], [2, 6, 'harf'],
        [2, 7, 'kart'], [2, 8],
      ],
    ],
  },
};

// Yol listesinden karelerin listesini ve her karenin "sonraki" karelerini çıkarır.
// Başlangıç karesi her zaman 0 numaralı karedir (ilk yolun ilk noktası).
function tahtaKur(tanim) {
  const kareler = [];
  const numara = {};  // "sütun,satır" → kare numarası
  const kareNo = (sutun, satir, tip) => {
    const anahtar = `${sutun},${satir}`;
    if (!(anahtar in numara)) {
      numara[anahtar] = kareler.length;
      kareler.push({ tip, sutun, satir, sonraki: [] });
    }
    return numara[anahtar];
  };
  tanim.yollar.forEach(yol => {
    let onceki = null;
    yol.forEach(([sutun, satir, tip]) => {
      const no = kareNo(sutun, satir, tip);
      if (onceki !== null && !kareler[onceki].sonraki.includes(no)) kareler[onceki].sonraki.push(no);
      onceki = no;
    });
  });
  // Geriye gitmek için (⏪ Geri Git kartı) her karenin "önceki" kareleri
  kareler.forEach(k => (k.onceki = []));
  kareler.forEach((k, i) => k.sonraki.forEach(s => kareler[s].onceki.push(i)));
  return { ...tanim, kareler };
}

// Joker: kelime turunda istediğin harfin yerine geçer ama 0 puandır
const JOKER = '★';

// Harf torbası (Kelimelik'teki taş adetleri, toplam 100 taş):
// sayı ne kadar büyükse o harf o kadar sık çıkar.
const HARF_AGIRLIK = {
  A: 12, E: 8, İ: 7, K: 7, L: 7, R: 6, N: 5, T: 5,
  I: 4, M: 4, O: 3, S: 3, U: 3,
  B: 2, D: 2, Ü: 2, Y: 2, C: 2, Ç: 2, Ş: 2, Z: 2,
  G: 1, H: 1, P: 1, F: 1, Ö: 1, V: 1, Ğ: 1, J: 1,
  [JOKER]: 2,
};

// Her harfin puanı (Kelimelik puan tablosu). Kelimenin puanı = harflerinin puanları toplamı.
const HARF_PUANI = {
  A: 1, E: 1, İ: 1, K: 1, L: 1, N: 1, R: 1, T: 1,
  I: 2, M: 2, O: 2, S: 2, U: 2,
  B: 3, D: 3, Ü: 3, Y: 3,
  C: 4, Ç: 4, Ş: 4, Z: 4,
  G: 5, H: 5, P: 5,
  F: 7, Ö: 7, V: 7,
  Ğ: 8,
  J: 10,
  [JOKER]: 0,
};
const ALFABE = 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ'.split('');  // jokerin olabileceği harfler

// ✍️ Harf Seç kartıyla alınan özel taşlar: harfin önüne "☆" konarak saklanır ("☆J").
// Kelimede o harf gibi kullanılır ama harfin kendi puanını değil, sabit OZEL_HARF_PUANI'nı alır
// (J'yi seçip 10 puan toplamak olmasın diye).
const OZEL_ON = '☆';
const OZEL_HARF_PUANI = 1;
const ozelMi = h => h.startsWith(OZEL_ON);
const harfinKendisi = h => (ozelMi(h) ? h.slice(OZEL_ON.length) : h);
const harfPuani = h => (ozelMi(h) ? OZEL_HARF_PUANI : HARF_PUANI[h]);
const tasSinifi = h => (h === JOKER ? 'joker' : ozelMi(h) ? 'ozel' : '');

const MIN_KELIME = 3;        // kelime turunda en az kaç harf
const BITIRME_BONUSU = 35;   // elindeki tüm harfleri kullanırsan...
const BITIRME_MIN_HARF = 6;  // ...ve kelimen en az bu kadar harfliyse

// 🃏 karelerinden çekilen, ⚔️ karelerinde rakibe kullanılan kartlar
const KARTLAR = {
  zarEksi2:     { ikon: '🎲', ad: 'Zar −2',   aciklama: 'Rakip bir sonraki zarında 2 eksik ilerler (en az 1).' },
  harfKap:      { ikon: '🫳', ad: 'Harf Kap', aciklama: 'Rakibin rastgele bir harfini alırsın.' },
  harfKaristir: { ikon: '🌀', ad: 'Karıştır', aciklama: 'Rakibin rastgele bir harfi başka bir harfe döner.' },
  // pasif: oynanmaz, elde durur ve kendiliğinden çalışır
  kalkan:       { ikon: '🛡️', ad: 'Kalkan',   aciklama: 'Elinde durur, sana kullanılan ilk kartı otomatik engeller.', pasif: true },
  tekHarfDegis: { ikon: '↔️', ad: 'Harf Değiş', aciklama: 'Rastgele bir harfin, rakibin rastgele bir harfiyle yer değiştirir.' },
  kartTakasi:   { ikon: '🔁', ad: 'Kart Takası', aciklama: 'Elindeki diğer kartlar rakibin kartlarıyla yer değiştirir.' },
  harfTakasi:   { ikon: '🔄', ad: 'Harf Takası', aciklama: 'Tüm harflerin, rakibin tüm harfleriyle yer değiştirir!' },
  hileliZar:    { ikon: '☠️', ad: 'Zehirli Zar', aciklama: 'Rakip bir sonraki turunda zar yerine çark çevirir: 0 ile 3 arası ilerler.' },
  // Aşağıdakiler sadece genişletilmiş tahtada çıkar (zar öncesi kart kullanımı orada var).
  // kendine: rakip seçilmez, kullananın kendisine (ya da rastgele) etki eder
  zarArti3:     { ikon: '⏫', ad: '+3 Zar', aciklama: 'Zar atmadan önce kullan: bu turki zarına +3 eklenir. (Genişletilmiş tahta)',
                  kendine: true, sadeceGenis: true },
  ciftZar:      { ikon: '🎲', ad: 'Çift Zar', aciklama: 'Bu tur 2 yerine 4 zar atarsın. (Genişletilmiş tahta)',
                  kendine: true, sadeceGenis: true },
  yerDegistir:  { ikon: '🏃', ad: 'Yer Değiştir', aciklama: 'Seçtiğin rakiple tahtadaki yerinizi değiştirirsiniz. (Genişletilmiş tahta)',
                  sadeceGenis: true },
  kasirga:      { ikon: '🌪️', ad: 'Kasırga', aciklama: 'Rastgele iki oyuncunun yeri değişir (sen de olabilirsin!). (Genişletilmiş tahta)',
                  kendine: true, sadeceGenis: true },
  tuzak:        { ikon: '🪤', ad: 'Tuzak', aciklama: 'Bir kareye ayı tuzağı kur. Oraya gelen rakibin bir harfi ve 200 mürekkebi sana geçer. (Genişletilmiş tahta)',
                  kendine: true, sadeceGenis: true },
  istenenHarf:  { ikon: '✍️', ad: 'Harf Seç', aciklama: 'İstediğin harfi al! Özel ★ taş olur, kelimede 1 puan sayılır. (Genişletilmiş tahta)',
                  kendine: true, sadeceGenis: true },

  // --- Hareket ---
  dondur:       { ikon: '⏸️', ad: 'Dondur', aciklama: 'Seçtiğin rakip bir sonraki turunda zar atamaz, yerinde bekler. (Genişletilmiş tahta)',
                  sadeceGenis: true },
  geriGit:      { ikon: '⏪', ad: 'Geri Git', aciklama: 'Seçtiğin rakip geldiği yoldan 3 kare geri gider. (Genişletilmiş tahta)',
                  sadeceGenis: true },
  tekrarAt:     { ikon: '🔁', ad: 'Tekrar At', aciklama: 'Bu tur zarı beğenmezsen bir kez daha atabilirsin. (Genişletilmiş tahta)',
                  kendine: true, sadeceGenis: true },
  roket:        { ikon: '🚀', ad: 'Roket', aciklama: 'Zar atmadan önündeki ilk yol ayrımına ya da 💰 hazineye uçarsın. (Genişletilmiş tahta)',
                  kendine: true, sadeceGenis: true },
  ekstraTur:    { ikon: '👣', ad: 'Ekstra Tur', aciklama: 'Bu turdan sonra bir tur daha oynarsın. (Genişletilmiş tahta)',
                  kendine: true, sadeceGenis: true },
  // --- Harf ---
  miknatis:     { ikon: '🧲', ad: 'Mıknatıs', aciklama: 'Tahtadaki en yakın dönen 💎 taşı kendine çekersin. (Genişletilmiş tahta)',
                  kendine: true, sadeceGenis: true },
  harfVergisi:  { ikon: '📜', ad: 'Harf Vergisi', aciklama: 'Her rakip sana en düşük puanlı harfini verir. (Genişletilmiş tahta)',
                  kendine: true, sadeceGenis: true },
  sihirliDegnek:{ ikon: '🪄', ad: 'Sihirli Değnek', aciklama: 'Elindeki bir harfi seçip ★ jokere çevirirsin. (Genişletilmiş tahta)',
                  kendine: true, sadeceGenis: true },
  sesliYagmuru: { ikon: '🌧️', ad: 'Sesli Yağmuru', aciklama: 'Torbadan 2 sesli harf alırsın (A, E, İ, O...). (Genişletilmiş tahta)',
                  kendine: true, sadeceGenis: true },
  harfBombasi:  { ikon: '💣', ad: 'Harf Bombası', aciklama: 'Senin dışındaki herkes rastgele 1 harf kaybeder. (Genişletilmiş tahta)',
                  kendine: true, sadeceGenis: true },
  // --- Savunma ---
  ayna:         { ikon: '🪞', ad: 'Ayna', aciklama: 'Elinde durur; sana oynanan ilk kartı sahibine geri yansıtır. (Genişletilmiş tahta)',
                  pasif: true, sadeceGenis: true },
  casus:        { ikon: '🕵️', ad: 'Casus', aciklama: 'Seçtiğin rakibin kartlarını görürsün ve birini çöpe atarsın. (Genişletilmiş tahta)',
                  sadeceGenis: true },
  tuzakTemizle: { ikon: '🧹', ad: 'Temizlik', aciklama: 'Tahtada seçtiğin bir tuzağı, kutuyu ya da duvarı kaldırırsın. (Genişletilmiş tahta)',
                  kendine: true, sadeceGenis: true },
  // --- Kelime turu ---
  ciftPuan:     { ikon: '✖️', ad: 'Çift Puan', aciklama: 'Bir sonraki kelime turunda kelimenin puanı 2 katı olur. (Genişletilmiş tahta)',
                  kendine: true, sadeceGenis: true },
  ekSure:       { ikon: '⏱️', ad: 'Ek Süre', aciklama: 'Bir sonraki kelime turunda +30 saniyen olur. (Genişletilmiş tahta)',
                  kendine: true, sadeceGenis: true },
  sureHirsizi:  { ikon: '⏳', ad: 'Süre Hırsızı', aciklama: 'Seçtiğin rakibin bir sonraki kelime turu süresi 30 saniyeye düşer. (Genişletilmiş tahta)',
                  sadeceGenis: true },
  // --- Tahtaya konanlar ---
  surprizKutusu:{ ikon: '🎁', ad: 'Sürpriz Kutusu', aciklama: 'Bir kareye kutu koyarsın. Oraya gelen %50 +2 harf alır, %50 1 harf kaybeder. (Genişletilmiş tahta)',
                  kendine: true, sadeceGenis: true },
  duvar:        { ikon: '🧱', ad: 'Duvar', aciklama: 'Bir kareye duvar örersin. Oradan geçmek isteyen rakip orada durmak zorunda kalır. (Genişletilmiş tahta)',
                  kendine: true, sadeceGenis: true },
  // --- Market ---
  indirim:      { ikon: '🏷️', ad: 'İndirim', aciklama: 'Elinde durur; marketteki bir sonraki alışverişin %50 indirimli olur. (Genişletilmiş tahta)',
                  pasif: true, sadeceGenis: true },
};
// Kartların çıkma sıklığı. Güçlü kartlar (takaslar) daha nadir.
// Hangi kartların oyunda olacağı kurulum ekranında seçilir.
const KART_AGIRLIK = {
  zarEksi2: 3, harfKap: 3, harfKaristir: 2, kalkan: 2,
  tekHarfDegis: 2, kartTakasi: 1, harfTakasi: 1,
  hileliZar: 2, zarArti3: 3,
  ciftZar: 2, yerDegistir: 2, kasirga: 1, tuzak: 2, istenenHarf: 2,
  dondur: 2, geriGit: 2, tekrarAt: 2, roket: 1, ekstraTur: 1,
  miknatis: 2, harfVergisi: 1, sihirliDegnek: 1, sesliYagmuru: 2, harfBombasi: 1,
  ayna: 2, casus: 2, tuzakTemizle: 1,
  ciftPuan: 1, ekSure: 2, sureHirsizi: 2,
  surprizKutusu: 2, duvar: 2, indirim: 2,
};

// Tahtaya kart ile konan nesneler: hangi kart hangisini koyar
const TAHTA_NESNELERI = {
  // adini: "...oyuncusunun ___ kaldırdı" cümlesindeki hali
  tuzak:         { ikon: '🪤', ad: 'tuzak', adini: 'tuzağını' },
  surprizKutusu: { ikon: '🎁', ad: 'sürpriz kutusu', adini: 'sürpriz kutusunu' },
  duvar:         { ikon: '🧱', ad: 'duvar', adini: 'duvarını' },
};
const SESLI_HARFLER = { A: 12, E: 8, İ: 7, I: 4, O: 3, U: 3, Ü: 2, Ö: 1 };
const GERI_GIT_ADIM = 3;
const EK_SURE = 30;          // ⏱️ Ek Süre kartının eklediği saniye
const KISA_SURE = 30;        // ⏳ Süre Hırsızı yiyenin kelime turu süresi
const ROKET_MENZIL = 15;     // 🚀 Roket en fazla kaç kare ileri uçar

// 🏪 Marketteki kart fiyatları (🖋️ mürekkep), kartın gücüne göre. En pahalısı 750.
const FIYATLAR = {
  zarEksi2: 250, zarArti3: 250, sesliYagmuru: 250, harfKaristir: 250, ekSure: 250,
  indirim: 300,
  harfKap: 400, kalkan: 400, tekHarfDegis: 400, miknatis: 400, tekrarAt: 400, geriGit: 400,
  tuzak: 400, surprizKutusu: 400, duvar: 400, sureHirsizi: 400, hileliZar: 400, tuzakTemizle: 400,
  dondur: 550, yerDegistir: 550, ciftZar: 550, casus: 550, ayna: 550, istenenHarf: 550,
  sihirliDegnek: 550, roket: 550, harfBombasi: 550, kasirga: 550,
  harfTakasi: 750, kartTakasi: 750, ekstraTur: 750, harfVergisi: 750, ciftPuan: 750,
};
const MARKET_SECENEK = 3;  // markette kaç kart çıkar (biri alınabilir)

const TOPLANACAK_SAYISI = 4;  // genişletilmiş tahtada aynı anda kaç dönen harf taşı olur
const TOPLANACAK_JOKER_SANSI = 0.35;
// Dönen taşlar değerli harflerden (3 puan ve üstü) seçilir; sayılar çıkma sıklığı
const DEGERLI_HARFLER = {
  B: 2, D: 2, Ü: 2, Y: 2, C: 2, Ç: 2, Ş: 2, Z: 2,
  G: 1, H: 1, P: 1, F: 1, Ö: 1, V: 1, Ğ: 1, J: 1,
};

const BASLANGIC_HARF = 3;  // herkes elinde kaç harfle başlar
const MAX_KART = 3;        // bir oyuncu en fazla kaç kart tutabilir
const FINAL_SURE = 60;     // kelime turunda kelime kurmak için saniye
const ADIM_SURESI = 350;   // piyonun bir kare zıplama süresi (milisaniye)
const ZAR_SURESI = 950;    // zarın dönme süresi (style.css'teki .zarKup ile aynı tut)
const CARK_SURESI = 1800;  // ☠️ zehirli zar çarkının dönme süresi
// Piyon renkleri: kurulumda her oyuncu birini seçer, seçilen renk başkasına kapanır
const RENKLER = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c',
  '#ff6fa8', '#f1c40f', '#a1887f', '#ecf0f1', '#a3e635',
];
const RENK_ADLARI = {
  '#e74c3c': 'Kırmızı', '#3498db': 'Mavi', '#2ecc71': 'Yeşil', '#f39c12': 'Turuncu',
  '#9b59b6': 'Mor', '#1abc9c': 'Turkuaz', '#ff6fa8': 'Pembe', '#f1c40f': 'Sarı',
  '#a1887f': 'Kahverengi', '#ecf0f1': 'Beyaz', '#a3e635': 'Fıstık yeşili',
};
let kurulumRenkleri = [];  // kurulum ekranında her oyuncunun seçtiği renk
// Oyuncu sayısı azaltılıp tekrar artırılınca isimler ve renkler kaybolmasın diye hafıza
let hatirlananIsimler = [];
let hatirlananRenkler = [];

// 3D zar: her sayının bize dönük olması için küpün döneceği açılar [X, Y]
const ZAR_ACILARI = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
// Zarın her yüzündeki noktalar: 3x3'lük ızgarada hangi hücreler dolu (0 sol üst, 8 sağ alt)
const ZAR_NOKTALARI = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

// Three.js yüklendiyse gerçek 3D tahta (tahta3d.js), yüklenemediyse (internet yok)
// eski CSS tahtası kullanılır. Kurallar ikisinde de aynı.
const UC_BOYUT = typeof Tahta3D !== 'undefined' && Tahta3D.hazirMi();

// Telefon gibi dar ekranlarda düzen değişir (kontroller tahtanın altına gelir)
const MOBIL = matchMedia('(max-width: 760px)').matches;

// Online oyun durumu (bağlantı işleri ag.js'te):
//   'yerel'   — herkes aynı cihazda sırayla oynar
//   'ev'      — odayı açan: oyunun kurallarını o çalıştırır, misafire durumu gönderir
//   'misafir' — odaya katılan: hamlelerini eve gönderir, gelen durumu ekrana çizer
const AG = { mod: 'yerel', benimNo: 0 };
const online = () => AG.mod !== 'yerel';

// Şu an bu cihazdaki oyuncunun hamle sırası mı? (aynı cihazda oynarken hep evet)
function benimSiram() {
  if (!online()) return true;
  return (oyun.faz === 'kelime' ? oyun.finalSira : oyun.sira) === AG.benimNo;
}

// Kullanıcının her hamlesi buradan geçer. Aynı cihazda doğrudan çalışır; online'da ag.js
// bu fonksiyonu değiştirir (misafirin hamlesi eve gider, ev sırası olmayanı yok sayar).
function eylem(ad, ...args) {
  window[ad](...args);
}

// Ekranda bir şey değişti: online evde misafire yeni durumu gönderir (ag.js doldurur)
function durumDegisti() {}
// Oyun başladı: online evde misafire tahtayı kurdurur (ag.js doldurur)
function agOyunBasladi() {}

// ---------- 2) OYUN DURUMU ----------
// Oyunun o anki her bilgisi bu tek nesnede durur.
// Ekran her zaman bu nesneye bakılarak çizilir (ciz fonksiyonu).
const oyun = {
  oyuncular: [],  // her oyuncu: { ad, renk, konum, harfler, kartlar, puan, zarCezasi, kelime, turPuani, gecersiz }
  sira: 0,        // şu an sırası gelen oyuncunun numarası
  tahta: null,    // tahtaKur() sonucu: { kareler: [{ tip, sutun, satir, sonraki }], genislik, ... }
  kalanAdim: 0,   // piyonun bu zarla daha kaç kare ilerleyeceği
  yolSecenekleri: [], // yol ayrımında gidilebilecek kare numaraları
  hedefler: [],   // bu zarla gelinebilecek kareler (işaretlenir)
  nesneler: {},   // tahtaya konan 🪤 tuzak / 🎁 kutu / 🧱 duvar: { kareNo: { tip, sahip } }
  kareAmaci: null, // kare seçme modunda neyin kurulacağı ('tuzak', 'surprizKutusu', 'duvar')
  casusluk: null,  // 🕵️ Casus kartında: { casus: oyuncuNo, hedef: oyuncuNo }
  market: null,    // 🏪 açık market: { secenekler: [kart], devam: yürümeye devam eden fonksiyon }
  toplanacaklar: {}, // karelerin üstünde dönen harf taşları: { kareNo: 'Ğ' }
  onKartKullanildi: false, // bu tur zar öncesi kart kullanıldı mı (turda 1)
  saldiriZamani: 'kare',   // kart nerede kullanılıyor: 'kare' (⚔️ karesi) ya da 'onZar' (zar atmadan önce)
  kartAgirlik: {}, // sadece bu oyunda seçili kartların çıkma sıklıkları
  tur: 1,
  hedefPuan: 50,
  kelimeSiklik: 3, // kaç turda bir kelime turu yapılır
  zar: 0,
  zarDonus: 0,     // zar her atışta önceki açıdan ileri dönsün diye sayaç
  ziplayan: -1,    // şu an zıplayan piyonun oyuncu numarası
  secilenKart: null, // ⚔️ karesinde seçilen kartın numarası
  faz: 'zar',      // 'zar' → 'yuvarlaniyor' → 'hareket' (↔ 'yolSecimi') → ('saldiri') → sonraki oyuncu ... / 'kelime'
  mesaj: '',
  finalSira: 0,
  secilenler: [],  // kelime turunda seçilen harflerin sırası (harf dizisindeki numaraları)
  jokerler: {},    // kelime turunda jokerlere verilen harfler: { harfNumarası: 'A' }
  jokerSeciliyor: null, // harfi seçilmekte olan jokerin numarası
  dizilis: [],     // kelime turunda taşların ekranda hangi sırayla durduğu (Karıştır bunu değiştirir)
  karistirildi: false, // taşlar az önce karıştırıldıysa bir kez animasyon oynat
  sayac: null,
  kalanSure: 0,
};

// ---------- 3) YARDIMCILAR ----------
const $ = id => document.getElementById(id);
const aktif = () => oyun.oyuncular[oyun.sira];
const finalOyuncu = () => oyun.oyuncular[oyun.finalSira];
// Rakibe kullanılabilen kartlar (pasif kartlar elde durur, "kendine" kartlar rakibe oynanmaz)
const saldiriKartlari = o => o.kartlar.filter(k => !KARTLAR[k].pasif && !KARTLAR[k].kendine);
// Zar atmadan önce kullanılabilen kartlar (pasifler hariç hepsi)
const onZarKartlari = o => o.kartlar.filter(k => !KARTLAR[k].pasif);
const bekle = ms => new Promise(r => setTimeout(r, ms));

function rastgele(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// { A: 12, B: 3 } gibi bir tablodan, sayılara orantılı şansla bir anahtar seçer
function agirlikliSec(tablo) {
  const toplam = Object.values(tablo).reduce((a, b) => a + b, 0);
  let r = Math.random() * toplam;
  for (const [anahtar, agirlik] of Object.entries(tablo)) {
    r -= agirlik;
    if (r < 0) return anahtar;
  }
  return Object.keys(tablo)[0];
}

// Oyuncu isimleri sayfaya yazılırken < > gibi karakterler sorun çıkarmasın
function guvenli(metin) {
  return String(metin).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function isim(o) {
  return `<b style="color:${o.renk}">${guvenli(o.ad)}</b>`;
}

function ekranGoster(id) {
  document.querySelectorAll('.ekran').forEach(e => e.classList.add('gizli'));
  $(id).classList.remove('gizli');
  // Kelime turunda harcanan harfler tahtaya dönünce "kaybedildi" gibi uçmasın (gorsel.js)
  if (id !== 'oyun') elIzleriniSifirla();
  durumDegisti();
}

// Yan paneldeki "Olaylar" listesine en üste bir satır ekler
function kayit(metin) {
  const li = document.createElement('li');
  li.innerHTML = metin;
  // Satırın solundaki renkli çizgi, olayın hangi tür kartla ilgili olduğunu gösterir (gorsel.js)
  const tur = kayitTuru(metin);
  if (tur) li.className = `tur-${tur}`;
  $('kayitListesi').prepend(li);
}

// Harf taşı: köşesinde puanı yazar (Kelimelik'teki gibi)
function harfTasi(h) {
  return `<span class="harf ${tasSinifi(h)}">${harfinKendisi(h)}<sub>${harfPuani(h)}</sub></span>`;
}

function harfVer(o) {
  const h = agirlikliSec(HARF_AGIRLIK);
  o.harfler.push(h);
  return h;
}

function rastgeleHarfAl(o) {
  return o.harfler.splice(rastgele(0, o.harfler.length - 1), 1)[0];
}

// Karenin numarasından 7x7 ızgaradaki [satır, sütun] yerini bulur.
// Üst kenar soldan sağa → sağ kenar aşağı → alt kenar sağdan sola → sol kenar yukarı
function kareKonumu(i) {
  if (i <= 6) return [1, i + 1];
  if (i <= 12) return [i - 5, 7];
  if (i <= 18) return [7, 19 - i];
  return [25 - i, 1];
}

// ---------- 4) KURULUM ----------
// isimler verilmezse kutulardaki mevcut yazılar korunur
// Her oyuncu için bir isim kutusu ve altında renk kutucukları.
// isimler / renkler verilmezse ekrandaki mevcut seçimler korunur.
function isimAlanlariniCiz(isimler, renkler) {
  const n = Number($('oyuncuSayisi').value);
  const alan = $('isimAlanlari');
  // Ekrandaki isimleri hafızaya al; kayıttan yükleniyorsa kayıttakiler geçerli
  alan.querySelectorAll('input').forEach((input, i) => (hatirlananIsimler[i] = input.value));
  if (isimler) hatirlananIsimler = [...isimler];
  if (renkler) hatirlananRenkler = [...renkler];
  const eskiler = hatirlananIsimler;
  // Renkler: önce hatırlanan seçim (geçerli ve tekrarsızsa), eksikse boştaki ilk renk
  const istenen = hatirlananRenkler;
  kurulumRenkleri = [];
  for (let i = 0; i < n; i++) {
    const r = istenen[i];
    kurulumRenkleri.push(RENKLER.includes(r) && !kurulumRenkleri.includes(r)
      ? r : RENKLER.find(x => !kurulumRenkleri.includes(x) && !istenen.slice(i + 1, n).includes(x))
        ?? RENKLER.find(x => !kurulumRenkleri.includes(x)));
  }
  hatirlananRenkler = [...kurulumRenkleri, ...hatirlananRenkler.slice(n)];

  alan.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const satir = document.createElement('div');
    satir.className = 'oyuncuSatiri';
    const input = document.createElement('input');
    input.maxLength = 12;
    input.placeholder = `Oyuncu ${i + 1}`;
    input.value = eskiler[i] ?? '';
    const renkler = document.createElement('div');
    renkler.className = 'renkSecimi';
    satir.append(input, renkler);
    alan.appendChild(satir);
  }
  renkKutucuklariniCiz();
}

// Renk kutucukları: kendi rengin işaretli, başkasının seçtiği renkler soluk ve tıklanamaz
function renkKutucuklariniCiz() {
  document.querySelectorAll('#isimAlanlari .oyuncuSatiri').forEach((satir, i) => {
    satir.querySelector('input').style.borderColor = kurulumRenkleri[i];
    satir.querySelector('.renkSecimi').innerHTML = RENKLER.map(renk => {
      const benim = kurulumRenkleri[i] === renk;
      const baskasinin = !benim && kurulumRenkleri.includes(renk);
      return `<button type="button" class="renk ${benim ? 'secili' : ''}" style="background:${renk}"
                title="${RENK_ADLARI[renk]}${baskasinin ? ' (seçildi)' : ''}" ${baskasinin ? 'disabled' : ''}
                onclick="renkSec(${i}, '${renk}')"></button>`;
    }).join('');
  });
}

function renkSec(oyuncuNo, renk) {
  if (kurulumRenkleri.some((r, i) => r === renk && i !== oyuncuNo)) return;
  kurulumRenkleri[oyuncuNo] = renk;
  hatirlananRenkler[oyuncuNo] = renk;
  renkKutucuklariniCiz();
}

// Kurulum ekranındaki kart kutucukları. acikKartlar verilmezse hepsi işaretli gelir.
// En üstte "Hepsini seç" kutucuğu: tıklanınca hepsi işaretlenir/kaldırılır; bir kısmı seçiliyse yarı dolu görünür.
function kartSecimiCiz(acikKartlar) {
  $('kartSecimi').innerHTML = '<legend>Oyundaki kartlar</legend>'
    + `<label class="kartSecenek hepsiniSec">
        <input type="checkbox" id="hepsiniSec">
        <span><b>Hepsini seç</b> <small id="kartSayaci"></small></span>
      </label>`
    + Object.entries(KARTLAR).map(([anahtar, k]) => `
      <label class="kartSecenek">
        <input type="checkbox" class="kartKutusu" value="${anahtar}" ${!acikKartlar || acikKartlar.includes(anahtar) ? 'checked' : ''}>
        <span>${k.ikon} <b>${k.ad}</b><small>${k.aciklama}</small></span>
      </label>`).join('');
  hepsiniSecDurumu();
  // gorsel.js bu dosyadan sonra yüklenir; ilk çizimde o henüz yoksa kendisi renklendirir
  if (typeof kartSecimiRenklendir === 'function') kartSecimiRenklendir();
}

function kartKutulari() {
  return [...document.querySelectorAll('#kartSecimi .kartKutusu')];
}

function seciliKartlar() {
  return kartKutulari().filter(i => i.checked).map(i => i.value);
}

// "Hepsini seç" kutucuğu, kart kutularının durumunu yansıtır
function hepsiniSecDurumu() {
  const kutular = kartKutulari();
  const secili = kutular.filter(i => i.checked).length;
  $('hepsiniSec').checked = secili === kutular.length;
  $('hepsiniSec').indeterminate = secili > 0 && secili < kutular.length;
  $('kartSayaci').textContent = `(${secili} / ${kutular.length} kart)`;
}

function kartSecimiDegisti(e) {
  if (e.target.id === 'hepsiniSec') {
    kartKutulari().forEach(i => (i.checked = e.target.checked));
  }
  hepsiniSecDurumu();
}

function oyunuBaslat() {
  const kartlar = seciliKartlar();
  if (!kartlar.length) {
    alert('Oyunda en az bir kart olmalı. Lütfen kart seç.');
    return;
  }
  oyun.tahta = tahtaKur(TAHTALAR[$('tahtaSecimi').value]);
  // Zar öncesi kart kullanımı olmayan tahtada "kendine" kartlar işe yaramaz, desteye girmez
  oyun.kartAgirlik = Object.fromEntries(kartlar
    .filter(k => oyun.tahta.onZarKartlari || !KARTLAR[k].sadeceGenis)
    .map(k => [k, KART_AGIRLIK[k]]));

  const inputlar = [...$('isimAlanlari').querySelectorAll('input')];
  oyun.oyuncular = inputlar.map((input, i) => ({
    ad: input.value.trim() || `Oyuncu ${i + 1}`,
    renk: kurulumRenkleri[i],
    konum: 0,
    harfler: [],
    kartlar: [],
    puan: 0,
    zarCezasi: 0,     // Zar −2 kartlarından gelen eksi
    zarBonusu: 0,     // +3 Zar kartından gelen artı
    hileliZar: false, // Zehirli Zar kartı yediyse bir sonraki atışı çark (0-3)
    ciftZar: false,   // Çift Zar kartı kullandıysa bu tur 4 zar
    tekrarHakki: false, // 🔁 Tekrar At: bu tur zarı bir kez daha atabilir
    donmus: false,    // ⏸️ Dondur yediyse bir sonraki turu atlanır
    ekstraTur: false, // 👣 Ekstra Tur: bu turdan sonra bir tur daha
    ciftPuan: false,  // ✖️ Çift Puan: sonraki kelime turunda puan ×2
    ekSure: 0,        // ⏱️ Ek Süre: sonraki kelime turunda fazladan saniye
    kisaSure: false,  // ⏳ Süre Hırsızı yediyse sonraki kelime turu kısa
    murekkep: oyun.tahta.ekonomi?.baslangicMurekkep ?? 0,  // 🖋️ marketten kart almak için
    iflas: false,     // 💸 mürekkebi bitti: bir sonraki turunu oynayamaz
    turOdulu: 0,      // son kelime turunda kazandığı mürekkep
    kelime: '',
    turPuani: 0,
    gecersiz: false,
  }));
  oyun.hedefPuan = Number($('hedefPuan').value);
  oyun.kelimeSiklik = Number($('kelimeSiklik').value);
  // Online odada 2. kişi arkadaşın; kayıtlı oyuncu listen bozulmasın diye ayarlar kaydedilmez
  if (!online()) ayarlariKaydet(inputlar.map(i => i.value.trim()));
  // Herkes birkaç harfle (ve genişletilmiş tahtada bir kartla) başlar
  const kartVar = Object.keys(oyun.kartAgirlik).length > 0;
  oyun.oyuncular.forEach(o => {
    for (let k = 0; k < BASLANGIC_HARF; k++) harfVer(o);
    for (let k = 0; kartVar && k < (oyun.tahta.baslangicKarti ?? 0); k++) {
      o.kartlar.push(agirlikliSec(oyun.kartAgirlik));
    }
  });

  oyun.nesneler = {};
  oyun.toplanacaklar = {};
  toplanacaklariTamamla();
  tahtaEkraniniKur();
  agOyunBasladi();  // online odada misafire de tahtayı kurdurur
  if (oyun.oyuncular[0].kartlar.length) {
    kayit('🃏 Herkes başlangıç kartını aldı! Sıran gelince zar atmadan önce oynayabilirsin.');
    sesCal('kartCek');
  }
  sirayiBaslat();
}

// Oyun ekranını ve tahtayı (3D ya da yedek CSS) kurar. Online misafir de bunu çağırır.
function tahtaEkraniniKur() {
  ekranGoster('oyun');
  if (UC_BOYUT) {
    $('sahne').classList.add('gizli');
    $('tahta3d').classList.remove('gizli');
    // Kontroller (Zar At, mesaj, kart paneli) bilgisayarda sahnenin üstüne biner,
    // telefonda tahtayı kapatmasın diye tahtanın altına gelir
    if (MOBIL) {
      $('tahta3d').after($('kontroller'));
      document.querySelector('.ipucu3d').textContent = '👆 Kaydır: tahtayı kaydır · İki parmak: yakınlaş, çevir: döndür · Çift dokun: oraya yakınlaş';
    } else {
      $('tahta3d').appendChild($('kontroller'));
    }
    Tahta3D.olustur($('tahta3d'), {
      zarSayisi: oyun.tahta.zarSayisi,
      genislik: oyun.tahta.genislik,
      yukseklik: oyun.tahta.yukseklik,
      levha: oyun.tahta.levha,
      kareler: oyun.tahta.kareler.map(k => ({ ...k, ...kareBilgisi(k.tip) })),
    }, kare => eylem('yolSec', kare));
    // Kareye dokununca ne işe yaradığını anlatan balon (sadece bu cihazda)
    Tahta3D.kareDokunmasi(kareBilgisiGoster);
  } else {
    tahtayiOlustur();
  }
}

// Genişletilmiş tahtada her zaman TOPLANACAK_SAYISI kadar dönen harf taşı olsun:
// eksik varsa boş (piyon, tuzak ve taş olmayan) rastgele karelere yenisi konur.
function toplanacaklariTamamla() {
  if (!oyun.tahta.toplanacakHarf) return;
  const dolu = new Set([0, ...oyun.oyuncular.map(o => o.konum), ...Object.keys(oyun.nesneler).map(Number)]);
  const bos = oyun.tahta.kareler.map((_, i) => i)
    .filter(i => !dolu.has(i) && !(i in oyun.toplanacaklar));
  while (Object.keys(oyun.toplanacaklar).length < TOPLANACAK_SAYISI && bos.length) {
    const kare = bos.splice(rastgele(0, bos.length - 1), 1)[0];
    oyun.toplanacaklar[kare] = Math.random() < TOPLANACAK_JOKER_SANSI ? JOKER : agirlikliSec(DEGERLI_HARFLER);
  }
}

// İsimler, oyuncu sayısı ve oyun ayarları tarayıcıda saklanır:
// sayfa yenilense veya Ana Menü'ye dönülse bile kurulum ekranı dolu gelir.
const KAYIT_ANAHTARI = 'harfAvcilari.ayarlar';

function ayarlariKaydet(isimler) {
  try {
    localStorage.setItem(KAYIT_ANAHTARI, JSON.stringify({
      sayi: $('oyuncuSayisi').value,
      hedef: $('hedefPuan').value,
      siklik: $('kelimeSiklik').value,
      tahta: $('tahtaSecimi').value,
      kartlar: seciliKartlar(),
      bilinenKartlar: Object.keys(KARTLAR),  // sonradan eklenen kartları tanıyıp işaretli getirmek için
      isimler,
      renkler: kurulumRenkleri,
    }));
  } catch (e) { /* tarayıcı izin vermezse sorun değil, sadece hatırlanmaz */ }
}

// Kayıttaki değer listede varsa seç (eski sürümden kalan geçersiz değerleri atla)
function secimiAyarla(id, deger) {
  if ([...$(id).options].some(o => o.value === String(deger))) $(id).value = deger;
}

function ayarlariYukle() {
  try {
    const kayit = JSON.parse(localStorage.getItem(KAYIT_ANAHTARI));
    if (!kayit) return;
    secimiAyarla('oyuncuSayisi', kayit.sayi);
    secimiAyarla('hedefPuan', kayit.hedef);
    secimiAyarla('kelimeSiklik', kayit.siklik);
    secimiAyarla('tahtaSecimi', kayit.tahta);
    isimAlanlariniCiz(kayit.isimler, kayit.renkler);
    if (kayit.kartlar) {
      // Kayıttan sonra oyuna eklenmiş yeni kartlar işaretli gelsin
      const bilinen = kayit.bilinenKartlar ?? kayit.kartlar;
      const yeniler = Object.keys(KARTLAR).filter(k => !bilinen.includes(k));
      kartSecimiCiz([...kayit.kartlar, ...yeniler]);
    }
  } catch (e) { /* kayıt yoksa veya bozuksa boş başla */ }
}

// Ana Menü: önce sayfa içindeki onay penceresini açar
function menuOnayiniAc() {
  $('menuOnay').classList.remove('gizli');
}

function menuOnayiniKapat() {
  $('menuOnay').classList.add('gizli');
}

// "Evet" denirse sayfa yenilenir: oyun sıfırlanır, kayıtlı isimler ve ayarlar kurulum ekranına gelir
function anaMenuyeDon() {
  clearInterval(oyun.sayac);
  location.reload();
}

// Yedek (internetsiz) CSS tahtası: kareler bir ızgaraya yerleştirilir, ortadaki boşluğa kontroller gelir
function tahtayiOlustur() {
  const { genislik, yukseklik, levha, kareler } = oyun.tahta;
  const tahta = $('tahta');
  tahta.querySelectorAll('.kare').forEach(k => k.remove());
  tahta.style.gridTemplateColumns = `repeat(${genislik}, 1fr)`;
  tahta.style.gridTemplateRows = `repeat(${yukseklik}, 1fr)`;
  tahta.style.aspectRatio = `${genislik} / ${yukseklik}`;
  tahta.style.width = `min(92vw, ${Math.round(620 * genislik / 7)}px)`;
  const [lSutun, lSatir, lGenislik, lYukseklik] = levha;
  $('orta').style.gridColumn = `${lSutun + 1} / span ${lGenislik}`;
  $('orta').style.gridRow = `${lSatir + 1} / span ${lYukseklik}`;

  kareler.forEach(({ tip, sutun, satir }, i) => {
    const kare = document.createElement('div');
    kare.className = `kare kare-${tip}`;
    kare.id = `kare-${i}`;
    kare.style.gridRow = satir + 1;
    kare.style.gridColumn = sutun + 1;
    kare.innerHTML = `
      <span class="ikon">${kareBilgisi(tip).ikon}</span>
      <span>${kareBilgisi(tip).yazi}</span>
      <span class="ekstra" id="ekstra-${i}"></span>
      <div class="piyonlar" id="piyonlar-${i}"></div>`;
    kare.addEventListener('click', () => eylem('kareTiklandi', i));
    tahta.appendChild(kare);
  });
}

// 3D zarın 6 yüzünü ve üstlerindeki noktaları oluşturur
function zarKupunuOlustur() {
  $('zarKup').innerHTML = [1, 2, 3, 4, 5, 6].map(n => `
    <div class="yuz yuz-${n}">
      ${[...Array(9)].map((_, i) => `<span class="${ZAR_NOKTALARI[n].includes(i) ? 'nokta' : ''}"></span>`).join('')}
    </div>`).join('');
}

// ---------- 5) TUR AKIŞI ----------
// Bir sıra: zar at → zar döner → piyon zıplar → karenin etkisi → sıra geçer
function sirayiBaslat() {
  oyun.faz = 'zar';
  oyun.onKartKullanildi = false;
  oyun.hedefler = [];
  zarSonucunuGizle();
  if (UC_BOYUT) Tahta3D.zarlariGoster(oyun.tahta.zarSayisi);
  const o = aktif();
  // ⏸️ Dondurulan oyuncu bu turu buz küpünün içinde bekler; tur sonunda buz kırılır
  if (o.donmus) {
    oyun.faz = 'donmus';
    oyun.mesaj = `🧊 ${isim(o)} buz kesti, bu turu bekliyor...`;
    kayit(`⏸️ ${isim(o)} donmuş olduğu için bu turu bekledi`);
    efekt(o.konum, '🧊 Dondu!', 'ceza');
    ciz();
    setTimeout(() => {
      o.donmus = false;  // ciz() bunu görünce 3D'de buzu kırar
      sesCal('kirilma');
      ciz();
      setTimeout(sonrakiOyuncu, 700);
    }, 1500);
    return;
  }
  // 💸 İflas eden oyuncu bu turu oynayamaz; sonraki turda 0 mürekkeple devam eder
  if (o.iflas) {
    o.iflas = false;
    oyun.faz = 'donmus';
    oyun.mesaj = `💸 ${isim(o)} iflas ettiği için bu turu oynayamıyor...`;
    kayit(`💸 ${isim(o)} iflas yüzünden bu turu bekledi`);
    efekt(o.konum, '💸 İflas!', 'ceza');
    sesCal('ceza');
    ciz();
    setTimeout(sonrakiOyuncu, 1800);
    return;
  }
  // 📡 Online'da bağlantısı kopan oyuncunun sırası kendiliğinden geçer
  if (o.koptu) {
    oyun.faz = 'donmus';
    oyun.mesaj = `📡 ${isim(o)} oyundan ayrıldı, sırası geçiyor...`;
    ciz();
    setTimeout(sonrakiOyuncu, 900);
    return;
  }
  oyun.mesaj = `${isim(o)}, zar atma sırası sende!`;
  ciz();
}

function zarSonucunuGizle() {
  $('zarSonucu').classList.add('gizli');
}

// 🔁 Tekrar At: zarlar düşünce oyuncuya "bu sonuçla mı gideceksin, tekrar mı atacaksın?" diye sorulur
let tekrarCevabi = null;  // butona basılınca çağrılacak fonksiyon

function tekrarCevapla(tekrar) {
  if (oyun.faz === 'tekrarSorusu' && tekrarCevabi) tekrarCevabi(tekrar);
}

function tekrarSor(toplam) {
  return new Promise(cevapla => {
    oyun.faz = 'tekrarSorusu';
    oyun.mesaj = `🔁 ${isim(aktif())}, ${toplam} geldi. Bununla mı gideceksin, tekrar mı atacaksın?`;
    tekrarCevabi = tekrar => {
      tekrarCevabi = null;
      oyun.faz = 'yuvarlaniyor';
      cevapla(tekrar);
    };
    ciz();
  });
}

// Zarlar atılır ve toplanır (☠️ zehirli zar yediysen zar yerine 0-3'lük çark döner).
// Sonra varsa kartların etkisi sırayla eklenir: 🎲 Zar −2 → 2 düşer, ⏫ +3 Zar → 3 eklenir.
// Her adım ekranda büyük sayıyla animasyonlu gösterilir (3 + 6 = 9 → +3 → 12).
async function zarAt() {
  if (oyun.faz !== 'zar') return;
  const o = aktif();
  const zehirli = o.hileliZar;
  oyun.faz = 'yuvarlaniyor';
  let atilan;
  let ilkEtiket = '';
  if (zehirli) {
    atilan = rastgele(0, 3);
    ilkEtiket = '☠️ Zehirli çark';
    oyun.mesaj = '☠️ Zehirli çark dönüyor...';
    if (UC_BOYUT) Tahta3D.carkCevir(atilan, CARK_SURESI);
    sesCal('cark');
    ciz();
    await bekle(CARK_SURESI);
  } else {
    // 🔁 Tekrar At kartı varsa zar bir kez daha atılabilir (döngü en fazla iki kez döner)
    for (;;) {
      const zarlar = [...Array(o.ciftZar ? 4 : oyun.tahta.zarSayisi)].map(() => rastgele(1, 6));
      atilan = zarlar.reduce((a, b) => a + b, 0);
      ilkEtiket = zarlar.length > 1 ? `🎲 ${zarlar.join(' + ')}` : '';
      oyun.mesaj = zarlar.length > 1 ? `${zarlar.length} zar yuvarlanıyor...` : 'Zar yuvarlanıyor...';
      if (UC_BOYUT) Tahta3D.zarAt(zarlar, ZAR_SURESI);
      else zariCevir(zarlar[0]);
      sesCal('zar');
      ciz();
      await bekle(ZAR_SURESI + (zarlar.length - 1) * 60);
      if (!o.tekrarHakki) break;
      o.tekrarHakki = false;
      await zarSonucunuGoster(atilan, ilkEtiket, []);
      if (!(await tekrarSor(atilan))) break;
      kayit(`🔁 ${isim(o)} ${atilan} beğenmedi, tekrar atıyor`);
    }
  }

  const enAz = zehirli ? 0 : 1;  // zehirli çarkta yerinde saymak da mümkün
  let deger = atilan;
  const adimlar = [];
  if (o.zarCezasi) {
    deger = Math.max(enAz, deger - o.zarCezasi);
    adimlar.push({ etiket: `🎲 −${o.zarCezasi}`, deger });
  }
  if (o.zarBonusu) {
    deger += o.zarBonusu;
    adimlar.push({ etiket: `⏫ +${o.zarBonusu}`, deger });
  }
  o.hileliZar = false;
  o.ciftZar = false;
  o.tekrarHakki = false;
  o.zarCezasi = 0;
  o.zarBonusu = 0;
  oyun.zar = deger;

  await zarSonucunuGoster(atilan, ilkEtiket, adimlar);
  const ek = [ilkEtiket, ...adimlar.map(a => a.etiket)].filter(Boolean).join(', ');
  kayit(`🎲 ${isim(o)} ${zehirli ? 'çark çevirdi' : 'zar attı'}: <b>${atilan}</b>${ek ? ` (${ek})` : ''}${adimlar.length ? ` → <b>${deger}</b>` : ''}`);
  hareketEt();
}

// Ekranda büyük zar sonucu: önce atılan toplam (yanında "🎲 3 + 6"), sonra her kart etkisi için
// sayı yeni değere sayarak değişir
async function zarSonucunuGoster(ilk, ilkEtiket, adimlar) {
  const kutu = $('zarSonucu');
  const sayi = kutu.querySelector('.sayi');
  const etiket = kutu.querySelector('.etiket');
  sayi.textContent = ilk;
  etiket.textContent = ilkEtiket;
  kutu.classList.remove('gizli');
  animasyonuYenidenOynat(kutu, 'belir');
  await bekle(adimlar.length ? 600 : 350);

  let simdiki = ilk;
  for (const { etiket: yazi, deger } of adimlar) {
    etiket.textContent = yazi;
    animasyonuYenidenOynat(etiket, 'belir');
    sesCal('harfSec');
    const yon = Math.sign(deger - simdiki);
    while (simdiki !== deger) {
      simdiki += yon;
      sayi.textContent = simdiki;
      animasyonuYenidenOynat(sayi, 'tik');
      await bekle(90);
    }
    await bekle(450);
  }
}

// Aynı CSS animasyonunu tekrar oynatmak için sınıfı kaldırıp geri ekliyoruz
function animasyonuYenidenOynat(el, sinif) {
  el.classList.remove(sinif);
  void el.offsetWidth;  // tarayıcıya "değişikliği şimdi uygula" dedirtir
  el.classList.add(sinif);
}

// Küpü, istenen sayı üste gelecek şekilde döndürür.
// Her atışta 2 tam tur fazladan ekliyoruz ki zar hep yuvarlanıyormuş gibi dönsün.
function zariCevir(sayi) {
  oyun.zarDonus += 2;
  const [x, y] = ZAR_ACILARI[sayi];
  const fazla = oyun.zarDonus * 360;
  $('zarKup').style.transform = `rotateX(${x + fazla}deg) rotateY(${y + fazla}deg)`;
}

// Piyon kare kare ilerler. Bulunduğu karenin birden fazla "sonraki" karesi varsa (yol ayrımı)
// durur ve oyuncuya hangi yoldan gideceğini sorar; seçince kalan adımlarla devam eder.
function hareketEt() {
  if (oyun.zar === 0) {
    kayit(`☠️ ${isim(aktif())} zehirli çark yüzünden yerinde saydı`);
    sonrakiOyuncu();
    return;
  }
  oyun.faz = 'hareket';
  oyun.ziplayan = oyun.sira;
  oyun.kalanAdim = oyun.zar;
  oyun.hedefler = oyun.tahta.hedefGoster ? ulasilabilir(aktif().konum, oyun.zar) : [];
  oyun.mesaj = `${isim(aktif())} ${oyun.zar} kare ilerliyor...`;
  ciz();
  setTimeout(adimAt, ADIM_SURESI);
}

// Bir kareden tam "adim" kadar ilerleyince gelinebilecek bütün kareler (yol ayrımlarının hepsi denenir).
// Yolda bir rakibin 🧱 duvarı varsa piyon orada durur, o yüzden duvar da varış karesi sayılır.
function ulasilabilir(baslangic, adim) {
  let kume = new Set([baslangic]);
  const duvardaDuran = new Set();
  for (let i = 0; i < adim; i++) {
    const yeni = new Set();
    kume.forEach(k => oyun.tahta.kareler[k].sonraki.forEach(s => {
      if (rakipDuvariMi(s)) duvardaDuran.add(s);
      else yeni.add(s);
    }));
    kume = yeni;
  }
  return [...new Set([...kume, ...duvardaDuran])];
}

function rakipDuvariMi(kare) {
  const n = oyun.nesneler[kare];
  return n?.tip === 'duvar' && n.sahip !== oyun.sira;
}

function adimAt() {
  const secenekler = oyun.tahta.kareler[aktif().konum].sonraki;
  if (secenekler.length > 1) {
    yolSorusu(secenekler);
  } else {
    ilerle(secenekler[0]);
  }
}

function ilerle(hedefKare) {
  const o = aktif();
  o.konum = hedefKare;
  oyun.kalanAdim--;
  sesCal('adim');
  const ekonomi = oyun.tahta.ekonomi;
  if (o.konum === 0 && ekonomi) {
    // Ekonomili tahtada başlangıçtan geçen de duran da mürekkep alır
    o.murekkep += ekonomi.gecisMurekkep;
    kayit(`🏁 ${isim(o)} başlangıçtan geçti: <b>+${ekonomi.gecisMurekkep} 🖋️</b>`);
    efekt(0, `+${ekonomi.gecisMurekkep} 🖋️`, 'harf');
    sesCal('para');
  } else if (o.konum === 0 && oyun.kalanAdim > 0) {
    // Klasik tahtada başlangıçtan geçen +1 harf alır (tam üstüne gelirse kareEtkisi verir)
    const h = harfVer(o);
    kayit(`🏁 ${isim(o)} başlangıçtan geçti: <b>${h}</b>`);
    efekt(0, `+${h}`, 'harf');
    sesCal('harf');
  }
  // Karenin üstünde dönen harf taşı varsa, üstünden geçen de duran da onu toplar
  if (o.konum in oyun.toplanacaklar) {
    const h = oyun.toplanacaklar[o.konum];
    delete oyun.toplanacaklar[o.konum];
    o.harfler.push(h);
    kayit(`💎 ${isim(o)} dönen taşı topladı: <b>${h}</b>`);
    if (UC_BOYUT) Tahta3D.harfToplandi(o.konum, oyun.sira);
    sesCal('toplama');
  }
  // 🧱 Rakibin duvarına çarpan piyon orada durur, duvar da yıkılır
  if (oyun.kalanAdim > 0 && rakipDuvariMi(o.konum)) {
    const sahip = oyun.oyuncular[oyun.nesneler[o.konum].sahip];
    kayit(`🧱 ${isim(o)} ${isim(sahip)} oyuncusunun duvarına çarptı, ${oyun.kalanAdim} adımı yandı`);
    nesneyiKaldir(o.konum);
    efekt(o.konum, '🧱 Dur!', 'ceza');
    sesCal('saldiri');
    oyun.kalanAdim = 0;
  }
  const devam = () => setTimeout(oyun.kalanAdim > 0 ? adimAt : kareEtkisi, ADIM_SURESI);
  // 🏪 Marketten geçen de duran da alışveriş yapabilir; sonra yürümeye devam eder
  if (ekonomi && oyun.tahta.kareler[o.konum].tip === 'market') {
    marketAc(devam);
    return;
  }
  ciz();
  devam();
}

// ---------- 🏪 MARKET ----------
// Oyundaki kartlardan rastgele MARKET_SECENEK tanesi çıkar; oyuncu birini mürekkeple alabilir.
function marketAc(devam) {
  const havuz = Object.keys(oyun.kartAgirlik);
  const secenekler = [];
  while (secenekler.length < MARKET_SECENEK && havuz.length) {
    secenekler.push(havuz.splice(rastgele(0, havuz.length - 1), 1)[0]);
  }
  oyun.market = { secenekler, devam };
  oyun.faz = 'market';
  oyun.mesaj = `🏪 ${isim(aktif())}, markete uğradın! İstersen bir kart al.`;
  sesCal('para');
  ciz();
}

// 🏷️ İndirim kartı elindeyse fiyat yarıya iner
function marketFiyati(o, kart) {
  const fiyat = FIYATLAR[kart] ?? 400;
  return o.kartlar.includes('indirim') ? Math.ceil(fiyat / 2) : fiyat;
}

// Alınabilir mi? Mürekkep yetmeli ve elde yer olmalı (İndirim harcanacaksa onun yeri boşalır)
function marketteAlinabilir(o, kart) {
  const elde = o.kartlar.length - (o.kartlar.includes('indirim') ? 1 : 0);
  return o.murekkep >= marketFiyati(o, kart) && elde < MAX_KART;
}

function marketAl(secenekNo) {
  if (oyun.faz !== 'market') return;
  const o = aktif();
  const kart = oyun.market.secenekler[secenekNo];
  if (!marketteAlinabilir(o, kart)) return;
  const fiyat = marketFiyati(o, kart);
  if (fiyat < FIYATLAR[kart]) {
    o.kartlar.splice(o.kartlar.indexOf('indirim'), 1);
    kayit(`🏷️ ${isim(o)} indirim kartını kullandı`);
  }
  o.murekkep -= fiyat;
  o.kartlar.push(kart);
  kayit(`🏪 ${isim(o)} marketten ${KARTLAR[kart].ikon} <b>${KARTLAR[kart].ad}</b> aldı (−${fiyat} 🖋️)`);
  efekt(o.konum, `${KARTLAR[kart].ikon} ${KARTLAR[kart].ad}`, 'kart');
  sesCal('para');
  marketKapat();
}

function marketKapat() {
  if (oyun.faz !== 'market') return;
  const { devam } = oyun.market;
  oyun.market = null;
  oyun.faz = 'hareket';
  oyun.mesaj = `${isim(aktif())} yoluna devam ediyor...`;
  ciz();
  devam();
}

// Zorunlu ödeme (💸 vergi, 🪤 tuzak). Mürekkebi yetmeyen ya da sıfırlanan oyuncu iflas eder:
// elindekinin hepsini öder ve bir sonraki turunu oynayamaz.
function murekkepOde(o, miktar, alici = null) {
  const odenen = Math.min(o.murekkep, miktar);
  o.murekkep -= odenen;
  if (alici) alici.murekkep += odenen;
  if (o.murekkep === 0) {
    o.iflas = true;
    kayit(`💸 ${isim(o)} mürekkebi bitti, <b>İFLAS</b> etti! Bir sonraki turunu oynayamayacak`);
    efekt(o.konum, '💸 İflas!', 'ceza');
  }
  return odenen;
}

function yolSorusu(secenekler) {
  oyun.faz = 'yolSecimi';
  oyun.yolSecenekleri = secenekler;
  oyun.mesaj = `🔀 ${isim(aktif())}, yol ayrımındasın! Hangi yoldan gideceksin? (${oyun.kalanAdim} adım kaldı)`;
  sesCal('harfSec');
  ciz();
}

// Oyuncu bir yol seçti (paneldeki butondan ya da 3D'deki oka tıklayarak)
function yolSec(hedefKare) {
  if (oyun.faz !== 'yolSecimi' || !oyun.yolSecenekleri.includes(hedefKare)) return;
  oyun.faz = 'hareket';
  oyun.yolSecenekleri = [];
  oyun.mesaj = `${isim(aktif())} ilerliyor...`;
  ilerle(hedefKare);
}

// Bir yol seçeneğinin yönü, ilk birkaç karesi ve (işaretleme açıksa) varılacak kare:
// "⬇️ Aşağı: 🃏🃏🔤🔤… → 🎯 🔤 +1 harf"
function yolTarifi(hedefKare) {
  let tarif = yolYonu(hedefKare);
  if (oyun.tahta.hedefGoster) {
    const varis = ulasilabilir(hedefKare, oyun.kalanAdim - 1)
      .map(k => kareBilgisi(oyun.tahta.kareler[k].tip))
      .map(b => `${b.ikon} ${b.yazi}`);
    tarif += ` → 🎯 ${varis.join(' / ')}`;
  }
  return tarif;
}

function yolYonu(hedefKare) {
  const { kareler } = oyun.tahta;
  const nereden = kareler[aktif().konum];
  const nereye = kareler[hedefKare];
  const dx = nereye.sutun - nereden.sutun;
  const dy = nereye.satir - nereden.satir;
  const yon = dx > 0 ? '➡️ Sağa' : dx < 0 ? '⬅️ Sola' : dy > 0 ? '⬇️ Aşağı' : '⬆️ Yukarı';
  const ikonlar = [];
  let k = hedefKare;
  for (let i = 0; i < 4; i++) {
    ikonlar.push(kareIkonu(k));
    k = kareler[k].sonraki[0];
  }
  return `${yon}: ${ikonlar.join('')}…`;
}

// Karenin simgesi; üstünde tuzak/kutu/duvar ya da dönen taş varsa onu da gösterir
function kareIkonu(k) {
  return (k in oyun.nesneler ? TAHTA_NESNELERI[oyun.nesneler[k].tip].ikon : '')
    + (k in oyun.toplanacaklar ? '💎' : '')
    + kareBilgisi(oyun.tahta.kareler[k].tip).ikon;
}

function kareEtkisi() {
  oyun.ziplayan = -1;
  oyun.hedefler = [];
  const o = aktif();
  const yer = o.konum;
  const tip = oyun.tahta.kareler[yer].tip;

  nesneKontrol(o, yer);

  if (tip === 'vergi') {
    const odenen = murekkepOde(o, oyun.tahta.ekonomi.vergi);
    kayit(`💸 ${isim(o)} vergi ödedi: <b>−${odenen} 🖋️</b>`);
    efekt(yer, `💸 −${odenen} 🖋️`, 'ceza');
    sesCal('ceza');
  } else if (tip === 'harf' || (tip === 'baslangic' && !oyun.tahta.ekonomi)) {
    const h = harfVer(o);
    kayit(`🔤 ${isim(o)} <b>${h}</b> harfini buldu`);
    efekt(yer, `+${h}`, 'harf');
    sesCal('harf');
  } else if (tip === 'bonus' || tip === 'hazine') {
    const yeni = [...Array(tip === 'hazine' ? 3 : 2)].map(() => harfVer(o));
    kayit(`${kareBilgisi(tip).ikon} ${isim(o)} ${tip === 'hazine' ? 'hazine buldu' : 'bonus'}: <b>${yeni.join(', ')}</b>`);
    efekt(yer, yeni.map(h => `+${h}`).join(' '), 'harf');
    sesCal('bonus');
  } else if (tip === 'kart') {
    if (!Object.keys(oyun.kartAgirlik).length) {
      kayit(`🃏 Bu oyunda çekilecek kart yok`);
    } else if (o.kartlar.length >= MAX_KART) {
      kayit(`🃏 ${isim(o)} kart alamadı (elinde zaten ${MAX_KART} kart var)`);
    } else {
      const k = agirlikliSec(oyun.kartAgirlik);
      o.kartlar.push(k);
      kayit(`🃏 ${isim(o)} kart çekti: ${KARTLAR[k].ikon} ${KARTLAR[k].ad}`);
      efekt(yer, `${KARTLAR[k].ikon} ${KARTLAR[k].ad}`, 'kart');
      sesCal('kartCek');
    }
  } else if (tip === 'saldir') {
    if (saldiriKartlari(o).length) {
      saldiriBaslat();
      return;  // sıra, oyuncu kartını kullanınca veya vazgeçince geçer
    }
    kayit(`⚔️ ${isim(o)} kart kullan karesine geldi ama elinde kullanacak kart yok`);
  } else if (tip === 'ceza') {
    sesCal('ceza');
    if (o.harfler.length) {
      const h = rastgeleHarfAl(o);
      kayit(`💥 ${isim(o)} <b>${h}</b> harfini kaybetti`);
      efekt(yer, `−${h}`, 'ceza');
    } else {
      kayit(`💥 ${isim(o)} cezaya bastı ama kaybedecek harfi yoktu`);
    }
  } else if (tip === 'kartKaybi') {
    sesCal('ceza');
    if (o.kartlar.length) {
      const k = o.kartlar.splice(rastgele(0, o.kartlar.length - 1), 1)[0];
      kayit(`🗑️ ${isim(o)} <b>${KARTLAR[k].ad}</b> kartını kaybetti`);
      efekt(yer, `🗑️ −${KARTLAR[k].ad}`, 'ceza');
    } else {
      kayit(`🗑️ ${isim(o)} kart kaybı karesine geldi ama elinde kart yoktu`);
    }
  }
  sonrakiOyuncu();
}

// Duran oyuncunun karesinde tahta nesnesi varsa çalışır:
//   🪤 Rakibin tuzağı: kapanır, rastgele bir harfi tuzağı kurana geçer (kalkan korur).
//   🎁 Sürpriz kutusu (kimin olursa olsun): açılır, %50 +2 harf, %50 −1 harf.
// Kendi tuzağına basan bir şey kaybetmez (tuzak yerinde kalır). Duvarlar ilerlerken çalışır (ilerle).
function nesneKontrol(o, yer) {
  const nesne = oyun.nesneler[yer];
  if (!nesne) return;
  const kuran = oyun.oyuncular[nesne.sahip];

  if (nesne.tip === 'surprizKutusu') {
    nesneyiKaldir(yer);
    if (Math.random() < 0.5) {
      const yeni = [harfVer(o), harfVer(o)];
      kayit(`🎁 ${isim(o)} sürpriz kutusunu açtı: şanslı! <b>${yeni.join(', ')}</b>`);
      efekt(yer, `🎁 ${yeni.map(h => `+${h}`).join(' ')}`, 'harf');
      sesCal('bonus');
    } else if (o.harfler.length) {
      const h = rastgeleHarfAl(o);
      kayit(`🎁 ${isim(o)} sürpriz kutusunu açtı: şanssız! <b>${h}</b> harfini kaybetti`);
      efekt(yer, `🎁 −${h}`, 'ceza');
      sesCal('ceza');
    } else {
      kayit(`🎁 ${isim(o)} sürpriz kutusunu açtı: boş çıktı`);
      efekt(yer, '🎁 Boş!', 'kart');
    }
    return;
  }

  if (nesne.tip !== 'tuzak' || kuran === o) return;
  nesneyiKaldir(yer);
  sesCal('tuzak');
  if (korumaVarMi(o, `${isim(kuran)} oyuncusunun tuzağı`, yer)) return;
  if (o.harfler.length) {
    const h = rastgeleHarfAl(o);
    kuran.harfler.push(h);
    kayit(`🪤 ${isim(o)} ${isim(kuran)} oyuncusunun tuzağına yakalandı: <b>${h}</b> harfi ona geçti`);
    efekt(yer, `🪤 −${h}`, 'ceza');
  } else {
    kayit(`🪤 ${isim(o)} tuzağa yakalandı ama verecek harfi yoktu`);
    efekt(yer, '🪤 Şak!', 'ceza');
  }
  // Ekonomili tahtada tuzak mürekkep de çalar
  const ekonomi = oyun.tahta.ekonomi;
  if (ekonomi) {
    const odenen = murekkepOde(o, ekonomi.tuzakMurekkep, kuran);
    if (odenen) kayit(`🪤 ${isim(kuran)} tuzaktan <b>${odenen} 🖋️</b> kazandı`);
  }
}

// Tuzak/bomba gibi "kart olmayan" saldırılara karşı sadece kalkan korur (ayna yansıtacak kart bulamaz)
function korumaVarMi(o, neden, yer) {
  const kalkan = o.kartlar.indexOf('kalkan');
  if (kalkan === -1) return false;
  o.kartlar.splice(kalkan, 1);
  kayit(`🛡️ ${isim(o)} kalkanıyla ${neden} kendini korudu!`);
  efekt(yer, '🛡️ Engellendi!', 'kart');
  piyonEfekti(oyun.oyuncular.indexOf(o), 'kalkan');
  return true;
}

function nesneyiKaldir(kare) {
  delete oyun.nesneler[kare];
  if (UC_BOYUT) Tahta3D.nesneTetiklendi(kare);
}

// 3D tahtada karenin üstünden yükselen yazı (+A, −K, kart adı). CSS tahtasında bir şey yapmaz.
function efekt(kareNo, metin, stil) {
  if (UC_BOYUT) Tahta3D.ucanYazi(kareNo, metin, stil);
}

function sonrakiOyuncu() {
  // 👣 Ekstra Tur kartı kullanan aynı oyuncu bir kez daha oynar
  if (aktif().ekstraTur && oyun.faz !== 'donmus') {
    aktif().ekstraTur = false;
    kayit(`👣 ${isim(aktif())} ekstra turunu oynuyor!`);
    sirayiBaslat();
    return;
  }
  oyun.sira++;
  if (oyun.sira >= oyun.oyuncular.length) {
    oyun.sira = 0;
    oyun.tur++;
    toplanacaklariTamamla();  // toplanan dönen taşların yerine yenileri gelir
    // Her "kelimeSiklik" turda bir kelime turu yapılır
    if ((oyun.tur - 1) % oyun.kelimeSiklik === 0) {
      kelimeTurunaGec();
      return;
    }
  }
  sirayiBaslat();
}

// Kelime turuna kaç tur kaldı (üst barda gösterilir)
function kelimeTurunaKalan() {
  return oyun.kelimeSiklik - ((oyun.tur - 1) % oyun.kelimeSiklik);
}

// ---------- 6) KART KULLANMA ----------
// Kartlar iki yerde kullanılır:
//   ⚔️ karesine gelince (her tahtada): önce kart, sonra hedef rakip seçilir.
//   Zar atmadan önce (sadece genişletilmiş tahtada): turda 1 kart.
// Kart türleri:
//   rakibe oynananlar: hedef seçilir. Rakibin 🪞 aynası kartı sana yansıtır, 🛡️ kalkanı engeller.
//   kendine (KARTLAR[..].kendine): hemen işler; bazıları önce bir seçim ister
//     (✍️ harf, 🪄 kendi harfin, 🪤🎁🧱 tahtada bir kare). Seçimden vazgeçersen kart elinde kalır.
//   pasif (🛡️ kalkan, 🪞 ayna): oynanmaz, elde durur ve kendiliğinden çalışır.
function saldiriBaslat() {
  oyun.faz = 'saldiri';
  oyun.saldiriZamani = 'kare';
  oyun.secilenKart = null;
  oyun.mesaj = `⚔️ ${isim(aktif())}, bir kart kullanabilirsin!`;
  ciz();
}

function saldiriKartSec(kartNo) {
  if (oyun.faz !== 'saldiri') return;
  // Zar öncesi kartta "← Geri", kart seçimini iptal edip zar atma ekranına döner
  if (kartNo === null && oyun.saldiriZamani === 'onZar') {
    oyun.saldiriZamani = 'kare';
    oyun.secilenKart = null;
    oyun.faz = 'zar';
    oyun.mesaj = `${isim(aktif())}, zar atma sırası sende!`;
  } else {
    oyun.secilenKart = kartNo;
  }
  ciz();
}

// Zar atmadan önce elden bir kart seçildi
function onZarKartiSec(kartNo) {
  const o = aktif();
  const kart = o.kartlar[kartNo];
  if (oyun.faz !== 'zar' || oyun.onKartKullanildi || !kart || KARTLAR[kart].pasif) return;
  const bilgi = KARTLAR[kart];

  // Önce bir seçim isteyen kartlar: kart, seçim yapılınca harcanır
  if (kart === 'istenenHarf') {
    secimeGec('harfSecimi', kartNo, `✍️ ${isim(o)}, hangi harfi istiyorsun?`);
    return;
  }
  if (kart === 'sihirliDegnek') {
    if (!o.harfler.some(h => h !== JOKER)) {
      oyun.mesaj = `🪄 ${isim(o)}, jokere çevrilecek harfin yok`;
      ciz();
      return;
    }
    secimeGec('degnekSecimi', kartNo, `🪄 ${isim(o)}, hangi harfini ★ jokere çevireceksin?`);
    return;
  }
  if (kart in TAHTA_NESNELERI) {
    oyun.kareAmaci = kart;
    secimeGec('kareSecimi', kartNo,
      `${bilgi.ikon} ${isim(o)}, ${TAHTA_NESNELERI[kart].ad} koymak için tahtada bir kareye tıkla`);
    return;
  }
  // 🧹 Temizlik: tahtadaki nesnelerden biri seçilir (seçilebilecekler sarı çerçeveyle parlar)
  if (kart === 'tuzakTemizle') {
    if (!Object.keys(oyun.nesneler).length) {
      oyun.mesaj = `🧹 ${isim(o)}, tahtada temizlenecek bir şey yok, kartın elinde kaldı`;
      ciz();
      return;
    }
    oyun.kareAmaci = 'temizle';
    oyun.hedefler = Object.keys(oyun.nesneler).map(Number);
    secimeGec('kareSecimi', kartNo, `🧹 ${isim(o)}, kaldırmak istediğin tuzağa, kutuya ya da duvara tıkla`);
    return;
  }

  if (bilgi.kendine) {
    o.kartlar.splice(kartNo, 1);
    oyun.onKartKullanildi = true;
    kayit(`${bilgi.ikon} ${isim(o)} <b>${bilgi.ad}</b> kullandı`);
    efekt(o.konum, `${bilgi.ikon} ${bilgi.ad}`, 'kart');
    kartGosterisi(kart, oyun.sira);
    kartPiyonEfekti(kart, oyun.sira, null);
    sesCal('kartCek');
    oyun.mesaj = `${isim(o)}, şimdi zar at!`;
    kendiKartEtkisi(kart, o);
    if (oyun.faz === 'zar') ciz();  // 🚀 Roket gibi kartlar turu kendileri sürdürür
    return;
  }

  oyun.faz = 'saldiri';
  oyun.saldiriZamani = 'onZar';
  oyun.secilenKart = kartNo;
  oyun.mesaj = `${bilgi.ikon} ${isim(o)}, ${bilgi.ad} kartını kime kullanacaksın?`;
  ciz();
}

function secimeGec(faz, kartNo, mesaj) {
  oyun.faz = faz;
  oyun.secilenKart = kartNo;
  oyun.mesaj = mesaj;
  ciz();
}

// Seçimden vazgeçildi: kart elde kalır, zar atma ekranına dönülür
function secimIptal() {
  if (!['harfSecimi', 'degnekSecimi', 'kareSecimi'].includes(oyun.faz)) return;
  secimiBitir();
  oyun.mesaj = `${isim(aktif())}, zar atma sırası sende!`;
  ciz();
}

// Seçim tamamlandı: kart elden düşer ve zar atma ekranına dönülür
function secilenKartiHarca() {
  const kart = aktif().kartlar.splice(oyun.secilenKart, 1)[0];
  oyun.onKartKullanildi = true;
  kartGosterisi(kart, oyun.sira);
  kartPiyonEfekti(kart, oyun.sira, null);
  secimiBitir();
  return kart;
}

function secimiBitir() {
  oyun.faz = 'zar';
  oyun.secilenKart = null;
  oyun.kareAmaci = null;
  oyun.hedefler = [];
}

// "Kendine" kartların etkisi (kart elden düşmüş, kayıt yazılmış olarak gelir)
function kendiKartEtkisi(kart, o) {
  if (kart === 'zarArti3') {
    o.zarBonusu += 3;
    oyun.mesaj = `⏫ ${isim(o)}, zarına +3 eklenecek. Şimdi zar at!`;
  } else if (kart === 'ciftZar') {
    o.ciftZar = true;
    if (UC_BOYUT) Tahta3D.zarlariGoster(4);
    oyun.mesaj = `🎲 ${isim(o)}, bu tur 4 zar atacaksın!`;
  } else if (kart === 'tekrarAt') {
    o.tekrarHakki = true;
    oyun.mesaj = `🔁 ${isim(o)}, zarı beğenmezsen bir kez daha atabilirsin. Zar at!`;
  } else if (kart === 'ekstraTur') {
    o.ekstraTur = true;
    oyun.mesaj = `👣 ${isim(o)}, bu turdan sonra bir tur daha oynayacaksın. Zar at!`;
  } else if (kart === 'kasirga') {
    kasirga();
  } else if (kart === 'roket') {
    roket(o);
  } else if (kart === 'miknatis') {
    miknatis(o);
  } else if (kart === 'harfVergisi') {
    harfVergisi(o);
  } else if (kart === 'sesliYagmuru') {
    const yeni = [agirlikliSec(SESLI_HARFLER), agirlikliSec(SESLI_HARFLER)];
    o.harfler.push(...yeni);
    kayit(`🌧️ ${isim(o)} sesli harf yağmuruyla <b>${yeni.join(', ')}</b> aldı`);
    efekt(o.konum, yeni.map(h => `+${h}`).join(' '), 'harf');
    sesCal('bonus');
  } else if (kart === 'harfBombasi') {
    harfBombasi(o);
  } else if (kart === 'ciftPuan') {
    o.ciftPuan = true;
    kayit(`✖️ ${isim(o)} bir sonraki kelime turunda çift puan alacak`);
  } else if (kart === 'ekSure') {
    o.ekSure += EK_SURE;
    kayit(`⏱️ ${isim(o)} bir sonraki kelime turunda +${EK_SURE} saniye kazandı`);
  }
}

// 🌪️ Kasırga: rastgele iki oyuncunun yeri değişir (kartı kullanan da çıkabilir)
function kasirga() {
  const numaralar = oyun.oyuncular.map((_, i) => i);
  const a = numaralar.splice(rastgele(0, numaralar.length - 1), 1)[0];
  const b = numaralar.splice(rastgele(0, numaralar.length - 1), 1)[0];
  yerleriDegistir(oyun.oyuncular[a], oyun.oyuncular[b]);
  kayit(`🌪️ Kasırga! ${isim(oyun.oyuncular[a])} ile ${isim(oyun.oyuncular[b])} yer değiştirdi`);
}

function yerleriDegistir(o1, o2) {
  [o1.konum, o2.konum] = [o2.konum, o1.konum];
  piyonEfekti(oyun.oyuncular.indexOf(o1), 'donus');
  piyonEfekti(oyun.oyuncular.indexOf(o2), 'donus');
  efekt(o1.konum, '🔄', 'kart');
  efekt(o2.konum, '🔄', 'kart');
}

// ⏪ Geri Git: geldiği yoldan "adim" kare geri (birleşme noktasında rastgele bir yoldan)
function geriGotur(o, adim) {
  const { kareler } = oyun.tahta;
  for (let i = 0; i < adim; i++) {
    const onceki = kareler[o.konum].onceki;
    if (!onceki.length) break;
    o.konum = onceki[rastgele(0, onceki.length - 1)];
  }
  efekt(o.konum, `⏪ −${adim}`, 'ceza');
}

// 🚀 Roket: önündeki yoldan (ayrımlarda ilk yoldan) uçup ilk yol ayrımına ya da 💰 hazineye konar.
// Zar atılmaz, uçarken tuzak/duvar/taş etkilemez; vardığı karenin etkisi çalışır ve sıra geçer.
function roket(o) {
  const { kareler } = oyun.tahta;
  let k = o.konum;
  for (let i = 0; i < ROKET_MENZIL; i++) {
    k = kareler[k].sonraki[0];
    if (kareler[k].sonraki.length > 1 || kareler[k].tip === 'hazine') break;
  }
  o.konum = k;
  oyun.faz = 'hareket';
  oyun.ziplayan = oyun.sira;
  oyun.mesaj = `🚀 ${isim(o)} uçuyor!`;
  kayit(`🚀 ${isim(o)} roketle ${kareBilgisi(kareler[k].tip).ikon} karesine uçtu`);
  sesCal('bonus');
  ciz();
  setTimeout(kareEtkisi, 900);
}

// 🧲 Mıknatıs: tahtada (kuş uçuşu) en yakın dönen taşı kendine çeker
function miknatis(o) {
  const { kareler } = oyun.tahta;
  const ben = kareler[o.konum];
  const taslar = Object.keys(oyun.toplanacaklar).map(Number);
  if (!taslar.length) {
    kayit('🧲 Tahtada çekilecek taş yoktu');
    return;
  }
  const uzaklik = k => Math.abs(kareler[k].sutun - ben.sutun) + Math.abs(kareler[k].satir - ben.satir);
  const kare = taslar.reduce((a, b) => (uzaklik(b) < uzaklik(a) ? b : a));
  const h = oyun.toplanacaklar[kare];
  delete oyun.toplanacaklar[kare];
  o.harfler.push(h);
  kayit(`🧲 ${isim(o)} mıknatısla <b>${h}</b> taşını çekti`);
  if (UC_BOYUT) Tahta3D.harfToplandi(kare, oyun.sira);
  sesCal('toplama');
}

// 📜 Harf Vergisi: her rakip en düşük puanlı harfini verir (joker hariç; kalkan korur)
function harfVergisi(o) {
  oyun.oyuncular.forEach(r => {
    if (r === o) return;
    const adaylar = r.harfler.map((h, i) => [h, i]).filter(([h]) => h !== JOKER);
    if (!adaylar.length || korumaVarMi(r, 'vergiden', r.konum)) return;
    const [h, i] = adaylar.reduce((a, b) => (harfPuani(b[0]) < harfPuani(a[0]) ? b : a));
    r.harfler.splice(i, 1);
    o.harfler.push(h);
    kayit(`📜 ${isim(r)} vergi olarak <b>${harfinKendisi(h)}</b> verdi`);
    efekt(r.konum, `📜 −${harfinKendisi(h)}`, 'ceza');
    piyonEfekti(oyun.oyuncular.indexOf(r), 'zehir');
  });
  sesCal('toplama');
}

// 💣 Harf Bombası: senin dışındaki herkes rastgele 1 harf kaybeder (kalkan korur)
function harfBombasi(o) {
  sesCal('saldiri');
  oyun.oyuncular.forEach(r => {
    if (r === o || !r.harfler.length || korumaVarMi(r, 'bombadan', r.konum)) return;
    const h = rastgeleHarfAl(r);
    kayit(`💣 ${isim(r)} <b>${harfinKendisi(h)}</b> harfini kaybetti`);
    efekt(r.konum, `💣 −${harfinKendisi(h)}`, 'ceza');
    piyonEfekti(oyun.oyuncular.indexOf(r), 'patlama');
  });
}

// 🧹 Temizlik: tahtadaki bütün tuzak, kutu ve duvarlar kalkar
// 🧹 Temizlik: seçilen karedeki tuzak/kutu/duvar kaldırılır (kimin olursa olsun)
function temizle(kareNo) {
  if (!(kareNo in oyun.nesneler)) {
    oyun.mesaj = '🧹 O karede temizlenecek bir şey yok, sarı çerçeveli karelerden birini seç';
    ciz();
    return;
  }
  const o = aktif();
  const { tip, sahip } = oyun.nesneler[kareNo];
  secilenKartiHarca();
  nesneyiKaldir(kareNo);
  kayit(`🧹 ${isim(o)}, ${isim(oyun.oyuncular[sahip])} oyuncusunun ${TAHTA_NESNELERI[tip].adini} kaldırdı`);
  efekt(kareNo, `🧹 ${TAHTA_NESNELERI[tip].ikon}`, 'kart');
  sesCal('kartCek');
  oyun.mesaj = `${isim(o)}, şimdi zar at!`;
  ciz();
}

// 🪤🎁🧱 Kare seçme modunda bir kareye tıklandı (3D'de karoya, yedek tahtada kareye)
function kareTiklandi(kareNo) {
  if (oyun.faz !== 'kareSecimi') return;
  if (oyun.kareAmaci === 'temizle') {
    temizle(kareNo);
    return;
  }
  if (kareNo === 0 || kareNo in oyun.nesneler) {
    oyun.mesaj = 'Başlangıca ya da üstünde zaten bir şey olan kareye konamaz, başka bir kare seç';
    ciz();
    return;
  }
  const o = aktif();
  const amac = oyun.kareAmaci;
  const n = TAHTA_NESNELERI[amac];
  secilenKartiHarca();
  oyun.nesneler[kareNo] = { tip: amac, sahip: oyun.sira };
  kayit(`${n.ikon} ${isim(o)} bir kareye ${n.ad} koydu`);
  sesCal(amac === 'tuzak' ? 'tuzak' : 'kartCek');
  oyun.mesaj = `${n.ikon} ${isim(o)}, şimdi zar at!`;
  ciz();
}

// ✍️ Harf Seç kartıyla alfabeden bir harf seçildi: ★ özel taş olarak ele gelir
function ozelHarfAl(h) {
  if (oyun.faz !== 'harfSecimi') return;
  const o = aktif();
  secilenKartiHarca();
  o.harfler.push(OZEL_ON + h);
  kayit(`✍️ ${isim(o)} Harf Seç kartıyla <b>${h}</b> aldı (★ özel taş, ${OZEL_HARF_PUANI} puan)`);
  efekt(o.konum, `★${h}`, 'harf');
  sesCal('toplama');
  oyun.mesaj = `${isim(o)}, şimdi zar at!`;
  ciz();
}

// 🪄 Sihirli Değnek: elindeki seçilen harf ★ jokere döner
function degnekSec(harfNo) {
  if (oyun.faz !== 'degnekSecimi') return;
  const o = aktif();
  const eski = o.harfler[harfNo];
  if (eski === undefined || eski === JOKER) return;
  secilenKartiHarca();
  o.harfler[harfNo] = JOKER;
  kayit(`🪄 ${isim(o)} <b>${harfinKendisi(eski)}</b> harfini ★ jokere çevirdi`);
  efekt(o.konum, `🪄 ${harfinKendisi(eski)} → ★`, 'harf');
  sesCal('toplama');
  oyun.mesaj = `${isim(o)}, şimdi zar at!`;
  ciz();
}

function saldiriHedefSec(hedefNo) {
  if (oyun.faz !== 'saldiri' || oyun.secilenKart === null) return;
  const saldiran = aktif();
  const hedef = oyun.oyuncular[hedefNo];
  const kart = saldiran.kartlar.splice(oyun.secilenKart, 1)[0];
  const bilgi = KARTLAR[kart];
  kayit(`${bilgi.ikon} ${isim(saldiran)}, ${isim(hedef)} oyuncusuna <b>${bilgi.ad}</b> kullandı`);

  const ayna = hedef.kartlar.indexOf('ayna');
  const kalkan = hedef.kartlar.indexOf('kalkan');
  let sonuc;
  if (ayna !== -1) {
    // 🪞 Ayna önce gelir: kart, kullanana geri döner (roller yer değiştirir)
    hedef.kartlar.splice(ayna, 1);
    kayit(`🪞 ${isim(hedef)} aynayla kartı ${isim(saldiran)} oyuncusuna geri yansıttı!`);
    efekt(hedef.konum, '🪞 Yansıdı!', 'kart');
    efekt(saldiran.konum, `${bilgi.ikon} ${bilgi.ad}`, 'kart');
    kartGosterisi(kart, oyun.sira, hedefNo, `🪞 ${isim(hedef)} aynayla geri yansıttı! Kart ${isim(saldiran)} oyuncusuna döndü.`);
    piyonEfekti(hedefNo, 'ayna');
    kartPiyonEfekti(kart, hedefNo, oyun.sira);
    sesCal('kalkan');
    sonuc = kartEtkisi(kart, hedef, saldiran);
  } else if (kalkan !== -1) {
    hedef.kartlar.splice(kalkan, 1);
    kayit(`🛡️ ${isim(hedef)} kalkanla engelledi!`);
    efekt(hedef.konum, `${bilgi.ikon} ${bilgi.ad} → 🛡️ Engellendi!`, 'kart');
    kartGosterisi(kart, oyun.sira, hedefNo, `🛡️ ${isim(hedef)} kalkanla engelledi! Hiçbir şey olmadı.`);
    piyonEfekti(hedefNo, 'kalkan');
    sesCal('kalkan');
  } else {
    efekt(hedef.konum, `${bilgi.ikon} ${bilgi.ad}`, 'kart');
    kartGosterisi(kart, oyun.sira, hedefNo);
    kartPiyonEfekti(kart, oyun.sira, hedefNo);
    sesCal('saldiri');
    sonuc = kartEtkisi(kart, saldiran, hedef);
  }
  if (sonuc !== 'secimBekle') saldiriSonu();
}

// Kart kullanımı bitti: zar öncesiyse oyuncu şimdi zarını atar, ⚔️ karesindeyse sıra geçer
function saldiriSonu() {
  if (oyun.saldiriZamani === 'onZar') {
    oyun.saldiriZamani = 'kare';
    oyun.onKartKullanildi = true;
    oyun.faz = 'zar';
    oyun.secilenKart = null;
    oyun.mesaj = `${isim(aktif())}, şimdi zar at!`;
    ciz();
  } else {
    sonrakiOyuncu();
  }
}

function saldiriVazgec() {
  if (oyun.faz !== 'saldiri') return;
  kayit(`⚔️ ${isim(aktif())} kartını saklamayı seçti`);
  sonrakiOyuncu();
}

// 🕵️ Casus: casusluk yapan, hedefin kartlarından birini seçip çöpe atar
function casusAt(kartNo) {
  if (oyun.faz !== 'casusSecimi') return;
  const { casus, hedef } = oyun.casusluk;
  const kart = oyun.oyuncular[hedef].kartlar.splice(kartNo, 1)[0];
  kayit(`🕵️ ${isim(oyun.oyuncular[casus])}, ${isim(oyun.oyuncular[hedef])} oyuncusunun <b>${KARTLAR[kart].ad}</b> kartını çöpe attı`);
  efekt(oyun.oyuncular[hedef].konum, `🗑️ −${KARTLAR[kart].ad}`, 'ceza');
  sesCal('ceza');
  oyun.casusluk = null;
  saldiriSonu();
}

// Rakibe oynanan kartların etkisi. Ayna yansıttığında "saldiran" ve "hedef" yer değiştirmiş gelir.
// Kart ek bir seçim bekliyorsa 'secimBekle' döner (🕵️ Casus).
function kartEtkisi(kart, saldiran, hedef) {
  if (kart === 'zarEksi2') {
    hedef.zarCezasi += 2;
    kayit(`${isim(hedef)} bir sonraki zarında ${hedef.zarCezasi} eksik ilerleyecek`);
    return;
  }
  if (kart === 'hileliZar') {
    hedef.hileliZar = true;
    kayit(`${isim(hedef)} bir sonraki turunda zar yerine ☠️ zehirli çark çevirecek (0-3)`);
    return;
  }
  if (kart === 'yerDegistir') {
    yerleriDegistir(saldiran, hedef);
    kayit(`${isim(saldiran)} ile ${isim(hedef)} yer değiştirdi`);
    return;
  }
  if (kart === 'dondur') {
    hedef.donmus = true;
    kayit(`⏸️ ${isim(hedef)} buz kesti, bir sonraki turunu bekleyecek`);
    sesCal('buz');
    return;
  }
  if (kart === 'geriGit') {
    geriGotur(hedef, GERI_GIT_ADIM);
    kayit(`⏪ ${isim(hedef)} ${GERI_GIT_ADIM} kare geri gitti`);
    return;
  }
  if (kart === 'sureHirsizi') {
    hedef.kisaSure = true;
    kayit(`⏳ ${isim(hedef)} bir sonraki kelime turunda sadece ${KISA_SURE} saniyesi olacak`);
    return;
  }
  if (kart === 'casus') {
    if (!hedef.kartlar.length) {
      kayit(`🕵️ ${isim(hedef)} oyuncusunun hiç kartı yokmuş`);
      return;
    }
    oyun.casusluk = { casus: oyun.oyuncular.indexOf(saldiran), hedef: oyun.oyuncular.indexOf(hedef) };
    oyun.faz = 'casusSecimi';
    oyun.mesaj = `🕵️ ${isim(saldiran)}, ${isim(hedef)} oyuncusunun kartları bunlar. Birini çöpe at!`;
    ciz();
    return 'secimBekle';
  }
  if (kart === 'kartTakasi') {
    [saldiran.kartlar, hedef.kartlar] = [hedef.kartlar, saldiran.kartlar];
    kayit(`${isim(saldiran)} ve ${isim(hedef)} kartlarını değiştirdi`);
    return;
  }
  if (kart === 'harfTakasi') {
    [saldiran.harfler, hedef.harfler] = [hedef.harfler, saldiran.harfler];
    kayit(`${isim(saldiran)} ve ${isim(hedef)} tüm harflerini değiştirdi!`);
    return;
  }
  if (!hedef.harfler.length) {
    kayit('Ama etkilenecek harf yoktu');
    return;
  }
  if (kart === 'harfKap') {
    const h = rastgeleHarfAl(hedef);
    saldiran.harfler.push(h);
    kayit(`${isim(saldiran)} <b>${harfinKendisi(h)}</b> harfini kaptı`);
  } else if (kart === 'harfKaristir') {
    const i = rastgele(0, hedef.harfler.length - 1);
    const eski = hedef.harfler[i];
    hedef.harfler[i] = agirlikliSec(HARF_AGIRLIK);
    kayit(`<b>${harfinKendisi(eski)}</b> harfi <b>${hedef.harfler[i]}</b> oldu`);
  } else if (kart === 'tekHarfDegis') {
    if (!saldiran.harfler.length) {
      kayit('Ama verecek harfin yoktu');
      return;
    }
    const i = rastgele(0, saldiran.harfler.length - 1);
    const j = rastgele(0, hedef.harfler.length - 1);
    const verilen = saldiran.harfler[i];
    const alinan = hedef.harfler[j];
    saldiran.harfler[i] = alinan;
    hedef.harfler[j] = verilen;
    kayit(`${isim(saldiran)} <b>${harfinKendisi(verilen)}</b> verdi, <b>${harfinKendisi(alinan)}</b> aldı`);
  }
}

// ---------- 7) ÇİZİM ----------
// Durum (oyun nesnesi) değişince ekranı baştan güncelleriz.
function ciz() {
  const oklar = oyun.faz === 'yolSecimi' ? oyun.yolSecenekleri : [];
  if (UC_BOYUT) {
    Tahta3D.piyonlariGuncelle(oyun.oyuncular, oyun.sira, oyun.ziplayan, ADIM_SURESI);
    Tahta3D.yolOklari(aktif().konum, oklar);
    Tahta3D.hedefleriIsaretle(oyun.hedefler);
    Tahta3D.nesneleriGuncelle(Object.fromEntries(Object.entries(oyun.nesneler)
      .map(([kare, n]) => [kare, { tip: n.tip, renk: oyun.oyuncular[n.sahip].renk }])));
    Tahta3D.toplanacaklariGuncelle(oyun.toplanacaklar);
    // Tahtada kare seçme (tuzak/kutu/duvar/temizlik) sadece hamle sırası bu cihazdaysa açık
    if (oyun.faz === 'kareSecimi' && benimSiram()) Tahta3D.kareSecimiAc(kare => eylem('kareTiklandi', kare));
    else Tahta3D.kareSecimiKapat();
  } else {
    piyonlariCiz();
    // Yedek tahtada tuzak/kutu/duvar ve dönen taşlar karenin köşesinde simge olarak görünür
    oyun.tahta.kareler.forEach((_, i) => {
      $(`ekstra-${i}`).textContent = (i in oyun.nesneler ? TAHTA_NESNELERI[oyun.nesneler[i].tip].ikon : '')
        + (oyun.toplanacaklar[i] ?? '');
    });
    // CSS tahtasında seçilebilecek kareler ve varış kareleri parlar
    document.querySelectorAll('.kare.secilebilir, .kare.hedef').forEach(k => k.classList.remove('secilebilir', 'hedef'));
    oklar.forEach(no => $(`kare-${no}`).classList.add('secilebilir'));
    oyun.hedefler.forEach(no => $(`kare-${no}`).classList.add('hedef'));
  }
  yolPaneliniCiz();

  const kalan = kelimeTurunaKalan();
  $('turBilgisi').textContent = `🔁 Tur ${oyun.tur} · ${kalan === 1 ? 'bu tur sonu kelime turu!' : `kelime turuna ${kalan} tur`}`;
  $('siraBilgisi').innerHTML = `Sıra: ${isim(aktif())}`;
  $('hedefBilgisi').textContent = `🎯 Hedef: ${oyun.hedefPuan}`;
  $('mesaj').innerHTML = oyun.mesaj;
  // Bu zarı etkileyecek kartlar hatırlatılır
  const o = aktif();
  const uyarilar = [];
  if (o.hileliZar) uyarilar.push('☠️ zar yerine zehirli çark (0-3)');
  if (o.ciftZar) uyarilar.push('🎲 4 zar');
  if (o.zarCezasi) uyarilar.push(`🎲 ${o.zarCezasi} düşülecek`);
  if (o.zarBonusu) uyarilar.push(`⏫ +${o.zarBonusu} eklenecek`);
  if (o.tekrarHakki) uyarilar.push('🔁 beğenmezsen tekrar atabilirsin');
  if (o.ekstraTur) uyarilar.push('👣 sonra bir tur daha');
  $('kartIpucu').textContent = oyun.faz === 'zar' && uyarilar.length ? `Bu atışında: ${uyarilar.join(' · ')}` : '';
  $('zarBtn').disabled = oyun.faz !== 'zar' || !benimSiram();
  const zarAdedi = o.ciftZar ? 4 : oyun.tahta.zarSayisi;
  $('zarBtn').textContent = o.hileliZar ? '☠️ Çarkı Çevir'
    : zarAdedi > 1 ? `🎲 ${zarAdedi} Zar At` : '🎲 Zar At';
  // Online'da sıra rakipteyken kontroller sadece izlenir (tıklanmaz)
  $('kontroller').classList.toggle('izleyici', !benimSiram());
  if (online() && !benimSiram() && oyun.faz !== 'donmus') {
    $('kartIpucu').textContent = `⏳ Sıra ${aktif().ad} oyuncusunda, hamlesini bekliyorsun...`;
  }
  saldiriPaneliniCiz();
  oyuncuListesiniCiz();
  ipucuKontrol(tahtaIpucuSec(), 'ipucuBalonu');
  siraAfisiKontrol();
  durumDegisti();
}

// Yol ayrımında her yol için bir buton: yönü ve o yoldaki ilk birkaç kare görünür
function yolPaneliniCiz() {
  const panel = $('yolPaneli');
  const secimde = oyun.faz === 'yolSecimi' && benimSiram();
  panel.classList.toggle('gizli', !secimde);
  panel.innerHTML = !secimde ? '' : oyun.yolSecenekleri.map(no =>
    `<button class="kartBtn" onclick="eylem('yolSec', ${no})">${yolTarifi(no)}</button>`).join('');
}

// Yedek (internetsiz) CSS tahtasında piyonlar
function piyonlariCiz() {
  document.querySelectorAll('.piyonlar').forEach(p => (p.innerHTML = ''));
  oyun.oyuncular.forEach((o, i) => {
    const piyon = document.createElement('div');
    piyon.className = 'piyon'
      + (i === oyun.sira ? ' aktif' : '')
      + (i === oyun.ziplayan ? ' zipla' : '');
    piyon.style.setProperty('--renk', o.renk);
    piyon.title = o.ad;
    piyon.innerHTML = '<span class="taban"></span><span class="govde"></span><span class="govde"></span><span class="govde"></span>';
    $(`piyonlar-${o.konum}`).appendChild(piyon);
  });
}

function saldiriPaneliniCiz() {
  const panel = $('saldiriPaneli');
  const o = aktif();
  const onZarSecimi = oyun.faz === 'zar' && oyun.tahta.onZarKartlari
    && !oyun.onKartKullanildi && onZarKartlari(o).length > 0;
  const secimFazlari = ['saldiri', 'kareSecimi', 'harfSecimi', 'degnekSecimi', 'casusSecimi', 'tekrarSorusu', 'market'];
  // Online'da sıra rakipteyken onun kartları/seçenekleri gösterilmez (gizli bilgi)
  if ((!secimFazlari.includes(oyun.faz) && !onZarSecimi) || !benimSiram()) {
    panel.classList.add('gizli');
    panel.innerHTML = '';
    return;
  }
  panel.classList.remove('gizli');
  const vazgec = `<button onclick="eylem('secimIptal')">Vazgeç</button>`;

  if (oyun.faz === 'harfSecimi') {
    panel.innerHTML = `<p class="adim">✍️ Hangi harfi istiyorsun? (★ özel taş, kelimede ${OZEL_HARF_PUANI} puan)</p>`
      + `<div class="alfabe">${ALFABE.map(h => `<button onclick="eylem('ozelHarfAl', '${h}')">${h}</button>`).join('')}</div>`
      + vazgec;
    return;
  }
  if (oyun.faz === 'degnekSecimi') {
    panel.innerHTML = '<p class="adim">🪄 Hangi harfin ★ jokere dönsün?</p>'
      + `<div class="alfabe">${o.harfler.map((h, i) => h === JOKER ? ''
        : `<button onclick="eylem('degnekSec', ${i})">${harfinKendisi(h)}</button>`).join('')}</div>`
      + vazgec;
    return;
  }
  if (oyun.faz === 'kareSecimi') {
    panel.innerHTML = (oyun.kareAmaci === 'temizle'
      ? '<p class="adim">🧹 Kaldırmak istediğin tuzağa, kutuya ya da duvara tıkla (sarı çerçeveliler)</p>'
      : `<p class="adim">${TAHTA_NESNELERI[oyun.kareAmaci].ikon} Tahtada ${TAHTA_NESNELERI[oyun.kareAmaci].ad} koymak istediğin kareye tıkla</p>`)
      + vazgec;
    return;
  }
  if (oyun.faz === 'casusSecimi') {
    const hedef = oyun.oyuncular[oyun.casusluk.hedef];
    panel.innerHTML = `<p class="adim">🕵️ ${guvenli(hedef.ad)} oyuncusunun kartları — hangisi çöpe gitsin?</p>`
      + `<div class="kartSirasi">${hedef.kartlar.map((k, kNo) => kartYuzu(k, { tikla: `eylem('casusAt', ${kNo})` })).join('')}</div>`;
    return;
  }
  if (oyun.faz === 'market') {
    const indirimli = o.kartlar.includes('indirim');
    panel.innerHTML = `<p class="adim">🏪 Market · 🖋️ ${o.murekkep} mürekkebin var${indirimli ? ' · 🏷️ indirim: fiyatlar yarıya!' : ''}</p>`
      + `<div class="kartSirasi">${oyun.market.secenekler.map((k, i) => {
        const fiyat = marketFiyati(o, k);
        const alinabilir = marketteAlinabilir(o, k);
        const neden = alinabilir ? KARTLAR[k].aciklama : o.murekkep < fiyat ? 'Mürekkebin yetmiyor' : `Elinde zaten ${MAX_KART} kart var`;
        return kartYuzu(k, { tikla: `eylem('marketAl', ${i})`, fiyat, kapali: !alinabilir, ipucu: neden });
      }).join('')}</div>`
      + `<button onclick="eylem('marketKapat')">Almıyorum →</button>`;
    return;
  }
  if (oyun.faz === 'tekrarSorusu') {
    panel.innerHTML = `<button class="kartBtn" onclick="eylem('tekrarCevapla', false)">✅ Bu sonuçla git</button>`
      + `<button class="kartBtn" onclick="eylem('tekrarCevapla', true)">🔁 Tekrar at</button>`;
    return;
  }

  // Genişletilmiş tahta: zar atmadan önce elindeki kartlar (istersen kullan, istersen direkt zar at)
  if (onZarSecimi) {
    panel.innerHTML = '<p class="adim">🃏 Zar atmadan önce bir kart oynayabilirsin — istemezsen direkt zar at:</p>'
      + `<div class="kartSirasi">${o.kartlar.map((k, kNo) => (KARTLAR[k].pasif ? ''
        : kartYuzu(k, { tikla: `eylem('onZarKartiSec', ${kNo})` }))).join('')}</div>`;
    return;
  }

  if (oyun.secilenKart === null) {
    panel.innerHTML = '<p class="adim">1) Hangi kartı kullanacaksın?</p>'
      + `<div class="kartSirasi">${o.kartlar.map((k, kNo) => (KARTLAR[k].pasif || KARTLAR[k].kendine ? ''
        : kartYuzu(k, { tikla: `eylem('saldiriKartSec', ${kNo})` }))).join('')}</div>`
      + `<button onclick="eylem('saldiriVazgec')">Saklarım, kullanmıyorum</button>`;
  } else {
    const b = KARTLAR[o.kartlar[oyun.secilenKart]];
    panel.innerHTML = `<p class="adim">2) ${b.ikon} ${b.ad} kime? <span class="soluk kucuk">(${kartKisa(o.kartlar[oyun.secilenKart])})</span></p>`
      + oyun.oyuncular.map((r, rNo) => r === o ? '' : `
        <button class="kartBtn" style="border-color:${r.renk}" onclick="eylem('saldiriHedefSec', ${rNo})">
          ${guvenli(r.ad)} (${r.harfler.length} harf, ${r.kartlar.length} kart)${r.kartlar.includes('kalkan') ? ' 🛡️' : ''}${r.kartlar.includes('ayna') ? ' 🪞' : ''}
        </button>`).join('')
      + `<button onclick="eylem('saldiriKartSec', null)">← Geri</button>`;
  }
}

// Oyuncunun üstündeki kart etkileri (yan panelde isminin yanında küçük rozetler)
function durumRozetleri(o) {
  return [
    o.iflas && '💸 iflas',
    o.donmus && '⏸️ donmuş',
    o.hileliZar && '☠️ zehirli',
    o.zarCezasi && `🎲 −${o.zarCezasi}`,
    o.ciftPuan && '✖️2 puan',
    o.ekSure && `⏱️ +${o.ekSure} sn`,
    o.kisaSure && `⏳ ${KISA_SURE} sn`,
  ].filter(Boolean).map(r => `<span class="rozet">${r}</span>`).join('');
}

// Online'da rakibin harfleri ve kartları gizlidir: sadece kaç tane olduğu görünür
function oyuncuListesiniCiz() {
  $('oyuncuListesi').innerHTML = oyun.oyuncular.map((o, i) => {
    const gizli = online() && i !== AG.benimNo;
    // Yeni gelen taş/kart parlar, giden taş kırmızı uçar, puan değişince sayı zıplar (gorsel.js)
    const iz = elDegisiminiIzle(o, i);
    const harfler = gizli ? gizliSayac(`🔒 ${o.harfler.length} harf`, iz)
      : elHarfleriniCiz(o, iz) || '<i class="soluk">harf yok</i>';
    const yeniKartlar = [...iz.yeniKart];
    const yeniMi = k => {
      const j = yeniKartlar.findIndex(y => y.x === k);
      return j !== -1 && yeniKartlar.splice(j, 1).length > 0;
    };
    const kartlar = gizli ? o.kartlar.map(k => kartArkasi(yeniMi(k))).join('') || '<i class="soluk">kart yok</i>'
      : o.kartlar.map(k => kartYuzu(k, { mini: true, yeni: yeniMi(k) })).join('')
        || '<i class="soluk">kart yok</i>';
    const puanSinifi = iz.puanDegisim ? ' zipla' : '';
    return `
    <div class="oyuncuKart ${i === oyun.sira ? 'sirada' : ''}" style="border-color:${o.renk};--renk:${o.renk}">
      <div class="oyuncuUst">${isim(o)}${online() && i === AG.benimNo ? ' <small class="soluk">(sen)</small>' : ''}
        <span>${oyun.tahta.ekonomi ? `<span class="murekkep">🖋️ ${o.murekkep}${degisimRozeti(iz.murekkepDegisim)}</span> ` : ''}<span class="puan${puanSinifi}" ${iz.puanDegisim ? `style="${animGecikme(iz.puanDegisim.t)}"` : ''}>⭐ ${o.puan}${degisimRozeti(iz.puanDegisim)}</span></span>
      </div>
      <div class="rozetler">${durumRozetleri(o)}</div>
      <div class="harfler">${harfler}</div>
      <div class="kartlar">${kartlar}</div>
    </div>`;
  }).join('');
}

// ---------- 8) KELİME TURU ----------
// Herkes sırayla, süre bitmeden harflerinden bir kelime kurar.
// Puan = harflerin puanları toplamı. Tüm harflerini kullanıp en az 6 harfli kelime kurana +35.
// Kullanılan harfler elden gider, kalanlar tahtaya geri döner.
// Kelime önce TDK listesinde (kelimeler.js) aranır; bulunamazsa masadakiler karar verir.
function kelimeTurunaGec() {
  oyun.faz = 'kelime';
  oyun.finalSira = 0;
  oyun.oyuncular.forEach(o => {
    o.kelime = '';
    o.turPuani = 0;
    o.bonusAldi = false;
    o.gecersiz = false;
  });
  ekranGoster('final');
  gecisAfisi('📝 KELİME TURU!', 'Harflerinle en değerli kelimeni kur');
  finalOyuncusunuBaslat();
}

function finalOyuncusunuBaslat() {
  // 📡 Bağlantısı kopan oyuncu kelime turunu pas geçer
  if (finalOyuncu().koptu) {
    finalOyuncu().kelime = '';
    sonrakiFinal();
    return;
  }
  oyun.secilenler = [];
  oyun.jokerler = {};
  oyun.jokerSeciliyor = null;
  oyun.dizilis = finalOyuncu().harfler.map((_, i) => i);
  // ⏱️ Ek Süre ve ⏳ Süre Hırsızı kartları bu turda harcanır
  const o = finalOyuncu();
  oyun.kalanSure = o.kisaSure ? KISA_SURE : FINAL_SURE + o.ekSure;
  const notlar = [
    o.kisaSure ? `⏳ süren çalındı: ${KISA_SURE} sn` : '',
    !o.kisaSure && o.ekSure ? `⏱️ +${o.ekSure} sn` : '',
    o.ciftPuan ? '✖️ çift puan' : '',
  ].filter(Boolean);
  o.kisaSure = false;
  o.ekSure = 0;
  $('finalBaslik').innerHTML = `📝 Kelime turu · ${isim(o)}, en değerli kelimeni kur!`
    + (notlar.length ? `<br><span class="soluk kucuk">${notlar.join(' · ')}</span>` : '');
  $('oylama').classList.add('gizli');
  $('kelimeKontrolleri').classList.remove('gizli');
  finalCiz();

  clearInterval(oyun.sayac);
  oyun.sayac = setInterval(() => {
    oyun.kalanSure--;
    $('sure').textContent = oyun.kalanSure;
    durumDegisti();
    if (oyun.kalanSure > 0 && oyun.kalanSure <= 10) sesCal('tik');
    if (oyun.kalanSure <= 0) kelimeyiGonder();
  }, 1000);
}

// Seçilen taşlardan kelimeyi oluşturur; jokerin yerine oyuncunun seçtiği harf yazılır
function secilenKelime() {
  const o = finalOyuncu();
  return oyun.secilenler.map(i => o.harfler[i] === JOKER ? oyun.jokerler[i] : harfinKendisi(o.harfler[i])).join('');
}

// Kelimenin puanı: harf puanları toplamı (joker 0) + şartlar tutarsa bitirme bonusu
function kelimePuani(o, secilenler) {
  if (secilenler.length < MIN_KELIME) return { temel: 0, bonus: 0 };
  const temel = secilenler.reduce((toplam, i) => toplam + harfPuani(o.harfler[i]), 0);
  const hepsiBitti = secilenler.length === o.harfler.length && secilenler.length >= BITIRME_MIN_HARF;
  return { temel, bonus: hepsiBitti ? BITIRME_BONUSU : 0 };
}

function finalCiz() {
  const o = finalOyuncu();
  const kelime = secilenKelime();
  const { temel, bonus } = kelimePuani(o, oyun.secilenler);
  $('sure').textContent = oyun.kalanSure;
  $('kelime').textContent = kelime || '…';

  let bilgi = `Bu kelime: ${temel} puan`;
  if (bonus) bilgi += ` + ${bonus} bitirme bonusu! 🎉`;
  if (o.ciftPuan && temel) bilgi += ` → ✖️2 = ${(temel + bonus) * 2}`;
  else if (o.harfler.length >= BITIRME_MIN_HARF) bilgi += ` · ${o.harfler.length} harfinin hepsini kullanırsan +${BITIRME_BONUSU}!`;
  $('onPuan').textContent = `${bilgi} · Toplamın: ${o.puan} / ${oyun.hedefPuan}`;

  // Taşlar "dizilis" sırasıyla çizilir; her taş yine kendi numarasıyla seçilir,
  // bu yüzden karıştırmak seçilmiş harfleri bozmaz.
  $('finalHarfler').innerHTML = oyun.dizilis.map(i => {
    const h = o.harfler[i];
    return `
    <button class="harf buyuk ${tasSinifi(h)} ${oyun.karistirildi ? 'karisti' : ''}"
            ${oyun.secilenler.includes(i) ? 'disabled' : ''}
            onclick="eylem('harfSec', ${i})">${harfinKendisi(h)}<sub>${harfPuani(h)}</sub></button>`;
  }).join('')
    || '<i class="soluk">Elinde harf yok, bu turu pas geçmek zorundasın.</i>';
  oyun.karistirildi = false;

  // Jokere tıklanınca hangi harf olacağını sormak için alfabe çıkar
  const secici = $('jokerSecici');
  secici.classList.toggle('gizli', oyun.jokerSeciliyor === null);
  secici.innerHTML = oyun.jokerSeciliyor === null ? '' :
    '<p>★ Joker hangi harf olsun? (0 puan)</p>'
    + ALFABE.map(h => `<button onclick="eylem('jokerHarfiSec', '${h}')">${h}</button>`).join('')
    + `<button onclick="eylem('jokerIptal')">İptal</button>`;
  finalYetkiAyarla();
  ipucuKontrol(benimSiram() ? 'kelime' : null, 'kelimeIpucu');
  durumDegisti();
}

// Online kelime turunda: kelimeyi kuran kişi taşlara ve butonlara dokunabilir, diğeri izler.
// Sözlükte bulunamayan kelimeye ise kuran değil RAKİBİ karar verir.
function finalYetkiAyarla() {
  const kuran = benimSiram();
  ['finalHarfler', 'jokerSecici', 'kelimeKontrolleri', 'sozlukDevamBtn'].forEach(id =>
    $(id).classList.toggle('izleyici', !kuran));
  // Kelimeyi kuran kendine oy veremez; oyunu veren de ikinci kez veremez
  const oyVerdi = oyun.oylar?.[AG.benimNo] !== undefined;
  ['gecerliBtn', 'gecersizBtn'].forEach(id =>
    $(id).classList.toggle('izleyici', online() && (kuran || oyVerdi)));
}

function harfSec(i) {
  if (oyun.secilenler.includes(i) || oyun.jokerSeciliyor !== null) return;
  if (finalOyuncu().harfler[i] === JOKER) {
    oyun.jokerSeciliyor = i;
    finalCiz();
    return;
  }
  oyun.secilenler.push(i);
  sesCal('harfSec');
  finalCiz();
}

function jokerHarfiSec(h) {
  const i = oyun.jokerSeciliyor;
  if (i === null) return;
  oyun.jokerler[i] = h;
  oyun.secilenler.push(i);
  oyun.jokerSeciliyor = null;
  sesCal('harfSec');
  finalCiz();
}

function jokerIptal() {
  oyun.jokerSeciliyor = null;
  finalCiz();
}

// Taşların yerini rastgele değiştirir (Fisher-Yates karıştırma), farklı kelimeler gözüne çarpsın diye
function taslariKaristir() {
  const d = oyun.dizilis;
  for (let i = d.length - 1; i > 0; i--) {
    const j = rastgele(0, i);
    [d[i], d[j]] = [d[j], d[i]];
  }
  oyun.karistirildi = true;
  sesCal('karistir');
  finalCiz();
}

function harfSil() {
  const i = oyun.secilenler.pop();
  delete oyun.jokerler[i];
  finalCiz();
}

function pasGec() {
  oyun.secilenler = [];
  kelimeyiGonder();
}

function kelimeyiGonder() {
  clearInterval(oyun.sayac);
  oyun.jokerSeciliyor = null;
  $('jokerSecici').classList.add('gizli');
  const o = finalOyuncu();
  o.kelime = secilenKelime();
  if (oyun.secilenler.length < MIN_KELIME) {
    o.kelime = '';
    sonrakiFinal();
    return;
  }
  $('kelimeKontrolleri').classList.add('gizli');
  $('oylama').classList.remove('gizli');
  // Online'da 3+ kişide sözlükte olmayan kelimeyi diğer herkes oylar (ag.js)
  oyun.oylar = {};
  $('oyDurumu').innerHTML = '';

  // Kelime listesi varsa önce sözlüğe bakılır. Bulunursa otomatik kabul,
  // bulunamazsa son söz yine masada (listede sadece yalın haller var: KİTAP var, KİTAPLAR yok).
  const { temel, bonus } = kelimePuani(o, oyun.secilenler);
  const carpan = o.ciftPuan ? 2 : 1;
  const puanYazisi = `+${(temel + bonus) * carpan} puan${bonus ? ' (bitirme bonusu dahil 🎉)' : ''}${o.ciftPuan ? ' (✖️2)' : ''}`;
  let durum;
  if (!sozlukVarMi()) {
    durum = 'sozluk-yok';
    $('oylamaSoru').innerHTML = `<b>${o.kelime}</b> geçerli bir Türkçe kelime mi? Masadakiler karar versin.`;
  } else if (KELIMELER.has(o.kelime)) {
    durum = 'bulundu';
    $('oylamaSoru').innerHTML = `✅ <b>${o.kelime}</b> sözlükte var! ${puanYazisi}`;
    sesCal('dogru');
  } else {
    durum = 'bulunamadi';
    $('oylamaSoru').innerHTML = `❓ <b>${o.kelime}</b> sözlükte bulunamadı.<br>
      <span class="soluk kucuk">Sözlükte kelimelerin sadece yalın hali var (KİTAP var, KİTAPLAR yok).
      Masadakiler yine de kabul ederse puanı alır.</span>`;
  }
  $('sozlukDevamBtn').classList.toggle('gizli', durum !== 'bulundu');
  $('gecerliBtn').classList.toggle('gizli', durum === 'bulundu');
  $('gecersizBtn').classList.toggle('gizli', durum === 'bulundu');
  $('gecerliBtn').textContent = durum === 'bulunamadi' ? '✓ Yine de kabul et' : '✓ Geçerli';
  finalYetkiAyarla();
  durumDegisti();
}

// kelimeler.js yüklenemediyse (dosya silindiyse vb.) oyun eskisi gibi oylamayla devam eder
function sozlukVarMi() {
  return typeof KELIMELER !== 'undefined';
}

// sesliMi: sözlükte bulunan kelimenin sesi zaten çaldı, ikinci kez çalmasın
function oyla(gecerli, sesliMi = true) {
  const o = finalOyuncu();
  o.gecersiz = !gecerli;
  if (sesliMi) sesCal(gecerli ? 'dogru' : 'yanlis');
  if (gecerli) {
    const { temel, bonus } = kelimePuani(o, oyun.secilenler);
    o.turPuani = (temel + bonus) * (o.ciftPuan ? 2 : 1);
    o.bonusAldi = bonus > 0;
    if (o.bonusAldi) konfeti(80);
    o.puan += o.turPuani;
    // Kelimede kullanılan harfler harcanır
    o.harfler = o.harfler.filter((_, i) => !oyun.secilenler.includes(i));
  }
  sonrakiFinal();
}

function sonrakiFinal() {
  finalOyuncu().ciftPuan = false;  // ✖️ Çift Puan bu kelime turunda harcandı (pas geçse bile)
  oyun.finalSira++;
  if (oyun.finalSira >= oyun.oyuncular.length) araSonucuGoster();
  else finalOyuncusunuBaslat();
}

// ---------- 9) ARA SONUÇ / KAZANAN ----------
// Her kelime turundan sonra gösterilir. Biri hedefe ulaştıysa oyun biter,
// ulaşmadıysa "Tahtaya Devam" ile herkes kaldığı yerden devam eder.
function araSonucuGoster() {
  ekranGoster('sonuc');
  murekkepOdulleriniDagit();
  const sirali = [...oyun.oyuncular].sort((a, b) => b.puan - a.puan);
  const enYuksek = sirali[0].puan;
  const bitti = enYuksek >= oyun.hedefPuan;

  if (bitti) {
    const kazananlar = sirali.filter(o => o.puan === enYuksek);
    $('kazanan').innerHTML = `🏆 Kazanan: ${kazananlar.map(isim).join(' ve ')}`;
    sesCal('kazanma');
    konfeti(200);
    $('sonucAlt').textContent = `${enYuksek} puanla ${oyun.hedefPuan} puan hedefine ulaştı!`;
  } else {
    $('kazanan').textContent = '📊 Kelime turu bitti';
    $('sonucAlt').textContent = `Hedef ${oyun.hedefPuan} puan. Tahtada kaldığınız yerden devam!`;
  }
  $('devamBtn').classList.toggle('gizli', bitti);
  $('tekrarBtn').classList.toggle('gizli', !bitti);

  $('sonucTablosu').innerHTML = sirali.map((o, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${isim(o)}</td>
      <td>${o.kelime ? `<b>${o.kelime}</b>${o.gecersiz ? ' ❌' : ''}${o.bonusAldi ? ` 🎉 +${BITIRME_BONUSU}` : ''}` : '—'}</td>
      <td>+${o.turPuani}</td>
      <td><b>${o.puan}</b></td>
      ${oyun.tahta.ekonomi ? `<td class="murekkep">${o.turOdulu ? `+${o.turOdulu}` : '—'}</td>` : ''}
    </tr>`).join('');
  $('odulBasligi').classList.toggle('gizli', !oyun.tahta.ekonomi);
  durumDegisti();
}

// 🖋️ Ekonomili tahtada kelime turunda puan alanlar, aldıkları puana göre sıralanıp mürekkep kazanır:
// 1. olana 1200, 2. olana 1000, 3. olana 800 ... (puan alamayan bir şey kazanmaz)
function murekkepOdulleriniDagit() {
  const ekonomi = oyun.tahta.ekonomi;
  oyun.oyuncular.forEach(o => (o.turOdulu = 0));
  if (!ekonomi) return;
  [...oyun.oyuncular]
    .filter(o => o.turPuani > 0)
    .sort((a, b) => b.turPuani - a.turPuani)
    .forEach((o, sira) => {
      o.turOdulu = ekonomi.odul[sira] ?? 0;
      o.murekkep += o.turOdulu;
      if (o.turOdulu) kayit(`🖋️ ${isim(o)} kelime turunda ${sira + 1}. oldu: <b>+${o.turOdulu} 🖋️</b>`);
    });
  sesCal('para');
}

// Ekranın üstünden renkli kağıt parçaları yağar (kazanma ve bitirme bonusunda)
function konfeti(adet = 120) {
  const renkler = ['#ffd166', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c'];
  for (let i = 0; i < adet; i++) {
    const parca = document.createElement('div');
    parca.className = 'konfeti';
    parca.style.left = `${Math.random() * 100}vw`;
    parca.style.background = renkler[i % renkler.length];
    parca.style.animationDuration = `${2.2 + Math.random() * 2}s`;
    parca.style.animationDelay = `${Math.random() * 0.6}s`;
    parca.style.setProperty('--salinim', `${(Math.random() - 0.5) * 200}px`);
    parca.style.setProperty('--donus', `${Math.random() * 1080 - 540}deg`);
    document.body.appendChild(parca);
    parca.addEventListener('animationend', () => parca.remove());
  }
}

function tahtayaDevam() {
  ekranGoster('oyun');
  kayit(`📝 Kelime turu bitti, tahtaya devam! (Tur ${oyun.tur})`);
  sirayiBaslat();
}

// ---------- BAŞLANGIÇ: butonları fonksiyonlara bağla ----------
$('oyuncuSayisi').addEventListener('change', () => isimAlanlariniCiz());
$('kartSecimi').addEventListener('change', kartSecimiDegisti);
$('baslaBtn').addEventListener('click', oyunuBaslat);
$('menuBtn').addEventListener('click', menuOnayiniAc);
$('menuHayirBtn').addEventListener('click', menuOnayiniKapat);
$('menuEvetBtn').addEventListener('click', anaMenuyeDon);
// Pencerenin dışına tıklamak da "Hayır" sayılır
$('menuOnay').addEventListener('click', e => {
  if (e.target.id === 'menuOnay') menuOnayiniKapat();
});
$('sesBtn').addEventListener('click', sesiAcKapa);
$('zarBtn').addEventListener('click', () => eylem('zarAt'));
// Kelime turu ve sonuç ekranı butonlarının işleri index.html'de (onclick) yazılı:
// online'da misafirin ekranı bu bölümleri evden kopyaladığı için butonlar kopyayla birlikte çalışmalı.
isimAlanlariniCiz();
kartSecimiCiz();
ayarlariYukle();
zarKupunuOlustur();
sesButonunuGuncelle();
