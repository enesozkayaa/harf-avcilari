// =============================================================
// Harf Avcıları - 3D tahta (Three.js)
// Oyunun kuralları game.js'te; bu dosya sadece tahtayı ve üstündekileri 3D çizer.
// game.js buradaki fonksiyonları çağırır:
//   Tahta3D.hazirMi()                         → Three.js yüklendi mi (internet yoksa false)
//   Tahta3D.olustur(kapsayici, tahta, yolSec) → sahneyi kurar (tahta: genişlik, kareler, levha)
//   Tahta3D.piyonlariGuncelle(...)            → piyonları yeni yerlerine (zıplatarak) götürür
//   Tahta3D.zarlariGoster(adet)               → masada kaç zar duracağı (çarkı gizler)
//   Tahta3D.zarAt([3, 5], sure)               → zarları fırlatır, her biri istenen sayıyla durur
//   Tahta3D.carkCevir(sayi, sure)             → ☠️ zehirli zar çarkını çevirir (0-3)
//   Tahta3D.yolOklari(kaynak, hedefler)       → yol ayrımında tıklanabilir oklar gösterir
//   Tahta3D.hedefleriIsaretle(kareler)        → zarla gelinecek karelerin etrafına sarı çerçeve
//   Tahta3D.ucanYazi(kareNo, metin, stil)     → karenin üstünden yükselen yazı (+A, kart adı...)
//   Tahta3D.nesneleriGuncelle({kare: {tip, renk}}) → 🪤 tuzak, 🎁 kutu, 🧱 duvar yerleştirir
//   Tahta3D.nesneTetiklendi(kareNo)           → nesne çalışır (tuzak kapanır, kutu açılır, duvar çöker)
//   Tahta3D.toplanacaklariGuncelle({kare: h}) → karelerin üstünde dönen harf taşları
//   Tahta3D.harfToplandi(kareNo, oyuncuNo)    → dönen taş uçup piyona gider
//   Tahta3D.kareSecimiAc(fonk) / kareSecimiKapat() → tahtada bir kareye tıklatmak için (tuzak kurma)
//   Tahta3D.kareDokunmasi(fonk)               → seçim modu dışında kareye dokununca (kare bilgisi balonu)
//   Tahta3D.piyonEfekti(oyuncuNo, tip)        → piyonda kart efekti: patlama, zehir, kalkan, ayna, donus, parilti
//
// 3D'de her şey "birim" ile ölçülür: bir kare 1 birim genişliğinde.
// x sağa, y yukarı, z bize doğru. Tahtanın ortası (0, 0, 0).
// =============================================================

