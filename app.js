/**
 * PinjamanKu Client API & Storage Engine (Google Sheets Direct Gviz - 100% CORS-Proof)
 */

const SPREADSHEET_ID = '1LUs1Ro7nUDNvD8rA-QNfsznXH4BMnHYdbfv6cv6CYOA';
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbzdX75QkP-B6C2DNLkv2Xh5v4R-RIhlVDh9ZfpqbjfuJbI1qSgpreMBdbh3k_7YrvDL/exec';

const STORAGE_KEYS = {
  AUTH: 'pinjamanku_auth_session',
  PINJAMAN: 'pinjamanku_data_pinjaman',
  TRACKER: 'pinjamanku_data_tracker',
  PEMBAYARAN: 'pinjamanku_data_pembayaran'
};

class AppStorage {
  static getApiUrl() {
    return GAS_API_URL;
  }

  static setApiUrl(url) {
    // disimpan untuk keperluan POST
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
}

class PinjamanAPI {
  static isApiConnected() {
    return true;
  }

  // Mengambil sheet langsung lewat Google Visualization API (Bebas CORS 100%)
  static async fetchSheet(sheetName) {
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}&_t=${Date.now()}`;
    const res = await fetch(url);
    const text = await res.text();
    
    // Parsing respons gviz
    const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const data = JSON.parse(jsonStr);
    
    if (!data.table || !data.table.rows) return [];
    
    const headers = data.table.cols.map(c => (c ? c.label || c.id : ''));
    return data.table.rows.map(row => {
      const obj = {};
      row.c.forEach((cell, idx) => {
        const header = headers[idx];
        if (header) {
          obj[header] = cell ? (cell.v !== null ? cell.v : cell.f) : '';
        }
      });
      return obj;
    });
  }

  static async request(action, method = 'GET', data = null) {
    try {
      if (method === 'GET') {
        if (action === 'getDataPinjaman') {
          const rows = await this.fetchSheet('Pinjaman');
          // Format & mapping data agar kompatibel dengan UI
          const result = rows.map(r => ({
            id: r.id || r.ID || '',
            nama: r.nama || r.Nama || 'Tanpa Nama',
            telepon: r.telepon || r.Telepon || '',
            tanggalPinjam: r.tanggalPinjam || r.TanggalPinjam || '',
            nominalPinjaman: Number(r.nominalPinjaman || r.NominalPinjaman || 0),
            bungaPersen: Number(r.bungaPersen || r.BungaPersen || 30),
            bungaNominal: Number(r.bungaNominal || r.BungaNominal || 0),
            totalBayar: Number(r.totalBayar || r.TotalBayar || 0),
            jatuhTempo: r.jatuhTempo || r.JatuhTempo || '',
            totalDibayar: Number(r.totalDibayar || r.TotalDibayar || 0),
            sisaTagihan: Number(r.sisaTagihan || r.SisaTagihan || 0),
            status: r.status || r.Status || 'Belum Lunas',
            catatan: r.catatan || r.Catatan || '',
            bungaSudahDibayar: String(r.status || '').toLowerCase().includes('bunga')
          })).reverse(); // urutan terbaru di atas

          AppStorage.setLocalData(STORAGE_KEYS.PINJAMAN, result);
          return result;
        }

        if (action === 'getTrackerData') {
          const rows = await this.fetchSheet('Tracker');
          const result = rows.map(r => ({
            id: r.id || '',
            tanggal: r.tanggal || '',
            tipe: r.tipe || 'Pemasukan',
            nominal: Number(r.nominal || 0),
            kategori: r.kategori || 'Umum',
            catatan: r.catatan || ''
          })).reverse();

          AppStorage.setLocalData(STORAGE_KEYS.TRACKER, result);
          return result;
        }

        if (action === 'getRiwayatPembayaran') {
          const rows = await this.fetchSheet('Pembayaran');
          const result = rows.map(r => ({
            id: r.id || '',
            loanId: r.loanId || '',
            namaPeminjam: r.namaPeminjam || r.loanId || 'Pembayaran',
            tanggalPembayaran: r.tanggalPembayaran || '',
            nominalPembayaran: Number(r.nominalPembayaran || 0),
            jenisPembayaran: r.jenisPembayaran || 'pelunasan',
            catatan: r.catatan || ''
          })).reverse();

          AppStorage.setLocalData(STORAGE_KEYS.PEMBAYARAN, result);
          return result;
        }
      } else {
        // Operasi POST menggunakan Apps Script Web App
        await fetch(GAS_API_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: JSON.stringify({ action: action, data: data })
        });
        return { success: true };
      }
    } catch (err) {
      console.warn(`[PinjamanAPI] Gagal fetch gviz (${action}), beralih ke cache lokal:`, err);
      return AppStorage.getLocalData(STORAGE_KEYS.PINJAMAN, []);
    }
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
    // Handle format gviz Date(yyyy,m,d)
    if (typeof dateStr === 'string' && dateStr.startsWith('Date(')) {
      const parts = dateStr.match(/\d+/g);
      if (parts) {
        const d = new Date(parts[0], parts[1], parts[2]);
        return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
      }
    }
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
  alertBox.className = `pointer-events-auto flex items-start gap-3 p-4 rounded-2xl shadow-xl border ${
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
  setTimeout(() => alertBox.remove(), 4000);
}
