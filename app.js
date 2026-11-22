/**
 * PinjamanKu Client API & Storage Engine (Universal Login & Direct Data Engine)
 */

const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbwpKPcPnd74DMT32jnc4QRxNawo-KqmigkyG-8-GznZx06TxCaPs4-SFEYvaJSBs5E/exec';
const BACKUP_SPREADSHEET_ID = '1LUs1Ro7nUDNvD8rA-QNfsznXH4BMnHYdbfv6cv6CYOA';

const STORAGE_KEYS = {
  AUTH: 'pinjamanku_auth_session',
  PINJAMAN: 'pinjamanku_data_pinjaman',
  TRACKER: 'pinjamanku_data_tracker',
  PEMBAYARAN: 'pinjamanku_data_pembayaran',
  TRACKER_LOCK: 'pinjamanku_tracker_pin',
  TRACKER_SESSION: 'pinjamanku_tracker_unlocked'
};

class AppStorage {
  static getTrackerPin() {
    return localStorage.getItem(STORAGE_KEYS.TRACKER_LOCK) || '123456';
  }

  static setTrackerPin(newPin) {
    if (newPin && newPin.trim()) {
      localStorage.setItem(STORAGE_KEYS.TRACKER_LOCK, newPin.trim());
    }
  }

  static isTrackerUnlocked() {
    return sessionStorage.getItem(STORAGE_KEYS.TRACKER_SESSION) === 'true';
  }

  static setTrackerUnlocked(status = true) {
    if (status) {
      sessionStorage.setItem(STORAGE_KEYS.TRACKER_SESSION, 'true');
    } else {
      sessionStorage.removeItem(STORAGE_KEYS.TRACKER_SESSION);
    }
  }
  static getApiUrl() {
    return localStorage.getItem('pinjamanku_custom_api_url') || GAS_API_URL;
  }

  static setApiUrl(url) {
    if (url && url.trim()) {
      localStorage.setItem('pinjamanku_custom_api_url', url.trim());
    } else {
      localStorage.removeItem('pinjamanku_custom_api_url');
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
    if (!auth || !auth.isLoggedIn || !auth.serverAuth || !auth.token) {
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

  // Fungsi Hash SHA-256 di browser
  static async sha256(str) {
    const buffer = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  // Verifikasi login aman (Mendukung p@ssword123! dan varian p\@ssword123!)
  static async login(username, password) {
    const url = new URL(AppStorage.getApiUrl());
    const callbackName = `pinjamanLogin${Date.now()}${Math.random().toString(36).slice(2)}`;
    url.searchParams.set('action', 'login');
    url.searchParams.set('u', String(username || '').trim());
    url.searchParams.set('p', String(password || ''));
    url.searchParams.set('callback', callbackName);

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Waktu koneksi ke server login habis.'));
      }, 15000);

      const cleanup = () => {
        clearTimeout(timeout);
        delete window[callbackName];
        script.remove();
      };

      window[callbackName] = result => {
        cleanup();
        resolve(result);
      };
      script.onerror = () => {
        cleanup();
        reject(new Error('Tidak dapat terhubung ke server login.'));
      };
      script.src = url.toString();
      document.head.appendChild(script);
    });
  }

  // Mengambil data sheet
  static async fetchSheetDirect(sheetName) {
    const url = `https://docs.google.com/spreadsheets/d/${BACKUP_SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}&_t=${Date.now()}`;
    const res = await fetch(url);
    const text = await res.text();
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

  // Helper normalisasi tanggal Google Sheets (gviz) ke YYYY-MM-DD
  static normalizeDate(val) {
    if (!val) return '';
    if (typeof val === 'string' && val.startsWith('Date(')) {
      const parts = val.match(/\d+/g);
      if (parts && parts.length >= 3) {
        const y = parts[0];
        const m = String(parseInt(parts[1], 10) + 1).padStart(2, '0');
        const d = String(parts[2]).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }
    return String(val).slice(0, 10);
  }

  static async request(action, method = 'GET', data = null) {
    try {
      if (method === 'GET') {
        if (action === 'getDataPinjaman') {
          const rows = await this.fetchSheetDirect('Pinjaman');
          const result = rows.map(r => ({
            id: r.id || r.ID || '',
            nama: r.nama || r.Nama || 'Tanpa Nama',
            telepon: r.telepon || r.Telepon || '',
            tanggalPinjam: this.normalizeDate(r.tanggalPinjam || r.TanggalPinjam),
            nominalPinjaman: Number(r.nominalPinjaman || r.NominalPinjaman || 0),
            bungaPersen: Number(r.bungaPersen || r.BungaPersen || 30),
            bungaNominal: Number(r.bungaNominal || r.BungaNominal || 0),
            totalBayar: Number(r.totalBayar || r.TotalBayar || 0),
            jatuhTempo: this.normalizeDate(r.jatuhTempo || r.JatuhTempo),
            totalDibayar: Number(r.totalDibayar || r.TotalDibayar || 0),
            sisaTagihan: Number(r.sisaTagihan || r.SisaTagihan || 0),
            status: r.status || r.Status || 'Belum Lunas',
            catatan: r.catatan || r.Catatan || '',
            bungaSudahDibayar: String(r.status || '').toLowerCase().includes('bunga')
          })).reverse();

          AppStorage.setLocalData(STORAGE_KEYS.PINJAMAN, result);
          return result;
        }

        if (action === 'getTrackerData') {
          const rows = await this.fetchSheetDirect('Tracker');
          const result = rows.map(r => ({
            id: r.id || '',
            tanggal: this.normalizeDate(r.tanggal),
            tipe: r.tipe || 'Pemasukan',
            nominal: Number(r.nominal || 0),
            kategori: r.kategori || 'Umum',
            catatan: r.catatan || ''
          })).reverse();

          AppStorage.setLocalData(STORAGE_KEYS.TRACKER, result);
          return result;
        }

        if (action === 'getRiwayatPembayaran') {
          const rows = await this.fetchSheetDirect('Pembayaran');
          const result = rows.map(r => ({
            id: r.id || '',
            loanId: r.loanId || '',
            namaPeminjam: r.namaPeminjam || r.loanId || 'Pembayaran',
            tanggalPembayaran: this.normalizeDate(r.tanggalPembayaran),
            nominalPembayaran: Number(r.nominalPembayaran || 0),
            jenisPembayaran: r.jenisPembayaran || 'pelunasan',
            catatan: r.catatan || ''
          })).reverse();

          AppStorage.setLocalData(STORAGE_KEYS.PEMBAYARAN, result);
          return result;
        }
      } else {
        // Operasi POST
        const auth = AppStorage.getAuth();
        if (!auth || !auth.token) {
          throw new Error('Sesi login tidak valid. Silakan keluar lalu masuk kembali.');
        }

        const res = await fetch(AppStorage.getApiUrl(), {
          method: 'POST',
          mode: 'no-cors',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: action, data: data, token: auth.token })
        });
        return { success: true, pending: res.type === 'opaque' };
      }
    } catch (err) {
      console.warn(`[PinjamanAPI] Gagal fetch (${action}):`, err);
      if (method !== 'GET') throw err;
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
