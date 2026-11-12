/**
 * PinjamanKu Client API & Storage Engine
 * Menghubungkan Frontend ke Google Apps Script (Spreadsheet & Drive)
 * dengan Fallback Local Storage cerdas & offline caching
 */

const STORAGE_KEYS = {
  API_URL: 'pinjamanku_gas_api_url',
  AUTH: 'pinjamanku_auth_session',
  PINJAMAN: 'pinjamanku_data_pinjaman',
  TRACKER: 'pinjamanku_data_tracker',
  PEMBAYARAN: 'pinjamanku_data_pembayaran',
  CONFIG: 'pinjamanku_app_config'
};

// Default Sample Data jika API belum diset / offline pertama kali
const DEFAULT_SAMPLE_PINJAMAN = [
  {
    id: "LOAN-DEMO-001",
    nama: "Budi Santoso",
    telepon: "081234567890",
    tanggalPinjam: "2026-11-01",
    nominalPinjaman: 2000000,
    bungaPersen: 30,
    bungaNominal: 600000,
    totalBayar: 2600000,
    jatuhTempo: "2026-11-22",
    totalDibayar: 0,
    sisaTagihan: 2600000,
    status: "Belum Lunas",
    catatan: "Modal usaha warung sembako",
    bungaSudahDibayar: false
  },
  {
    id: "LOAN-DEMO-002",
    nama: "Siti Rahma",
    telepon: "085712345678",
    tanggalPinjam: "2026-10-25",
    nominalPinjaman: 1500000,
    bungaPersen: 30,
    bungaNominal: 450000,
    totalBayar: 1950000,
    jatuhTempo: "2026-11-07",
    totalDibayar: 0,
    sisaTagihan: 1950000,
    status: "Belum Lunas",
    catatan: "Biaya renovasi kios",
    bungaSudahDibayar: false
  },
  {
    id: "LOAN-DEMO-003",
    nama: "Ahmad Fauzi",
    telepon: "087890123456",
    tanggalPinjam: "2026-10-10",
    nominalPinjaman: 1000000,
    bungaPersen: 30,
    bungaNominal: 300000,
    totalBayar: 1300000,
    jatuhTempo: "2026-10-22",
    totalDibayar: 1300000,
    sisaTagihan: 0,
    status: "Lunas",
    catatan: "Keperluan perlengkapan bengkel",
    bungaSudahDibayar: true
  }
];

const DEFAULT_SAMPLE_TRACKER = [
  {
    id: "TRX-DEMO-001",
    tanggal: "2026-11-10",
    tipe: "Pemasukan",
    nominal: 1300000,
    kategori: "Pelunasan",
    catatan: "Pelunasan Ahmad Fauzi"
  },
  {
    id: "TRX-DEMO-002",
    tanggal: "2026-11-01",
    tipe: "Pengeluaran",
    nominal: 2000000,
    kategori: "Pencairan Pinjaman",
    catatan: "Pencairan pinjaman Budi Santoso"
  },
  {
    id: "TRX-DEMO-003",
    tanggal: "2026-10-25",
    tipe: "Pengeluaran",
    nominal: 1500000,
    kategori: "Pencairan Pinjaman",
    catatan: "Pencairan pinjaman Siti Rahma"
  }
];

const DEFAULT_SAMPLE_PEMBAYARAN = [
  {
    id: "PAY-DEMO-001",
    loanId: "LOAN-DEMO-003",
    namaPeminjam: "Ahmad Fauzi",
    tanggalPembayaran: "2026-10-22",
    nominalPembayaran: 1300000,
    jenisPembayaran: "pelunasan",
    catatan: "Pelunasan penuh via transfer BCA",
    periodeBunga: ""
  }
];

class AppStorage {
  static getApiUrl() {
    return localStorage.getItem(STORAGE_KEYS.API_URL) || '';
  }

  static setApiUrl(url) {
    if (url) {
      localStorage.setItem(STORAGE_KEYS.API_URL, url.trim());
    } else {
      localStorage.removeItem(STORAGE_KEYS.API_URL);
    }
  }

