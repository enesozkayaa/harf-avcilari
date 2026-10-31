// =============================================================
// Harf Avcıları - ses efektleri
// Hiçbir ses dosyası yok: tüm sesler tarayıcının ses motoruyla (Web Audio API)
// anında üretilir. Böylece indirilecek bir şey de yok.
//
// İki temel yapı taşı var:
//   nota()    → tek bir "bip" (frekans = ne kadar ince/kalın, süre, dalga tipi)
//   gurultu() → kısa bir hışırtı (zar takırtısı, kart sesi için)
// Her efekt bunların birkaçını art arda çalar. Yeni ses eklemek için
// SESLER tablosuna bir satır eklemen, sonra game.js'te sesCal('ad') demen yeterli.
// =============================================================

const SES_ANAHTARI = 'harfAvcilari.ses';
const ZAR_SES_SEVIYESI = 0.8;  // zar sesi ne kadar yüksek (0 sessiz, 1 en yüksek)
let sesBaglami = null;  // tarayıcının ses motoru, ilk seste oluşturulur
let sesAcik = true;

try {
  sesAcik = localStorage.getItem(SES_ANAHTARI) !== 'kapali';
} catch (e) { /* hatırlanamazsa açık başlar */ }

// Tarayıcılar sesi ancak kullanıcı bir yere tıkladıktan sonra çalar;
// bu yüzden ses motorunu ilk seste (yani bir buton tıklamasında) açıyoruz.
function sesMotoru() {
  if (!sesAcik) return null;
  sesBaglami ??= new (window.AudioContext || window.webkitAudioContext)();
  if (sesBaglami.state === 'suspended') sesBaglami.resume();
  return sesBaglami;
}

// Tek bir nota. tip: 'sine' yumuşak, 'triangle' tatlı, 'square' oyun konsolu, 'sawtooth' sert
function nota(frekans, { gecikme = 0, sure = 0.15, tip = 'sine', seviye = 0.2, bitisFrekans } = {}) {
  const ctx = sesMotoru();
  if (!ctx) return;
  const t = ctx.currentTime + gecikme;
  const osc = ctx.createOscillator();
  const kazanc = ctx.createGain();
  osc.type = tip;
  osc.frequency.setValueAtTime(frekans, t);
  if (bitisFrekans) osc.frequency.exponentialRampToValueAtTime(bitisFrekans, t + sure);
  // Ses yüksek başlar, hızla söner (çıt diye bitmesin diye)
  kazanc.gain.setValueAtTime(seviye, t);
  kazanc.gain.exponentialRampToValueAtTime(0.001, t + sure);
  osc.connect(kazanc).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + sure + 0.05);
}

// Kısa bir hışırtı. filtre: hangi frekans çevresi duyulsun (düşük = boğuk, yüksek = cızırtılı)
function gurultu({ gecikme = 0, sure = 0.05, seviye = 0.3, filtre = 2000 } = {}) {
  const ctx = sesMotoru();
  if (!ctx) return;
  const t = ctx.currentTime + gecikme;
  const tampon = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * sure), ctx.sampleRate);
  const veri = tampon.getChannelData(0);
  for (let i = 0; i < veri.length; i++) {
    veri[i] = (Math.random() * 2 - 1) * (1 - i / veri.length);
  }
  const kaynak = ctx.createBufferSource();
  kaynak.buffer = tampon;
  const bant = ctx.createBiquadFilter();
  bant.type = 'bandpass';
  bant.frequency.value = filtre;
  const kazanc = ctx.createGain();
  kazanc.gain.value = seviye;
  kaynak.connect(bant).connect(kazanc).connect(ctx.destination);
  kaynak.start(t);
}

// Küçük sert bir cismin tahtaya çarpması: çok kısa bir "tık" ve altında tahtanın boğuk "tok" sesi.
// guc: 1 tam, 0.5 yarı yüksek. filtre: tıkın tınısı (yüksek = sert/plastik, düşük = yumuşak/tahta)
// tok / tokSeviye: alttaki gövde sesinin kalınlığı ve yüksekliği
function vurus({
  gecikme = 0, guc = 1,
  filtre = 1800 + Math.random() * 1600,  // varsayılan: her çarpma biraz farklı tınlasın
  q = 2.5, sonumSn = 0.004,
  tok = 170 + Math.random() * 60, tokSeviye = 0.06, tokSure = 0.06, tokBitis,
} = {}) {
  const ctx = sesMotoru();
  if (!ctx) return;
  const t = ctx.currentTime + gecikme;
  const tampon = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.03), ctx.sampleRate);
  const veri = tampon.getChannelData(0);
  const sonum = ctx.sampleRate * sonumSn;  // tık birkaç milisaniyede söner
  for (let i = 0; i < veri.length; i++) {
    veri[i] = (Math.random() * 2 - 1) * Math.exp(-i / sonum);
  }
  const kaynak = ctx.createBufferSource();
  kaynak.buffer = tampon;
  const bant = ctx.createBiquadFilter();
  bant.type = 'bandpass';
  bant.frequency.value = filtre;
  bant.Q.value = q;
  const kazanc = ctx.createGain();
  kazanc.gain.value = 0.35 * guc;
  kaynak.connect(bant).connect(kazanc).connect(ctx.destination);
  kaynak.start(t);
  nota(tok, { gecikme, sure: tokSure, seviye: tokSeviye * guc, bitisFrekans: tokBitis });
}

