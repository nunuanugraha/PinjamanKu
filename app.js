/**
 * PinjamanKu Client API & Storage Engine (Secure Session & Anti-CORS Version)
 * Tidak ada kredensial login atau Spreadsheet ID sensitif yang diekspos di client.
 */

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
    localStorage.removeItem(STORAGE_KEYS.PINJAMAN);
    localStorage.removeItem(STORAGE_KEYS.TRACKER);
    localStorage.removeItem(STORAGE_KEYS.PEMBAYARAN);
  }

  static checkAuth() {
    const auth = this.getAuth();
    if (!auth || !auth.isLoggedIn || !auth.token) {
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

  // Request aman JSONP untuk membaca data tanpa blokir CORS
  static fetchJsonp(url) {
    return new Promise((resolve, reject) => {
      const callbackName = 'gas_cb_' + Math.round(1000000 * Math.random());
      const script = document.createElement('script');
      
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Koneksi ke server timeout'));
      }, 15000);

      function cleanup() {
        if (script.parentNode) script.parentNode.removeChild(script);
        delete window[callbackName];
        clearTimeout(timeout);
      }

      window[callbackName] = function(data) {
        cleanup();
        resolve(data);
      };

      script.onerror = function() {
        cleanup();
        reject(new Error('Gagal memuat respon dari server Apps Script'));
      };

      const sep = url.includes('?') ? '&' : '?';
      script.src = `${url}${sep}callback=${callbackName}&_t=${Date.now()}`;
      document.body.appendChild(script);
    });
  }

  // Verifikasi login langsung ke server Google Apps Script (tanpa simpan password di GitHub)
  static async login(username, password) {
    const apiUrl = AppStorage.getApiUrl();
    const url = `${apiUrl}?action=login&u=${encodeURIComponent(username)}&p=${encodeURIComponent(password)}`;
    return await this.fetchJsonp(url);
  }

  static async request(action, method = 'GET', data = null) {
    const apiUrl = AppStorage.getApiUrl();
    const auth = AppStorage.getAuth();
    const token = auth ? auth.token : '';

    try {
      if (method === 'GET') {
        const url = `${apiUrl}?action=${encodeURIComponent(action)}&token=${encodeURIComponent(token)}`;
        const result = await this.fetchJsonp(url);

        if (result && result.error === 'UNAUTHORIZED') {
          AppStorage.clearAuth();
          window.location.replace('login.html');
          return [];
        }

        this.syncCache(action, result);
        return Array.isArray(result) ? result : [];
      } else {
        // Operasi POST untuk simpan / ubah / hapus data
        const payload = {
          token: token,
          action: action,
          data: data
        };

        await fetch(apiUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: JSON.stringify(payload)
        });

        return { success: true };
      }
    } catch (err) {
      console.warn(`[PinjamanAPI] Gagal request (${action}), menggunakan cache:`, err);
      if (action === 'getDataPinjaman') return AppStorage.getLocalData(STORAGE_KEYS.PINJAMAN, []);
      if (action === 'getTrackerData') return AppStorage.getLocalData(STORAGE_KEYS.TRACKER, []);
      if (action === 'getRiwayatPembayaran') return AppStorage.getLocalData(STORAGE_KEYS.PEMBAYARAN, []);
      return { success: true };
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
