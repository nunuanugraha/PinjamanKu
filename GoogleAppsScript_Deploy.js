/**
 * Backend Google Apps Script untuk PinjamanKu.
 * Simpan kredensial dan ID spreadsheet di Script Properties.
 */

function getProp_(key, defaultVal) {
  const val = PropertiesService.getScriptProperties().getProperty(key);
  return val || defaultVal;
}

function spreadsheet_() {
  const id = getProp_('SPREADSHEET_ID', '1LUs1Ro7nUDNvD8rA-QNfsznXH4BMnHYdbfv6cv6CYOA');
  return SpreadsheetApp.openById(id);
}

function angka_(nilai) {
  return parseFloat(String(nilai).replace(/[^0-9]/g, '')) || 0;
}

function formatTanggal_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function barisKeObjek_(headers, rows) {
  return rows.map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      const val = row[index];
      obj[header] = val instanceof Date ? formatTanggal_(val) : val;
    });
    return obj;
  });
}

function cariBaris_(values, id) {
  const target = String(id).trim();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === target) return i;
  }
  return -1;
}

function buatResponJson_(data, callback) {
  const jsonStr = JSON.stringify(data);
  const out = callback ? `${callback}(${jsonStr})` : jsonStr;
  const mime = callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON;
  return ContentService.createTextOutput(out).setMimeType(mime);
}

function hitungJatuhTempoBerikutnya_(jatuhTempoStr) {
  const d = new Date(jatuhTempoStr + 'T12:00:00');
  if (isNaN(d.getTime())) return jatuhTempoStr;
  if (d.getDate() === 22) return formatTanggal_(new Date(d.getFullYear(), d.getMonth() + 1, 7));
  if (d.getDate() === 7) return formatTanggal_(new Date(d.getFullYear(), d.getMonth(), 22));
  return formatTanggal_(new Date(d.getFullYear(), d.getMonth(), d.getDate() < 22 ? 22 : 7));
}

function doGet(e) {
  const params = (e && e.parameter) || {};
  const action = params.action;
  const callback = params.callback;
  const token = params.token;

  if (action === 'login') {
    const username = String(params.u || '').trim();
    const password = String(params.p || '');
    const validUser = getProp_('APP_USERNAME', 'nunuanugraha');
    const validPass = getProp_('APP_PASSWORD', 'p@ssword123!');

    if (username === validUser && (password === validPass || password === 'p\\@ssword123!')) {
      const sessionToken = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
      CacheService.getScriptCache().put('session_' + sessionToken, validUser, 21600);
      return buatResponJson_({
        success: true,
        token: sessionToken,
        name: 'Nunu Anugraha'
      }, callback);
    }

    return buatResponJson_({ success: false, message: 'Username atau password salah!' }, callback);
  }

  if (!token || CacheService.getScriptCache().get('session_' + token) === null) {
    return buatResponJson_({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Sesi berakhir, silakan login kembali.'
    }, callback);
  }

  try {
    const ss = spreadsheet_();

    if (action === 'getDataPinjaman') {
      const sheet = ss.getSheetByName('Pinjaman');
      if (!sheet || sheet.getLastRow() <= 1) return buatResponJson_([], callback);

      const [headers, ...rows] = sheet.getDataRange().getValues();
      const paymentSheet = ss.getSheetByName('Pembayaran');
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

      const data = barisKeObjek_(headers, rows.reverse()).map(item => {
        item.bungaSudahDibayar = bungaPerPeriode.has(
          String(item.id).trim() + '|' + String(item.jatuhTempo).trim()
        );
        return item;
      });
      return buatResponJson_(data, callback);
    }

    if (action === 'getTrackerData') {
      const sheet = ss.getSheetByName('Tracker');
      if (!sheet || sheet.getLastRow() <= 1) return buatResponJson_([], callback);
      const [headers, ...rows] = sheet.getDataRange().getValues();
      return buatResponJson_(barisKeObjek_(headers, rows.reverse()), callback);
    }

    if (action === 'getRiwayatPembayaran') {
      const sheet = ss.getSheetByName('Pembayaran');
      const sheetPinjaman = ss.getSheetByName('Pinjaman');
      if (!sheet || sheet.getLastRow() <= 1) return buatResponJson_([], callback);

      const [headers, ...rows] = sheet.getDataRange().getValues();
      const namaMap = {};
      if (sheetPinjaman) {
        sheetPinjaman.getDataRange().getValues().slice(1).forEach(row => {
          namaMap[String(row[0]).trim()] = row[1];
        });
      }

      const riwayat = barisKeObjek_(headers, rows.reverse()).map(item => {
        item.namaPeminjam = namaMap[String(item.loanId).trim()] || 'Data Terhapus';
        return item;
      });
      return buatResponJson_(riwayat, callback);
    }

    return buatResponJson_({ success: true, message: 'Server Online' }, callback);
  } catch (err) {
    return buatResponJson_({ success: false, error: err.message }, callback);
  }
}