  static getAuth() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.AUTH);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  static setAuth(authObj) {
    localStorage.setItem(STORAGE_KEYS.AUTH, JSON.stringify(authObj));
  }

  static clearAuth() {
    localStorage.removeItem(STORAGE_KEYS.AUTH);
  }

  static checkAuth() {
    const auth = this.getAuth();
    if (!auth || !auth.isLoggedIn) {
      window.location.replace('login.html');
      return false;
    }
    return true;
  }

  // Local Data Cache Handlers
  static getLocalData(key, defaultVal) {
    try {
      const d = localStorage.getItem(key);
      return d ? JSON.parse(d) : defaultVal;
    } catch (e) {
      return defaultVal;
    }
  }

  static setLocalData(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }

  static initDataIfEmpty() {
    if (!localStorage.getItem(STORAGE_KEYS.PINJAMAN)) {
      this.setLocalData(STORAGE_KEYS.PINJAMAN, DEFAULT_SAMPLE_PINJAMAN);
    }
    if (!localStorage.getItem(STORAGE_KEYS.TRACKER)) {
      this.setLocalData(STORAGE_KEYS.TRACKER, DEFAULT_SAMPLE_TRACKER);
    }
    if (!localStorage.getItem(STORAGE_KEYS.PEMBAYARAN)) {
      this.setLocalData(STORAGE_KEYS.PEMBAYARAN, DEFAULT_SAMPLE_PEMBAYARAN);
    }
  }
}

// Ensure initial demo data exists in local storage
AppStorage.initDataIfEmpty();

/**
 * Universal API Client:
 * Mengakses Google Apps Script via fetch (CORS friendly via no-cors or JSON redirect),
 * atau fallback ke LocalStorage jika offline / API URL belum diset.
 */
class PinjamanAPI {
  static isApiConnected() {
    return Boolean(AppStorage.getApiUrl());
  }

