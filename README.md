# PinjamanKu - Web Version (GitHub Pages Ready)

Aplikasi manajemen pinjaman, bunga periodik (siklus 7 & 22), money tracker kas, dan kalkulator keuntungan yang dapat di-deploy langsung ke **GitHub Pages** secara gratis, dengan database yang terhubung ke **Google Sheets** dan penyimpanan lampiran di **Google Drive**.

---

## 🚀 Fitur Utama
1. **Web Standar Statis (100% Cocok GitHub Pages)**:
   - Tidak memerlukan server Node.js / PHP berbayar.
   - Menggunakan HTML5, Tailwind CSS modern, Phosphor Icons, dan Pure JavaScript.
2. **Database Fleksibel**:
   - **Google Sheets & Google Drive**: Sinkronisasi online real-time lewat Google Apps Script Web App.
   - **Offline / Local Mode**: Jika koneksi terputus atau URL Apps Script belum diisi, aplikasi tetap berjalan lancar menggunakan `localStorage`.
3. **Fitur Pinjaman Lengkap**:
   - Tambah debitur, hitung bunga otomatis (default 30% atau custom).
   - Perhitungan jatuh tempo otomatis berdasarkan siklus tanggal 22 dan tanggal 7.
   - Opsi pembayaran bunga saja (memperpanjang siklus tanpa memotong pokok).
   - Opsi pelunasan penuh.
   - Riwayat pembayaran lengkap & filter pencarian.
4. **Money Tracker Kas**:
   - Catat pemasukan & pengeluaran kas operasional.
   - Ringkasan saldo kas real-time.
5. **Kalkulator Keuangan**:
   - Simulasi laba pinjaman bunga flat vs compound.
   - Kalkulator matematika harian terintegrasi.
6. **Autentikasi Aman**:
   - Username default: `nunuanugraha`
   - Password default: `p@ssword123!`

---

## 📁 Struktur File Proyek
```text
PinjamanKu/
├── index.html                  # Halaman pembuka / redirector
├── login.html                  # Halaman login otentikasi
├── dashboard.html              # Ringkasan statistik & metrik
├── pinjaman.html               # Pengelolaan debitur, bayar bunga & pelunasan
├── tracker.html                # Money tracker kas masuk & keluar
├── calculator.html             # Kalkulator bunga & laba
├── app.js                      # Mesin API Universal, Google Sheets Bridge & Local Storage
├── GoogleAppsScript_Deploy.js  # Kode Apps Script untuk backend Spreadsheet & Drive
└── README.md                   # Petunjuk penggunaan & deployment
```

---

## 🛠️ Langkah Menghubungkan ke Google Sheets & Drive

1. Buka spreadsheet Google Anda (atau buat baru) di [Google Sheets](https://sheets.google.com).
2. Klik menu **Extensions (Ekstensi)** > **Apps Script**.
3. Hapus kode default di editor, lalu salin dan tempel seluruh isi file **`GoogleAppsScript_Deploy.js`**.
4. Sesuaikan konstanta `SPREADSHEET_ID` di baris atas dengan ID Spreadsheet Anda (sudah otomatis terisi dengan ID bawaan proyek Anda).
5. Klik **Deploy** > **New deployment**:
   - Pilih type: **Web app**
   - **Execute as**: `Me` (Akun Anda)
   - **Who has access**: `Anyone` (Penting agar GitHub Pages bisa mengirim dan mengambil data)
6. Klik **Deploy** dan berikan izin akses (Authorize access).
7. Salin URL Web App yang dihasilkan (berakhiran `/exec`).
8. Buka aplikasi web PinjamanKu Anda, klik tombol **"Set DB"** atau **"Konfigurasi DB"**, lalu tempel URL tersebut. Klik **Simpan**. Selesai! Data Anda sekarang langsung terhubung dengan Google Spreadsheet & Drive!

---

## 🌐 Cara Deploy ke GitHub Pages

1. Buat repository baru di GitHub, contohnya `pinjamanku`.
2. Buka terminal di folder proyek ini dan jalankan:
   ```bash
   git add .
   git commit -m "Siap deploy ke GitHub Pages"
   git branch -M main
   git remote add origin https://github.com/USERNAME-ANDA/pinjamanku.git
   git push -u origin main
   ```
3. Buka repository Anda di GitHub:
   - Masuk ke tab **Settings** > **Pages**.
   - Pada bagian **Build and deployment** > **Branch**, pilih `main` dan folder `/ (root)`.
   - Klik **Save**.
4. Tunggu 1-2 menit, website Anda sudah aktif di URL:
   `https://USERNAME-ANDA.github.io/pinjamanku/`