const Tahta3D = (() => {
  const KARE = 1;
  const KARE_BOSLUK = 0.07;
  const TAHTA_UST = 0.4;      // tahta tablasının üst yüzeyi
  const KARO_KALINLIK = 0.16;
  const KARO_UST = TAHTA_UST + KARO_KALINLIK;
  const ZAR_BOYU = 0.56;
  const ZAR_Y = TAHTA_UST + 0.05 + ZAR_BOYU / 2;  // zar ortadaki levhanın üstünde durur
  const EN_FAZLA_ZAR = 4;      // 🎲 Çift Zar kartıyla 4 zar atılabilir
  const CARK_YARICAP = 0.8;
  const ZIPLAMA_YUKSEKLIGI = 0.6;
  const UCAN_YAZI_SURESI = 1500;  // +A gibi yazıların ekranda kalma süresi (ms)
  const TOPLAMA_SURESI = 650;     // dönen harfin piyona uçma süresi (ms)
  const KAMERA_TAKIP = 0.25;      // kamera aktif piyona ne kadar kaysın (0 = hiç, 1 = tam üstüne)

  const KARE_RENGI = {
    baslangic: '#ffd166', harf: '#a8d8f0', bonus: '#9be3a8', hazine: '#ffe08a',
    kart: '#c9b3f5', saldir: '#f7c08a', ceza: '#f5a3a3', kartKaybi: '#d9b3d0',
    market: '#7fd8be', vergi: '#c8c8c8',
  };

  const UCAN_YAZI_STILI = {
    harf: { zemin: '#f5e6c4', yazi: '#222', kenar: '#b9a679' },
    ceza: { zemin: '#e74c3c', yazi: '#fff', kenar: '#8e2b20' },
    kart: { zemin: '#2a2f4a', yazi: '#fff', kenar: '#ffd166' },
  };

  // Zarın her yüzündeki noktalar (3x3 ızgarada dolu hücreler) — game.js'teki ile aynı
  const NOKTALAR = {
    1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
  };
  // Küpün yüz sırası Three.js'te: +x, -x, +y(üst), -y(alt), +z, -z.
  // Karşılıklı yüzlerin toplamı 7 olacak şekilde sayıları dağıtıyoruz:
  const YUZ_SAYILARI = [2, 5, 1, 6, 3, 4];
  const YUZ_NORMALLERI = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

  // Zarların levhada yan yana duracağı yerler (levhanın ortasına göre)
  const ZAR_DIZILISI = {
    1: [[0, 0]],
    2: [[-0.45, 0], [0.45, 0]],
    3: [[-0.7, 0], [0, 0], [0.7, 0]],
    4: [[-0.45, -0.32], [0.45, -0.32], [-0.45, 0.32], [0.45, 0.32]],
  };

  const CARK_RENKLERI = ['#e74c3c', '#f39c12', '#2ecc71', '#3498db'];

  let sahne, kamera, cizici, kapsayici;
  let tahta;                   // game.js'ten gelen tahta bilgisi
  let yolSecildi = () => {};   // oka tıklanınca game.js'e haber veren fonksiyon
  let karePozisyonlari = [];
  let kareMeshleri = [];       // tıklanınca hangi kare olduğunu bulmak için
  const piyonlar = [];  // her oyuncu için: { govde, from, to, baslangic, sure, zipla, yeni }
  let aktifNo = 0;
  let aktifHalka;
  const zarlar = [];
  let zarAnimleri = [];
  let gorunenZar = 1;
  let cark;          // çarkın tamamı (dönmeyen gösterge dahil)
  let carkDonen;     // çarkın dönen dilimleri
  let carkAnim = null;
  const hedefIsaretleri = [];  // zarla gelinecek karelerin üstündeki sarı çerçeveler
  let hedefAnahtari = '';
  let levhaMerkezi;     // zarın düştüğü yer
  let levhaBoyu;        // [genişlik, derinlik]
  const oklar = [];     // yol ayrımında gösterilen oklar
  let okAnahtari = '';
  const ucanYazilar = [];
  const tuzaklar = {};       // tahtadaki nesneler (tuzak/kutu/duvar): kareNo → { grup, tip, kurulus, kapanis }
  const toplanacaklar = {};  // kareNo → mesh
  const ucanTaslar = [];     // toplanıp piyona uçan harfler
  const buzParcalari = [];   // kırılan buz küplerinden saçılan parçalar
  let kareSecimi = null;     // kare seçme modu açıksa: tıklanınca çağrılacak fonksiyon
  let kareDokunuldu = null;  // seçim modu yokken kareye dokununca çağrılacak fonksiyon (bilgi balonu)
  const piyonEfektleri = []; // kart efektleri: saçılan parçacıklar, kalkan küresi, dönen piyon
  let secimIsareti;          // fareyle üstüne gelinen kareyi gösteren turuncu çerçeve
  let uzerindekiKare = null;

  // Kamera, bir hedef noktanın etrafında yörüngede durur; fareyle döndürülür.
  // Hedef nokta, sırası gelen piyona doğru yavaşça kayar.
  let varsayilanYorunge;
  let temelUzaklik;     // yatay ekranda kameranın tahtaya uzaklığı (dik ekranda artar)
  let yorunge;
  let kameraHedefi;
  let hedefKaydirma;    // tahtanın alttaki kontrol panelinin üstünde kalması için hedefi bize kaydırıyoruz

  function hazirMi() {
    return typeof THREE !== 'undefined';
  }

  // Izgara konumundan (sütun, satır) 3D konuma: tahtanın ortası (0, 0)
  function izgaradan3D(sutun, satir) {
    return [
      (sutun - (tahta.genislik - 1) / 2) * KARE,
      (satir - (tahta.yukseklik - 1) / 2) * KARE,
    ];
  }

  // ---------- Dokular: canvas'a çizip 3D yüzeylere yapıştırıyoruz ----------
  function dokuYap(canvas) {
    const doku = new THREE.CanvasTexture(canvas);
    doku.colorSpace = THREE.SRGBColorSpace;
    doku.anisotropy = 8;
    return doku;
  }

  function tuval(genislik, yukseklik = genislik) {
    const c = document.createElement('canvas');
    c.width = genislik;
    c.height = yukseklik;
    return [c, c.getContext('2d')];
  }

  function karoDokusu(renk, ikon, yazi) {
    const [c, g] = tuval(256);
    g.fillStyle = renk;
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(0, 0, 0, .15)';
    g.lineWidth = 10;
    g.strokeRect(5, 5, 246, 246);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#000';
    g.font = '104px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    g.fillText(ikon, 128, 108);
    g.fillStyle = '#1b1b1b';
    g.font = 'bold 38px "Segoe UI", system-ui, sans-serif';
    g.fillText(yazi, 128, 212);
    return dokuYap(c);
  }

  // Ortadaki levha: tahtanın boş iç kısmını kaplar, oranı tahtaya göre değişir
  function levhaDokusu(oran) {
    const w = 1024;
    const h = Math.max(200, Math.round(w * oran));
    const [c, g] = tuval(w, h);
    g.fillStyle = '#2a2f4a';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255, 209, 102, .35)';
    g.lineWidth = 6;
    g.strokeRect(24, 24, w - 48, h - 48);
    const baslik = Math.min(104, h * 0.32);
    const y = Math.min(200, h * 0.42);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffd166';
    g.font = `900 ${baslik}px "Segoe UI", system-ui, sans-serif`;
    g.fillText('HARF AVCILARI', w / 2, y);
    g.fillStyle = 'rgba(244, 244, 248, .55)';
    g.font = `${baslik * 0.42}px "Segoe UI", system-ui, sans-serif`;
    g.fillText('harf topla · kart oyna · kelime kur', w / 2, y + baslik * 0.9);
    return dokuYap(c);
  }

  // Masa için basit bir ahşap deseni
  function ahsapDokusu() {
    const [c, g] = tuval(512);
    g.fillStyle = '#4a3226';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 80; i++) {
      const koyu = Math.random() < 0.5;
      g.strokeStyle = koyu ? `rgba(30, 18, 12, ${0.15 + Math.random() * 0.25})`
                           : `rgba(120, 85, 60, ${0.1 + Math.random() * 0.2})`;
      g.lineWidth = 1 + Math.random() * 4;
      const y = Math.random() * 512;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(170, y + (Math.random() - 0.5) * 30, 340, y + (Math.random() - 0.5) * 30, 512, y);
      g.stroke();
    }
    const doku = dokuYap(c);
    doku.wrapS = doku.wrapT = THREE.RepeatWrapping;
    doku.repeat.set(5, 5);
    return doku;
  }

  function zarYuzuDokusu(sayi) {
    const [c, g] = tuval(256);
    g.fillStyle = '#fffdf5';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#d8d2c0';
    g.lineWidth = 12;
    g.strokeRect(6, 6, 244, 244);
    g.fillStyle = '#222';
    NOKTALAR[sayi].forEach(hucre => {
      const x = 52 + (hucre % 3) * 76;
      const y = 52 + Math.floor(hucre / 3) * 76;
      g.beginPath();
      g.arc(x, y, 22, 0, Math.PI * 2);
      g.fill();
    });
    return dokuYap(c);
  }

  // Ortasında büyük bir yazı olan kare doku (çark sayıları, dönen harf taşları)
  function yaziDokusu(metin, zemin, yaziRengi, boyut = 128) {
    const [c, g] = tuval(boyut);
    if (zemin) {
      g.fillStyle = zemin;
      g.fillRect(0, 0, boyut, boyut);
    }
    g.fillStyle = yaziRengi;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `900 ${boyut * 0.62}px "Segoe UI", system-ui, sans-serif`;
    g.fillText(metin, boyut / 2, boyut * 0.54);
    return dokuYap(c);
  }

  // Yükselen yazının resmi: yuvarlak köşeli bir etiket
  function etiketDokusu(metin, stil) {
    const s = UCAN_YAZI_STILI[stil] ?? UCAN_YAZI_STILI.harf;
    const font = 'bold 56px "Segoe UI", "Segoe UI Emoji", system-ui, sans-serif';
    const [, og] = tuval(8);  // sadece yazının genişliğini ölçmek için
    og.font = font;
    const w = Math.ceil(og.measureText(metin).width) + 48;
    const h = 92;
    const [c, g] = tuval(w, h);
    g.fillStyle = s.zemin;
    g.strokeStyle = s.kenar;
    g.lineWidth = 6;
    g.beginPath();
    g.roundRect(3, 3, w - 6, h - 6, 18);
    g.fill();
    g.stroke();
    g.font = font;
    g.fillStyle = s.yazi;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(metin, w / 2, h / 2 + 2);
    return [dokuYap(c), w / h];
  }

  // Ortası boş kare çerçeve (varış işareti ve kare seçimi için)
  function cerceveYap(renk, parlaklik) {
    const dis = new THREE.Shape();
    dis.moveTo(-0.52, -0.52).lineTo(0.52, -0.52).lineTo(0.52, 0.52).lineTo(-0.52, 0.52);
    const delik = new THREE.Path();
    delik.moveTo(-0.42, -0.42).lineTo(-0.42, 0.42).lineTo(0.42, 0.42).lineTo(0.42, -0.42);
    dis.holes.push(delik);
    const cerceve = new THREE.Mesh(
      new THREE.ShapeGeometry(dis),
      new THREE.MeshStandardMaterial({
        color: renk, emissive: renk, emissiveIntensity: parlaklik,
        transparent: true, side: THREE.DoubleSide,
      }),
    );
    cerceve.rotation.x = -Math.PI / 2;
    return cerceve;
  }

  // ---------- Sahne parçaları ----------
  function isiklariKur(yaricap) {
    sahne.add(new THREE.HemisphereLight('#ffffff', '#3a3550', 1.4));
    const gunes = new THREE.DirectionalLight('#fff4e0', 2.4);
    gunes.position.set(4, 10, 6);
    gunes.castShadow = true;
    gunes.shadow.mapSize.set(2048, 2048);
    Object.assign(gunes.shadow.camera, {
      left: -yaricap, right: yaricap, top: yaricap, bottom: -yaricap, near: 1, far: 40,
    });
    gunes.shadow.bias = -0.0005;
    sahne.add(gunes);
  }

  function masaVeTahtayiKur() {
    const masa = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ map: ahsapDokusu(), roughness: 0.85 }),
    );
    masa.rotation.x = -Math.PI / 2;
    masa.receiveShadow = true;
    sahne.add(masa);

    const tabla = new THREE.Mesh(
      new THREE.BoxGeometry(tahta.genislik * KARE + 0.5, TAHTA_UST, tahta.yukseklik * KARE + 0.5),
      new THREE.MeshStandardMaterial({ color: '#2f3557', roughness: 0.6 }),
    );
    tabla.position.y = TAHTA_UST / 2;
    tabla.castShadow = true;
    tabla.receiveShadow = true;
    sahne.add(tabla);

    // Levha: [sütun, satır, genişlik, yükseklik]
    const [ls, lr, lw, lh] = tahta.levha;
    const [x1, z1] = izgaradan3D(ls, lr);
    const [x2, z2] = izgaradan3D(ls + lw - 1, lr + lh - 1);
    levhaMerkezi = new THREE.Vector3((x1 + x2) / 2, 0, (z1 + z2) / 2);
    levhaBoyu = [lw * KARE, lh * KARE];
    const levha = new THREE.Mesh(
      new THREE.BoxGeometry(lw * KARE - KARE_BOSLUK, 0.05, lh * KARE - KARE_BOSLUK),
      [0, 1, 2, 3, 4, 5].map(i => i === 2
        ? new THREE.MeshStandardMaterial({ map: levhaDokusu(lh / lw), roughness: 0.7 })
        : new THREE.MeshStandardMaterial({ color: '#23273d' })),
    );
    levha.position.set(levhaMerkezi.x, TAHTA_UST + 0.025, levhaMerkezi.z);
    levha.receiveShadow = true;
    sahne.add(levha);
  }

  function kareleriKur() {
    const geo = new THREE.BoxGeometry(KARE - KARE_BOSLUK, KARO_KALINLIK, KARE - KARE_BOSLUK);
    kareMeshleri = [];
    karePozisyonlari = tahta.kareler.map(({ tip, ikon, yazi, satir, sutun }, i) => {
      const renk = KARE_RENGI[tip];
      const yan = new THREE.MeshStandardMaterial({
        color: new THREE.Color(renk).multiplyScalar(0.7), roughness: 0.5,
      });
      const ust = new THREE.MeshStandardMaterial({ map: karoDokusu(renk, ikon, yazi), roughness: 0.45 });
      const karo = new THREE.Mesh(geo, [yan, yan, ust, yan, yan, yan]);
      const [x, z] = izgaradan3D(sutun, satir);
      karo.position.set(x, TAHTA_UST + KARO_KALINLIK / 2, z);
      karo.castShadow = true;
      karo.receiveShadow = true;
      karo.userData.kareNo = i;
      sahne.add(karo);
      kareMeshleri.push(karo);
      return new THREE.Vector3(x, KARO_UST, z);
    });
  }

  // Piyon: yan profili çizilip kendi ekseni etrafında döndürülerek (torna gibi) oluşturulur
  function piyonGeometrisi() {
    const profil = [
      [0, 0], [0.26, 0], [0.27, 0.04], [0.24, 0.08], [0.17, 0.12], [0.12, 0.22],
      [0.09, 0.36], [0.08, 0.42], [0.15, 0.45], [0.15, 0.48], [0.08, 0.5],
      [0.13, 0.56], [0.155, 0.62], [0.15, 0.68], [0.12, 0.73], [0.07, 0.765], [0, 0.78],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    return new THREE.LatheGeometry(profil, 40);
  }

  function piyonEkle(renk, geo) {
    const govde = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: renk, roughness: 0.28, metalness: 0.15,
    }));
    govde.castShadow = true;
    sahne.add(govde);
    piyonlar.push({
      govde, from: new THREE.Vector3(), to: new THREE.Vector3(),
      baslangic: 0, sure: 1, zipla: false, yeni: true,
    });
  }

  // ---------- Zarlar ----------
  // 4 küp zar baştan kurulur; o an kaç zar atılıyorsa o kadarı görünür.
  function zarlariKur() {
    const malzemeler = YUZ_SAYILARI.map(n =>
      new THREE.MeshStandardMaterial({ map: zarYuzuDokusu(n), roughness: 0.35 }));
    const geo = new THREE.BoxGeometry(ZAR_BOYU, ZAR_BOYU, ZAR_BOYU);
    for (let i = 0; i < EN_FAZLA_ZAR; i++) {
      const zar = new THREE.Mesh(geo, malzemeler);
      zar.castShadow = true;
      zar.quaternion.copy(zarSonYonu(i + 1));
      sahne.add(zar);
      zarlar.push(zar);
    }
  }

  function zarDinlenmeYeri(i, adet) {
    const [dx, dz] = ZAR_DIZILISI[adet][i];
    return new THREE.Vector3(levhaMerkezi.x + dx, ZAR_Y, levhaMerkezi.z + dz);
  }

  // Zarın istenen sayısının yukarı bakması için gereken dönüş
  function zarSonYonu(sayi) {
    const i = YUZ_SAYILARI.indexOf(sayi);
    return new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(...YUZ_NORMALLERI[i]), new THREE.Vector3(0, 1, 0));
  }

  function zarlariGoster(adet) {
    gorunenZar = adet;
    cark.visible = false;
    zarlar.forEach((zar, i) => {
      zar.visible = i < adet;
      if (i < adet && !zarAnimleri.length) zar.position.copy(zarDinlenmeYeri(i, adet));
    });
  }

  // Zarlar bize yakın bir yerden havaya fırlatılır, dönerek levhanın üstüne düşer, seker
  // ve her biri kendi sayısı üstte kalacak şekilde durur.
  function zarAt(sayilar, sure) {
    gorunenZar = sayilar.length;
    cark.visible = false;
    zarlar.forEach((zar, i) => (zar.visible = i < sayilar.length));
    const simdi = performance.now();
    zarAnimleri = sayilar.map((sayi, i) => {
      const rastgeleYon = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 0.8);
      const bit = zarDinlenmeYeri(i, sayilar.length);
      bit.x += (Math.random() - 0.5) * 0.15;
      bit.z += (Math.random() - 0.5) * 0.15;
      return {
        zar: zarlar[i],
        baslangic: simdi + i * 60,  // zarlar art arda, birbirinden biraz farklı düşsün
        sure,
        // önce sayıyı üste getir, sonra dikey eksende biraz çevir (üstteki sayı değişmez)
        son: rastgeleYon.multiply(zarSonYonu(sayi)),
        eksen: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
        donus: (3 + Math.random() * 2) * Math.PI * 2,
        bas: new THREE.Vector3(bit.x + (Math.random() - 0.5) * 2, 0, levhaMerkezi.z + levhaBoyu[1] / 2 + 2),
        bit,
      };
    });
  }

  function zarlariGuncelle(simdi) {
    zarAnimleri = zarAnimleri.filter(({ zar, baslangic, sure, son, eksen, donus, bas, bit }) => {
      const t = Math.max(0, Math.min(1, (simdi - baslangic) / sure));
      const e = yumusat(t);
      zar.position.x = bas.x + (bit.x - bas.x) * e;
      zar.position.z = bas.z + (bit.z - bas.z) * e;
      // Gittikçe alçalan sekmeler: t=0'da en yüksekte, t=1'de tam tahtada
      zar.position.y = ZAR_Y + 2.2 * Math.pow(1 - t, 2) * Math.abs(Math.cos(t * Math.PI * 2.5));
      // Kalan dönüş miktarı azaldıkça zar son yönüne yerleşir
      const spin = new THREE.Quaternion().setFromAxisAngle(eksen, (1 - e) * donus);
      zar.quaternion.copy(son).multiply(spin);
      return t < 1;
    });
  }

  // ---------- ☠️ Zehirli zar çarkı ----------
  // Levhanın üstünde yatan 4 dilimli (0, 1, 2, 3) bir çark ve uzak tarafta sabit bir gösterge.
  // Dilim v, çarkın kendi içinde v·90° ile (v+1)·90° arasındadır. Çark y ekseninde ψ kadar
  // dönünce göstergenin altındaki dilim: 90° − ψ açısındaki dilim olur.
  function carkiKur() {
    cark = new THREE.Group();
    carkDonen = new THREE.Group();
    const taban = new THREE.Mesh(
      new THREE.CylinderGeometry(CARK_YARICAP + 0.07, CARK_YARICAP + 0.07, 0.05, 48),
      new THREE.MeshStandardMaterial({ color: '#1b1e30', roughness: 0.6 }),
    );
    taban.position.y = -0.03;
    taban.receiveShadow = true;
    cark.add(taban);

    for (let v = 0; v < 4; v++) {
      const dilim = new THREE.Mesh(
        new THREE.CircleGeometry(CARK_YARICAP, 24, (v * Math.PI) / 2, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: CARK_RENKLERI[v], roughness: 0.5 }),
      );
      dilim.rotation.x = -Math.PI / 2;
      carkDonen.add(dilim);
      // Sayı, dilimin ortasında yatar ve "yukarısı" dışa bakar
      const aci = (v * Math.PI) / 2 + Math.PI / 4;
      const yazi = new THREE.Mesh(
        new THREE.PlaneGeometry(0.42, 0.42),
        new THREE.MeshBasicMaterial({ map: yaziDokusu(String(v), null, '#fff'), transparent: true }),
      );
      yazi.position.set(Math.cos(aci) * 0.5, 0.005, -Math.sin(aci) * 0.5);
      yazi.rotation.set(-Math.PI / 2, aci - Math.PI / 2, 0, 'YXZ');
      carkDonen.add(yazi);
    }
    const kenar = new THREE.Mesh(
      new THREE.TorusGeometry(CARK_YARICAP, 0.035, 8, 64),
      new THREE.MeshStandardMaterial({ color: '#ffd166', metalness: 0.6, roughness: 0.3 }),
    );
    kenar.rotation.x = -Math.PI / 2;
    carkDonen.add(kenar);
    cark.add(carkDonen);

    // Gösterge: uzak kenarda, merkeze bakan kırmızı bir sivri uç
    const gosterge = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.3, 16),
      new THREE.MeshStandardMaterial({ color: '#ff4d4d', emissive: '#aa0000', emissiveIntensity: 0.5 }),
    );
    gosterge.rotation.x = Math.PI / 2;  // ucu +z (merkeze doğru)
    gosterge.position.set(0, 0.12, -CARK_YARICAP - 0.1);
    gosterge.castShadow = true;
    cark.add(gosterge);

    cark.position.set(levhaMerkezi.x, TAHTA_UST + 0.08, levhaMerkezi.z);
    cark.visible = false;
    sahne.add(cark);
  }

  function carkCevir(sayi, sure) {
    zarlar.forEach(zar => (zar.visible = false));
    cark.visible = true;
    const bas = carkDonen.rotation.y;
    // Göstergenin dilimin ortasına değil, rastgele bir yerine denk gelmesi için ±30° oynatıyoruz
    let son = ((45 - 90 * sayi + (Math.random() - 0.5) * 60) * Math.PI) / 180;
    while (son < bas + Math.PI * 6) son += Math.PI * 2;  // en az 3 tam tur
    carkAnim = { bas, son, baslangic: performance.now(), sure };
  }

  function carkGuncelle(simdi) {
    if (!carkAnim) return;
    const t = Math.min(1, (simdi - carkAnim.baslangic) / carkAnim.sure);
    const e = 1 - Math.pow(1 - t, 4);  // hızlı başlar, yavaşlayarak durur
    carkDonen.rotation.y = carkAnim.bas + (carkAnim.son - carkAnim.bas) * e;
    if (t >= 1) carkAnim = null;
  }

  // Göstergenin altındaki sayı (kontrol için)
  function carkDegeri() {
    const aci = ((90 - (carkDonen.rotation.y * 180) / Math.PI) % 360 + 360) % 360;
    return Math.floor(aci / 90);
  }

  // ---------- 🪤 Ayı tuzağı ----------
  // Metal bir halka, üstünde içe eğik sivri dişler ve ortada kuranın renginde bir basma plakası.
  function tuzakYap(renk) {
    const grup = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: '#7a7f8c', metalness: 0.85, roughness: 0.3 });
    const halka = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 8, 40), metal);
    halka.rotation.x = -Math.PI / 2;
    halka.position.y = 0.03;
    grup.add(halka);
    const plaka = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.04, 24),
      new THREE.MeshStandardMaterial({ color: renk, metalness: 0.3, roughness: 0.4 }),
    );
    plaka.position.y = 0.02;
    grup.add(plaka);
    const disler = new THREE.Group();
    const disGeo = new THREE.ConeGeometry(0.035, 0.16, 6);
    for (let i = 0; i < 14; i++) {
      const a = (2 * Math.PI * i) / 14;
      const dis = new THREE.Mesh(disGeo, metal);
      dis.position.set(Math.cos(a) * 0.3, 0.1, Math.sin(a) * 0.3);
      // Dişler hafifçe merkeze eğik
      dis.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(-Math.cos(a) * 0.45, 1, -Math.sin(a) * 0.45).normalize());
      dis.castShadow = true;
      disler.add(dis);
    }
    grup.add(disler);
    grup.userData.disler = disler;
    return grup;
  }

  // 🎁 Sürpriz kutusu: kurdeleli hediye paketi, kapağın üstünde fiyonk
  function kutuYap(renk) {
    const grup = new THREE.Group();
    const kagit = new THREE.MeshStandardMaterial({ color: renk, roughness: 0.45 });
    const kurdele = new THREE.MeshStandardMaterial({ color: '#ffd166', roughness: 0.3, metalness: 0.3 });
    const govde = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.36, 0.46), kagit);
    govde.position.y = 0.18;
    const kapak = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.1, 0.52), kagit);
    kapak.position.y = 0.41;
    const serit1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.47, 0.53), kurdele);
    serit1.position.y = 0.235;
    const serit2 = new THREE.Mesh(new THREE.BoxGeometry(0.53, 0.47, 0.1), kurdele);
    serit2.position.y = 0.235;
    const fiyonk = new THREE.Group();
    [-1, 1].forEach(yon => {
      const ilmek = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.025, 8, 16), kurdele);
      ilmek.position.set(yon * 0.08, 0.5, 0);
      ilmek.rotation.y = Math.PI / 2;
      ilmek.rotation.z = yon * 0.5;
      fiyonk.add(ilmek);
    });
    [govde, kapak, serit1, serit2].forEach(m => (m.castShadow = true));
    const kapakGrubu = new THREE.Group();  // açılırken kapak + fiyonk birlikte uçar
    kapakGrubu.add(kapak, fiyonk);
    grup.add(govde, serit1, serit2, kapakGrubu);
    grup.userData.kapak = kapakGrubu;
    return grup;
  }

  // 🧱 Duvar: kuranın renginde çizgili, üst üste dizilmiş tuğlalar
  function duvarYap(renk) {
    const grup = new THREE.Group();
    const tugla = new THREE.MeshStandardMaterial({ color: '#b5543c', roughness: 0.85 });
    const serit = new THREE.MeshStandardMaterial({ color: renk, roughness: 0.6 });
    const geo = new THREE.BoxGeometry(0.27, 0.14, 0.18);
    for (let sira = 0; sira < 4; sira++) {
      const kayik = sira % 2 ? 0.14 : 0;  // tuğlalar bir alt sıraya göre yarım kaydırılır
      for (let i = -1; i <= 1; i++) {
        const t = new THREE.Mesh(geo, sira === 3 ? serit : tugla);
        t.position.set(i * 0.28 + kayik - 0.07, 0.075 + sira * 0.145, 0);
        t.castShadow = true;
        grup.add(t);
      }
    }
    return grup;
  }

  const NESNE_MODELLERI = { tuzak: tuzakYap, surprizKutusu: kutuYap, duvar: duvarYap };

  // Tahtaya konan nesneler (🪤 tuzak, 🎁 kutu, 🧱 duvar): liste = { kareNo: { tip, renk } }
  function nesneleriGuncelle(liste) {
    Object.keys(tuzaklar).forEach(kareNo => {
      if (!(kareNo in liste) && !tuzaklar[kareNo].kapanis) {
        sahne.remove(tuzaklar[kareNo].grup);
        delete tuzaklar[kareNo];
      }
    });
    Object.entries(liste).forEach(([kareNo, { tip, renk }]) => {
      if (tuzaklar[kareNo]) return;
      const grup = NESNE_MODELLERI[tip](renk);
      const yer = karePozisyonlari[kareNo];
      grup.position.set(yer.x, KARO_UST, yer.z);
      grup.scale.setScalar(0.01);  // kurulurken büyüyerek belirsin
      sahne.add(grup);
      tuzaklar[kareNo] = { grup, tip, kurulus: performance.now(), kapanis: null };
    });
  }

  // Nesne çalıştı ya da kaldırıldı: kendine özgü bir animasyonla kaybolur
  function nesneTetiklendi(kareNo) {
    const t = tuzaklar[kareNo];
    if (t && !t.kapanis) t.kapanis = performance.now();
  }

  function tuzaklariCanlandir(simdi) {
    Object.entries(tuzaklar).forEach(([kareNo, t]) => {
      const yer = karePozisyonlari[kareNo];
      if (t.kapanis) {
        const k = (simdi - t.kapanis) / 900;
        if (t.tip === 'tuzak') {
          // Şak! Dişler bir anda içe kapanır, tuzak titrer
          t.grup.userData.disler.scale.set(0.35, 1.2, 0.35);
          t.grup.position.x = yer.x + (k < 0.4 ? Math.sin(simdi / 15) * 0.03 : 0);
        } else if (t.tip === 'surprizKutusu') {
          // Kapak fiyonkuyla birlikte havaya fırlar
          t.grup.userData.kapak.position.y = Math.min(k, 0.6) * 1.6;
          t.grup.userData.kapak.rotation.z = k * 3;
        } else {
          // Duvar sarsılıp çöker
          t.grup.rotation.z = Math.min(k * 1.6, 0.6) * Math.sin(simdi / 30) * 0.3;
          t.grup.position.y = KARO_UST - Math.max(0, k - 0.3) * 0.4;
        }
        t.grup.scale.setScalar(Math.max(0.01, k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4));
        if (k >= 1) {
          sahne.remove(t.grup);
          delete tuzaklar[kareNo];
        }
        return;
      }
      // Kurulurken büyür; sonra her nesne kendince hafifçe "yaşar"
      t.grup.scale.setScalar(Math.min(1, (simdi - t.kurulus) / 400));
      if (t.tip === 'tuzak') {
        const nefes = 1 + Math.sin(simdi / 300 + Number(kareNo)) * 0.08;
        t.grup.userData.disler.scale.set(nefes, 1, nefes);
      } else if (t.tip === 'surprizKutusu') {
        t.grup.rotation.y = Math.sin(simdi / 700 + Number(kareNo)) * 0.25;
        t.grup.position.y = KARO_UST + Math.abs(Math.sin(simdi / 400)) * 0.05;
      }
    });
  }

  // ---------- Dönen harf taşları (Feather Party'deki yumurtalar gibi) ----------
  function harfTasiYap(harf) {
    const joker = harf === '★';
    const yuz = new THREE.MeshStandardMaterial({
      map: yaziDokusu(harf, joker ? '#ffd166' : '#f5e6c4', '#222'), roughness: 0.4,
      emissive: joker ? '#ff9f1c' : '#000', emissiveIntensity: joker ? 0.35 : 0,
    });
    const yan = new THREE.MeshStandardMaterial({ color: joker ? '#e0a800' : '#b9a679', roughness: 0.5 });
    const tas = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.1), [yan, yan, yan, yan, yuz, yuz]);
    tas.castShadow = true;
    return tas;
  }

  function toplanacaklariGuncelle(liste) {
    Object.keys(toplanacaklar).forEach(kareNo => {
      if (!(kareNo in liste)) {
        sahne.remove(toplanacaklar[kareNo]);
        delete toplanacaklar[kareNo];
      }
    });
    Object.entries(liste).forEach(([kareNo, harf]) => {
      if (toplanacaklar[kareNo]) return;
      const tas = harfTasiYap(harf);
      const yer = karePozisyonlari[kareNo];
      tas.position.set(yer.x, KARO_UST + 0.6, yer.z);
      tas.userData.faz = Math.random() * 10;
      sahne.add(tas);
      toplanacaklar[kareNo] = tas;
    });
  }

  function harfToplandi(kareNo, oyuncuNo) {
    const tas = toplanacaklar[kareNo];
    if (!tas) return;
    delete toplanacaklar[kareNo];
    ucanTaslar.push({ tas, piyon: piyonlar[oyuncuNo], bas: tas.position.clone(), baslangic: performance.now() });
  }

  function harfTaslariniCanlandir(simdi) {
    Object.values(toplanacaklar).forEach(tas => {
      tas.rotation.y = simdi / 600 + tas.userData.faz;
      tas.position.y = KARO_UST + 0.6 + Math.sin(simdi / 350 + tas.userData.faz) * 0.08;
    });
    // Toplanan taş, yay çizerek piyonun başının üstüne uçar ve küçülerek kaybolur
    for (let i = ucanTaslar.length - 1; i >= 0; i--) {
      const u = ucanTaslar[i];
      const t = Math.min(1, (simdi - u.baslangic) / TOPLAMA_SURESI);
      const hedef = u.piyon.govde.position.clone();
      hedef.y += 0.9;
      u.tas.position.lerpVectors(u.bas, hedef, yumusat(t));
      u.tas.position.y += Math.sin(Math.PI * t) * 0.6;
      u.tas.rotation.y += 0.35;
      u.tas.scale.setScalar(1 - t * 0.8);
      if (t >= 1) {
        sahne.remove(u.tas);
        ucanTaslar.splice(i, 1);
      }
    }
  }

  // Yol ayrımı oku: karonun üstünde yatan kalın, parlak sarı bir ok.
  // Yatık olduğu için yukarıdan bakan kameraya hangi yönü gösterirse göstersin net görünür.
  // Etrafında tıklamayı kolaylaştıran görünmez bir kutu var.
  function okYap(hedefKare) {
    // Ok şekli (ucu +y yönünde): sap + üçgen uç
    const sekil = new THREE.Shape();
    [[-0.11, -0.34], [0.11, -0.34], [0.11, 0.02], [0.26, 0.02], [0, 0.34], [-0.26, 0.02], [-0.11, 0.02]]
      .forEach(([x, y], i) => (i ? sekil.lineTo(x, y) : sekil.moveTo(x, y)));
    const ok = new THREE.Mesh(
      new THREE.ExtrudeGeometry(sekil, { depth: 0.06, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02 }),
      new THREE.MeshStandardMaterial({ color: '#ffd166', emissive: '#ff9f1c', emissiveIntensity: 0.8, roughness: 0.3 }),
    );
    ok.rotation.x = -Math.PI / 2;  // yatır: ucu -z yönüne bakar
    ok.castShadow = true;
    const tiklamaAlani = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.5, 0.95),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    const grup = new THREE.Group();
    grup.add(ok, tiklamaAlani);
    grup.userData.hedefKare = hedefKare;
    return grup;
  }

  // ---------- Kamera ve fare ----------
  function kameraGuncelle() {
    // Hedef nokta, aktif piyona doğru biraz kayar (yavaşça, her karede %4)
    const aktif = piyonlar[aktifNo];
    const istenen = hedefKaydirma.clone();
    if (aktif) {
      istenen.x += aktif.govde.position.x * KAMERA_TAKIP;
      istenen.z += aktif.govde.position.z * KAMERA_TAKIP;
    }
    kameraHedefi.lerp(istenen, 0.04);

    const { aci, egim, uzaklik } = yorunge;
    kamera.position.set(
      kameraHedefi.x + Math.sin(aci) * Math.sin(egim) * uzaklik,
      kameraHedefi.y + Math.cos(egim) * uzaklik,
      kameraHedefi.z + Math.cos(aci) * Math.sin(egim) * uzaklik,
    );
    kamera.lookAt(kameraHedefi);
  }

  // Farenin altındaki ilk nesneyi bulur (yoksa undefined)
  function isinAt(e, nesneler) {
    if (!nesneler.length) return undefined;
    const kutu = cizici.domElement.getBoundingClientRect();
    const fare = new THREE.Vector2(
      ((e.clientX - kutu.left) / kutu.width) * 2 - 1,
      -((e.clientY - kutu.top) / kutu.height) * 2 + 1,
    );
    const isin = new THREE.Raycaster();
    isin.setFromCamera(fare, kamera);
    return isin.intersectObjects(nesneler, true)[0]?.object;
  }

  const oktaMi = e => isinAt(e, oklar)?.parent.userData.hedefKare ?? null;
  const karedeMi = e => (kareSecimi ? isinAt(e, kareMeshleri)?.userData.kareNo ?? null : null);

  // Fare ve dokunmatik: tek parmak/fare sürükleyince döner, iki parmakla kıstırınca yakınlaşır
  let elleYakinlastirildi = false;  // oyuncu kendisi yakınlaştırdıysa ekran döndüğünde bozmayalım
  const yakinlastir = oran => {
    elleYakinlastirildi = true;
    yorunge.uzaklik = Math.min(30, Math.max(6, yorunge.uzaklik * oran));
  };

  function fareyiBagla(canvas) {
    let surukleniyor = false;
    let basX = 0;
    let basY = 0;
    let sonX = 0;
    let sonY = 0;
    const parmaklar = new Map();  // ekrandaki parmaklar: pointerId → {x, y}
    let kistirma = 0;             // iki parmak arasındaki son uzaklık (0: kıstırma yok)
    let kistirildi = false;       // bu dokunuşta kıstırma yapıldıysa bırakınca tıklama sayılmasın
    const parmakAraligi = () => {
      const [a, b] = [...parmaklar.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    canvas.addEventListener('pointerdown', e => {
      parmaklar.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (parmaklar.size === 2) {
        kistirma = parmakAraligi();
        kistirildi = true;
        surukleniyor = false;
        return;
      }
      kistirildi = false;
      surukleniyor = true;
      basX = sonX = e.clientX;
      basY = sonY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (parmaklar.has(e.pointerId)) parmaklar.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (parmaklar.size === 2) {
        const aralik = parmakAraligi();
        if (kistirma && aralik) yakinlastir(kistirma / aralik);
        kistirma = aralik;
        return;
      }
      if (!surukleniyor) {
        // Kare seçme modunda farenin üstündeki kare turuncu çerçeveyle gösterilir
        uzerindekiKare = karedeMi(e);
        secimIsareti.visible = uzerindekiKare !== null;
        if (uzerindekiKare !== null) {
          const yer = karePozisyonlari[uzerindekiKare];
          secimIsareti.position.set(yer.x, KARO_UST + 0.05, yer.z);
        }
        canvas.style.cursor = oktaMi(e) !== null || uzerindekiKare !== null ? 'pointer' : '';
        return;
      }
      yorunge.aci -= (e.clientX - sonX) * 0.008;
      yorunge.egim = Math.min(1.25, Math.max(0.25, yorunge.egim - (e.clientY - sonY) * 0.006));
      sonX = e.clientX;
      sonY = e.clientY;
    });
    const birak = e => {
      parmaklar.delete(e.pointerId);
      kistirma = 0;
      // İki parmaktan biri kalktıysa kalan parmakla döndürmeye zıplamadan devam et
      if (parmaklar.size === 1) {
        const [p] = parmaklar.values();
        sonX = p.x;
        sonY = p.y;
        surukleniyor = true;
      } else {
        surukleniyor = false;
      }
    };
    canvas.addEventListener('pointercancel', birak);
    canvas.addEventListener('pointerup', e => {
      birak(e);
      // Sürüklemeden bırakıldıysa bu bir tıklamadır: oka ya da (seçim modunda) kareye mi tıklandı?
      if (!kistirildi && !parmaklar.size && Math.hypot(e.clientX - basX, e.clientY - basY) < 8) {
        const hedef = oktaMi(e);
        if (hedef !== null) {
          yolSecildi(hedef);
          return;
        }
        const kare = karedeMi(e);
        if (kare !== null) {
          kareSecimi(kare);
          return;
        }
        if (kareDokunuldu) {
          const dokunulan = isinAt(e, kareMeshleri)?.userData.kareNo;
          if (dokunulan !== undefined) kareDokunuldu(dokunulan, e.clientX, e.clientY);
        }
      }
    });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      yakinlastir(1 + e.deltaY * 0.001);
    }, { passive: false });
    canvas.addEventListener('dblclick', () => Object.assign(yorunge, varsayilanYorunge));
  }

  function boyutlandir() {
    const w = kapsayici.clientWidth;
    const h = kapsayici.clientHeight;
    if (!w || !h) return;  // ekran gizliyken (kelime turu) boyut 0 olur
    cizici.setSize(w, h);
    kamera.aspect = w / h;
    kamera.updateProjectionMatrix();
    // Dar (telefon gibi dik) ekranda geniş tahta yanlardan taşmasın diye kamera uzaklaşır
    varsayilanYorunge.uzaklik = temelUzaklik * Math.pow(Math.max(1, 1.45 / kamera.aspect), 0.45);
    if (!elleYakinlastirildi) yorunge.uzaklik = varsayilanYorunge.uzaklik;
  }

  // ---------- Animasyon döngüsü: saniyede ~60 kez sahne yeniden çizilir ----------
  const yumusat = t => 1 - Math.pow(1 - t, 3);

  function dongu(simdi) {
    requestAnimationFrame(dongu);

    piyonlar.forEach(p => {
      const t = Math.min(1, (simdi - p.baslangic) / p.sure);
      p.govde.position.lerpVectors(p.from, p.to, p.zipla ? t : yumusat(t));
      if (p.zipla && t < 1) p.govde.position.y += Math.sin(Math.PI * t) * ZIPLAMA_YUKSEKLIGI;
    });

    // Sırası gelen piyonun altında nabız gibi atan sarı halka
    const aktif = piyonlar[aktifNo];
    if (aktif) {
      const s = 1 + Math.sin(simdi / 220) * 0.08;
      aktifHalka.position.set(aktif.govde.position.x, KARO_UST + 0.02, aktif.govde.position.z);
      aktifHalka.scale.set(s, s, s);
    }

    // Yol okları hafifçe aşağı yukarı süzülür
    oklar.forEach((ok, i) => {
      ok.position.y = KARO_UST + 0.2 + Math.sin(simdi / 180 + i) * 0.08;
    });
    // Varış karesi çerçeveleri yukarı aşağı oynar ve nabız gibi parlar
    hedefIsaretleri.forEach(isaret => {
      isaret.position.y = KARO_UST + 0.04 + (Math.sin(simdi / 160) + 1) * 0.09;
      isaret.material.opacity = 0.65 + Math.sin(simdi / 160) * 0.3;
    });

    tuzaklariCanlandir(simdi);
    harfTaslariniCanlandir(simdi);
    buzlariCanlandir(simdi);
    piyonEfektleriniCanlandir(simdi);
    ucanYazilariGuncelle(simdi);
    zarlariGuncelle(simdi);
    carkGuncelle(simdi);
    kameraGuncelle();
    cizici.render(sahne, kamera);
  }

  // ---------- Dışarıya açılan fonksiyonlar ----------
  function olustur(kutu, tahtaBilgisi, yolSecilince) {
    kapsayici = kutu;
    tahta = tahtaBilgisi;
    yolSecildi = yolSecilince;

    // Büyük tahtada kamera daha uzağa çekilir. Ekran yatay olduğu için genişlik
    // derinlikten daha az uzaklık gerektirir.
    const olcek = Math.max(1, tahta.genislik / 7 * 0.68, tahta.yukseklik / 7);
    temelUzaklik = 13 * olcek;
    varsayilanYorunge = { aci: 0, egim: 0.8, uzaklik: temelUzaklik };
    yorunge = { ...varsayilanYorunge };
    hedefKaydirma = new THREE.Vector3(0, 0, 1.6 * olcek * Math.max(0.85, tahta.yukseklik / tahta.genislik));
    kameraHedefi = hedefKaydirma.clone();

    sahne = new THREE.Scene();
    sahne.background = new THREE.Color('#151827');
    sahne.fog = new THREE.Fog('#151827', 22 * olcek, 50 * olcek);

    kamera = new THREE.PerspectiveCamera(40, 1, 0.1, 150);
    cizici = new THREE.WebGLRenderer({ antialias: true });
    cizici.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    cizici.shadowMap.enabled = true;
    cizici.shadowMap.type = THREE.PCFSoftShadowMap;
    kapsayici.prepend(cizici.domElement);

    isiklariKur(Math.max(tahta.genislik, tahta.yukseklik) / 2 + 1.5);
    masaVeTahtayiKur();
    kareleriKur();
    carkiKur();
    zarlariKur();
    zarlariGoster(tahta.zarSayisi);

    aktifHalka = new THREE.Mesh(
      new THREE.TorusGeometry(0.33, 0.035, 12, 48),
      new THREE.MeshStandardMaterial({ color: '#ffd166', emissive: '#ffb703', emissiveIntensity: 0.8 }),
    );
    aktifHalka.rotation.x = -Math.PI / 2;
    sahne.add(aktifHalka);

    secimIsareti = cerceveYap('#ff7b00', 1.2);
    secimIsareti.visible = false;
    sahne.add(secimIsareti);

    fareyiBagla(cizici.domElement);
    new ResizeObserver(boyutlandir).observe(kapsayici);
    boyutlandir();
    requestAnimationFrame(dongu);
  }

  // Aynı karede birden fazla piyon varsa küçük bir çember üzerine yan yana dizilirler.
  // Konumu değişen piyon kayarak, zıplayan piyon yay çizerek yeni yerine gider.
  // ---------- ⏸️ Buz küpü (donmuş piyon) ----------
  // Piyonu içine alan yarı saydam, açık mavi bir küp; kenarları buz beyazı çizgili.
  const BUZ_MALZEMESI = () => new THREE.MeshStandardMaterial({
    color: '#bfe9ff', emissive: '#4fb3ff', emissiveIntensity: 0.25,
    roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.5, depthWrite: false,
  });

  function buzKupuYap() {
    const geo = new THREE.BoxGeometry(0.66, 0.98, 0.66);
    const kup = new THREE.Mesh(geo, BUZ_MALZEMESI());
    const kenarlar = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 }),
    );
    const grup = new THREE.Group();
    grup.add(kup, kenarlar);
    grup.userData.kup = kup;
    grup.renderOrder = 5;  // saydam küp, piyondan sonra çizilsin ki piyon içinde görünsün
    return grup;
  }

  // Donmuş oyuncuların piyonlarına buz koyar; çözülenlerin buzunu kırar
  function buzlariGuncelle(oyuncular) {
    oyuncular.forEach((o, i) => {
      const p = piyonlar[i];
      if (o.donmus && !p.buz) {
        p.buz = buzKupuYap();
        p.buz.userData.olusum = performance.now();
        sahne.add(p.buz);
      } else if (!o.donmus && p.buz) {
        buzuKir(p);
      }
    });
  }

  // Buz küpü yerine 12 parça kalır; parçalar dışa doğru saçılıp düşer ve kaybolur
  function buzuKir(p) {
    const merkez = p.buz.position.clone();
    sahne.remove(p.buz);
    p.buz = null;
    for (let i = 0; i < 12; i++) {
      const boy = 0.08 + Math.random() * 0.12;
      const parca = new THREE.Mesh(new THREE.BoxGeometry(boy, boy * 1.4, boy), BUZ_MALZEMESI());
      parca.position.copy(merkez).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.5, 0.2 + Math.random() * 0.7, (Math.random() - 0.5) * 0.5));
      sahne.add(parca);
      const aci = Math.random() * Math.PI * 2;
      buzParcalari.push({
        parca,
        hiz: new THREE.Vector3(Math.cos(aci) * 1.6, 1.5 + Math.random() * 1.5, Math.sin(aci) * 1.6),
        donus: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
        baslangic: performance.now(),
      });
    }
  }

  let sonBuzZamani = 0;
  function buzlariCanlandir(simdi) {
    const dt = Math.min(0.05, (simdi - (sonBuzZamani || simdi)) / 1000);
    sonBuzZamani = simdi;
    piyonlar.forEach(p => {
      if (!p.buz) return;
      // Küp piyonla birlikte durur, oluşurken büyüyerek "donar", sonra hafifçe parıldar
      p.buz.position.set(p.govde.position.x, p.govde.position.y + 0.45, p.govde.position.z);
      const t = Math.min(1, (simdi - p.buz.userData.olusum) / 450);
      p.buz.scale.set(t, t * (1 + Math.sin(t * Math.PI) * 0.15), t);
      p.buz.userData.kup.material.opacity = 0.42 + Math.sin(simdi / 350) * 0.08;
    });
    for (let i = buzParcalari.length - 1; i >= 0; i--) {
      const b = buzParcalari[i];
      const yas = (simdi - b.baslangic) / 1000;
      b.hiz.y -= 9 * dt;  // yerçekimi
      b.parca.position.addScaledVector(b.hiz, dt);
      if (b.parca.position.y < KARO_UST + 0.05) {
        b.parca.position.y = KARO_UST + 0.05;
        b.hiz.multiplyScalar(0.4);
      }
      b.parca.rotation.x += b.donus.x * dt;
      b.parca.rotation.y += b.donus.y * dt;
      b.parca.material.opacity = Math.max(0, 0.6 * (1 - yas / 1.2));
      if (yas > 1.2) {
        sahne.remove(b.parca);
        buzParcalari.splice(i, 1);
      }
    }
  }

  function piyonlariGuncelle(oyuncular, aktifOyuncu, ziplayanOyuncu, adimSuresi) {
    if (!piyonlar.length) {
      const geo = piyonGeometrisi();
      oyuncular.forEach(o => piyonEkle(o.renk, geo));
    }
    aktifNo = aktifOyuncu;

    const karedekiler = {};
    oyuncular.forEach((o, i) => (karedekiler[o.konum] ??= []).push(i));

    const simdi = performance.now();
    oyuncular.forEach((o, i) => {
      const grup = karedekiler[o.konum];
      const hedef = karePozisyonlari[o.konum].clone();
      if (grup.length > 1) {
        const a = (2 * Math.PI * grup.indexOf(i)) / grup.length + Math.PI / 4;
        hedef.x += Math.cos(a) * 0.24;
        hedef.z += Math.sin(a) * 0.24;
      }
      const p = piyonlar[i];
      if (p.yeni) {
        p.from.copy(hedef);
        p.to.copy(hedef);
        p.govde.position.copy(hedef);
        p.yeni = false;
      } else if (!p.to.equals(hedef)) {
        p.from.copy(p.govde.position);
        p.from.y = KARO_UST;
        p.to.copy(hedef);
        p.baslangic = simdi;
        p.zipla = i === ziplayanOyuncu;
        p.sure = p.zipla ? adimSuresi * 0.85 : 450;
      }
    });
    buzlariGuncelle(oyuncular);
  }

  // Yol ayrımında, gidilebilecek her karenin üstüne o yöne bakan bir ok koyar.
  // hedefler boşsa oklar kaldırılır.
  function yolOklari(kaynakKare, hedefler) {
    const anahtar = hedefler.length ? `${kaynakKare}:${hedefler.join(',')}` : '';
    if (anahtar === okAnahtari) return;
    okAnahtari = anahtar;
    oklar.splice(0).forEach(ok => sahne.remove(ok));
    hedefler.forEach(hedefKare => {
      const ok = okYap(hedefKare);
      const nereden = karePozisyonlari[kaynakKare];
      const nereye = karePozisyonlari[hedefKare];
      ok.position.set(nereye.x, KARO_UST + 0.2, nereye.z);
      // Okun ucu -z'ye bakıyor; gidilecek yöne (dx, dz) çevir
      ok.rotation.y = Math.atan2(-(nereye.x - nereden.x), -(nereye.z - nereden.z));
      sahne.add(ok);
      oklar.push(ok);
    });
  }

  // Zarla gidilebilecek karelerin etrafına sarı, aşağı yukarı süzülen bir çerçeve koyar.
  // kareler boşsa çerçeveler kaldırılır.
  function hedefleriIsaretle(kareler) {
    const anahtar = kareler.join(',');
    if (anahtar === hedefAnahtari) return;
    hedefAnahtari = anahtar;
    hedefIsaretleri.splice(0).forEach(i => sahne.remove(i));
    kareler.forEach(kareNo => {
      const isaret = cerceveYap('#ffd166', 1);
      const yer = karePozisyonlari[kareNo];
      isaret.position.set(yer.x, KARO_UST + 0.03, yer.z);
      sahne.add(isaret);
      hedefIsaretleri.push(isaret);
    });
  }

  // Karenin üstünden yükselip kaybolan etiket. 'kart' stili, kart açılıyormuş gibi dönerek belirir.
  function ucanYazi(kareNo, metin, stil = 'harf') {
    const [doku, oran] = etiketDokusu(metin, stil);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: doku, transparent: true, depthTest: false,
    }));
    const boy = stil === 'kart' ? 0.62 : 0.5;
    sprite.renderOrder = 10;
    // Aynı karede peş peşe yazı çıkarsa üst üste binmesin
    const ayniKarede = ucanYazilar.filter(u => u.kareNo === kareNo).length;
    const yer = karePozisyonlari[kareNo];
    sprite.position.set(yer.x, KARO_UST + 0.9 + ayniKarede * 0.55, yer.z);
    sahne.add(sprite);
    ucanYazilar.push({
      sprite, kareNo, stil, genislik: boy * oran, boy,
      baslangicY: sprite.position.y, baslangic: performance.now(),
    });
  }

  function ucanYazilariGuncelle(simdi) {
    for (let i = ucanYazilar.length - 1; i >= 0; i--) {
      const u = ucanYazilar[i];
      const t = (simdi - u.baslangic) / UCAN_YAZI_SURESI;
      if (t >= 1) {
        sahne.remove(u.sprite);
        u.sprite.material.map.dispose();
        u.sprite.material.dispose();
        ucanYazilar.splice(i, 1);
        continue;
      }
      u.sprite.position.y = u.baslangicY + yumusat(t) * 1.1;
      u.sprite.material.opacity = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      // Kart: ilk anda yan duruyor (genişlik 0), dönerek önümüze açılıyor
      const acilma = u.stil === 'kart' ? Math.sin(Math.min(1, t / 0.2) * Math.PI / 2) : 1;
      u.sprite.scale.set(u.genislik * acilma, u.boy, 1);
    }
  }

  // ---------- Kart efektleri: piyonun üstünde kısa bir gösteri ----------
  // tip: patlama (turuncu parçalar saçılır), zehir (mor kabarcıklar yükselir), parilti (yeşil yıldızcıklar),
  //      kalkan (mavi küre belirip söner), ayna (gümüş halka döner), donus (piyon fırıl fırıl döner)
  const PARCACIK_AYARI = {
    patlama: { renkler: ['#ff7a00', '#ffd166', '#e74c3c'], adet: 26, hiz: 2.6, yukari: 2.2, yercekimi: 7, sure: 900 },
    zehir:   { renkler: ['#9b59b6', '#6ad66a', '#c39bd3'], adet: 16, hiz: 0.5, yukari: 1.2, yercekimi: -0.6, sure: 1300 },
    parilti: { renkler: ['#2ecc71', '#ffd166', '#a8f0c0'], adet: 18, hiz: 0.8, yukari: 1.6, yercekimi: -0.4, sure: 1100 },
  };
  const EFEKT_SURESI = { kalkan: 1000, ayna: 1100, donus: 900 };

  function piyonEfekti(oyuncuNo, tip) {
    const p = piyonlar[oyuncuNo];
    if (!p) return;
    const simdi = performance.now();
    const merkez = p.govde.position.clone().add(new THREE.Vector3(0, 0.45, 0));
    const ayar = PARCACIK_AYARI[tip];
    if (ayar) {
      for (let i = 0; i < ayar.adet; i++) {
        const boy = 0.04 + Math.random() * 0.06;
        const parca = new THREE.Mesh(
          tip === 'patlama' ? new THREE.BoxGeometry(boy, boy, boy) : new THREE.SphereGeometry(boy, 8, 6),
          new THREE.MeshBasicMaterial({ color: ayar.renkler[i % ayar.renkler.length], transparent: true }));
        parca.position.copy(merkez);
        sahne.add(parca);
        const aci = Math.random() * Math.PI * 2;
        const hiz = ayar.hiz * (0.4 + Math.random() * 0.6);
        piyonEfektleri.push({
          tip: 'parca', nesne: parca, baslangic: simdi, sure: ayar.sure * (0.7 + Math.random() * 0.3),
          yercekimi: ayar.yercekimi,
          hiz: new THREE.Vector3(Math.cos(aci) * hiz, ayar.yukari * (0.5 + Math.random() * 0.5), Math.sin(aci) * hiz),
        });
      }
      if (tip === 'patlama') {
        // Patlamanın ortasında bir anlık parlak top
        const isik = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12),
          new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.9 }));
        isik.position.copy(merkez);
        sahne.add(isik);
        piyonEfektleri.push({ tip: 'flas', nesne: isik, baslangic: simdi, sure: 350 });
      }
      return;
    }
    if (tip === 'kalkan' || tip === 'ayna') {
      const nesne = tip === 'kalkan'
        ? new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16),
          new THREE.MeshBasicMaterial({ color: '#4aa8ff', transparent: true, opacity: 0.45, depthWrite: false }))
        : new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 10, 40),
          new THREE.MeshStandardMaterial({ color: '#e8eef5', metalness: 0.9, roughness: 0.15, transparent: true }));
      nesne.position.copy(merkez);
      sahne.add(nesne);
      piyonEfektleri.push({ tip, nesne, piyon: p, baslangic: simdi, sure: EFEKT_SURESI[tip] });
      return;
    }
    if (tip === 'donus') {
      piyonEfektleri.push({ tip, piyon: p, baslangic: simdi, sure: EFEKT_SURESI.donus });
    }
  }

  let sonEfektZamani = 0;
  function piyonEfektleriniCanlandir(simdi) {
    const dt = Math.min(0.05, (simdi - (sonEfektZamani || simdi)) / 1000);
    sonEfektZamani = simdi;
    for (let i = piyonEfektleri.length - 1; i >= 0; i--) {
      const e = piyonEfektleri[i];
      const t = Math.min(1, (simdi - e.baslangic) / e.sure);
      if (e.tip === 'parca') {
        e.hiz.y -= e.yercekimi * dt;
        e.nesne.position.addScaledVector(e.hiz, dt);
        e.nesne.rotation.x += dt * 6;
        e.nesne.material.opacity = 1 - t;
      } else if (e.tip === 'flas') {
        e.nesne.scale.setScalar(1 + t * 1.5);
        e.nesne.material.opacity = 0.9 * (1 - t);
      } else if (e.tip === 'kalkan') {
        // Hızla büyüyüp piyonu sarar, titreşir, sonra söner
        e.nesne.position.set(e.piyon.govde.position.x, e.piyon.govde.position.y + 0.42, e.piyon.govde.position.z);
        e.nesne.scale.setScalar(Math.min(1, t * 5) * (1 + Math.sin(t * 30) * 0.04));
        e.nesne.material.opacity = 0.45 * (t < 0.6 ? 1 : (1 - t) / 0.4);
      } else if (e.tip === 'ayna') {
        e.nesne.position.set(e.piyon.govde.position.x, e.piyon.govde.position.y + 0.42, e.piyon.govde.position.z);
        e.nesne.rotation.y = t * Math.PI * 4;
        e.nesne.scale.setScalar(Math.min(1, t * 4));
        e.nesne.material.opacity = t < 0.7 ? 1 : (1 - t) / 0.3;
      } else if (e.tip === 'donus') {
        e.piyon.govde.rotation.y = yumusat(t) * Math.PI * 4;
      }
      if (t >= 1) {
        if (e.nesne) {
          sahne.remove(e.nesne);
          e.nesne.geometry.dispose();
          e.nesne.material.dispose();
        }
        if (e.tip === 'donus') e.piyon.govde.rotation.y = 0;
        piyonEfektleri.splice(i, 1);
      }
    }
  }

  function kareDokunmasi(fonk) {
    kareDokunuldu = fonk;
  }

  function kareSecimiAc(tiklaninca) {
    kareSecimi = tiklaninca;
  }

  function kareSecimiKapat() {
    kareSecimi = null;
    uzerindekiKare = null;
    if (secimIsareti) secimIsareti.visible = false;
  }

  // Kontrol için: zarların şu an hangi yüzü yukarı bakıyor?
  function zarUstSayilari() {
    const yukari = new THREE.Vector3(0, 1, 0);
    return zarlar.slice(0, gorunenZar).map(zar => {
      let enIyi = null;
      let enYuksek = -Infinity;
      YUZ_NORMALLERI.forEach((n, i) => {
        const d = new THREE.Vector3(...n).applyQuaternion(zar.quaternion).dot(yukari);
        if (d > enYuksek) { enYuksek = d; enIyi = YUZ_SAYILARI[i]; }
      });
      return enIyi;
    });
  }

  return {
    hazirMi, olustur, piyonlariGuncelle, zarlariGoster, zarAt, carkCevir, yolOklari,
    hedefleriIsaretle, ucanYazi, nesneleriGuncelle, nesneTetiklendi, toplanacaklariGuncelle,
    harfToplandi, kareSecimiAc, kareSecimiKapat, zarUstSayilari, carkDegeri,
    piyonEfekti, kareDokunmasi,
  };
})();