// Kağıt sürtünmesi: kartın desteden kayarak çekilmesi.
// Ses yavaşça yükselip söner, tınısı da kayarken hafifçe incelir ("fşşt").
function surtunme({ gecikme = 0, sure = 0.16, seviye = 0.12, filtre = 3500 } = {}) {
  const ctx = sesMotoru();
  if (!ctx) return;
  const t = ctx.currentTime + gecikme;
  const tampon = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * sure), ctx.sampleRate);
  const veri = tampon.getChannelData(0);
  for (let i = 0; i < veri.length; i++) veri[i] = Math.random() * 2 - 1;
  const kaynak = ctx.createBufferSource();
  kaynak.buffer = tampon;
  const bant = ctx.createBiquadFilter();
  bant.type = 'bandpass';
  bant.Q.value = 0.8;
  bant.frequency.setValueAtTime(filtre * 0.6, t);
  bant.frequency.linearRampToValueAtTime(filtre * 1.3, t + sure);
  const kazanc = ctx.createGain();
  kazanc.gain.setValueAtTime(0, t);
  kazanc.gain.linearRampToValueAtTime(seviye, t + sure * 0.35);
  kazanc.gain.linearRampToValueAtTime(0, t + sure);
  kaynak.connect(bant).connect(kazanc).connect(ctx.destination);
  kaynak.start(t);
}