function doPost(e) {
  try {
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    const token = payload.token;
    if (!token || CacheService.getScriptCache().get('session_' + token) === null) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'UNAUTHORIZED'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const action = payload.action;
    const data = payload.data || payload;
    const ss = spreadsheet_();

    if (action === 'tambahPinjaman') {
      const sheet = ss.getSheetByName('Pinjaman');
      const nominal = angka_(data.nominalPinjaman);
      const bungaPersen = parseFloat(data.bungaPersen) || 30;
      const bungaNominal = Math.round(nominal * (bungaPersen / 100));
      const total = nominal + bungaNominal;
      const tanggalPinjam = new Date(data.tanggalPinjam);
      const jatuhTempo = formatTanggal_(tanggalPinjam.getDate() <= 21
        ? new Date(tanggalPinjam.getFullYear(), tanggalPinjam.getMonth(), 22)
        : new Date(tanggalPinjam.getFullYear(), tanggalPinjam.getMonth() + 1, 7));

      sheet.appendRow([
        Utilities.getUuid(), data.nama, data.telepon, data.tanggalPinjam, nominal,
        bungaPersen, bungaNominal, total, jatuhTempo, 0, total, 'Belum Lunas', data.catatan
      ]);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: 'Pinjaman berhasil ditambahkan'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'prosesCicilan') {
      const sheetPinjaman = ss.getSheetByName('Pinjaman');
      const paymentSheet = ss.getSheetByName('Pembayaran');
      const values = sheetPinjaman.getDataRange().getValues();
      const rowIndex = cariBaris_(values, data.loanId);
      if (rowIndex === -1) throw new Error('ID pinjaman tidak ditemukan');

      const row = values[rowIndex];
      const nominalBayar = angka_(data.nominalPembayaran);
      const jenis = String(data.jenisPembayaran || 'pelunasan').toLowerCase();
      const totalBayar = Math.round(Number(row[7]) || 0);
      const totalDibayarSaatIni = Math.round(Number(row[9]) || 0);
      const jatuhTempoSaatIni = formatTanggal_(new Date(row[8]));

      paymentSheet.appendRow([
        Utilities.getUuid(), data.loanId, data.tanggalPembayaran, nominalBayar,
        data.catatan || '', jenis, jenis === 'bunga' ? jatuhTempoSaatIni : ''
      ]);

      if (jenis === 'pelunasan') {
        const totalDibayar = totalDibayarSaatIni + nominalBayar;
        const sisaTagihan = Math.max(totalBayar - totalDibayar, 0);
        sheetPinjaman.getRange(rowIndex + 1, 10, 1, 3).setValues([[
          totalDibayar, sisaTagihan, sisaTagihan === 0 ? 'Lunas' : 'Belum Lunas'
        ]]);
      } else {
        const jatuhTempoBerikutnya = hitungJatuhTempoBerikutnya_(jatuhTempoSaatIni);
        sheetPinjaman.getRange(rowIndex + 1, 9).setValue(jatuhTempoBerikutnya);
        sheetPinjaman.getRange(rowIndex + 1, 12).setValue('Sudah Bayar Bunga');
      }

      SpreadsheetApp.flush();
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: 'Pembayaran berhasil diproses'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'tambahTransaksiTracker') {
      const sheet = ss.getSheetByName('Tracker');
      sheet.appendRow([
        Utilities.getUuid(), data.tanggal, data.tipe, angka_(data.nominal),
        data.kategori, data.catatan
      ]);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: 'Transaksi kas berhasil dicatat'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'deletePinjaman') {
      const sheetPinjaman = ss.getSheetByName('Pinjaman');
      const rowIndex = cariBaris_(sheetPinjaman.getDataRange().getValues(), data.id || data);
      if (rowIndex !== -1) sheetPinjaman.deleteRow(rowIndex + 1);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: 'Data pinjaman dihapus'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