  static async request(action, method = 'GET', data = null) {
    const apiUrl = AppStorage.getApiUrl();
    if (!apiUrl) {
      // Offline / Local Mode
      return this.handleLocalOperation(action, data);
    }

    try {
      if (method === 'GET') {
        const url = new URL(apiUrl);
        url.searchParams.append('action', action);
        url.searchParams.append('_t', Date.now()); // anti-cache
        const res = await fetch(url.toString(), {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });
        const result = await res.json();
        // Update local cache on successful fetch
        this.syncCache(action, result);
        return result;
      } else {
        // GAS Web App CORS trick: Menggunakan format POST URLSearchParams atau JSON
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8' // Text plain prevents CORS preflight OPTIONS in GAS
          },
          body: JSON.stringify({ action: action, data: data })
        });
        const result = await res.json();
        // Update local state mirrors
        this.handleLocalOperation(action, data);
        return result;
      }
    } catch (err) {
      console.warn(`[PinjamanAPI] Gagal request online (${action}), menggunakan fallback lokal:`, err);
      return this.handleLocalOperation(action, data);
    }
  }

  static syncCache(action, data) {
    if (action === 'getDataPinjaman' && Array.isArray(data)) {
      AppStorage.setLocalData(STORAGE_KEYS.PINJAMAN, data);
    } else if (action === 'getTrackerData' && Array.isArray(data)) {
      AppStorage.setLocalData(STORAGE_KEYS.TRACKER, data);
    } else if (action === 'getRiwayatPembayaran' && Array.isArray(data)) {
      AppStorage.setLocalData(STORAGE_KEYS.PEMBAYARAN, data);
    }
  }

  static handleLocalOperation(action, payload) {
    let pinjaman = AppStorage.getLocalData(STORAGE_KEYS.PINJAMAN, DEFAULT_SAMPLE_PINJAMAN);
    let tracker = AppStorage.getLocalData(STORAGE_KEYS.TRACKER, DEFAULT_SAMPLE_TRACKER);
    let pembayaran = AppStorage.getLocalData(STORAGE_KEYS.PEMBAYARAN, DEFAULT_SAMPLE_PEMBAYARAN);

    switch (action) {
      case 'getDataPinjaman':
        return pinjaman;

      case 'getTrackerData':
        return tracker;

      case 'getRiwayatPembayaran':
        return pembayaran;

      case 'tambahPinjaman': {
        const t = this.hitungTagihanLokal(payload);
        const newItem = {
          id: "LOAN-" + Date.now().toString(36).toUpperCase(),
          nama: payload.nama,
          telepon: payload.telepon || '',
          tanggalPinjam: payload.tanggalPinjam,
          nominalPinjaman: t.nominal,
          bungaPersen: t.bungaPersen,
          bungaNominal: t.bungaNominal,
          totalBayar: t.totalBayar,
          jatuhTempo: t.jatuhTempo,
          totalDibayar: 0,
          sisaTagihan: t.totalBayar,
          status: 'Belum Lunas',
          catatan: payload.catatan || '',
          bungaSudahDibayar: false
        };
        pinjaman.unshift(newItem);
        AppStorage.setLocalData(STORAGE_KEYS.PINJAMAN, pinjaman);
        return { success: true, message: 'Data pinjaman berhasil disimpan.' };
      }

      case 'editPinjaman': {
        const index = pinjaman.findIndex(p => String(p.id).trim() === String(payload.id).trim());
        if (index === -1) throw new Error('Data pinjaman tidak ditemukan');
        const t = this.hitungTagihanLokal(payload);
        const currentPaid = Number(pinjaman[index].totalDibayar) || 0;
        const sisa = Math.max(t.totalBayar - currentPaid, 0);

        pinjaman[index] = {
          ...pinjaman[index],
          nama: payload.nama,
          telepon: payload.telepon,
          tanggalPinjam: payload.tanggalPinjam,
          nominalPinjaman: t.nominal,
          bungaPersen: t.bungaPersen,
          bungaNominal: t.bungaNominal,
          totalBayar: t.totalBayar,
          jatuhTempo: t.jatuhTempo,
          sisaTagihan: sisa,
          status: sisa <= 0 ? 'Lunas' : 'Belum Lunas',
          catatan: payload.catatan || ''
        };
        AppStorage.setLocalData(STORAGE_KEYS.PINJAMAN, pinjaman);
        return { success: true, message: 'Data pinjaman berhasil diperbarui.' };
      }

      case 'deletePinjaman': {
        const id = String(payload.id || payload).trim();
        pinjaman = pinjaman.filter(p => String(p.id).trim() !== id);
        pembayaran = pembayaran.filter(p => String(p.loanId).trim() !== id);
        AppStorage.setLocalData(STORAGE_KEYS.PINJAMAN, pinjaman);
        AppStorage.setLocalData(STORAGE_KEYS.PEMBAYARAN, pembayaran);
        return { success: true, message: 'Data pinjaman dan riwayat cicilan berhasil dihapus.' };
      }

      case 'prosesCicilan': {
        const targetId = String(payload.loanId).trim();
        const pIndex = pinjaman.findIndex(p => String(p.id).trim() === targetId);
        if (pIndex === -1) throw new Error('Data pinjaman tidak ditemukan.');

        const item = pinjaman[pIndex];
        const nominal = Number(String(payload.nominalPembayaran).replace(/\D/g, '')) || 0;
        const jenis = String(payload.jenisPembayaran || 'pelunasan').toLowerCase();
        const tglBayar = payload.tanggalPembayaran || new Date().toISOString().split('T')[0];

        // Catat riwayat
        pembayaran.unshift({
          id: "PAY-" + Date.now().toString(36).toUpperCase(),
          loanId: targetId,
          namaPeminjam: item.nama,
          tanggalPembayaran: tglBayar,
          nominalPembayaran: nominal,
          jenisPembayaran: jenis,
          catatan: payload.catatan || '',
          periodeBunga: jenis === 'bunga' ? item.jatuhTempo : ''
        });

        if (jenis === 'pelunasan') {
          const totalDibayarBaru = (Number(item.totalDibayar) || 0) + nominal;
          const sisaBaru = Math.max((Number(item.totalBayar) || 0) - totalDibayarBaru, 0);
          pinjaman[pIndex].totalDibayar = totalDibayarBaru;
          pinjaman[pIndex].sisaTagihan = sisaBaru;
          pinjaman[pIndex].status = sisaBaru <= 0 ? 'Lunas' : 'Belum Lunas';
          AppStorage.setLocalData(STORAGE_KEYS.PINJAMAN, pinjaman);
          AppStorage.setLocalData(STORAGE_KEYS.PEMBAYARAN, pembayaran);
          return { success: true, message: 'Pelunasan penuh berhasil dicatat.' };
        } else {
          // Bayar bunga: majukan jatuh tempo ke siklus 22 <-> 7
          const nextDue = this.hitungJatuhTempoBerikutnya(item.jatuhTempo);
          pinjaman[pIndex].jatuhTempo = nextDue;
          pinjaman[pIndex].status = 'Sudah Bayar Bunga';
          pinjaman[pIndex].bungaSudahDibayar = true;
          AppStorage.setLocalData(STORAGE_KEYS.PINJAMAN, pinjaman);
          AppStorage.setLocalData(STORAGE_KEYS.PEMBAYARAN, pembayaran);
          return { success: true, message: `Pembayaran bunga dicatat. Jatuh tempo berikutnya: ${nextDue}` };
        }
      }

      case 'tambahTransaksiTracker': {
        const newItem = {
          id: "TRX-" + Date.now().toString(36).toUpperCase(),
          tanggal: payload.tanggal,
          tipe: payload.tipe,
          nominal: Number(String(payload.nominal).replace(/\D/g, '')) || 0,
          kategori: payload.kategori,
          catatan: payload.catatan || ''
        };
        tracker.unshift(newItem);
        AppStorage.setLocalData(STORAGE_KEYS.TRACKER, tracker);
        return { success: true, message: 'Transaksi berhasil dicatat.' };
      }

      case 'editTransaksiTracker': {
        const index = tracker.findIndex(t => String(t.id).trim() === String(payload.id).trim());
        if (index === -1) throw new Error('Data transaksi tidak ditemukan.');
        tracker[index] = {
          ...tracker[index],
          tanggal: payload.tanggal,
          tipe: payload.tipe,
          nominal: Number(String(payload.nominal).replace(/\D/g, '')) || 0,
          kategori: payload.kategori,
          catatan: payload.catatan || ''
        };
        AppStorage.setLocalData(STORAGE_KEYS.TRACKER, tracker);
        return { success: true, message: 'Data transaksi berhasil diperbarui.' };
      }

      case 'hapusTransaksiTracker': {
        const id = String(payload.id || payload).trim();
        tracker = tracker.filter(t => String(t.id).trim() !== id);
        AppStorage.setLocalData(STORAGE_KEYS.TRACKER, tracker);
        return { success: true, message: 'Data transaksi berhasil dihapus.' };
      }

      default:
        return { success: true };
    }
  }

  static hitungTagihanLokal(data) {
    const nominal = Number(String(data.nominalPinjaman).replace(/\D/g, '')) || 0;
    const bungaPersen = parseFloat(data.bungaPersen) || 30;
    const bungaNominal = Math.round(nominal * (bungaPersen / 100));
    const totalBayar = nominal + bungaNominal;
    
    const tgl = new Date(data.tanggalPinjam || new Date());
    const day = tgl.getDate();
    let jatuhTempoDate;
    if (day <= 21) {
      jatuhTempoDate = new Date(tgl.getFullYear(), tgl.getMonth(), 22);
    } else {
      jatuhTempoDate = new Date(tgl.getFullYear(), tgl.getMonth() + 1, 7);
    }
    const jatuhTempo = jatuhTempoDate.toISOString().split('T')[0];

    return { nominal, bungaPersen, bungaNominal, totalBayar, jatuhTempo };
  }

  static hitungJatuhTempoBerikutnya(jatuhTempoStr) {
    const d = new Date(jatuhTempoStr + 'T12:00:00');
    if (isNaN(d.getTime())) return jatuhTempoStr;
    let next;
    if (d.getDate() === 22) {
      next = new Date(d.getFullYear(), d.getMonth() + 1, 7);
    } else {
      next = new Date(d.getFullYear(), d.getMonth(), 22);
    }
    return next.toISOString().split('T')[0];
  }
}