const SESLER = {
  // Zar masaya atılıp sekiyor: her sekme bir öncekinden daha kısa arayla ve daha kısık gelir,
  // sonunda hızlı küçük tıkırtılarla durur. Zar animasyonu (~0.95 sn) içinde biter.
  zar() {
    const sekmeler = [0, 0.17, 0.31, 0.42, 0.51, 0.58, 0.64, 0.69, 0.73, 0.76];
    sekmeler.forEach((zaman, i) => {
      const guc = ZAR_SES_SEVIYESI * Math.pow(0.78, i);
      vurus({ gecikme: zaman + Math.random() * 0.015, guc });
      // İlk sekmelerde bazen zarın iki köşesi peş peşe değer: "tı-tık"
      if (i < 5 && Math.random() < 0.4) {
        vurus({ gecikme: zaman + 0.018 + Math.random() * 0.01, guc: guc * 0.5 });
      }
    });
  },
  // Piyon tahtaya konuyor: yumuşak bir tık + kalın, tahta gibi bir "tok"
  adim() {
    vurus({ guc: 0.5, filtre: 650 + Math.random() * 150, q: 1.5, sonumSn: 0.006, tok: 140, tokSeviye: 0.35, tokSure: 0.09, tokBitis: 90 });
  },
  harf() {
    nota(880, { sure: 0.12 });
    nota(1320, { gecikme: 0.08, sure: 0.2 });
  },
  bonus() {
    [660, 880, 1100, 1320].forEach((f, i) => nota(f, { gecikme: i * 0.07, sure: 0.16 }));
  },
  // Kart desteden kayarak çekiliyor ("fşşt"), sonra ele/masaya hafifçe konuyor ("tap")
  kartCek() {
    surtunme({ sure: 0.16, seviye: 0.14, filtre: 3500 });
    vurus({ gecikme: 0.17, guc: 0.35, filtre: 2500, q: 1, sonumSn: 0.003, tok: 300, tokSeviye: 0.04 });
  },
  // Rakibe kart kullanıldı: alçalan sert ses + darbe
  saldiri() {
    nota(220, { sure: 0.35, tip: 'sawtooth', seviye: 0.15, bitisFrekans: 60 });
    gurultu({ sure: 0.15, filtre: 700, seviye: 0.5 });
  },
  // Kalkan engelledi: metalik "çınnn"
  kalkan() {
    nota(1250, { sure: 0.6, tip: 'square', seviye: 0.05 });
    nota(1870, { sure: 0.5, seviye: 0.12 });
  },
  ceza() {
    nota(420, { sure: 0.45, tip: 'sawtooth', seviye: 0.12, bitisFrekans: 110 });
  },
  // Taşlar karıştırılıyor: masada kayan birkaç taşın kısa tıkırtısı
  karistir() {
    surtunme({ sure: 0.12, seviye: 0.08, filtre: 2500 });
    [0.03, 0.08, 0.12, 0.15].forEach(t =>
      vurus({ gecikme: t, guc: 0.25, filtre: 1200 + Math.random() * 600, q: 1.5, tok: 260, tokSeviye: 0.03 }));
  },
  harfSec() {
    nota(700, { sure: 0.06, tip: 'triangle', seviye: 0.12 });
  },
  dogru() {
    [523, 659, 784].forEach((f, i) => nota(f, { gecikme: i * 0.1, sure: 0.25 }));
  },
  yanlis() {
    nota(300, { sure: 0.25, tip: 'square', seviye: 0.07 });
    nota(220, { gecikme: 0.2, sure: 0.35, tip: 'square', seviye: 0.07 });
  },
  // 🪤 Ayı tuzağı: sert metalik "şak" ve arkasından titreşen yay sesi
  tuzak() {
    vurus({ guc: 0.9, filtre: 3800, q: 3, sonumSn: 0.003, tok: 320, tokSeviye: 0.08 });
    vurus({ gecikme: 0.02, guc: 0.6, filtre: 2600, q: 4, sonumSn: 0.004, tok: 180, tokSeviye: 0.05 });
    nota(1400, { gecikme: 0.03, sure: 0.35, tip: 'square', seviye: 0.025, bitisFrekans: 1250 });
  },
  // ☠️ Çark dönüyor: dilimlerin göstergeye çarpma tıkırtısı, gittikçe yavaşlar (~1.8 sn)
  cark() {
    let t = 0;
    let ara = 0.035;
    while (t < 1.7) {
      vurus({ gecikme: t, guc: 0.25, filtre: 2200, q: 2, sonumSn: 0.002, tok: 400, tokSeviye: 0.02 });
      t += ara;
      ara *= 1.09;
    }
  },
  // 🧊 Donma: buzun çıtırdayarak sarması (kısa cızırtılar) ve soğuk, alçalan cam tınısı
  buz() {
    for (let i = 0; i < 8; i++) {
      vurus({ gecikme: i * 0.04 + Math.random() * 0.02, guc: 0.25, filtre: 5000 + Math.random() * 2000, q: 4, sonumSn: 0.002, tok: 1800, tokSeviye: 0.01 });
    }
    [2093, 1568, 1319].forEach((f, i) => nota(f, { gecikme: 0.1 + i * 0.09, sure: 0.5, seviye: 0.06 }));
  },
  // 🧊 Buz kırıldı: cam gibi çatırdama, parçaların masaya saçılması
  kirilma() {
    gurultu({ sure: 0.12, seviye: 0.35, filtre: 6000 });
    for (let i = 0; i < 10; i++) {
      vurus({ gecikme: 0.05 + i * 0.035 + Math.random() * 0.03, guc: 0.3 * (1 - i / 12), filtre: 3500 + Math.random() * 3000, q: 5, sonumSn: 0.002, tok: 2400, tokSeviye: 0.015 });
    }
  },
  // 🖋️ Mürekkep kazanıldı/harcandı: iki kısa metalik "çın çın" (kasa sesi gibi)
  para() {
    [2637, 3520].forEach((f, i) => nota(f, { gecikme: i * 0.07, sure: 0.18, tip: 'triangle', seviye: 0.09 }));
    vurus({ guc: 0.2, filtre: 6000, q: 3, sonumSn: 0.002, tok: 2000, tokSeviye: 0.01 });
  },
  // 💎 Dönen taş toplandı: parlak, yükselen tınlama
  toplama() {
    [988, 1319, 1568, 1976].forEach((f, i) => nota(f, { gecikme: i * 0.05, sure: 0.22, tip: 'triangle', seviye: 0.12 }));
  },
  // Kelime turunda son 10 saniye
  tik() {
    nota(1000, { sure: 0.03, tip: 'square', seviye: 0.05 });
  },
  kazanma() {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) =>
      nota(f, { gecikme: i * 0.13, sure: i === 5 ? 0.7 : 0.2, tip: 'triangle', seviye: 0.22 }));
  },
};

// Oyunun her yerinden çağrılan tek fonksiyon. Ses bir sebeple çalmazsa oyun etkilenmez.
function sesCal(ad) {
  try {
    SESLER[ad]();
  } catch (e) { /* ses çalınamadı, sorun değil */ }
}

function sesButonunuGuncelle() {
  const buton = document.getElementById('sesBtn');
  buton.textContent = sesAcik ? '🔊' : '🔇';
  buton.title = sesAcik ? 'Sesi kapat' : 'Sesi aç';
}

function sesiAcKapa() {
  sesAcik = !sesAcik;
  try {
    localStorage.setItem(SES_ANAHTARI, sesAcik ? 'acik' : 'kapali');
  } catch (e) { /* hatırlanamazsa sorun değil */ }
  sesButonunuGuncelle();
  if (sesAcik) sesCal('harfSec');
}
