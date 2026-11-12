const SPREADSHEET_ID = '1LUs1Ro7nUDNvD8rA-QNfsznXH4BMnHYdbfv6cv6CYOA';

const BUNGA_DEFAULT = 30;

const HALAMAN = {
  dashboard: { file: 'Dashboard', title: 'PinjamanKu - Dashboard' },
  pinjaman: { file: 'Index', title: 'PinjamanKu - Data Pinjaman' },
  tracker: { file: 'Tracker', title: 'PinjamanKu - Money Tracker' },
  kalkulator: { file: 'Calculator', title: 'PinjamanKu - Kalkulator' }
};

function doGet(e) {
  const params = (e && e.parameter) || {};
  const page = params.page || '';
  const protectedPage = Object.prototype.hasOwnProperty.call(HALAMAN, page);
  const token = params.session || '';

  // Validasi sesi dilakukan di server, bukan mengandalkan sessionStorage browser.
  if (protectedPage && !validasiSesi_(token)) {
    return HtmlService.createTemplateFromFile('Login')
      .evaluate()
      .setTitle('PinjamanKu - Login')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  const target = protectedPage ? HALAMAN[page] : { file: 'Login', title: 'PinjamanKu - Login' };
  const template = HtmlService.createTemplateFromFile(target.file);
  template.AUTH_TOKEN = protectedPage ? token : '';
  template.BASE_APP_URL = ScriptApp.getService().getUrl();
  return template.evaluate()
    .setTitle(target.title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function validasiSesi_(token) {
  if (!token || typeof token !== 'string' || token.length > 120) return false;
  const cache = CacheService.getScriptCache();
  const key = 'pinjamanku_session_' + token;
  if (cache.get(key) !== 'active') return false;
  cache.put(key, 'active', 21600); // perpanjang sesi 6 jam saat halaman dibuka
  return true;
}

function logoutSession(token) {
  if (token) CacheService.getScriptCache().remove('pinjamanku_session_' + token);
  return true;
}

function verifikasiLogin(username, password) {
  const validUsername = 'nunuanugraha';
  const validPassword = 'p\@ssword123!';
  if (username === validUsername && password === validPassword) {
    const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
    CacheService.getScriptCache().put('pinjamanku_session_' + token, 'active', 21600);
    return {
      success: true,
      redirectUrl: ScriptApp.getService().getUrl() + '?page=dashboard&session=' + encodeURIComponent(token)
    };
  }
  return { success: false, message: 'Username atau Password salah!' };
}

function spreadsheet() {

  return SpreadsheetApp.openById(SPREADSHEET_ID);

}

function angka(nilai) {

  return parseFloat(String(nilai).replace(/[^0-9]/g, ''));

}

function formatTanggal(date) {

  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");

}

// Date dari Sheets tidak bisa dikirim lewat google.script.run, jadi diubah ke string.

function barisKeObjek(headers, rows) {

  return rows.map(row => {

    const obj = {};

    headers.forEach((header, index) => {

      const value = row[index];

      obj[header] = value instanceof Date ? formatTanggal(value) : value;

    });

    return obj;

  });

}

function cariBaris(values, id) {

  const target = String(id).trim();

  for (let i = 1; i < values.length; i++) {

    if (String(values[i][0]).trim() === target) return i;

  }

  return -1;

}

// Jalankan sekali dari editor Apps Script.

function initDatabase() {

  const ss = spreadsheet();

  const buatSheet = (nama, headers, kolomAngka) => {

    if (ss.getSheetByName(nama)) return;

    const sheet = ss.insertSheet(nama);

    sheet.appendRow(headers);

    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");

    kolomAngka.forEach(kolom => sheet.getRange(kolom).setNumberFormat("#,##0"));

  };

  buatSheet('Pinjaman', [

    'id', 'nama', 'telepon', 'tanggalPinjam', 'nominalPinjaman',

    'bungaPersen', 'bungaNominal', 'totalBayar', 'jatuhTempo',

    'totalDibayar', 'sisaTagihan', 'status', 'catatan'

  ], ["E:E", "G:H", "J:K"]);

  buatSheet('Pembayaran', [

    'id', 'loanId', 'tanggalPembayaran', 'nominalPembayaran', 'catatan'

  ], ["D:D"]);

  buatSheet('Tracker', [

    'id', 'tanggal', 'tipe', 'nominal', 'kategori', 'catatan'

  ], ["D:D"]);

}

function tambahTransaksiTracker(data) {

  const sheet = spreadsheet().getSheetByName('Tracker');

  sheet.appendRow([

    Utilities.getUuid(), data.tanggal, data.tipe, angka(data.nominal), data.kategori, data.catatan

  ]);

  return { success: true, message: 'Transaksi berhasil dicatat.' };

}

function getTrackerData() {

  const sheet = spreadsheet().getSheetByName('Tracker');

  if (!sheet) return [];

  const [headers, ...rows] = sheet.getDataRange().getValues();

  if (rows.length === 0) return [];

  rows.sort((a, b) => new Date(b[1]) - new Date(a[1]));

  return barisKeObjek(headers, rows);

}

// Pinjaman tgl 1-21 jatuh tempo tgl 22 bulan yang sama; tgl 22 ke atas jatuh tempo tgl 7 bulan berikutnya.

function hitungJatuhTempo(tanggalPinjamStr) {

  const tgl = new Date(tanggalPinjamStr);

  const jatuhTempo = tgl.getDate() <= 21

    ? new Date(tgl.getFullYear(), tgl.getMonth(), 22)

    : new Date(tgl.getFullYear(), tgl.getMonth() + 1, 7);

  return formatTanggal(jatuhTempo);

}

function hitungJatuhTempoBerikutnya(jatuhTempoStr) {
  const d = new Date(jatuhTempoStr + 'T12:00:00');
  if (isNaN(d.getTime())) throw new Error('Tanggal jatuh tempo tidak valid.');
  // Siklus tetap: tanggal 22 -> tanggal 7 bulan berikutnya; tanggal 7 -> tanggal 22 bulan yang sama.
  if (d.getDate() === 22) return formatTanggal(new Date(d.getFullYear(), d.getMonth() + 1, 7));
  if (d.getDate() === 7) return formatTanggal(new Date(d.getFullYear(), d.getMonth(), 22));
  // Data lama dengan tanggal selain 7/22 dinormalisasi ke tanggal siklus berikutnya.
  return formatTanggal(new Date(d.getFullYear(), d.getMonth(), d.getDate() < 22 ? 22 : 7));
}

function hitungTagihan(data) {

  const nominal = angka(data.nominalPinjaman);

  const bungaPersen = parseFloat(data.bungaPersen) || BUNGA_DEFAULT;

const bungaNominal = nominal * (bungaPersen / 100);

  return {

    nominal,

    bungaPersen,

    bungaNominal,

    totalBayar: nominal + bungaNominal,

    jatuhTempo: hitungJatuhTempo(data.tanggalPinjam),

  };

}

function tambahPinjaman(data) {

  const sheet = spreadsheet().getSheetByName('Pinjaman');

  const t = hitungTagihan(data);

  sheet.appendRow([

    Utilities.getUuid(), data.nama, data.telepon, data.tanggalPinjam, t.nominal,

    t.bungaPersen, t.bungaNominal, t.totalBayar, t.jatuhTempo,

    0, t.totalBayar, 'Belum Lunas', data.catatan

  ]);

  return { success: true, message: 'Data pinjaman berhasil ditambahkan.' };

}

function ensureJenisPembayaranColumn() {
  const sheet = spreadsheet().getSheetByName('Pembayaran');
  if (!sheet) throw new Error("Sheet 'Pembayaran' tidak ditemukan. Jalankan initDatabase() terlebih dahulu.");

  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map(v => String(v || '').trim());

  if (!headers.includes('jenisPembayaran')) {
    const targetColumn = Math.max(lastColumn + 1, 6);
    sheet.getRange(1, targetColumn).setValue('jenisPembayaran').setFontWeight('bold');
  }
  const refreshed = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(v => String(v || '').trim());
  if (!refreshed.includes('periodeBunga')) sheet.getRange(1, sheet.getLastColumn() + 1).setValue('periodeBunga').setFontWeight('bold');
}

function getDataPinjaman() {
  const sheet = spreadsheet().getSheetByName('Pinjaman');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0];
  const rows = data.slice(1).reverse();
  const paymentSheet = spreadsheet().getSheetByName('Pembayaran');
  const payments = paymentSheet && paymentSheet.getLastRow() > 1
    ? paymentSheet.getDataRange().getValues().slice(1)
    : [];

  const bungaPerPeriode = new Set();
  payments.forEach(row => {
    if (String(row[5] || '').trim().toLowerCase() === 'bunga') {
      const loanId = String(row[1]).trim();
      const periode = String(row[6] || '').trim();
      if (periode) bungaPerPeriode.add(loanId + '|' + periode);
    }
  });

  return barisKeObjek(headers, rows).map(item => {
    item.bungaSudahDibayar = bungaPerPeriode.has(String(item.id).trim() + '|' + String(item.jatuhTempo).trim());
    return item;
  });
}

function prosesCicilan(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const ss = spreadsheet();
    ensureJenisPembayaranColumn();

    const sheetPinjaman = ss.getSheetByName('Pinjaman');
    if (!sheetPinjaman) throw new Error("Sheet 'Pinjaman' tidak ditemukan. Jalankan initDatabase() terlebih dahulu.");

    const values = sheetPinjaman.getDataRange().getValues();
    const i = cariBaris(values, data.loanId);
    if (i === -1) throw new Error('ID pinjaman tidak ditemukan.');

    const row = values[i];
    const statusSaatIni = String(row[11] || 'Belum Lunas');
    if (statusSaatIni === 'Lunas') throw new Error('Pinjaman ini sudah lunas.');

    const nominalBayar = angka(data.nominalPembayaran);
    if (!Number.isFinite(nominalBayar) || nominalBayar <= 0) {
      throw new Error('Nominal pembayaran harus lebih besar dari Rp0.');
    }
    if (!data.tanggalPembayaran) throw new Error('Tanggal pembayaran wajib diisi.');

    const jenis = String(data.jenisPembayaran || 'pelunasan').toLowerCase();
    if (!['bunga', 'pelunasan'].includes(jenis)) {
      throw new Error('Jenis pembayaran tidak valid.');
    }

    const bungaNominal = Math.round(Number(row[6]) || 0);
    const totalBayar = Math.round(Number(row[7]) || 0);
    const totalDibayarSaatIni = Math.round(Number(row[9]) || 0);
    const sisaTagihan = Math.max(totalBayar - totalDibayarSaatIni, 0);

    const paymentSheet = ss.getSheetByName('Pembayaran');
    if (!paymentSheet) throw new Error("Sheet 'Pembayaran' tidak ditemukan. Jalankan initDatabase() terlebih dahulu.");
    const paymentRows = paymentSheet.getLastRow() > 1
      ? paymentSheet.getDataRange().getValues().slice(1)
      : [];

    const jatuhTempoSaatIni = formatTanggal(new Date(row[8]));
    if (jenis === 'bunga') {
      const sudahBayarPeriodeIni = paymentRows.some(payment =>
        String(payment[1]).trim() === String(data.loanId).trim() &&
        String(payment[5] || '').trim().toLowerCase() === 'bunga' &&
        String(payment[6] || '').trim() === jatuhTempoSaatIni
      );
      if (sudahBayarPeriodeIni) throw new Error('Bunga untuk periode jatuh tempo ' + jatuhTempoSaatIni + ' sudah dibayar.');
      if (nominalBayar !== bungaNominal) throw new Error('Pembayaran bunga harus tepat Rp' + bungaNominal.toLocaleString('id-ID') + '.');
      if (sisaTagihan <= 0) throw new Error('Tidak ada tagihan tersisa untuk pinjaman ini.');
    } else {
      if (nominalBayar !== sisaTagihan) {
        throw new Error('Pelunasan penuh harus sama dengan sisa tagihan, yaitu Rp' + sisaTagihan.toLocaleString('id-ID') + '.');
      }
    }

    paymentSheet.appendRow([
      Utilities.getUuid(),
      data.loanId,
      data.tanggalPembayaran,
      nominalBayar,
      data.catatan || '',
      jenis,
      jenis === 'bunga' ? jatuhTempoSaatIni : ''
    ]);

    if (jenis === 'pelunasan') {
      const totalDibayarBaru = totalDibayarSaatIni + nominalBayar;
      const sisaBaru = Math.max(totalBayar - totalDibayarBaru, 0);
      const statusBaru = sisaBaru === 0 ? 'Lunas' : 'Belum Lunas';
      sheetPinjaman.getRange(i + 1, 10, 1, 3).setValues([
        [totalDibayarBaru, sisaBaru, statusBaru]
      ]);

      return {
        success: true,
        message: 'Pelunasan penuh berhasil dicatat. Pinjaman sekarang lunas.'
      };
    }

    const nextDue = hitungJatuhTempoBerikutnya(jatuhTempoSaatIni);
    // Simpan tanggal jatuh tempo dan status pada sheet Pinjaman setelah pembayaran bunga tercatat.
    // Kolom I = jatuhTempo, kolom L = status.
    sheetPinjaman.getRange(i + 1, 9).setValue(nextDue);
    sheetPinjaman.getRange(i + 1, 12).setValue('Sudah Bayar Bunga');
    SpreadsheetApp.flush();
    return {
      success: true,
      message: 'Pembayaran bunga periode ' + jatuhTempoSaatIni + ' berhasil dicatat. Jatuh tempo berikutnya: ' + nextDue + '. Sisa pokok/tagihan tetap Rp' + sisaTagihan.toLocaleString('id-ID') + '.'
    };
  } finally {
    lock.releaseLock();
  }
}

function editPinjaman(data) {

  const sheet = spreadsheet().getSheetByName('Pinjaman');

  const values = sheet.getDataRange().getValues();

  const i = cariBaris(values, data.id);

  if (i === -1) throw new Error("ID pinjaman tidak ditemukan.");

  const t = hitungTagihan(data);

  // Cicilan yang sudah masuk tidak ikut berubah saat data diedit.

  const totalDibayar = parseFloat(values[i][9]) || 0;

  const sisaTagihan = t.totalBayar - totalDibayar;

  const status = sisaTagihan <= 0 ? 'Lunas' : 'Belum Lunas';

  // Kolom 2-9: nama sampai jatuhTempo.

  sheet.getRange(i + 1, 2, 1, 8).setValues([[

    data.nama, data.telepon, data.tanggalPinjam, t.nominal,

    t.bungaPersen, t.bungaNominal, t.totalBayar, t.jatuhTempo

  ]]);

  // Kolom 11-13: sisaTagihan, status, catatan.

  sheet.getRange(i + 1, 11, 1, 3).setValues([[sisaTagihan, status, data.catatan]]);

  return { success: true, message: 'Data pinjaman berhasil diperbarui.' };

}

function deletePinjaman(id) {

  const ss = spreadsheet();

  const targetId = String(id).trim();

  const sheetPinjaman = ss.getSheetByName('Pinjaman');

  const i = cariBaris(sheetPinjaman.getDataRange().getValues(), targetId);

  if (i === -1) {

    throw new Error("ID target (" + targetId + ") tidak ditemukan di dalam database Sheets.");

  }

  sheetPinjaman.deleteRow(i + 1);

  const sheetPembayaran = ss.getSheetByName('Pembayaran');

  if (sheetPembayaran) {

    const values = sheetPembayaran.getDataRange().getValues();

    // Dihapus dari bawah supaya nomor baris di atasnya tidak bergeser.

    for (let j = values.length - 1; j >= 1; j--) {

      if (String(values[j][1]).trim() === targetId) sheetPembayaran.deleteRow(j + 1);

    }

  }

  return { success: true, message: 'Data pinjaman beserta riwayat cicilan berhasil dihapus.' };

}

function getRiwayatPembayaran() {
  const ss = spreadsheet();
  const sheetPembayaran = ss.getSheetByName('Pembayaran');
  const sheetPinjaman = ss.getSheetByName('Pinjaman');
  if (!sheetPembayaran || !sheetPinjaman || sheetPembayaran.getLastRow() <= 1) return [];

  ensureJenisPembayaranColumn();

  const [headers, ...rows] = sheetPembayaran.getDataRange().getValues();
  const namaPeminjam = {};
  sheetPinjaman.getDataRange().getValues().slice(1).forEach(row => {
    namaPeminjam[String(row[0]).trim()] = row[1];
  });
  rows.sort((a, b) => new Date(b[2]) - new Date(a[2]));

  return barisKeObjek(headers, rows).map(obj => {
    obj.namaPeminjam = namaPeminjam[String(obj.loanId).trim()] || 'Data Terhapus';
    obj.jenisPembayaran = String(obj.jenisPembayaran || 'pembayaran_lama').toLowerCase();
    return obj;
  });
}

function editTransaksiTracker(data) {

  const sheet = spreadsheet().getSheetByName('Tracker');

  const i = cariBaris(sheet.getDataRange().getValues(), data.id);

  if (i === -1) throw new Error("ID transaksi tidak ditemukan.");

  sheet.getRange(i + 1, 2, 1, 5).setValues([[

    data.tanggal, data.tipe, angka(data.nominal), data.kategori, data.catatan

  ]]);

  return { success: true, message: 'Data transaksi berhasil diperbarui.' };

}

function hapusTransaksiTracker(id) {

  const sheet = spreadsheet().getSheetByName('Tracker');

  const i = cariBaris(sheet.getDataRange().getValues(), id);

  if (i === -1) throw new Error("ID target tidak ditemukan dalam database.");

  sheet.deleteRow(i + 1);

  return { success: true, message: 'Data transaksi berhasil dihapus.' };

}
