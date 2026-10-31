// =============================================================
// Kelime listesini oyunun kullanacağı hale getirir.
// Oyunun kendisi bunu çalıştırmaz; liste değişirse bir kez elle çalıştırılır:
//
//   node araclar/kelime_listesi_olustur.js kaynak/words.json kelimeler.js
//
// Girdi : TDK sözlüğünden derlenmiş words.json
//         (https://github.com/bilalozdemir/tr-word-list, lisans CC BY-SA 4.0)
// Çıktı : kelimeler.js → oyun bunu index.html'den yükler
//
// Neden .js? index.html'e çift tıklayıp açınca tarayıcı yanındaki .json/.txt
// dosyalarını okumaya izin vermez, ama .js dosyalarını yükler.
// =============================================================

const fs = require('fs');

const [girdi, cikti] = process.argv.slice(2);
if (!girdi || !cikti) {
  console.error('Kullanım: node kelime_listesi_olustur.js <words.json> <kelimeler.js>');
  process.exit(1);
}

const kayitlar = JSON.parse(fs.readFileSync(girdi, 'utf8'));

// Şapkalı harfler oyunda yok: kâğıt → KAĞIT, dükkân → DÜKKAN
const SAPKASIZ = { 'â': 'a', 'î': 'i', 'û': 'u' };

const kelimeler = new Set();
for (const { word } of kayitlar) {
  // Sadece tek kelimelik, küçük harfle yazılmış girişler:
  // "dulavrat otu" (boşluklu), "Akrep" (özel isim), "canlar!" (işaretli) elenir
  if (!/^[a-zçğıöşüâîû]+$/.test(word)) continue;
  const kelime = word.replace(/[âîû]/g, h => SAPKASIZ[h]).toLocaleUpperCase('tr');
  if (kelime.length >= 2) kelimeler.add(kelime);
}

const sirali = [...kelimeler].sort((a, b) => a.localeCompare(b, 'tr'));
const icerik = `// Bu dosya araclar/kelime_listesi_olustur.js ile otomatik oluşturuldu, elle düzenleme.
// Kaynak: TDK sözlüğü, https://github.com/bilalozdemir/tr-word-list (CC BY-SA 4.0)
// ${sirali.length} kelime
const KELIMELER = new Set(${JSON.stringify(sirali.join(' '))}.split(' '));
`;
fs.writeFileSync(cikti, icerik, 'utf8');
console.log(`${sirali.length} kelime yazıldı → ${cikti} (${Math.round(icerik.length / 1024)} KB)`);