// Utility Formatter Global
const Utils = {
  formatRupiah(number) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(Number(number) || 0);
  },

  formatAngka(value) {
    const number = Math.max(0, Math.round(Number(value) || 0));
    return String(number).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  },

  parseAngka(value) {
    return Number(String(value || '').replace(/\D/g, '')) || 0;
  },

  formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  },

  formatInputRibuan(input) {
    const val = input.value.replace(/\D/g, '');
    input.value = val ? Utils.formatAngka(val) : '';
  },

  escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }
};

// Global Notification Alert
function showAlert(message, type = 'success') {
  let container = document.getElementById('globalAlertContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'globalAlertContainer';
    container.className = 'fixed top-5 right-5 z-[9999] flex flex-col gap-2 max-w-sm w-full px-4 pointer-events-none';
    document.body.appendChild(container);
  }

  const alertBox = document.createElement('div');
  const isSuccess = type === 'success';
  alertBox.className = `pointer-events-auto transform transition-all duration-300 ease-out translate-y-2 opacity-0 flex items-start gap-3 p-4 rounded-2xl shadow-xl border ${
    isSuccess ? 'bg-white border-emerald-100 text-emerald-800' : 'bg-white border-rose-100 text-rose-800'
  }`;
  
  alertBox.innerHTML = `
    <div class="w-8 h-8 rounded-xl flex-shrink-0 grid place-items-center ${isSuccess ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'} text-lg">
      <i class="ph-fill ${isSuccess ? 'ph-check-circle' : 'ph-warning-circle'}"></i>
    </div>
    <div class="flex-1 min-w-0">
      <h4 class="font-bold text-sm text-slate-800">${isSuccess ? 'Berhasil' : 'Perhatian'}</h4>
      <p class="text-xs text-slate-600 mt-0.5">${message}</p>
    </div>
    <button onclick="this.parentElement.remove()" class="text-slate-400 hover:text-slate-600 text-sm">
      <i class="ph-bold ph-x"></i>
    </button>
  `;

  container.appendChild(alertBox);
  setTimeout(() => {
    alertBox.classList.remove('translate-y-2', 'opacity-0');
  }, 10);

  setTimeout(() => {
    alertBox.classList.add('translate-y-2', 'opacity-0');
    setTimeout(() => alertBox.remove(), 300);
  }, 4000);
}
