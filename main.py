"""
main.py - IDU Price Manager
App desktop Tkinter per gestione listini fornitori
"""
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext
import threading
import os
import logging
from datetime import datetime

# ── cartella dati (database, CSV, log) ─────────────────────────────────────────
# Va creata PRIMA di configurare il logging, perché il file di log vive qui.
HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")
os.makedirs(DATA_DIR, exist_ok=True)
LOG_PATH = os.path.join(DATA_DIR, 'idu_price_manager.log')

# ── logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(name)s: %(message)s',
    handlers=[
        logging.FileHandler(LOG_PATH, encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

import db
import price_engine
import scraper
import scheduler
import export_mexal
import stock_engine
import documents
import carico


# ── rilevamento file Mexal (Opzione "collega a Mexal") ─────────────────────────
def _detect_mexal_file(prefix: str):
    """
    Cerca <prefix>_*.csv nelle cartelle azienda di Mexal (es. anar_idu.csv).
    Preferisce l'azienda 'idu'; in mancanza, il file più recente. None se assente.
    """
    import glob
    cands = []
    for root in (r"C:\mexal\dati\datiaz", r"D:\mexal\dati\datiaz"):
        cands += glob.glob(os.path.join(root, "*", f"{prefix}_*.csv"))
    if not cands:
        return None
    cands.sort(key=lambda p: os.path.getmtime(p), reverse=True)
    for p in cands:
        if os.path.basename(os.path.dirname(p)).lower() == "idu":
            return p
    return cands[0]

# ── palette colori ────────────────────────────────────────────────────────────
BG       = '#eef1f5'   # sfondo principale (grigio chiaro)
BG2      = '#ffffff'   # pannelli / schede (bianco)
ACCENT   = '#2563eb'   # blu accento
ACCENT2  = '#16a34a'   # verde (conferma)
WARN     = '#d97706'   # arancione
DANGER   = '#dc2626'   # rosso
FG       = '#1f2937'   # testo scuro
FG2      = '#6b7280'   # testo attenuato
CARD     = '#f3f4f6'   # campi / card (grigio chiarissimo)
ROW_ALT  = '#f7f8fa'   # righe alternate nelle tabelle
BTN      = '#64748b'   # colore default dei pulsanti (testo bianco)
FONT     = ('Segoe UI', 10)
FONT_B   = ('Segoe UI', 10, 'bold')
FONT_H   = ('Segoe UI', 14, 'bold')
FONT_S   = ('Segoe UI', 9)


class IDUApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("IDU Price Manager")
        self.geometry("1200x750")
        self.configure(bg=BG)
        self.minsize(900, 600)

        # Init DB
        db.init_db()

        self._build_ui()
        self._apply_styles()

        # Opzione "collega a Mexal": precompila i percorsi dei file veri
        self._prefill_mexal_paths()

        # Check aggiornamento settimanale automatico
        self.after(1500, self._auto_weekly_check)

    def _prefill_mexal_paths(self):
        """Rileva e precompila i file Mexal (anar per import/export, anpr per
        il carico magazzino), così l'utente non deve sfogliarli ogni volta."""
        anar = _detect_mexal_file("anar")
        if anar:
            if not self.import_path_var.get():
                self.import_path_var.set(anar)
            if not self.export_orig_var.get():
                self.export_orig_var.set(anar)
            self._log(self.import_log,
                      f"📁 File Mexal rilevato automaticamente:\n   {anar}\n"
                      "   Premi ▶ Importa per caricarlo (o cambia percorso).")
        anpr = _detect_mexal_file("anpr")
        if anpr:
            if hasattr(self, 'mag_anpr_var') and not self.mag_anpr_var.get():
                self.mag_anpr_var.set(anpr)
            if hasattr(self, 'doc_anpr_var') and not self.doc_anpr_var.get():
                self.doc_anpr_var.set(anpr)

    # ── UI principale ─────────────────────────────────────────────────────────

    def _build_ui(self):
        # Header
        hdr = tk.Frame(self, bg=BG, pady=8)
        hdr.pack(fill='x', padx=16)
        tk.Label(hdr, text="IDU Price Manager", font=FONT_H,
                 bg=BG, fg=ACCENT).pack(side='left')
        tk.Label(hdr, text="Gestione Listini Fornitori",
                 font=FONT_S, bg=BG, fg=FG2).pack(side='left', padx=12, pady=4)

        # Notebook tabs
        self.nb = ttk.Notebook(self)
        self.nb.pack(fill='both', expand=True, padx=12, pady=(0, 8))

        self.tab_import    = tk.Frame(self.nb, bg=BG2)
        self.tab_articles  = tk.Frame(self.nb, bg=BG2)
        self.tab_documenti = tk.Frame(self.nb, bg=BG2)
        self.tab_upload    = tk.Frame(self.nb, bg=BG2)
        self.tab_pdf_order = tk.Frame(self.nb, bg=BG2)
        self.tab_scraper   = tk.Frame(self.nb, bg=BG2)
        self.tab_batch     = tk.Frame(self.nb, bg=BG2)
        self.tab_suppliers = tk.Frame(self.nb, bg=BG2)
        self.tab_creds     = tk.Frame(self.nb, bg=BG2)
        self.tab_schedule  = tk.Frame(self.nb, bg=BG2)

        self.nb.add(self.tab_import,    text="  📥 Importa / Esporta Mexal  ")
        self.nb.add(self.tab_articles,  text="  🔍 Articoli  ")
        self.nb.add(self.tab_documenti, text="  🧾 Documenti Fornitore  ")
        self.nb.add(self.tab_upload,    text="  💾 Upload Listino  ")
        self.nb.add(self.tab_pdf_order, text="  📄 Ordine PDF  ")
        self.nb.add(self.tab_scraper,   text="  🌐 Ricerca Portali  ")
        self.nb.add(self.tab_batch,     text="  🚀 Ricerca Massiva  ")
        self.nb.add(self.tab_suppliers, text="  🏭 Fornitori  ")
        self.nb.add(self.tab_creds,     text="  🔐 Credenziali Portali  ")
        self.nb.add(self.tab_schedule,  text="  🕐 Pianificazione  ")

        self._build_tab_import()
        self._build_tab_articles()
        self._build_tab_documenti()
        self._build_tab_upload()
        self._build_tab_pdf_order()
        self._build_tab_scraper()
        self._build_tab_batch()
        self._build_tab_suppliers()
        self._build_tab_credentials()
        self._build_tab_schedule()

        # Status bar (con sottile separatore sopra)
        self.status_var = tk.StringVar(value="Pronto.")
        sb = tk.Label(self, textvariable=self.status_var,
                      font=FONT_S, bg=BG, fg=FG2, anchor='w', padx=12, pady=3)
        sb.pack(fill='x', side='bottom')
        tk.Frame(self, bg=CARD, height=1).pack(fill='x', side='bottom')

    # ── TAB: Importa CSV Mexal ────────────────────────────────────────────────

    def _build_tab_import(self):
        f = self.tab_import
        _section(f, "Importa anagrafica articoli da CSV Mexal (anar_idu.csv)")

        # Istruzione
        tk.Label(f, text=(
            "Esporta il file da Mexal con nome anar_idu.csv, poi selezionalo qui sotto.\n"
            "Puoi anche incollare direttamente il percorso nel campo testo."
        ), font=FONT_S, bg=BG2, fg=FG2, justify='left').pack(padx=20, pady=(4,0), anchor='w')

        # Riga percorso: campo editabile + sfoglia + cerca automatico
        row = tk.Frame(f, bg=BG2)
        row.pack(fill='x', padx=20, pady=8)

        self.import_path_var = tk.StringVar(value="")
        path_entry = tk.Entry(row, textvariable=self.import_path_var,
                              font=FONT_S, bg=CARD, fg=FG, insertbackground=FG,
                              width=55)
        path_entry.pack(side='left', padx=(0, 6))

        _btn(row, "📂 Sfoglia…",
             self._browse_import_csv).pack(side='left', padx=4)
        _btn(row, "🔍 Cerca sul PC",
             self._autofind_csv, color=ACCENT).pack(side='left', padx=4)
        _btn(row, "▶  Importa",
             self._run_import, color=ACCENT2).pack(side='left', padx=4)

        # Hint percorsi comuni
        hint_frame = tk.LabelFrame(f, text=" Percorsi tipici dove trovare il file ",
                                   bg=BG2, fg=FG2, font=FONT_S)
        hint_frame.pack(fill='x', padx=20, pady=4)
        hints = [
            r"C:\Users\{utente}\Desktop\anar_idu.csv",
            r"C:\Users\{utente}\Documents\anar_idu.csv",
            r"C:\mexal\dati\datiaz\idu\anar_idu.csv",
            r"C:\mexal\esportazioni\anar_idu.csv",
        ]
        for h in hints:
            row_h = tk.Frame(hint_frame, bg=BG2)
            row_h.pack(fill='x', padx=4, pady=1)
            tk.Label(row_h, text=h, font=('Consolas', 8),
                     bg=BG2, fg=FG2).pack(side='left')
            _btn(row_h, "Usa", lambda p=h: self._set_hint_path(p),
                 color=BTN).pack(side='left', padx=4)

        self.import_progress = ttk.Progressbar(f, mode='determinate')
        self.import_progress.pack(fill='x', padx=20, pady=4)

        self.import_log = _log_box(f, height=6)

        # ── SEZIONE EXPORT: genera CSV aggiornato per Mexal ──
        _section(f, "📤 Esporta CSV aggiornato per Mexal")
        tk.Label(f, text=(
            "Genera un nuovo CSV identico ad anar_idu.csv ma con i prezzi fornitore aggiornati.\n"
            "Pronto da reimportare in Mexal. NON modifica nulla sui portali, è solo un file."
        ), font=FONT_S, bg=BG2, fg=FG2, justify='left').pack(padx=20, pady=2, anchor='w')

        exp_row = tk.Frame(f, bg=BG2)
        exp_row.pack(fill='x', padx=20, pady=6)
        tk.Label(exp_row, text="File originale di riferimento:",
                 font=FONT_S, bg=BG2, fg=FG).pack(side='left')
        self.export_orig_var = tk.StringVar(value="")
        tk.Entry(exp_row, textvariable=self.export_orig_var,
                 font=FONT_S, bg=CARD, fg=FG, insertbackground=FG, width=40
                 ).pack(side='left', padx=6)
        _btn(exp_row, "📂 Sfoglia…",
             self._browse_export_orig).pack(side='left', padx=4)
        _btn(exp_row, "📤 Genera CSV aggiornato",
             self._run_export_mexal, color=ACCENT2).pack(side='left', padx=4)

        self.export_listini_var = tk.BooleanVar(value=True)
        tk.Checkbutton(
            f, text="Ricalcola anche i listini di vendita (BASE/INSTALL/APPALTI/INGROSS) "
                    "dalle categorie prezzi",
            variable=self.export_listini_var, font=FONT_S, bg=BG2, fg=FG,
            selectcolor=CARD, activebackground=BG2, activeforeground=FG
        ).pack(padx=20, pady=(2, 0), anchor='w')

    def _browse_export_orig(self):
        start = DATA_DIR
        # Precompila col CSV già usato per l'import, se presente
        if self.import_path_var.get() and os.path.exists(self.import_path_var.get()):
            self.export_orig_var.set(self.import_path_var.get())
            return
        p = filedialog.askopenfilename(
            title="Seleziona il anar_idu.csv originale",
            initialdir=start,
            filetypes=[("CSV", "*.csv"), ("Tutti i file", "*.*")])
        if p:
            self.export_orig_var.set(p)

    def _run_export_mexal(self):
        orig = self.export_orig_var.get().strip()
        # Fallback: usa il file di import o quello nella cartella app
        if not orig or not os.path.exists(orig):
            candidate = self.import_path_var.get().strip()
            if candidate and os.path.exists(candidate):
                orig = candidate
            else:
                local = os.path.join(DATA_DIR, "anar_idu.csv")
                if os.path.exists(local):
                    orig = local
        if not orig or not os.path.exists(orig):
            messagebox.showerror("Errore",
                "Seleziona il file anar_idu.csv originale (serve per la struttura).")
            return

        # Chiede dove salvare. Propone la CARTELLA di Mexal e il nome 'anar_idu.csv'
        # (nome/posizione che Mexal cerca per l'import): così l'export "atterra"
        # nel posto giusto, come il file che ha funzionato. Confermando si
        # sovrascrive l'originale (l'app fa scrittura sicura via file temporaneo).
        mexal_dir = os.path.dirname(orig)
        out = filedialog.asksaveasfilename(
            title="Salva per Mexal (consigliato: anar_idu.csv nella cartella Mexal)",
            defaultextension=".csv",
            filetypes=[("CSV", "*.csv")],
            initialdir=mexal_dir,
            initialfile="anar_idu.csv"
        )
        if not out:
            return

        self.import_log.delete('1.0', 'end')
        self.import_progress['value'] = 0
        ricalcola = self.export_listini_var.get()

        def _task():
            def prog(i, tot):
                pct = int(i / tot * 100) if tot else 0
                self._set_progress(self.import_progress, pct)

            def log(msg):
                self._log(self.import_log, msg)

            try:
                res = export_mexal.export_to_mexal_csv(
                    orig, out, progress_cb=prog, log_cb=log,
                    ricalcola_listini=ricalcola)
                self._set_progress(self.import_progress, 100)
                self._log(self.import_log,
                    f"\n📤 File pronto per Mexal:\n   {out}\n"
                    f"   {res['articoli_aggiornati']} articoli con prezzi aggiornati.")
                self._ui(lambda: messagebox.showinfo("Export completato",
                    f"CSV salvato:\n{out}\n\n"
                    f"Articoli aggiornati: {res['articoli_aggiornati']}\n"
                    f"Prezzi modificati: {res['prezzi_modificati']}\n\n"
                    "Ora importalo in Mexal (Trasferimento archivi → Caricamento "
                    "ASCII/CSV) con Importazione definitiva = S."))
            except Exception as e:
                self._log(self.import_log, f"❌ Errore export: {e}")
                logger.exception("Export Mexal")

        threading.Thread(target=_task, daemon=True).start()

    def _set_hint_path(self, path: str):
        """Imposta il percorso suggerito nel campo testo."""
        real = path.replace("{utente}", os.environ.get("USERNAME", "utente"))
        self.import_path_var.set(real)
        self._log(self.import_log, f"Percorso impostato: {real}\n"
                  "Verifica che il file esista, poi clicca ▶ Importa.")

    def _autofind_csv(self):
        """Cerca anar_idu.csv su Desktop, Documenti, C:\\ e cartella app."""
        self._log(self.import_log, "Ricerca automatica di anar_idu.csv in corso…")
        target = "anar_idu.csv"
        search_roots = [
            DATA_DIR,
            r"C:\mexal\dati\datiaz",
            os.path.dirname(os.path.abspath(__file__)),
            os.path.join(os.path.expanduser("~"), "Desktop"),
            os.path.join(os.path.expanduser("~"), "Documents"),
            os.path.join(os.path.expanduser("~"), "Downloads"),
            os.path.expanduser("~"),
        ]
        # Aggiungi radici di drive Windows
        for letter in "CDEFGH":
            drive = f"{letter}:\\"
            if os.path.exists(drive):
                search_roots.append(drive)

        found = []
        skip_dirs = {'windows', 'program files', 'program files (x86)',
                     'programdata', '$recycle.bin', 'appdata',
                     'node_modules', '__pycache__'}

        def _search():
            visited = set()
            for root in search_roots:
                if found:
                    break  # già trovato nelle cartelle utente: non scandire i drive interi
                norm = os.path.normcase(os.path.normpath(root))
                if norm in visited or not os.path.isdir(root):
                    continue
                visited.add(norm)
                try:
                    for dirpath, dirnames, files in os.walk(root):
                        # Pota la discesa: max 4 livelli, niente cartelle di sistema
                        depth = dirpath[len(root):].count(os.sep)
                        if depth >= 4:
                            dirnames[:] = []
                        else:
                            dirnames[:] = [d for d in dirnames
                                           if not d.startswith(('.', '$'))
                                           and d.lower() not in skip_dirs]
                        for fname in files:
                            if fname.lower() == target.lower():
                                found.append(os.path.join(dirpath, fname))
                        if len(found) >= 5:
                            break
                except (PermissionError, OSError):
                    continue

            if found:
                self._log(self.import_log,
                          f"✅ Trovati {len(found)} file:\n" +
                          "\n".join(f"  → {p}" for p in found))
                # Imposta automaticamente il primo trovato
                self._ui(lambda: self.import_path_var.set(found[0]))
                self._log(self.import_log,
                          f"\nPercorso impostato: {found[0]}")
            else:
                self._log(self.import_log,
                          "❌ File anar_idu.csv non trovato automaticamente.\n"
                          "   Usa 'Sfoglia…' per navigare manualmente,\n"
                          "   oppure incolla il percorso completo nel campo testo.")

        threading.Thread(target=_search, daemon=True).start()

    def _browse_import_csv(self):
        # Parte dalla cartella dell'app, poi Desktop, poi home utente
        start_dirs = [
            DATA_DIR,                                            # cartella dati
            os.path.join(os.path.expanduser("~"), "Desktop"),    # Desktop
            os.path.expanduser("~"),                              # Home utente
            "C:\\",
        ]
        initial_dir = next((d for d in start_dirs if os.path.isdir(d)), "C:\\")

        p = filedialog.askopenfilename(
            title="Seleziona file CSV Mexal (es. anar_idu.csv)",
            initialdir=initial_dir,
            filetypes=[
                ("File CSV", "*.csv"),
                ("File di testo", "*.txt"),
                ("Tutti i file", "*.*"),   # fallback: mostra tutto
            ]
        )
        if p:
            self.import_path_var.set(p)
            self._log(self.import_log, f"File selezionato: {p}")

    def _run_import(self):
        path = self.import_path_var.get()
        if not os.path.exists(path):
            messagebox.showerror("Errore", "Seleziona un file CSV valido.")
            return
        self.import_log.delete('1.0', 'end')
        self._log(self.import_log, f"Import avviato: {os.path.basename(path)}")
        self.import_progress['value'] = 0

        def _task():
            def prog(i, tot):
                pct = int(i / tot * 100) if tot else 0
                self._set_progress(self.import_progress, pct)
                self._log(self.import_log, f"  {i}/{tot} righe elaborate…", replace=True)

            try:
                res = db.import_from_csv(path, progress_callback=prog)
                self._set_progress(self.import_progress, 100)
                self._log(self.import_log,
                    f"✅ Import completato:\n"
                    f"   • {res['articoli']} articoli distinti nel database "
                    f"({res['righe']} righe del CSV elaborate)\n"
                    f"   • {res['rel_nuove']} relazioni fornitore nuove\n"
                    f"   • {res['rel_aggiornate']} relazioni aggiornate\n"
                    f"   • {res['rel_totali']} relazioni fornitore totali nel database")
                if res['rel_nuove'] == 0 and res['rel_totali'] > 0:
                    self._log(self.import_log,
                        "\nℹ Nessuna relazione NUOVA perché erano già presenti nel database.\n"
                        "   I tuoi dati sono completi: vai sul tab 'Articoli' per verificarli.")
                self._set_status(
                    f"Import OK: {res['articoli']} articoli, "
                    f"{res['rel_totali']} relazioni fornitore totali.")
            except Exception as e:
                self._log(self.import_log, f"❌ Errore: {e}")
                logger.exception("Import CSV")

        threading.Thread(target=_task, daemon=True).start()

    # ── TAB: Articoli ─────────────────────────────────────────────────────────

    def _build_tab_articles(self):
        f = self.tab_articles
        _section(f, "Ricerca articoli e prezzi per fornitore")

        # Search bar
        row = tk.Frame(f, bg=BG2)
        row.pack(fill='x', padx=20, pady=8)
        self.art_search_var = tk.StringVar()
        tk.Label(row, text="Cerca:", font=FONT, bg=BG2, fg=FG).pack(side='left')
        e = tk.Entry(row, textvariable=self.art_search_var,
                     font=FONT, bg=CARD, fg=FG, insertbackground=FG, width=40)
        e.pack(side='left', padx=8)
        e.bind('<Return>', lambda *_: self._search_articles())
        _btn(row, "🔍 Cerca", self._search_articles).pack(side='left')

        # Risultati articoli
        cols_a = ('codice', 'descrizione', 'um', 'costo_base', 'n_fornitori')
        self.art_tree = _tree(f, cols_a,
                              headings=('Codice', 'Descrizione', 'UM', 'Prezzo Base', '# Fornitori'),
                              widths=(120, 380, 50, 100, 90))
        self.art_tree.bind('<<TreeviewSelect>>', self._on_article_select)

        # Dettaglio fornitori
        _section(f, "Fornitori dell'articolo selezionato")
        cols_f = ('fornitore', 'nome', 'cod_forn', 'prezzo_forn', 'prezzo_base', 'verificato')
        self.forn_tree = _tree(f, cols_f,
                               headings=('Cod. Mexal', 'Nome', 'Cod. Fornitore',
                                         'Prezzo Forn.', 'Prezzo Base', 'Ultima verifica'),
                               widths=(100, 160, 120, 100, 100, 130))
        # Storico
        _btn(f, "📋 Storico prezzi articolo", self._show_history, color=ACCENT).pack(
            anchor='e', padx=20, pady=4)

        # ── Crea nuovo articolo (prodotto non ancora in Mexal) ──
        _section(f, "➕ Crea nuovo articolo (prodotto non ancora presente in Mexal)")
        naf = tk.LabelFrame(f, text=" Nuovo articolo ", bg=BG2, fg=FG2, font=FONT_S)
        naf.pack(fill='x', padx=20, pady=4)

        r1 = tk.Frame(naf, bg=BG2); r1.pack(fill='x', padx=6, pady=3)
        tk.Label(r1, text="Codice:", font=FONT_S, bg=BG2, fg=FG).pack(side='left')
        self.na_cod_var = tk.StringVar()
        tk.Entry(r1, textvariable=self.na_cod_var, font=FONT_S, bg=CARD, fg=FG,
                 insertbackground=FG, width=14).pack(side='left', padx=4)
        tk.Label(r1, text="Descrizione:", font=FONT_S, bg=BG2, fg=FG).pack(side='left', padx=(8, 0))
        self.na_des_var = tk.StringVar()
        tk.Entry(r1, textvariable=self.na_des_var, font=FONT_S, bg=CARD, fg=FG,
                 insertbackground=FG, width=40).pack(side='left', padx=4)

        r2 = tk.Frame(naf, bg=BG2); r2.pack(fill='x', padx=6, pady=3)
        tk.Label(r2, text="UM:", font=FONT_S, bg=BG2, fg=FG).pack(side='left')
        self.na_um_var = tk.StringVar(value="PZ")
        tk.Entry(r2, textvariable=self.na_um_var, font=FONT_S, bg=CARD, fg=FG,
                 insertbackground=FG, width=5).pack(side='left', padx=4)
        tk.Label(r2, text="IVA:", font=FONT_S, bg=BG2, fg=FG).pack(side='left', padx=(8, 0))
        self.na_iva_var = tk.StringVar(value="22")
        tk.Entry(r2, textvariable=self.na_iva_var, font=FONT_S, bg=CARD, fg=FG,
                 insertbackground=FG, width=4).pack(side='left', padx=4)
        tk.Label(r2, text="Categoria prezzi (1-27):", font=FONT_S, bg=BG2, fg=FG).pack(side='left', padx=(8, 0))
        self.na_cat_var = tk.StringVar()
        tk.Entry(r2, textvariable=self.na_cat_var, font=FONT_S, bg=CARD, fg=FG,
                 insertbackground=FG, width=4).pack(side='left', padx=4)
        tk.Label(r2, text="Costo:", font=FONT_S, bg=BG2, fg=FG).pack(side='left', padx=(8, 0))
        self.na_costo_var = tk.StringVar()
        tk.Entry(r2, textvariable=self.na_costo_var, font=FONT_S, bg=CARD, fg=FG,
                 insertbackground=FG, width=8).pack(side='left', padx=4)

        r3 = tk.Frame(naf, bg=BG2); r3.pack(fill='x', padx=6, pady=3)
        tk.Label(r3, text="(opz.) Fornitore:", font=FONT_S, bg=BG2, fg=FG).pack(side='left')
        self.na_forn_var = tk.StringVar()
        self.na_forn_cb = ttk.Combobox(r3, textvariable=self.na_forn_var,
                                       state='readonly', width=26)
        self.na_forn_cb.pack(side='left', padx=4)
        tk.Label(r3, text="Cod. forn.:", font=FONT_S, bg=BG2, fg=FG).pack(side='left', padx=(8, 0))
        self.na_cforn_var = tk.StringVar()
        tk.Entry(r3, textvariable=self.na_cforn_var, font=FONT_S, bg=CARD, fg=FG,
                 insertbackground=FG, width=14).pack(side='left', padx=4)
        tk.Label(r3, text="Prezzo:", font=FONT_S, bg=BG2, fg=FG).pack(side='left', padx=(8, 0))
        self.na_pforn_var = tk.StringVar()
        tk.Entry(r3, textvariable=self.na_pforn_var, font=FONT_S, bg=CARD, fg=FG,
                 insertbackground=FG, width=8).pack(side='left', padx=4)
        _btn(r3, "➕ Crea articolo", self._create_article, color=ACCENT2).pack(side='left', padx=10)

        tk.Label(naf, text=(
            "L'articolo viene aggiunto all'anar al prossimo '📤 Genera CSV aggiornato'. "
            "La categoria prezzi serve per calcolare i listini."
        ), font=FONT_S, bg=BG2, fg=FG2).pack(padx=6, pady=(0, 4), anchor='w')

        self._newart_refresh_forn_combo()

    def _search_articles(self):
        q = self.art_search_var.get().strip()
        if not q:
            return
        rows = db.search_articles(q)
        self.art_tree.delete(*self.art_tree.get_children())
        if not rows:
            self.status_var.set(f"Nessun articolo trovato per '{q}'.")
            return
        for r in rows:
            cb = r['costo_ult']
            self.art_tree.insert('', 'end', iid=str(r['id']),
                                 values=(r['codice'], r['descrizione'],
                                         r['um'], f"{cb:.4f}" if cb else '—',
                                         r['n_fornitori']))
        self.status_var.set(f"{len(rows)} articoli trovati per '{q}'.")

    def _on_article_select(self, _event=None):
        sel = self.art_tree.selection()
        if not sel:
            return
        art_id = int(sel[0])
        self._current_article_id = art_id
        rows = db.get_article_suppliers(art_id)
        self.forn_tree.delete(*self.forn_tree.get_children())
        for r in rows:
            pf = r['prezzo_fornitore']
            pb = r['prezzo_base']
            self.forn_tree.insert('', 'end',
                                  values=(r['codice_mexal'], r['nome'] or '—',
                                          r['codice_fornitore'] or '—',
                                          f"{pf:.4f}" if pf else '—',
                                          f"{pb:.4f}" if pb else '—',
                                          r['ultima_verifica'] or '—'))

    def _show_history(self):
        art_id = getattr(self, '_current_article_id', None)
        if not art_id:
            messagebox.showinfo("Info", "Seleziona prima un articolo.")
            return
        rows = db.get_price_history(art_id)
        win = tk.Toplevel(self)
        win.title("Storico prezzi")
        win.configure(bg=BG)
        win.geometry("760x420")
        # Centra sulla finestra principale
        self.update_idletasks()
        x = self.winfo_x() + (self.winfo_width() - 760) // 2
        y = self.winfo_y() + (self.winfo_height() - 420) // 2
        win.geometry(f"760x420+{x}+{y}")
        win.transient(self)
        win.grab_set()
        cols = ('data', 'fornitore', 'campo', 'vecchio', 'nuovo', 'motivo')
        t = _tree(win, cols,
                  headings=('Data', 'Fornitore', 'Campo', 'Vecchio', 'Nuovo', 'Motivo'),
                  widths=(130, 140, 140, 90, 90, 140))
        if not rows:
            t.insert('', 'end', values=('—', '—', 'Nessuna variazione registrata', '—', '—', '—'))
        for r in rows:
            t.insert('', 'end', values=(
                r['data_modifica'], r['fornitore_nome'] or r['codice_mexal'] or '—',
                r['campo'],
                f"{r['valore_vecchio']:.4f}" if r['valore_vecchio'] else '—',
                f"{r['valore_nuovo']:.4f}" if r['valore_nuovo'] else '—',
                r['motivo']
            ))

    def _newart_refresh_forn_combo(self):
        rows = db.get_all_suppliers()
        self._newart_forn_map = {f"{r['codice_mexal']} — {r['nome'] or 'N/D'}": r['id']
                                 for r in rows}
        self.na_forn_cb['values'] = [''] + list(self._newart_forn_map.keys())

    @staticmethod
    def _parse_float(s):
        try:
            s = str(s).strip().replace(',', '.')
            return float(s) if s else None
        except ValueError:
            return None

    def _create_article(self):
        cod = self.na_cod_var.get().strip()
        descr = self.na_des_var.get().strip()
        if not cod or not descr:
            messagebox.showerror("Errore", "Inserisci almeno Codice e Descrizione.")
            return
        cat = self.na_cat_var.get().strip()
        try:
            aid = db.create_article(
                cod, descr, um=self.na_um_var.get().strip() or 'PZ',
                iva=self.na_iva_var.get().strip() or '22',
                categoria=cat or None, costo=self._parse_float(self.na_costo_var.get()))
        except Exception as e:
            messagebox.showerror("Errore", f"Creazione articolo fallita: {e}")
            return
        fid = getattr(self, '_newart_forn_map', {}).get(self.na_forn_var.get())
        if fid:
            db.create_article_supplier_link(aid, fid, self.na_cforn_var.get().strip())
            pz = self._parse_float(self.na_pforn_var.get())
            if pz:
                db.apply_price_update(aid, fid, pz, 'nuovo_articolo')
        for v in (self.na_cod_var, self.na_des_var, self.na_cat_var,
                  self.na_costo_var, self.na_cforn_var, self.na_pforn_var):
            v.set('')
        self.na_forn_var.set('')
        messagebox.showinfo(
            "Creato", f"Articolo {cod} creato.\nVerrà aggiunto all'anar al prossimo "
            "'📤 Genera CSV aggiornato', poi reimportalo in Mexal.")

    # ── TAB: Documenti Fornitore ──────────────────────────────────────────────

    def _build_tab_documenti(self):
        f = self.tab_documenti
        _section(f, "🧾 Documenti fornitore — aggiorna codici, prezzi e giacenze da fattura/DDT")
        tk.Label(f, text=(
            "Carica una fattura o conferma d'ordine (PDF): l'app riconosce il fornitore, "
            "estrae codici/quantità/prezzi e li abbina agli articoli Mexal (anche se il "
            "codice fornitore è in slot diversi).\nI codici NUOVI li colleghi tu nell'area "
            "in basso. Niente viene scritto finché non premi ✅ Applica."
        ), font=FONT_S, bg=BG2, fg=FG2, justify='left').pack(padx=20, pady=2, anchor='w')

        row1 = tk.Frame(f, bg=BG2); row1.pack(fill='x', padx=20, pady=6)
        self.doc_file_var = tk.StringVar(value="Nessun file")
        tk.Label(row1, textvariable=self.doc_file_var, font=FONT_S, bg=BG2, fg=FG2,
                 width=42, anchor='w').pack(side='left')
        _btn(row1, "📂 Sfoglia PDF…", self._browse_doc).pack(side='left', padx=4)
        _btn(row1, "🔍 Analizza", self._run_doc_analyze, color=ACCENT).pack(side='left', padx=4)

        row2 = tk.Frame(f, bg=BG2); row2.pack(fill='x', padx=20, pady=2)
        tk.Label(row2, text="Fornitore:", font=FONT_S, bg=BG2, fg=FG).pack(side='left')
        self.doc_forn_var = tk.StringVar()
        self.doc_forn_cb = ttk.Combobox(row2, textvariable=self.doc_forn_var,
                                        state='readonly', width=32)
        self.doc_forn_cb.pack(side='left', padx=6)
        tk.Label(row2, text="(rilevato dal PDF; correggi se serve)",
                 font=FONT_S, bg=BG2, fg=FG2).pack(side='left', padx=6)

        cols = ('codice', 'mexal', 'descrizione', 'qta', 'netto', 'stato')
        self.doc_tree = _tree(
            f, cols,
            headings=('Cod. doc.', 'Cod. Mexal', 'Descrizione', 'Q.tà',
                      'Prezzo netto', 'Stato'),
            widths=(110, 110, 250, 55, 90, 130), height=9)
        self.doc_tree.tag_configure('nuovo', foreground=WARN)
        self.doc_tree.tag_configure('ok', foreground=ACCENT2)

        lf = tk.LabelFrame(
            f, text=" Collegamento guidato codici NUOVI  (una riga:  CODICE_DOC = CODICE_MEXAL) ",
            bg=BG2, fg=FG2, font=FONT_S)
        lf.pack(fill='x', padx=20, pady=4)
        self.doc_links_txt = tk.Text(lf, height=3, font=('Consolas', 9), bg=CARD,
                                     fg=FG, insertbackground=FG)
        self.doc_links_txt.pack(fill='x', padx=6, pady=4)
        _btn(lf, "↧ Precompila codici nuovi", self._doc_fill_links_template,
             color=BTN).pack(anchor='w', padx=6, pady=(0, 4))

        row3 = tk.Frame(f, bg=BG2); row3.pack(fill='x', padx=20, pady=4)
        self.doc_carico_var = tk.BooleanVar(value=True)
        tk.Checkbutton(row3, text="Genera carico magazzino (movimento da importare in Mexal)",
                       variable=self.doc_carico_var, font=FONT_S, bg=BG2, fg=FG,
                       selectcolor=CARD, activebackground=BG2,
                       activeforeground=FG).pack(side='left')
        tk.Label(row3, text="Causale:", font=FONT_S, bg=BG2, fg=FG).pack(side='left', padx=(12, 2))
        self.doc_causale_var = tk.StringVar(value="CL")
        tk.Entry(row3, textvariable=self.doc_causale_var, font=FONT_S, bg=CARD, fg=FG,
                 insertbackground=FG, width=5).pack(side='left', padx=4)
        tk.Label(row3, text="Magazzino:", font=FONT_S, bg=BG2, fg=FG).pack(side='left', padx=(8, 2))
        self.doc_mag_var = tk.StringVar(value="1")
        tk.Entry(row3, textvariable=self.doc_mag_var, font=FONT_S, bg=CARD, fg=FG,
                 insertbackground=FG, width=4).pack(side='left', padx=4)

        _btn(f, "✅ Applica (codici + prezzi + carico magazzino)",
             self._run_doc_apply, color=ACCENT2).pack(anchor='w', padx=20, pady=6)
        self.doc_log = _log_box(f, height=6)
        self._doc_refresh_forn_combo()

    def _doc_refresh_forn_combo(self):
        rows = db.get_all_suppliers()
        self._doc_forn_map = {f"{r['codice_mexal']} — {r['nome'] or 'N/D'}": r['id']
                              for r in rows}
        self.doc_forn_cb['values'] = list(self._doc_forn_map.keys())

    def _browse_doc(self):
        p = filedialog.askopenfilename(
            title="Documento fornitore (PDF)",
            initialdir=os.path.join(os.path.expanduser('~'), 'Downloads'),
            filetypes=[("PDF", "*.pdf"), ("Tutti", "*.*")])
        if p:
            self.doc_file_var.set(p)
            self._doc_path = p

    def _browse_doc_anpr(self):
        p = filedialog.askopenfilename(
            title="File anpr Mexal", initialdir=r"C:\mexal\dati\datiaz",
            filetypes=[("CSV", "*.csv"), ("Tutti", "*.*")])
        if p:
            self.doc_anpr_var.set(p)

    def _run_doc_analyze(self):
        path = getattr(self, '_doc_path', '')
        if not path or not os.path.exists(path):
            messagebox.showerror("Errore", "Seleziona un PDF.")
            return
        manual_fid = getattr(self, '_doc_forn_map', {}).get(self.doc_forn_var.get())
        self.doc_log.delete('1.0', 'end')
        self.doc_tree.delete(*self.doc_tree.get_children())
        self._log(self.doc_log, "Analisi documento…")

        def _task():
            try:
                fid, fmt = documents.detect_supplier_id(path)
                use_fid = fid or manual_fid
                # formato di lettura: dal fornitore scelto (es. Spolzino) o auto-rilevato
                fmt_use = documents.formato_per_fornitore(use_fid) or fmt or 'auto'
                items = documents.parse_items(path, fmt_use)
                if not items:
                    self._log(self.doc_log,
                              "Nessuna riga riconosciuta. Se il fornitore non è stato "
                              "rilevato, selezionalo dal menu a tendina e ri-analizza.")
                    return
                cls = documents.classify(items, use_fid) if use_fid else []
                self._doc_items = items
                self._doc_fid = use_fid

                def render():
                    if use_fid:
                        for label, i in getattr(self, '_doc_forn_map', {}).items():
                            if i == use_fid:
                                self.doc_forn_var.set(label)
                                break
                    import collections
                    cnt = collections.Counter(c['stato'] for c in cls)
                    self._doc_last_nuovi = [c['codice'] for c in cls if c['stato'] == 'nuovo']
                    for c in cls:
                        tag = ('nuovo' if c['stato'] == 'nuovo'
                               else ('ok' if c['stato'] == 'gia_collegato' else ''))
                        stato_txt = {'gia_collegato': 'già collegato',
                                     'auto_collega': 'auto-collega',
                                     'nuovo': 'NUOVO → collega'}.get(c['stato'], c['stato'])
                        self.doc_tree.insert(
                            '', 'end', tags=((tag,) if tag else ()),
                            values=(c['codice'], c['mexal'] or '—',
                                    (c['descrizione'] or '—')[:45],
                                    f"{c['qta']:.0f}" if c['qta'] else '—',
                                    f"{c['netto']:.4f}" if c['netto'] else '—',
                                    stato_txt))
                    if not use_fid:
                        self._log(self.doc_log,
                                  "Fornitore non rilevato: scegli dal menu a tendina e ri-analizza.")
                        return
                    self._log(self.doc_log,
                              f"Fornitore: {fmt or '?'} — Righe: {len(items)} | "
                              f"già collegati: {cnt.get('gia_collegato', 0)}, "
                              f"auto-collega: {cnt.get('auto_collega', 0)}, "
                              f"NUOVI da collegare: {cnt.get('nuovo', 0)}")
                    if cnt.get('nuovo'):
                        self._log(self.doc_log,
                                  "→ Per i NUOVI: 'Precompila codici nuovi' e scrivi il "
                                  "codice Mexal dopo l' '='.")

                self._ui(render)
            except Exception as e:
                self._log(self.doc_log, f"❌ Errore: {e}")
                logger.exception("Doc analyze")

        threading.Thread(target=_task, daemon=True).start()

    def _doc_fill_links_template(self):
        nuovi = getattr(self, '_doc_last_nuovi', [])
        if not nuovi:
            messagebox.showinfo("Info", "Nessun codice nuovo (analizza prima un documento).")
            return
        self.doc_links_txt.delete('1.0', 'end')
        self.doc_links_txt.insert('1.0', "\n".join(f"{c} = " for c in nuovi))

    def _parse_doc_links(self, text):
        links = {}
        for line in (text or '').splitlines():
            if '=' in line:
                a, b = line.split('=', 1)
                a, b = a.strip(), b.strip()
                if a and b:
                    links[a.upper()] = b
        return links

    def _run_doc_apply(self):
        items = getattr(self, '_doc_items', None)
        if not items:
            messagebox.showerror("Errore", "Analizza prima un documento.")
            return
        fid = (getattr(self, '_doc_forn_map', {}).get(self.doc_forn_var.get())
               or getattr(self, '_doc_fid', None))
        if not fid:
            messagebox.showerror("Errore", "Seleziona il fornitore.")
            return
        manual = self._parse_doc_links(self.doc_links_txt.get('1.0', 'end'))
        fai_carico = self.doc_carico_var.get()
        causale = self.doc_causale_var.get().strip() or 'CL'
        magazzino = self.doc_mag_var.get().strip() or '1'
        # il carico si salva nella cartella dati di Mexal
        mexal_dir = os.path.dirname(carico.MOTE_SRC)
        mote_out = os.path.join(mexal_dir, 'carico_mote.csv')
        mori_out = os.path.join(mexal_dir, 'carico_mori.csv')
        if not messagebox.askyesno(
                "Conferma",
                "Verranno aggiornati codici e prezzi nel database"
                + (f" e generato il carico (causale {causale}, mag. {magazzino})"
                   if fai_carico else "")
                + ".\nL'anar lo generi poi da '📥 Importa / Esporta Mexal'.\nProcedere?"):
            return
        self.doc_log.delete('1.0', 'end')

        def _task():
            try:
                rep = documents.apply_document(
                    items, fid, manual_links=manual,
                    genera_carico=fai_carico, causale=causale, magazzino=magazzino,
                    mote_out=mote_out, mori_out=mori_out,
                    log_cb=lambda m: self._log(self.doc_log, m))
                car = rep.get('carico')
                msg = (f"Aggiornati (già collegati): {len(rep['aggiornati'])}\n"
                       f"Auto-collegati: {len(rep['creati'])}\n"
                       f"Collegati manualmente: {len(rep['collegati_manuale'])}\n"
                       f"Non risolti (ancora da collegare): {len(rep['non_risolti'])}\n")
                if car:
                    msg += (f"\n📦 CARICO generato (causale {car['causale']}, "
                            f"{car['righe']} righe):\n   {mote_out}\n   {mori_out}\n"
                            "→ Importalo in Mexal: Trasferimento archivi → Caricamento "
                            "ASCII/CSV → Movimenti di magazzino.\n")
                msg += ("ORA per i prezzi/codici: '📥 Importa / Esporta Mexal' → "
                        "'Genera CSV aggiornato' per l'anar, poi reimporta in Mexal.")
                self._log(self.doc_log, msg)
                self._ui(lambda m=msg: messagebox.showinfo("Applicato", m))
            except Exception as e:
                self._log(self.doc_log, f"❌ Errore: {e}")
                logger.exception("Doc apply")

        threading.Thread(target=_task, daemon=True).start()

    # ── TAB: Upload Listino ───────────────────────────────────────────────────

    def _build_tab_upload(self):
        f = self.tab_upload
        _section(f, "Carica listino fornitore (CSV o PDF) e aggiorna i prezzi")

        # Selezione fornitore
        row1 = tk.Frame(f, bg=BG2)
        row1.pack(fill='x', padx=20, pady=6)
        tk.Label(row1, text="Fornitore:", font=FONT, bg=BG2, fg=FG).pack(side='left')
        self.upload_forn_var = tk.StringVar()
        self.upload_forn_cb = ttk.Combobox(row1, textvariable=self.upload_forn_var,
                                           state='readonly', width=30)
        self.upload_forn_cb.pack(side='left', padx=8)
        _btn(row1, "🔄 Aggiorna lista", self._refresh_supplier_combos).pack(side='left')

        # File
        row2 = tk.Frame(f, bg=BG2)
        row2.pack(fill='x', padx=20, pady=6)
        self.upload_file_var = tk.StringVar(value="Nessun file")
        tk.Label(row2, textvariable=self.upload_file_var,
                 font=FONT_S, bg=BG2, fg=FG2, width=50, anchor='w').pack(side='left')
        _btn(row2, "Sfoglia CSV…",
             lambda: self._browse_listino('csv')).pack(side='left', padx=4)
        _btn(row2, "Sfoglia PDF…",
             lambda: self._browse_listino('pdf')).pack(side='left', padx=4)

        # Mapping colonne CSV
        map_frame = tk.LabelFrame(f, text=" Mapping colonne CSV (ignorato per PDF) ",
                                  bg=BG2, fg=FG2, font=FONT_S)
        map_frame.pack(fill='x', padx=20, pady=6)
        tk.Label(map_frame, text="Colonna codice:", font=FONT_S, bg=BG2, fg=FG).grid(
            row=0, column=0, padx=8, pady=4, sticky='w')
        self.csv_col_cod = tk.Entry(map_frame, font=FONT_S, bg=CARD, fg=FG,
                                    insertbackground=FG, width=20)
        self.csv_col_cod.insert(0, "CODICE")
        self.csv_col_cod.grid(row=0, column=1, padx=4)
        tk.Label(map_frame, text="Colonna prezzo:", font=FONT_S, bg=BG2, fg=FG).grid(
            row=0, column=2, padx=8, sticky='w')
        self.csv_col_prz = tk.Entry(map_frame, font=FONT_S, bg=CARD, fg=FG,
                                    insertbackground=FG, width=20)
        self.csv_col_prz.insert(0, "PREZZO")
        self.csv_col_prz.grid(row=0, column=3, padx=4)
        tk.Label(map_frame, text="Separatore:", font=FONT_S, bg=BG2, fg=FG).grid(
            row=0, column=4, padx=8, sticky='w')
        self.csv_sep = tk.Entry(map_frame, font=FONT_S, bg=CARD, fg=FG,
                                insertbackground=FG, width=4)
        self.csv_sep.insert(0, ";")
        self.csv_sep.grid(row=0, column=5, padx=4)

        # Opzione: collega automaticamente i codici Mexal non ancora associati
        self.upload_autolink_var = tk.BooleanVar(value=True)
        tk.Checkbutton(
            f,
            text=("Crea automaticamente il collegamento fornitore quando il codice "
                  "esiste in Mexal ma non è ancora associato (codice + prezzo del listino)"),
            variable=self.upload_autolink_var,
            font=FONT_S, bg=BG2, fg=FG, selectcolor=CARD,
            activebackground=BG2, activeforeground=FG,
        ).pack(padx=20, pady=(2, 0), anchor='w')

        upl_btn_row = tk.Frame(f, bg=BG2)
        upl_btn_row.pack(fill='x', padx=20, pady=8)
        _btn(upl_btn_row, "▶  Avvia aggiornamento prezzi",
             self._run_upload, color=ACCENT2).pack(side='left')
        _btn(upl_btn_row, "📋 Articoli non trovati",
             self._show_not_found_window, color=WARN).pack(side='left', padx=8)

        self.upload_progress = ttk.Progressbar(f, mode='determinate')
        self.upload_progress.pack(fill='x', padx=20, pady=4)
        self.upload_log = _log_box(f, height=10)

    def _browse_listino(self, tipo):
        if tipo == 'csv':
            p = filedialog.askopenfilename(
                title="Listino CSV", filetypes=[("CSV", "*.csv"), ("Tutti", "*.*")])
        else:
            p = filedialog.askopenfilename(
                title="Listino PDF", filetypes=[("PDF", "*.pdf"), ("Tutti", "*.*")])
        if p:
            self.upload_file_var.set(p)
            self._upload_file_type = tipo

    def _run_upload(self):
        path = self.upload_file_var.get()
        if not os.path.exists(path):
            messagebox.showerror("Errore", "Seleziona un file.")
            return
        forn_label = self.upload_forn_var.get()
        forn_id = self._get_fornitore_id_from_label(forn_label)
        if not forn_id:
            messagebox.showerror("Errore", "Seleziona un fornitore valido.")
            return

        self.upload_log.delete('1.0', 'end')
        self.upload_progress['value'] = 0
        tipo = getattr(self, '_upload_file_type', 'csv')
        self._upload_last_label = forn_label

        col_codice = self.csv_col_cod.get()
        col_prezzo = self.csv_col_prz.get()
        sep = self.csv_sep.get() or ';'
        auto_link = self.upload_autolink_var.get()

        def _task():
            def prog(i, tot):
                pct = int(i / tot * 100) if tot else 0
                self._set_progress(self.upload_progress, pct)

            try:
                if tipo == 'csv':
                    results = price_engine.process_csv_listino(
                        path, forn_id,
                        col_codice=col_codice,
                        col_prezzo=col_prezzo,
                        sep=sep,
                        progress_cb=prog,
                        auto_link=auto_link
                    )
                else:
                    results = price_engine.process_pdf_listino(
                        path, forn_id, progress_cb=prog, formato='auto',
                        auto_link=auto_link)

                self._set_progress(self.upload_progress, 100)
                self._upload_results = results
                aggiornati = sum(1 for r in results if r.get('stato') == 'aggiornato')
                non_trovati = sum(1 for r in results if r.get('stato') == 'non_trovato')
                non_collegati = [r for r in results if r.get('stato') == 'codice_mexal_non_collegato']
                creati = [r for r in results if r.get('creato')]
                ambigui = [r for r in results if r.get('ambiguo')]

                self._log(self.upload_log,
                          f"✅ Completato: {aggiornati} aggiornati "
                          f"(di cui {len(creati)} con nuovo collegamento fornitore), "
                          f"{non_trovati} non trovati, "
                          f"{len(non_collegati)} da verificare, su {len(results)} righe.")

                # Collegamenti fornitore creati automaticamente
                if creati:
                    self._log(self.upload_log,
                        f"\n🔗 {len(creati)} collegamenti fornitore CREATI automaticamente "
                        f"(codice esistente in Mexal, non ancora associato):")
                    for r in creati[:30]:
                        self._log(self.upload_log,
                                  f"   • {r['codice']} → prezzo {r['new_pf']:.4f} €")
                    if len(creati) > 30:
                        self._log(self.upload_log,
                                  f"   … e altri {len(creati)-30}.")

                # Avvisi di ambiguità (codice fornitore = codice Mexal di altro articolo)
                if ambigui:
                    self._log(self.upload_log,
                        f"\n⚠ {len(ambigui)} codici AMBIGUI (aggiornato comunque "
                        f"il fornitore corretto):")
                    for r in ambigui[:10]:
                        self._log(self.upload_log, f"   • {r.get('nota','')}")

                # Codici da verificare manualmente
                if non_collegati:
                    self._log(self.upload_log,
                        f"\n⚠ {len(non_collegati)} codici da VERIFICARE "
                        f"(esistono in Mexal ma non collegati a questo fornitore):")
                    for r in non_collegati[:15]:
                        self._log(self.upload_log, f"   • {r.get('nota','')}")
                    if len(non_collegati) > 15:
                        self._log(self.upload_log,
                                  f"   … e altri {len(non_collegati)-15}.")

                # Dettaglio articoli aggiornati
                self._log(self.upload_log, "\n— Prezzi aggiornati —")
                n_shown = 0
                for r in results:
                    if r.get('stato') == 'aggiornato' and n_shown < 30:
                        netto = r.get('new_pf')
                        riga = f"  {r['codice']}: prezzo forn. → {netto:.4f} €"
                        if r.get('prezzo_lordo') and r.get('sconto'):
                            riga += f"  (lordo {r['prezzo_lordo']:.4f}, sc. {r['sconto']})"
                        if r.get('old_pb') != r.get('new_pb'):
                            riga += f"  ⬆ base {r['old_pb']:.4f} → {r['new_pb']:.4f}"
                        self._log(self.upload_log, riga)
                        n_shown += 1
                if aggiornati > 30:
                    self._log(self.upload_log, f"  … e altri {aggiornati - 30} articoli.")

                # Righe non applicate → apri la schermata dedicata
                problemi = sum(1 for r in results if r.get('stato') in
                               ('non_trovato', 'prezzo_non_valido',
                                'codice_mexal_non_collegato'))
                if problemi:
                    self._log(self.upload_log,
                        f"\n📋 {problemi} righe del listino non applicate: "
                        f"vedi finestra 'Articoli non trovati' (esportabile in CSV).")
                    self._ui(self._show_not_found_window)
            except Exception as e:
                self._log(self.upload_log, f"❌ Errore: {e}")
                logger.exception("Upload listino")

        threading.Thread(target=_task, daemon=True).start()

    # ── Finestra: articoli non trovati nell'ultimo upload ────────────────────

    _STATI_NON_APPLICATI = {
        'non_trovato': 'Non trovato in Mexal',
        'prezzo_non_valido': 'Prezzo non valido nel listino',
        'codice_mexal_non_collegato': 'Esiste in Mexal ma non collegato (verifica)',
    }

    def _show_not_found_window(self):
        results = getattr(self, '_upload_results', None)
        if not results:
            messagebox.showinfo("Info",
                "Nessun caricamento eseguito.\n"
                "Carica prima un listino con '▶ Avvia aggiornamento prezzi'.")
            return
        rows = [r for r in results
                if r.get('stato') in self._STATI_NON_APPLICATI]
        if not rows:
            messagebox.showinfo("Info",
                "Tutti i codici dell'ultimo listino sono stati trovati e applicati. ✅")
            return

        forn = getattr(self, '_upload_last_label', '')
        win = tk.Toplevel(self)
        win.title(f"Articoli non trovati — {len(rows)} righe")
        win.configure(bg=BG)
        w, h = 820, 480
        self.update_idletasks()
        x = self.winfo_x() + (self.winfo_width() - w) // 2
        y = self.winfo_y() + (self.winfo_height() - h) // 2
        win.geometry(f"{w}x{h}+{x}+{y}")
        win.transient(self)

        tk.Label(win, text=f"⚠ {len(rows)} righe del listino non applicate"
                           + (f"  —  fornitore: {forn}" if forn else ""),
                 font=FONT_B, bg=BG, fg=WARN, anchor='w').pack(
            fill='x', padx=20, pady=(12, 2))
        tk.Label(win, text=(
            "Questi codici non hanno aggiornato nessun prezzo. "
            "Controlla se in Mexal hanno un codice diverso, poi correggi il listino "
            "o collega l'articolo dal tab 'Articoli'."),
            font=FONT_S, bg=BG, fg=FG2, anchor='w', justify='left').pack(
            fill='x', padx=20)

        t = _tree(win, ('codice', 'prezzo', 'motivo'),
                  headings=('Codice listino', 'Prezzo listino', 'Motivo'),
                  widths=(170, 110, 460), height=15)
        for r in rows:
            pz = r.get('prezzo_listino')
            pz_txt = (f"{pz:.4f}" if pz is not None
                      else (r.get('prezzo_raw') or '—'))
            t.insert('', 'end', values=(
                r['codice'], pz_txt,
                self._STATI_NON_APPLICATI.get(r['stato'], r['stato'])))

        _btn(win, "💾 Esporta elenco CSV",
             lambda: self._export_not_found_csv(rows, win),
             color=ACCENT).pack(anchor='e', padx=20, pady=8)

    def _export_not_found_csv(self, rows, parent_win):
        import csv
        p = filedialog.asksaveasfilename(
            parent=parent_win,
            defaultextension=".csv",
            filetypes=[("CSV", "*.csv")],
            initialfile=f"non_trovati_{datetime.now().strftime('%Y%m%d_%H%M')}.csv")
        if not p:
            return
        with open(p, 'w', newline='', encoding='utf-8-sig') as f:
            w = csv.writer(f, delimiter=';')
            w.writerow(['codice', 'prezzo_listino', 'motivo', 'nota'])
            for r in rows:
                pz = r.get('prezzo_listino')
                w.writerow([
                    r['codice'],
                    f"{pz:.4f}".replace('.', ',') if pz is not None
                    else (r.get('prezzo_raw') or ''),
                    self._STATI_NON_APPLICATI.get(r['stato'], r['stato']),
                    r.get('nota', ''),
                ])
        messagebox.showinfo("Esportato", f"File salvato:\n{p}", parent=parent_win)

    # ── TAB: Carico Magazzino ─────────────────────────────────────────────────

    def _build_tab_magazzino(self):
        f = self.tab_magazzino
        _section(f, "📦 Carico magazzino — aggiorna le giacenze (file anpr Mexal)")
        tk.Label(f, text=(
            "Regola: nuova giacenza = max(esistenza attuale, 0) + quantità entrante.\n"
            "Se l'esistenza è negativa viene prima azzerata. L'app lavora su una COPIA: "
            "verifica l'anteprima e reimporta in Mexal solo dopo il controllo."
        ), font=FONT_S, bg=BG2, fg=FG2, justify='left').pack(padx=20, pady=2, anchor='w')

        row1 = tk.Frame(f, bg=BG2); row1.pack(fill='x', padx=20, pady=6)
        tk.Label(row1, text="File anpr:", font=FONT_S, bg=BG2, fg=FG).pack(side='left')
        self.mag_anpr_var = tk.StringVar()
        tk.Entry(row1, textvariable=self.mag_anpr_var, font=FONT_S, bg=CARD, fg=FG,
                 insertbackground=FG, width=46).pack(side='left', padx=6)
        _btn(row1, "📂 Sfoglia…", self._browse_mag_anpr).pack(side='left', padx=4)
        tk.Label(row1, text="Magazzino:", font=FONT_S, bg=BG2, fg=FG).pack(side='left', padx=(12, 2))
        self.mag_num_var = tk.StringVar(value="1")
        tk.Entry(row1, textvariable=self.mag_num_var, font=FONT_S, bg=CARD, fg=FG,
                 insertbackground=FG, width=4).pack(side='left')

        src = tk.LabelFrame(f, text=" Sorgente quantità entranti ",
                            bg=BG2, fg=FG2, font=FONT_S)
        src.pack(fill='x', padx=20, pady=6)
        self.mag_source_var = tk.StringVar(value="csv")
        for txt, val in (("CSV (codice + quantità)", "csv"),
                         ("PDF bolla/DDT", "pdf"),
                         ("Manuale (incolla righe)", "manuale")):
            tk.Radiobutton(src, text=txt, variable=self.mag_source_var, value=val,
                           font=FONT_S, bg=BG2, fg=FG, selectcolor=CARD,
                           activebackground=BG2, activeforeground=FG
                           ).pack(side='left', padx=8, pady=4)

        row2 = tk.Frame(f, bg=BG2); row2.pack(fill='x', padx=20, pady=4)
        self.mag_file_var = tk.StringVar(value="Nessun file")
        tk.Label(row2, textvariable=self.mag_file_var, font=FONT_S, bg=BG2, fg=FG2,
                 width=42, anchor='w').pack(side='left')
        _btn(row2, "Sfoglia CSV…", lambda: self._browse_mag_file('csv')).pack(side='left', padx=4)
        _btn(row2, "Sfoglia PDF…", lambda: self._browse_mag_file('pdf')).pack(side='left', padx=4)

        mapf = tk.Frame(f, bg=BG2); mapf.pack(fill='x', padx=20, pady=2)
        tk.Label(mapf, text="(CSV) col. codice:", font=FONT_S, bg=BG2, fg=FG).pack(side='left')
        self.mag_col_cod = tk.Entry(mapf, font=FONT_S, bg=CARD, fg=FG,
                                    insertbackground=FG, width=14)
        self.mag_col_cod.insert(0, "CODICE"); self.mag_col_cod.pack(side='left', padx=4)
        tk.Label(mapf, text="col. quantità:", font=FONT_S, bg=BG2, fg=FG).pack(side='left', padx=(8, 0))
        self.mag_col_qta = tk.Entry(mapf, font=FONT_S, bg=CARD, fg=FG,
                                    insertbackground=FG, width=14)
        self.mag_col_qta.insert(0, "QTA"); self.mag_col_qta.pack(side='left', padx=4)
        tk.Label(mapf, text="sep:", font=FONT_S, bg=BG2, fg=FG).pack(side='left')
        self.mag_sep = tk.Entry(mapf, font=FONT_S, bg=CARD, fg=FG,
                                insertbackground=FG, width=3)
        self.mag_sep.insert(0, ";"); self.mag_sep.pack(side='left', padx=4)

        tk.Label(f, text="(Manuale) una riga per articolo:  CODICE  QUANTITÀ",
                 font=FONT_S, bg=BG2, fg=FG2).pack(padx=20, anchor='w')
        self.mag_manual_txt = tk.Text(f, height=4, font=('Consolas', 9), bg=CARD,
                                      fg=FG, insertbackground=FG)
        self.mag_manual_txt.pack(fill='x', padx=20, pady=2)

        btnrow = tk.Frame(f, bg=BG2); btnrow.pack(fill='x', padx=20, pady=6)
        _btn(btnrow, "🔍 Calcola anteprima", self._run_mag_preview, color=ACCENT).pack(side='left')
        _btn(btnrow, "📤 Esporta anpr aggiornato", self._run_mag_export, color=ACCENT2).pack(side='left', padx=8)

        cols = ('codice', 'descrizione', 'attuale', 'entrante', 'nuova', 'stato')
        self.mag_tree = _tree(
            f, cols,
            headings=('Codice', 'Descrizione', 'Esist. attuale', 'Entrante',
                      'Nuova esist.', 'Stato'),
            widths=(110, 280, 100, 80, 100, 150), height=8)
        self.mag_log = _log_box(f, height=5)

    def _browse_mag_anpr(self):
        p = filedialog.askopenfilename(
            title="File anpr Mexal", initialdir=r"C:\mexal\dati\datiaz",
            filetypes=[("CSV", "*.csv"), ("Tutti", "*.*")])
        if p:
            self.mag_anpr_var.set(p)

    def _browse_mag_file(self, tipo):
        ft = [("CSV", "*.csv")] if tipo == 'csv' else [("PDF", "*.pdf")]
        p = filedialog.askopenfilename(title=f"File {tipo.upper()}",
                                       filetypes=ft + [("Tutti", "*.*")])
        if p:
            self.mag_file_var.set(p)
            self._mag_file_path = p
            self.mag_source_var.set(tipo)

    def _mag_gather(self):
        """Legge i parametri dai widget (solo dal thread Tkinter)."""
        return {
            'anpr': self.mag_anpr_var.get().strip(),
            'mode': self.mag_source_var.get(),
            'file': getattr(self, '_mag_file_path', ''),
            'manual': self.mag_manual_txt.get('1.0', 'end'),
            'col_cod': self.mag_col_cod.get().strip(),
            'col_qta': self.mag_col_qta.get().strip(),
            'sep': self.mag_sep.get() or ';',
            'nummag': self.mag_num_var.get().strip() or '1',
        }

    def _mag_build_incoming(self, p):
        """Costruisce {codice_raw: qta} dalla sorgente scelta (in worker thread)."""
        if p['mode'] == 'manuale':
            return stock_engine.parse_quantities_text(p['manual'])
        if not p['file'] or not os.path.exists(p['file']):
            raise FileNotFoundError("Seleziona un file sorgente (CSV o PDF).")
        if p['mode'] == 'csv':
            return stock_engine.parse_quantities_csv(
                p['file'], p['col_cod'], p['col_qta'], sep=p['sep'])
        return stock_engine.parse_quantities_pdf(p['file'])

    def _mag_resolve(self, raw):
        """Risolve i codici (mexal o fornitore) → {_ARCOD: qta}, + non risolti."""
        mapping = db.map_codes_to_articoli(list(raw.keys()))
        incoming, non_risolti = {}, []
        for code, qta in raw.items():
            info = mapping.get(code.upper())
            if info:
                arcod = info['codice']
                incoming[arcod] = incoming.get(arcod, 0.0) + qta
            else:
                non_risolti.append((code, qta))
        return incoming, non_risolti

    def _run_mag_preview(self):
        p = self._mag_gather()
        if not p['anpr'] or not os.path.exists(p['anpr']):
            messagebox.showerror("Errore", "Indica un file anpr valido.")
            return
        self.mag_log.delete('1.0', 'end')
        self.mag_tree.delete(*self.mag_tree.get_children())
        self._log(self.mag_log, "Calcolo anteprima…")

        def _task():
            try:
                raw = self._mag_build_incoming(p)
                if not raw:
                    self._log(self.mag_log, "Nessuna quantità trovata nella sorgente.")
                    return
                incoming, non_risolti = self._mag_resolve(raw)
                costo = db.get_costo_map(list(incoming))
                res = stock_engine.update_anpr(
                    p['anpr'], incoming, nummag=p['nummag'],
                    output_path=None, costo_map=costo)
                descr = {a['codice'].upper(): a['descrizione']
                         for a in db.get_articles_by_codes(list(incoming))}

                def render():
                    for r in res['report']:
                        cod = r['codice']
                        if r['stato'] == 'aggiornato':
                            self.mag_tree.insert('', 'end', values=(
                                cod, (descr.get(cod.upper()) or '')[:50],
                                f"{r['vecchia']:.2f}", f"{r['entrante']:.2f}",
                                f"{r['nuova']:.2f}", '✔ aggiornabile'))
                        else:
                            self.mag_tree.insert('', 'end', values=(
                                cod, '—', '—', f"{r['entrante']:.2f}", '—',
                                '⚠ non in magazzino'))
                    for code, qta in non_risolti:
                        self.mag_tree.insert('', 'end', values=(
                            code, '—', '—', f"{qta:.2f}", '—',
                            '⚠ codice non riconosciuto'))
                    self._log(self.mag_log,
                              f"Anteprima: {res['n_articoli']} articoli aggiornabili, "
                              f"{len(res['non_trovati'])} non in magazzino, "
                              f"{len(non_risolti)} codici non riconosciuti.")

                self._ui(render)
            except Exception as e:
                self._log(self.mag_log, f"❌ Errore: {e}")
                logger.exception("Magazzino preview")

        threading.Thread(target=_task, daemon=True).start()

    def _run_mag_export(self):
        p = self._mag_gather()
        if not p['anpr'] or not os.path.exists(p['anpr']):
            messagebox.showerror("Errore", "Indica un file anpr valido.")
            return
        out = filedialog.asksaveasfilename(
            title="Salva anpr aggiornato per Mexal", defaultextension=".csv",
            filetypes=[("CSV", "*.csv")],
            initialfile=f"anpr_idu_aggiornato_{datetime.now().strftime('%Y%m%d')}.csv")
        if not out:
            return
        self.mag_log.delete('1.0', 'end')

        def _task():
            try:
                raw = self._mag_build_incoming(p)
                incoming, non_risolti = self._mag_resolve(raw)
                if not incoming:
                    self._ui(lambda: messagebox.showinfo(
                        "Info", "Nessun articolo riconosciuto da aggiornare."))
                    return
                costo = db.get_costo_map(list(incoming))
                res = stock_engine.update_anpr(
                    p['anpr'], incoming, nummag=p['nummag'], output_path=out,
                    costo_map=costo, log_cb=lambda m: self._log(self.mag_log, m))
                msg = (f"File salvato:\n{out}\n\n"
                       f"Articoli aggiornati: {res['n_articoli']}\n"
                       f"Righe anpr modificate: {res['righe_modificate']}\n"
                       f"Codici non riconosciuti: {len(non_risolti)}\n\n"
                       "⚠ Verifica in Mexal con un'importazione di prova "
                       "prima dell'uso reale.")
                self._ui(lambda m=msg: messagebox.showinfo("Fatto", m))
            except Exception as e:
                self._log(self.mag_log, f"❌ Errore: {e}")
                logger.exception("Magazzino export")

        threading.Thread(target=_task, daemon=True).start()

    # ── TAB: Ordine PDF ───────────────────────────────────────────────────────

    def _build_tab_pdf_order(self):
        f = self.tab_pdf_order
        _section(f, "Carica PDF ordine/merce: confronto prezzi per fornitore più conveniente")

        row = tk.Frame(f, bg=BG2)
        row.pack(fill='x', padx=20, pady=8)
        self.order_file_var = tk.StringVar(value="Nessun file")
        tk.Label(row, textvariable=self.order_file_var,
                 font=FONT_S, bg=BG2, fg=FG2, width=55, anchor='w').pack(side='left')
        _btn(row, "Sfoglia PDF…", self._browse_order_pdf).pack(side='left', padx=8)
        _btn(row, "▶  Analizza", self._run_pdf_order, color=ACCENT2).pack(side='left')

        # Articoli trovati
        _section(f, "Articoli trovati nel PDF")
        cols_a = ('codice', 'descrizione', 'um')
        self.order_art_tree = _tree(f, cols_a,
                                    headings=('Codice', 'Descrizione', 'UM'),
                                    widths=(120, 420, 60), height=5)

        # Confronto prezzi
        _section(f, "Confronto prezzi per fornitore")
        cols_p = ('codice', 'descrizione', 'fornitore', 'cod_forn', 'prezzo_forn', 'prezzo_base', 'conveniente')
        self.order_price_tree = _tree(
            f, cols_p,
            headings=('Codice', 'Descrizione', 'Fornitore', 'Cod. Forn.', 'Prezzo Forn.', 'Prezzo Base', '✔'),
            widths=(100, 260, 130, 100, 90, 90, 40),
            height=8
        )
        _btn(f, "💾 Esporta confronto CSV", self._export_order_csv,
             color=ACCENT).pack(anchor='e', padx=20, pady=4)

    def _browse_order_pdf(self):
        p = filedialog.askopenfilename(
            title="PDF ordine", filetypes=[("PDF", "*.pdf"), ("Tutti", "*.*")])
        if p:
            self.order_file_var.set(p)

    def _run_pdf_order(self):
        path = self.order_file_var.get()
        if not os.path.exists(path):
            messagebox.showerror("Errore", "Seleziona un file PDF.")
            return
        self.status_var.set("Analisi PDF in corso…")

        def _task():
            try:
                articles, prices = price_engine.extract_pdf_order(path)

                # Raggruppa per articolo, evidenzia il più conveniente
                best = {}
                for p in prices:
                    cod = p['codice']
                    pf = p['prezzo_fornitore'] or 9e9
                    if cod not in best or pf < best[cod]:
                        best[cod] = pf

                def render():
                    self.order_art_tree.delete(*self.order_art_tree.get_children())
                    for a in articles:
                        self.order_art_tree.insert('', 'end',
                                                   values=(a['codice'], a['descrizione'], a['um']))
                    self.order_price_tree.delete(*self.order_price_tree.get_children())
                    self._order_price_data = prices
                    for p in prices:
                        pf = p['prezzo_fornitore']
                        pb = p['prezzo_base']
                        is_best = pf and abs(pf - best.get(p['codice'], 9e9)) < 0.0001
                        mark = '⭐' if is_best else ''
                        self.order_price_tree.insert('', 'end',
                            tags=('best',) if is_best else (),
                            values=(p['codice'], p['descrizione'],
                                    p['fornitore_nome'] or p['codice_mexal'],
                                    p['codice_fornitore'] or '—',
                                    f"{pf:.4f}" if pf else '—',
                                    f"{pb:.4f}" if pb else '—',
                                    mark))
                    self.order_price_tree.tag_configure('best', foreground=ACCENT2)
                    self.status_var.set(
                        f"PDF analizzato: {len(articles)} articoli trovati.")

                self._ui(render)
            except Exception as e:
                self._set_status(f"Errore: {e}")
                logger.exception("PDF order")

        threading.Thread(target=_task, daemon=True).start()

    def _export_order_csv(self):
        data = getattr(self, '_order_price_data', [])
        if not data:
            messagebox.showinfo("Info", "Nessun dato da esportare.")
            return
        import csv
        p = filedialog.asksaveasfilename(
            defaultextension=".csv",
            filetypes=[("CSV", "*.csv")],
            initialfile=f"confronto_prezzi_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
        )
        if not p:
            return
        with open(p, 'w', newline='', encoding='utf-8-sig') as f:
            w = csv.DictWriter(f, fieldnames=data[0].keys(), delimiter=';')
            w.writeheader()
            w.writerows(data)
        messagebox.showinfo("Esportato", f"File salvato:\n{p}")

    # ── TAB: Ricerca Portali ──────────────────────────────────────────────────

    def _build_tab_scraper(self):
        f = self.tab_scraper
        _section(f, "Ricerca articoli su portali fornitori")
        tk.Label(f, text=(
            "Cerca un articolo su tutti i portali dei fornitori configurati.\n"
            "Se il codice è noto per un fornitore, lo usa come termine di ricerca sugli altri."
        ), font=FONT_S, bg=BG2, fg=FG2, justify='left').pack(padx=20, pady=2, anchor='w')

        row = tk.Frame(f, bg=BG2)
        row.pack(fill='x', padx=20, pady=8)
        tk.Label(row, text="Codice / Descrizione:", font=FONT, bg=BG2, fg=FG).pack(side='left')
        self.scrape_search_var = tk.StringVar()
        e = tk.Entry(row, textvariable=self.scrape_search_var,
                     font=FONT, bg=CARD, fg=FG, insertbackground=FG, width=35)
        e.pack(side='left', padx=8)
        e.bind('<Return>', lambda *_: self._run_scrape_search())
        _btn(row, "🔍 Cerca", self._run_scrape_search, color=ACCENT).pack(side='left')

        # Articoli corrispondenti
        _section(f, "Articoli trovati nel DB")
        cols = ('codice', 'descrizione', 'n_fornitori')
        self.scrape_art_tree = _tree(f, cols,
                                     headings=('Codice', 'Descrizione', '# Fornitori'),
                                     widths=(120, 430, 90), height=4)
        self.scrape_art_tree.bind('<<TreeviewSelect>>', self._on_scrape_art_select)

        _btn(f, "🌐 Avvia ricerca su portali fornitore",
             self._run_portal_search, color=WARN).pack(padx=20, pady=6, anchor='w')

        self.scrape_progress = ttk.Progressbar(f, mode='determinate')
        self.scrape_progress.pack(fill='x', padx=20, pady=4)

        # Risultati scraping
        _section(f, "Risultati trovati sui portali")
        cols_r = ('fornitore', 'search_term', 'codice_trovato', 'prezzo', 'url')
        self.scrape_res_tree = _tree(
            f, cols_r,
            headings=('Fornitore', 'Termine cercato', 'Codice trovato', 'Prezzo', 'URL'),
            widths=(120, 140, 140, 80, 280),
            height=6
        )
        _btn(f, "💾 Salva risultati selezionati nel DB",
             self._save_scrape_results, color=ACCENT2).pack(anchor='e', padx=20, pady=4)

        tk.Label(f, text=(
            "💡 Per controllare TUTTI gli articoli in automatico usa il tab "
            "'🚀 Ricerca Massiva'."
        ), font=FONT_S, bg=BG2, fg=FG2, justify='left').pack(padx=20, pady=6, anchor='w')

    # ── TAB: Ricerca Massiva ──────────────────────────────────────────────────

    def _build_tab_batch(self):
        f = self.tab_batch
        _section(f, "🚀 Ricerca prezzi sui portali")
        tk.Label(f, text=(
            "Scegli l'ambito (singolo articolo, categoria/parola, o tutti) e i fornitori, "
            "poi premi Cerca. I risultati appaiono in tabella: rivedi e salva quelli giusti.\n"
            "Prerequisiti: URL portale nel tab 'Fornitori' e credenziali nel tab 'Credenziali Portali'."
        ), font=FONT_S, bg=BG2, fg=FG2, justify='left').pack(padx=20, pady=2, anchor='w')

        # ── Riga 1: ambito + parola/codice ──
        r1 = tk.Frame(f, bg=BG2); r1.pack(fill='x', padx=20, pady=(8, 2))
        tk.Label(r1, text="Ambito:", font=FONT_S, bg=BG2, fg=FG).pack(side='left')
        self._batch_scope_map = {
            'Tutti gli articoli': 'tutti',
            'Per categoria / parola (es. ottone)': 'categoria',
            'Singolo articolo (per codice)': 'singolo',
        }
        self.batch_scope_cb = ttk.Combobox(
            r1, state='readonly', width=34, values=list(self._batch_scope_map))
        self.batch_scope_cb.current(0)
        self.batch_scope_cb.pack(side='left', padx=8)
        tk.Label(r1, text="Parola / codice:", font=FONT_S, bg=BG2, fg=FG).pack(side='left', padx=(12, 2))
        self.batch_keyword_var = tk.StringVar()
        tk.Entry(r1, textvariable=self.batch_keyword_var, font=FONT_S,
                 bg=CARD, fg=FG, insertbackground=FG, width=22).pack(side='left')

        # ── Riga 2: fornitore + cosa aggiornare + limite ──
        r2 = tk.Frame(f, bg=BG2); r2.pack(fill='x', padx=20, pady=2)
        tk.Label(r2, text="Fornitore:", font=FONT_S, bg=BG2, fg=FG).pack(side='left')
        self._batch_forn_map = {'Tutti i portali': None}
        try:
            for p in scraper.portali_disponibili():
                self._batch_forn_map[p['nome']] = p['id']
        except Exception:
            pass
        self.batch_forn_cb = ttk.Combobox(
            r2, state='readonly', width=20, values=list(self._batch_forn_map))
        self.batch_forn_cb.current(0)
        self.batch_forn_cb.pack(side='left', padx=8)

        self._batch_missing_map = {
            'Solo dove manca il codice fornitore': True,
            'Aggiorna anche dove il codice c\'è già': False,
        }
        self.batch_missing_cb = ttk.Combobox(
            r2, state='readonly', width=34, values=list(self._batch_missing_map))
        self.batch_missing_cb.current(0)
        self.batch_missing_cb.pack(side='left', padx=8)

        tk.Label(r2, text="Max:", font=FONT_S, bg=BG2, fg=FG).pack(side='left', padx=(12, 2))
        self.batch_limite_var = tk.StringVar(value='50')
        tk.Entry(r2, textvariable=self.batch_limite_var, font=FONT_S,
                 bg=CARD, fg=FG, insertbackground=FG, width=6).pack(side='left')
        tk.Label(r2, text="(vuoto = tutti)", font=FONT_S, bg=BG2, fg=FG2).pack(side='left', padx=4)

        # ── Riga pulsanti ──
        rb = tk.Frame(f, bg=BG2); rb.pack(fill='x', padx=20, pady=6)
        self._batch_start_btn = _btn(rb, "🔍 Cerca", self._run_batch_search, color=ACCENT2)
        self._batch_start_btn.pack(side='left')
        self._batch_stop_btn = _btn(rb, "⏹ Stop", self._stop_batch_search, color=DANGER)
        self._batch_stop_btn.pack(side='left', padx=8)
        self.batch_parallel_var = tk.BooleanVar(value=True)
        tk.Checkbutton(rb, text="⚡ Parallelo", variable=self.batch_parallel_var,
                       font=FONT_S, bg=BG2, fg=FG, selectcolor=CARD,
                       activebackground=BG2, activeforeground=FG,
                       bd=0, highlightthickness=0).pack(side='left', padx=(8, 0))
        self.batch_progress = ttk.Progressbar(rb, mode='determinate')
        self.batch_progress.pack(side='left', fill='x', expand=True, padx=8)

        # ── Tabella risultati ──
        tframe = tk.Frame(f, bg=BG2)
        tframe.pack(fill='both', expand=True, padx=20, pady=4)
        cols = ('sel', 'art', 'descr', 'forn', 'cod', 'prezzo', 'stato')
        hdrs = ('', 'Articolo', 'Descrizione', 'Fornitore', 'Cod. trovato', 'Prezzo', 'Stato')
        wids = (34, 110, 250, 120, 120, 80, 110)
        sb = ttk.Scrollbar(tframe, orient='vertical')
        self.batch_tree = ttk.Treeview(tframe, columns=cols, show='headings',
                                       height=10, yscrollcommand=sb.set)
        sb.config(command=self.batch_tree.yview)
        for c, h, w in zip(cols, hdrs, wids):
            self.batch_tree.heading(c, text=h)
            self.batch_tree.column(c, width=w, anchor=('center' if c in ('sel', 'prezzo') else 'w'),
                                   stretch=(c == 'descr'))
        self.batch_tree.pack(side='left', fill='both', expand=True)
        sb.pack(side='right', fill='y')
        self.batch_tree.tag_configure('oddrow', background=ROW_ALT)
        self.batch_tree.bind('<Button-1>', self._batch_on_click)
        self._batch_results = {}   # iid -> dict risultato
        self._batch_checked = set()

        # ── Riga salvataggio ──
        rs = tk.Frame(f, bg=BG2); rs.pack(fill='x', padx=20, pady=4)
        _btn(rs, "☑ Tutti", self._batch_select_all, color=BTN).pack(side='left')
        _btn(rs, "☐ Nessuno", self._batch_deselect_all, color=BTN).pack(side='left', padx=6)
        _btn(rs, "💾 Salva selezionati", self._save_batch_results, color=ACCENT).pack(side='left', padx=6)
        _btn(rs, "🖨 PDF confronto", self._export_pdf_confronto, color=WARN).pack(side='left', padx=6)
        self._batch_count_var = tk.StringVar(value='')
        tk.Label(rs, textvariable=self._batch_count_var, font=FONT_S, bg=BG2, fg=FG2).pack(side='left', padx=10)

        self.batch_log = _log_box(f, height=5)

    # ── Ricerca massiva: azioni ──

    def _run_batch_search(self):
        import threading as _th
        scope = self._batch_scope_map.get(self.batch_scope_cb.get(), 'tutti')
        keyword = self.batch_keyword_var.get().strip()
        fid = self._batch_forn_map.get(self.batch_forn_cb.get())
        only_missing = self._batch_missing_map.get(self.batch_missing_cb.get(), True)
        lim_raw = self.batch_limite_var.get().strip()
        limite = int(lim_raw) if lim_raw.isdigit() else None

        if scope in ('categoria', 'singolo') and not keyword:
            messagebox.showwarning(
                "Manca la parola",
                "Per l'ambito scelto inserisci una parola (categoria) o un codice articolo.")
            return

        articoli = scraper.select_target_articoli(
            scope=scope, keyword=keyword, fornitore_id=fid,
            solo_senza_codice=only_missing, limite=limite)
        if not articoli:
            messagebox.showinfo("Nessun articolo",
                                "Nessun articolo corrisponde ai criteri scelti.")
            return
        if len(articoli) > 200:
            if not messagebox.askyesno(
                "Conferma",
                f"Stai per cercare su {len(articoli)} articoli. "
                "Può richiedere parecchio tempo.\nPuoi premere Stop in qualsiasi momento. Continuare?"):
                return

        # reset tabella
        self.batch_tree.delete(*self.batch_tree.get_children())
        self._batch_results.clear()
        self._batch_checked.clear()
        self._batch_count_var.set('')
        self.batch_log.delete('1.0', 'end')
        self.batch_progress['value'] = 0
        self._batch_stop_event = _th.Event()
        self._batch_start_btn.config(state='disabled')

        def _task():
            def prog(i, tot, desc=''):
                self._set_progress(self.batch_progress, int(i / tot * 100) if tot else 0)
                self._set_status(f"Ricerca: {i}/{tot} — {desc}")

            def log(msg):
                self._log(self.batch_log, msg)

            try:
                risultati = scraper.search_batch(
                    articoli,
                    fornitore_ids=[fid] if fid else None,
                    only_missing_code=only_missing,
                    progress_cb=prog, log_cb=log,
                    stop_event=self._batch_stop_event,
                    parallel=self.batch_parallel_var.get())
                self.after(0, lambda: self._fill_batch_results(risultati))
                self._set_progress(self.batch_progress, 100)
                self._set_status(f"Ricerca terminata: {len(risultati)} risultati.")
            except Exception as e:
                self._log(self.batch_log, f"❌ Errore: {e}")
                logger.exception("Batch search")
            finally:
                self.after(0, lambda: self._batch_start_btn.config(state='normal'))

        _th.Thread(target=_task, daemon=True).start()

    def _fill_batch_results(self, risultati):
        self.batch_tree.delete(*self.batch_tree.get_children())
        self._batch_results.clear()
        self._batch_checked.clear()
        stato_lbl = {'prezzo': '💶 prezzo', 'solo_codice': '🔖 solo codice', 'vuoto': '—'}
        for i, res in enumerate(risultati):
            iid = str(i)
            prezzo = res.get('prezzo')
            prezzo_s = (f"{prezzo:.4f}".rstrip('0').rstrip('.') if prezzo else '—')
            descr = (res.get('articolo_descr') or '')[:48]
            tags = ('oddrow',) if i % 2 else ()
            self.batch_tree.insert(
                '', 'end', iid=iid, tags=tags,
                values=('☑', res.get('articolo_codice', ''), descr,
                        res.get('fornitore_nome', ''), res.get('codice_trovato') or '—',
                        prezzo_s, stato_lbl.get(res.get('stato'), '—')))
            self._batch_results[iid] = res
            self._batch_checked.add(iid)
        self._update_batch_count()
        if not risultati:
            self._log(self.batch_log, "Nessun risultato trovato.")

    def _batch_on_click(self, event):
        # Toggle del check se si clicca sulla prima colonna
        if self.batch_tree.identify_region(event.x, event.y) != 'cell':
            return
        if self.batch_tree.identify_column(event.x) != '#1':
            return
        iid = self.batch_tree.identify_row(event.y)
        if not iid:
            return
        if iid in self._batch_checked:
            self._batch_checked.discard(iid)
            self.batch_tree.set(iid, 'sel', '☐')
        else:
            self._batch_checked.add(iid)
            self.batch_tree.set(iid, 'sel', '☑')
        self._update_batch_count()

    def _batch_select_all(self):
        for iid in self.batch_tree.get_children():
            self._batch_checked.add(iid)
            self.batch_tree.set(iid, 'sel', '☑')
        self._update_batch_count()

    def _batch_deselect_all(self):
        for iid in self.batch_tree.get_children():
            self.batch_tree.set(iid, 'sel', '☐')
        self._batch_checked.clear()
        self._update_batch_count()

    def _update_batch_count(self):
        tot = len(self._batch_results)
        sel = len(self._batch_checked)
        self._batch_count_var.set(f"{sel}/{tot} selezionati" if tot else '')

    def _save_batch_results(self):
        import threading as _th
        selez = [self._batch_results[iid] for iid in self._batch_checked
                 if iid in self._batch_results]
        if not selez:
            messagebox.showinfo("Niente da salvare",
                                "Seleziona almeno una riga (clic sulla casella ☑).")
            return
        if not messagebox.askyesno(
            "Conferma salvataggio",
            f"Salvo codice fornitore e prezzo per {len(selez)} righe selezionate nel database?"):
            return

        def _task():
            try:
                n = scraper.save_results(selez)
                self._log(self.batch_log, f"💾 Salvati {n} risultati nel database.")
                self._set_status(f"Salvati {n} risultati.")
                # marca le righe salvate
                for iid in list(self._batch_checked):
                    self.after(0, lambda i=iid: self.batch_tree.set(i, 'stato', '✅ salvato'))
            except Exception as e:
                self._log(self.batch_log, f"❌ Errore salvataggio: {e}")
                logger.exception("Save batch results")

        _th.Thread(target=_task, daemon=True).start()

    def _export_pdf_confronto(self):
        import threading as _th
        import report
        scope = self._batch_scope_map.get(self.batch_scope_cb.get(), 'tutti')
        keyword = self.batch_keyword_var.get().strip()
        if scope in ('categoria', 'singolo') and not keyword:
            messagebox.showwarning(
                "Manca la parola",
                "Per l'ambito scelto inserisci una parola (categoria) o un codice articolo.")
            return
        lim_raw = self.batch_limite_var.get().strip()
        limite = int(lim_raw) if lim_raw.isdigit() else None

        ids = report.select_article_ids(scope, keyword, limite)
        if not ids:
            messagebox.showinfo(
                "Nessun dato",
                "Nessun articolo con prezzi fornitore da confrontare per questo ambito.\n"
                "Suggerimento: fai prima una ricerca o un'importazione che popoli i prezzi.")
            return
        if len(ids) > 300 and not messagebox.askyesno(
                "Conferma",
                f"Il PDF conterrà {len(ids)} articoli (molte pagine). Continuare?"):
            return

        default = f"confronto_{(keyword or scope)}.pdf".replace(' ', '_')
        path = filedialog.asksaveasfilename(
            title="Salva PDF confronto fornitori", defaultextension=".pdf",
            initialfile=default, filetypes=[("PDF", "*.pdf")])
        if not path:
            return

        def _task():
            try:
                st = report.genera_pdf_confronto(
                    scope, keyword, path, limite=limite,
                    log_cb=lambda m: self._log(self.batch_log, m))
                self._set_status(f"PDF confronto creato: {st['n_articoli']} articoli.")
                self.after(0, lambda: self._offer_open_pdf(path))
            except Exception as e:
                self._log(self.batch_log, f"❌ Errore PDF: {e}")
                logger.exception("PDF confronto")

        _th.Thread(target=_task, daemon=True).start()

    def _offer_open_pdf(self, path):
        if messagebox.askyesno("PDF creato",
                               f"PDF salvato in:\n{path}\n\nVuoi aprirlo ora?"):
            try:
                os.startfile(path)   # Windows
            except Exception as e:
                self._log(self.batch_log, f"Impossibile aprire il PDF: {e}")

    def _stop_batch_search(self):
        ev = getattr(self, '_batch_stop_event', None)
        if ev is not None:
            ev.set()
            self._log(self.batch_log, "⏹ Stop inviato… attendere il termine dell'articolo in corso.")

    def _run_scrape_search(self):
        q = self.scrape_search_var.get().strip()
        if not q:
            return
        rows = db.search_articles(q)
        self.scrape_art_tree.delete(*self.scrape_art_tree.get_children())
        for r in rows:
            self.scrape_art_tree.insert('', 'end', iid=str(r['id']),
                                        values=(r['codice'], r['descrizione'], r['n_fornitori']))
        self.status_var.set(f"{len(rows)} articoli trovati per '{q}'." if rows else f"Nessun articolo trovato per '{q}'.")

    def _on_scrape_art_select(self, _=None):
        sel = self.scrape_art_tree.selection()
        self._scrape_art_id = int(sel[0]) if sel else None

    def _run_portal_search(self):
        art_id = getattr(self, '_scrape_art_id', None)
        if not art_id:
            messagebox.showinfo("Info", "Seleziona prima un articolo dalla lista.")
            return
        self.scrape_res_tree.delete(*self.scrape_res_tree.get_children())
        self.scrape_progress['value'] = 0
        self._scrape_results = []

        def _task():
            def prog(i, tot, nome=''):
                pct = int(i / tot * 100) if tot else 0
                self._set_progress(self.scrape_progress, pct)
                self._set_status(f"Ricerca su {nome}…")

            try:
                results = scraper.search_article_on_portals(art_id, progress_cb=prog)

                def render():
                    self._scrape_results = results
                    self.scrape_res_tree.delete(*self.scrape_res_tree.get_children())
                    for r in results:
                        pz = r.get('prezzo')
                        self.scrape_res_tree.insert('', 'end', values=(
                            r.get('fornitore_nome', '—'),
                            r.get('search_term', '—'),
                            r.get('codice_trovato') or '—',
                            f"{pz:.4f}" if pz else '—',
                            r.get('url', '—')
                        ))
                    self.scrape_progress['value'] = 100
                    self.status_var.set(f"Trovati {len(results)} risultati sui portali.")

                self._ui(render)
            except Exception as e:
                self._set_status(f"Errore scraping: {e}")
                logger.exception("Portal search")

        threading.Thread(target=_task, daemon=True).start()

    def _save_scrape_results(self):
        sel = self.scrape_res_tree.selection()
        art_id = getattr(self, '_scrape_art_id', None)
        if not sel or not art_id:
            messagebox.showinfo("Info", "Seleziona uno o più risultati da salvare.")
            return
        saved = 0
        for iid in sel:
            idx = self.scrape_res_tree.index(iid)
            if idx < len(self._scrape_results):
                r = self._scrape_results[idx]
                scraper.save_scraping_result(
                    art_id, r['fornitore_id'],
                    r.get('codice_trovato', ''), r.get('prezzo'))
                saved += 1
        messagebox.showinfo("Salvato", f"{saved} risultati salvati nel DB.")

    # ── TAB: Fornitori ────────────────────────────────────────────────────────

    def _build_tab_suppliers(self):
        f = self.tab_suppliers
        _section(f, "Anagrafica fornitori — configura nome, portale e selettori CSS")

        cols = ('codice_mexal', 'nome', 'url_portale', 'note')
        self.sup_tree = _tree(f, cols,
                              headings=('Cod. Mexal', 'Nome', 'URL Portale', 'Config (JSON)'),
                              widths=(100, 180, 320, 300), height=12)
        self.sup_tree.bind('<<TreeviewSelect>>', self._on_supplier_select)
        _btn(f, "🔄 Carica", self._load_suppliers).pack(side='top', padx=20, pady=4, anchor='w')

        # Aggiungi un fornitore non ancora presente (es. nuovo fornitore Mexal)
        af = tk.LabelFrame(f, text=" Aggiungi nuovo fornitore ", bg=BG2, fg=FG2, font=FONT_S)
        af.pack(fill='x', padx=20, pady=4)
        tk.Label(af, text="Codice Mexal:", font=FONT_S, bg=BG2, fg=FG).pack(side='left', padx=(8, 2), pady=6)
        self.newsup_cod_var = tk.StringVar()
        tk.Entry(af, textvariable=self.newsup_cod_var, font=FONT_S, bg=CARD, fg=FG,
                 insertbackground=FG, width=14).pack(side='left', padx=4)
        tk.Label(af, text="Nome:", font=FONT_S, bg=BG2, fg=FG).pack(side='left', padx=(8, 2))
        self.newsup_nome_var = tk.StringVar()
        tk.Entry(af, textvariable=self.newsup_nome_var, font=FONT_S, bg=CARD, fg=FG,
                 insertbackground=FG, width=24).pack(side='left', padx=4)
        _btn(af, "➕ Aggiungi", self._add_supplier, color=ACCENT2).pack(side='left', padx=8)

        # Form edit
        ef = tk.LabelFrame(f, text=" Modifica fornitore ", bg=BG2, fg=FG2, font=FONT_S)
        ef.pack(fill='x', padx=20, pady=8)

        fields = [
            ("Nome:", 'sup_nome_var', 30),
            ("URL Portale:", 'sup_url_var', 55),
        ]
        for i, (lbl, var, w) in enumerate(fields):
            tk.Label(ef, text=lbl, font=FONT_S, bg=BG2, fg=FG).grid(
                row=i, column=0, padx=8, pady=3, sticky='w')
            setattr(self, var, tk.StringVar())
            tk.Entry(ef, textvariable=getattr(self, var),
                     font=FONT_S, bg=CARD, fg=FG, insertbackground=FG, width=w
                     ).grid(row=i, column=1, padx=4, pady=3, sticky='w')

        tk.Label(ef, text="Config JSON\n(selettori CSS):", font=FONT_S,
                 bg=BG2, fg=FG).grid(row=2, column=0, padx=8, pady=3, sticky='nw')
        self.sup_note_txt = tk.Text(ef, font=FONT_S, bg=CARD, fg=FG,
                                    insertbackground=FG, width=60, height=4)
        self.sup_note_txt.grid(row=2, column=1, padx=4, pady=3, sticky='w')

        tk.Label(ef, text=(
            'Esempio: {"search_param":"q","selector_prezzo":".price","selector_codice":".sku"}'
        ), font=('Consolas', 8), bg=BG2, fg=FG2).grid(
            row=3, column=1, padx=4, sticky='w')

        _btn(ef, "💾 Salva", self._save_supplier, color=ACCENT2).grid(
            row=4, column=1, padx=4, pady=6, sticky='w')

        self._load_suppliers()

    def _load_suppliers(self):
        rows = db.get_all_suppliers()
        self.sup_tree.delete(*self.sup_tree.get_children())
        self._suppliers = {r['id']: dict(r) for r in rows}
        for r in rows:
            self.sup_tree.insert('', 'end', iid=str(r['id']),
                                 values=(r['codice_mexal'], r['nome'] or '—',
                                         r['url_portale'] or '—', r['note'] or ''))
        self._refresh_supplier_combos()

    def _on_supplier_select(self, _=None):
        sel = self.sup_tree.selection()
        if not sel:
            return
        self._edit_supplier_id = int(sel[0])
        r = self._suppliers.get(self._edit_supplier_id, {})
        self.sup_nome_var.set(r.get('nome') or '')
        self.sup_url_var.set(r.get('url_portale') or '')
        self.sup_note_txt.delete('1.0', 'end')
        self.sup_note_txt.insert('1.0', r.get('note') or '')

    def _add_supplier(self):
        cod = self.newsup_cod_var.get().strip()
        nome = self.newsup_nome_var.get().strip()
        if not cod:
            messagebox.showerror("Errore",
                                 "Inserisci il codice Mexal del fornitore (es. 60100830).")
            return
        db.add_supplier(cod, nome)
        self.newsup_cod_var.set('')
        self.newsup_nome_var.set('')
        self._load_suppliers()
        if hasattr(self, '_doc_refresh_forn_combo'):
            self._doc_refresh_forn_combo()   # aggiorna il menu del tab Documenti
        messagebox.showinfo("Aggiunto", f"Fornitore {cod} aggiunto.\n"
                            "Ora è selezionabile anche nel tab 'Documenti Fornitore'.")

    def _save_supplier(self):
        sid = getattr(self, '_edit_supplier_id', None)
        if not sid:
            messagebox.showinfo("Info", "Seleziona un fornitore dalla lista.")
            return
        db.update_supplier_info(
            sid,
            self.sup_nome_var.get().strip(),
            self.sup_url_var.get().strip(),
            self.sup_note_txt.get('1.0', 'end').strip()
        )
        self._load_suppliers()
        messagebox.showinfo("Salvato", "Fornitore aggiornato.")

    # ── TAB: Credenziali Portali ──────────────────────────────────────────────

    def _build_tab_credentials(self):
        f = self.tab_creds
        _section(f, "Credenziali di accesso ai portali fornitori")
        tk.Label(f, text=(
            "Le credenziali vengono salvate localmente nel database (non trasmesse).\n"
            "Sono usate dallo scraper automatico per accedere ai prezzi riservati."
        ), font=FONT_S, bg=BG2, fg=FG2, justify='left').pack(padx=20, pady=4, anchor='w')

        # Lista fornitori con stato credenziali
        cols = ('codice_mexal', 'nome', 'url_portale', 'stato_creds')
        self.creds_tree = _tree(f, cols,
                                headings=('Cod. Mexal', 'Nome', 'URL Portale', 'Credenziali'),
                                widths=(110, 180, 300, 120), height=8)
        self.creds_tree.bind('<<TreeviewSelect>>', self._on_creds_select)
        self.creds_tree.tag_configure('ok',      foreground=ACCENT2)
        self.creds_tree.tag_configure('missing', foreground=WARN)

        _btn(f, "🔄 Aggiorna lista", self._load_creds_list).pack(
            anchor='w', padx=20, pady=4)

        # Form inserimento credenziali
        cf = tk.LabelFrame(f, text=" Inserisci / Aggiorna credenziali ",
                           bg=BG2, fg=FG2, font=FONT_S)
        cf.pack(fill='x', padx=20, pady=10)

        # Fornitore selezionato
        tk.Label(cf, text="Fornitore:", font=FONT_S, bg=BG2, fg=FG).grid(
            row=0, column=0, padx=8, pady=6, sticky='w')
        self.creds_forn_label = tk.Label(cf, text="— nessuno selezionato —",
                                         font=FONT_B, bg=BG2, fg=ACCENT)
        self.creds_forn_label.grid(row=0, column=1, columnspan=3, padx=4, sticky='w')

        tk.Label(cf, text="Username / Email:", font=FONT_S, bg=BG2, fg=FG).grid(
            row=1, column=0, padx=8, pady=4, sticky='w')
        self.creds_user_var = tk.StringVar()
        tk.Entry(cf, textvariable=self.creds_user_var,
                 font=FONT_S, bg=CARD, fg=FG, insertbackground=FG, width=40
                 ).grid(row=1, column=1, padx=4, pady=4, sticky='w')

        tk.Label(cf, text="Password:", font=FONT_S, bg=BG2, fg=FG).grid(
            row=2, column=0, padx=8, pady=4, sticky='w')
        self.creds_pass_var = tk.StringVar()
        pw_entry = tk.Entry(cf, textvariable=self.creds_pass_var,
                            font=FONT_S, bg=CARD, fg=FG, insertbackground=FG,
                            width=40, show='●')
        pw_entry.grid(row=2, column=1, padx=4, pady=4, sticky='w')

        # Toggle mostra/nascondi password
        self._show_pw = tk.BooleanVar(value=False)
        def _toggle_pw():
            pw_entry.config(show='' if self._show_pw.get() else '●')
        tk.Checkbutton(cf, text="Mostra", variable=self._show_pw,
                       command=_toggle_pw, font=FONT_S,
                       bg=BG2, fg=FG2, selectcolor=CARD,
                       activebackground=BG2).grid(row=2, column=2, padx=4)

        btn_row = tk.Frame(cf, bg=BG2)
        btn_row.grid(row=3, column=0, columnspan=4, padx=8, pady=8, sticky='w')
        _btn(btn_row, "💾 Salva credenziali",
             self._save_credentials, color=ACCENT2).pack(side='left')
        _btn(btn_row, "🗑 Elimina credenziali",
             self._delete_credentials, color=DANGER).pack(side='left', padx=8)
        _btn(btn_row, "🔬 Testa login",
             self._test_credentials, color=ACCENT).pack(side='left')

        self.creds_test_log = _log_box(f, height=5)
        self._load_creds_list()

    def _load_creds_list(self):
        rows = db.get_all_suppliers()
        self.creds_tree.delete(*self.creds_tree.get_children())
        self._creds_suppliers = {r['id']: dict(r) for r in rows}
        for r in rows:
            has_creds = bool(db.get_config(f"creds_{r['id']}"))
            stato = "✅ Configurate" if has_creds else "⚠ Mancanti"
            tag   = 'ok' if has_creds else 'missing'
            self.creds_tree.insert('', 'end', iid=str(r['id']),
                                   tags=(tag,),
                                   values=(r['codice_mexal'],
                                           r['nome'] or '—',
                                           r['url_portale'] or '—',
                                           stato))

    def _on_creds_select(self, _=None):
        sel = self.creds_tree.selection()
        if not sel:
            return
        self._creds_edit_id = int(sel[0])
        r = self._creds_suppliers.get(self._creds_edit_id, {})
        label = f"{r.get('nome') or '—'}  [{r.get('codice_mexal')}]"
        self.creds_forn_label.config(text=label)
        # Precarica username se già salvato (non la password per sicurezza)
        import json as _json
        raw = db.get_config(f"creds_{self._creds_edit_id}")
        if raw:
            try:
                saved = _json.loads(raw)
                self.creds_user_var.set(saved.get("username", ""))
                self.creds_pass_var.set(saved.get("password", ""))
            except Exception:
                pass
        else:
            self.creds_user_var.set("")
            self.creds_pass_var.set("")

    def _save_credentials(self):
        sid = getattr(self, '_creds_edit_id', None)
        if not sid:
            messagebox.showinfo("Info", "Seleziona prima un fornitore dalla lista.")
            return
        u = self.creds_user_var.get().strip()
        p = self.creds_pass_var.get().strip()
        if not u or not p:
            messagebox.showerror("Errore", "Inserisci username e password.")
            return
        scraper.save_credentials(sid, u, p)
        self._load_creds_list()
        messagebox.showinfo("Salvato", "Credenziali salvate nel database locale.")

    def _delete_credentials(self):
        sid = getattr(self, '_creds_edit_id', None)
        if not sid:
            return
        if messagebox.askyesno("Conferma", "Eliminare le credenziali per questo fornitore?"):
            db.set_config(f"creds_{sid}", "")
            self.creds_user_var.set("")
            self.creds_pass_var.set("")
            self._load_creds_list()

    def _test_credentials(self):
        sid = getattr(self, '_creds_edit_id', None)
        if not sid:
            messagebox.showinfo("Info", "Seleziona prima un fornitore.")
            return
        r = self._creds_suppliers.get(sid, {})
        url = r.get('url_portale', '').strip()
        if not url:
            messagebox.showinfo("Info", "Configura prima l'URL del portale nel tab Fornitori.")
            return

        self.creds_test_log.delete('1.0', 'end')
        self._log(self.creds_test_log, f"Test login su {url} …")

        u = self.creds_user_var.get().strip()
        p = self.creds_pass_var.get().strip()
        if not u or not p:
            self._log(self.creds_test_log, "❌ Inserisci username e password prima del test.")
            return

        def _task():
            creds = {"username": u, "password": p}
            handler = scraper._pick_handler(url)
            try:
                # Prova ricerca di un termine generico per testare il login
                res = handler(url=url, search_term="test", creds=creds, config={})
                if res is not None:
                    self._log(self.creds_test_log,
                              "✅ Login riuscito! Portale accessibile.")
                else:
                    self._log(self.creds_test_log,
                              "⚠ Login eseguito ma nessun risultato per 'test'.\n"
                              "   Le credenziali potrebbero essere corrette.\n"
                              "   Prova una ricerca reale dal tab 'Ricerca Portali'.")
            except Exception as e:
                self._log(self.creds_test_log,
                          f"❌ Errore: {e}\n"
                          "   Controlla username, password e URL portale.")

        threading.Thread(target=_task, daemon=True).start()

    # ── TAB: Pianificazione ───────────────────────────────────────────────────

    def _build_tab_schedule(self):
        f = self.tab_schedule
        _section(f, "Aggiornamento settimanale automatico")

        cfg = scheduler.get_schedule_config()

        self.sched_enabled = tk.BooleanVar(value=cfg.get('enabled', False))
        tk.Checkbutton(f, text="Abilita aggiornamento settimanale automatico",
                       variable=self.sched_enabled,
                       font=FONT, bg=BG2, fg=FG,
                       selectcolor=CARD, activebackground=BG2).pack(
            padx=20, pady=8, anchor='w')

        row = tk.Frame(f, bg=BG2)
        row.pack(fill='x', padx=20, pady=4)
        tk.Label(row, text="Giorno:", font=FONT, bg=BG2, fg=FG).pack(side='left')
        days = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']
        self.sched_day_var = tk.StringVar(value=days[cfg.get('day_of_week', 0)])
        ttk.Combobox(row, textvariable=self.sched_day_var,
                     values=days, state='readonly', width=12).pack(side='left', padx=8)
        tk.Label(row, text="Ora:", font=FONT, bg=BG2, fg=FG).pack(side='left', padx=8)
        self.sched_hour_var = tk.IntVar(value=cfg.get('hour', 8))
        tk.Spinbox(row, from_=0, to=23, textvariable=self.sched_hour_var,
                   font=FONT, bg=CARD, fg=FG, width=4).pack(side='left')

        last_run = cfg.get('last_run') or 'Mai'
        tk.Label(f, text=f"Ultimo aggiornamento: {last_run}",
                 font=FONT_S, bg=BG2, fg=FG2).pack(padx=20, pady=4, anchor='w')

        btn_row = tk.Frame(f, bg=BG2)
        btn_row.pack(fill='x', padx=20, pady=8)
        _btn(btn_row, "💾 Salva impostazioni", self._save_schedule).pack(side='left')
        _btn(btn_row, "▶  Avvia aggiornamento ora",
             self._run_manual_update, color=WARN).pack(side='left', padx=12)

        self.sched_log = _log_box(f, height=10)

    def _save_schedule(self):
        days = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']
        cfg = scheduler.get_schedule_config()
        cfg['enabled'] = self.sched_enabled.get()
        cfg['day_of_week'] = days.index(self.sched_day_var.get())
        cfg['hour'] = self.sched_hour_var.get()
        scheduler.save_schedule_config(cfg)
        messagebox.showinfo("Salvato", "Impostazioni pianificazione salvate.")

    def _run_manual_update(self):
        self.sched_log.delete('1.0', 'end')
        cfg = scheduler.get_schedule_config()

        def _task():
            def log(msg):
                self._log(self.sched_log, msg)

            scheduler.run_weekly_update(cfg, log_cb=log)

        threading.Thread(target=_task, daemon=True).start()

    def _auto_weekly_check(self):
        # In un thread separato: lo scraping settimanale può durare minuti
        # e non deve congelare la finestra.
        def log(msg):
            self._set_status(msg)
        threading.Thread(
            target=lambda: scheduler.auto_check_and_run(log_cb=log),
            daemon=True).start()

    # ── helpers UI ────────────────────────────────────────────────────────────

    def _refresh_supplier_combos(self):
        rows = db.get_all_suppliers()
        labels = [f"{r['codice_mexal']} — {r['nome'] or 'N/D'}" for r in rows]
        self._supplier_map = {
            f"{r['codice_mexal']} — {r['nome'] or 'N/D'}": r['id']
            for r in rows
        }
        if hasattr(self, 'upload_forn_cb'):
            self.upload_forn_cb['values'] = labels
            if labels:
                self.upload_forn_cb.current(0)

    def _get_fornitore_id_from_label(self, label):
        return self._supplier_map.get(label) if hasattr(self, '_supplier_map') else None

    def _ui(self, fn):
        """Esegue fn nel thread Tkinter: i worker non devono toccare i widget."""
        self.after(0, fn)

    def _set_progress(self, bar: ttk.Progressbar, pct: int):
        self._ui(lambda: bar.config(value=pct))

    def _set_status(self, msg: str):
        self._ui(lambda: self.status_var.set(msg))

    def _log(self, widget: tk.Text, msg: str, replace=False):
        def _do():
            if replace:
                widget.delete('end-2l', 'end')
            widget.insert('end', msg + '\n')
            widget.see('end')
        self.after(0, _do)

    def _apply_styles(self):
        style = ttk.Style(self)
        style.theme_use('clam')
        style.configure('TNotebook', background=BG, borderwidth=0)
        style.configure('TNotebook.Tab', background=BG, foreground=FG2,
                        padding=[14, 7], font=FONT, borderwidth=0)
        style.map('TNotebook.Tab',
                  background=[('selected', BG2), ('active', CARD)],
                  foreground=[('selected', ACCENT), ('active', FG)])
        style.configure('Treeview', background=BG2, fieldbackground=BG2,
                        foreground=FG, rowheight=24, font=FONT_S,
                        borderwidth=0)
        style.configure('Treeview.Heading', background=CARD, foreground=FG2,
                        font=FONT_B, relief='flat', padding=[6, 4])
        style.map('Treeview.Heading',
                  background=[('active', BG)],
                  foreground=[('active', FG)])
        style.map('Treeview',
                  background=[('selected', ACCENT)],
                  foreground=[('selected', 'white')])
        style.configure('TProgressbar', troughcolor=CARD, background=ACCENT2,
                        thickness=8, borderwidth=0)
        style.configure('TCombobox', fieldbackground=BG2, background=BG2,
                        foreground=FG, selectbackground=ACCENT,
                        arrowcolor=FG2, bordercolor='#d1d5db', lightcolor=BG2,
                        darkcolor=BG2)
        style.map('TCombobox',
                  fieldbackground=[('readonly', BG2)],
                  foreground=[('readonly', FG)])
        style.configure('Vertical.TScrollbar', background=CARD,
                        troughcolor=BG, bordercolor=BG,
                        arrowcolor=FG2, relief='flat')
        style.map('Vertical.TScrollbar', background=[('active', '#cbd5e1')])
        # Tendina dei combobox (tema chiaro)
        self.option_add('*TCombobox*Listbox.background', BG2)
        self.option_add('*TCombobox*Listbox.foreground', FG)
        self.option_add('*TCombobox*Listbox.selectBackground', ACCENT)
        self.option_add('*TCombobox*Listbox.selectForeground', 'white')
        self.option_add('*TCombobox*Listbox.font', FONT_S)


# ── widget helpers ────────────────────────────────────────────────────────────

def _section(parent, text):
    tk.Label(parent, text=text, font=FONT_B, bg=BG2, fg=ACCENT,
             anchor='w').pack(fill='x', padx=20, pady=(12, 2))
    tk.Frame(parent, bg=ACCENT, height=1).pack(fill='x', padx=20, pady=(0, 6))


def _lighten(hexcolor: str, factor: float = 1.22) -> str:
    """Schiarisce un colore #rrggbb (per l'effetto hover dei pulsanti)."""
    r, g, b = (int(hexcolor[i:i + 2], 16) for i in (1, 3, 5))
    return '#%02x%02x%02x' % tuple(min(255, int(c * factor)) for c in (r, g, b))


def _btn(parent, text, command, color=None):
    color = color or BTN
    b = tk.Button(parent, text=text, command=command,
                  font=FONT_S, bg=color, fg='white',
                  relief='flat', padx=10, pady=4,
                  activebackground=ACCENT, activeforeground='white',
                  cursor='hand2')
    hover = _lighten(color)
    b.bind('<Enter>', lambda _e: b.config(bg=hover))
    b.bind('<Leave>', lambda _e: b.config(bg=color))
    return b


def _log_box(parent, height=7):
    box = scrolledtext.ScrolledText(
        parent, height=height, font=('Consolas', 9),
        bg='#f8fafc', fg='#166534', insertbackground=FG,
        state='normal', wrap='word', relief='solid', bd=1
    )
    box.pack(fill='both', expand=True, padx=20, pady=4)
    return box


def _tree(parent, columns, headings, widths, height=8):
    frame = tk.Frame(parent, bg=BG2)
    frame.pack(fill='x', padx=20, pady=4)
    sb = ttk.Scrollbar(frame, orient='vertical')
    t = ttk.Treeview(frame, columns=columns, show='headings',
                     height=height, yscrollcommand=sb.set)
    sb.config(command=t.yview)
    for col, hdr, w in zip(columns, headings, widths):
        t.heading(col, text=hdr)
        t.column(col, width=w, stretch=(w > 200))
    t.pack(side='left', fill='x', expand=True)
    sb.pack(side='right', fill='y')

    # Righe alternate: l'insert aggiunge da solo il tag di parità
    t.tag_configure('oddrow', background=ROW_ALT)
    _orig_insert = t.insert

    def _insert(parent_item='', index='end', **kw):
        if len(t.get_children(parent_item)) % 2:
            kw['tags'] = tuple(kw.get('tags') or ()) + ('oddrow',)
        return _orig_insert(parent_item, index, **kw)

    t.insert = _insert
    return t


# ── entry point ───────────────────────────────────────────────────────────────

if __name__ == '__main__':
    app = IDUApp()
    app.mainloop()
