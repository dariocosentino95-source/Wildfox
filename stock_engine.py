"""
stock_engine.py - Carico magazzino: aggiorna le giacenze nel file anpr Mexal.

Regola di aggiornamento (decisa con l'utente):
    nuova_esistenza = max(esistenza_attuale, 0) + quantità_entrante
cioè se l'esistenza è negativa la si azzera prima di aggiungere la merce.

Sorgenti delle quantità entranti supportate:
    - CSV     (colonna codice + colonna quantità)
    - PDF     (bolla/DDT: estrazione euristica codice + quantità)
    - manuale (righe di testo "CODICE  QUANTITA")

NB sul campo: in anpr la quantità a inventario è QTAINVENT; il valore è _ARINV.
   Mexal calcola l'esistenza come inventario + carichi - scarichi: questa
   ipotesi è isolata nelle costanti qui sotto. Se il tuo Mexal si comporta
   diversamente, basta cambiare CAMPO_ESISTENZA / la formula in _esistenza().
   Lavora SEMPRE su una copia e verifica prima di reimportare in Mexal.
"""
import re
import logging
import pandas as pd

logger = logging.getLogger(__name__)

CAMPO_ESISTENZA = 'QTAINVENT'   # quantità a inventario
CAMPO_CARICO    = 'QTACARICO'   # quantità caricata nel periodo
CAMPO_SCARICO   = 'QTASCARIC'   # quantità scaricata nel periodo
CAMPO_VALORE    = '_ARINV'      # valore di inventario (= qta * costo)
CAMPO_CODICE    = '_ARCOD'
CAMPO_MAGAZZINO = 'NUMMAG'


# ─────────────────────────────────────────────────────────────────────────────
# Regola di calcolo (isolata e testabile)
# ─────────────────────────────────────────────────────────────────────────────

def nuova_esistenza(esistenza_attuale: float, entrante: float) -> float:
    """max(esistenza, 0) + entrante. Cuore della regola concordata."""
    base = esistenza_attuale if esistenza_attuale and esistenza_attuale > 0 else 0.0
    return round(base + entrante, 2)


def _esistenza(row) -> float:
    """Esistenza corrente di una riga anpr = inventario + carichi - scarichi."""
    inv = _parse_qta(row.get(CAMPO_ESISTENZA))
    car = _parse_qta(row.get(CAMPO_CARICO))
    sca = _parse_qta(row.get(CAMPO_SCARICO))
    return (inv or 0.0) + (car or 0.0) - (sca or 0.0)


# ─────────────────────────────────────────────────────────────────────────────
# Parser sorgenti quantità → dict {codice: quantità_totale}
# (se un codice compare più volte, le quantità si sommano)
# ─────────────────────────────────────────────────────────────────────────────

def parse_quantities_csv(path: str, col_codice: str, col_qta: str,
                         sep: str = ';', encoding: str = 'latin-1') -> dict:
    df = pd.read_csv(path, sep=sep, engine='python', encoding=encoding,
                     dtype=str, keep_default_na=False)
    out = {}
    for row in df.to_dict('records'):
        cod = str(row.get(col_codice, '') or '').strip()
        qta = _parse_qta(row.get(col_qta))
        if cod and qta:
            out[cod] = out.get(cod, 0.0) + qta
    return out


def parse_quantities_text(text: str) -> dict:
    """Righe libere 'CODICE  QUANTITA' (separatore: tab, ; o spazi)."""
    out = {}
    for line in (text or '').splitlines():
        line = line.strip()
        if not line:
            continue
        parts = re.split(r'[\t;]+|\s{2,}|\s+', line)
        parts = [p for p in parts if p]
        if len(parts) < 2:
            continue
        cod = parts[0].strip()
        qta = _parse_qta(parts[-1])
        if cod and qta:
            out[cod] = out.get(cod, 0.0) + qta
    return out


def parse_quantities_pdf(path: str) -> dict:
    """
    Estrazione EURISTICA da bolla/DDT PDF: per ogni riga prende il primo token
    che sembra un codice e la prima quantità plausibile. Verifica sempre il
    risultato nell'anteprima prima di applicare.
    """
    import pdfplumber
    out = {}
    code_re = re.compile(r'^([A-Z0-9][A-Z0-9.\-/]{2,20})\b', re.IGNORECASE)
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for line in (page.extract_text() or '').splitlines():
                line = line.strip()
                m = code_re.match(line)
                if not m:
                    continue
                cod = m.group(1).upper()
                # numeri sulla riga, escluso il codice iniziale
                resto = line[m.end():]
                nums = re.findall(r'(\d{1,5}(?:[.,]\d{1,3})?)', resto)
                if not nums:
                    continue
                # quantità = primo numero "piccolo" (qta tipiche < 10000)
                qta = _parse_qta(nums[0])
                if cod and qta:
                    out[cod] = out.get(cod, 0.0) + qta
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Aggiornamento anpr
# ─────────────────────────────────────────────────────────────────────────────

def update_anpr(anpr_path: str, incoming_by_arcod: dict,
                nummag: str = '1', output_path: str = None,
                costo_map: dict = None, progress_cb=None, log_cb=None) -> dict:
    """
    Applica la regola di carico a una copia di anpr.

    incoming_by_arcod : { _ARCOD : quantità_entrante }
    nummag            : magazzino su cui caricare (default '1' = principale)
    output_path       : se None → solo simulazione (non scrive nulla)
    costo_map         : { _ARCOD_UPPER : costo } per aggiornare anche _ARINV

    Ritorna dict con 'report' (riga per riga), 'non_trovati', e conteggi.
    """
    if log_cb:
        log_cb(f"Lettura anpr: {anpr_path}")
    df = pd.read_csv(anpr_path, sep=';', engine='python', encoding='latin-1',
                     dtype=str, keep_default_na=False)
    cols = df.columns.tolist()
    for c in (CAMPO_CODICE, CAMPO_ESISTENZA, CAMPO_MAGAZZINO):
        if c not in cols:
            raise ValueError(f"Colonna '{c}' assente in anpr: file non valido.")

    incoming_up = {k.upper(): v for k, v in incoming_by_arcod.items()}
    costo_map = costo_map or {}
    nummag = str(nummag).strip()

    # Indicizza le righe per (codice, magazzino) — un codice ha più righe identiche
    idx_by_cod = {}
    for i in range(len(df)):
        if str(df.at[i, CAMPO_MAGAZZINO]).strip() != nummag:
            continue
        cod_up = str(df.at[i, CAMPO_CODICE]).strip().upper()
        if cod_up in incoming_up:
            idx_by_cod.setdefault(cod_up, []).append(i)

    report = []
    righe_mod = 0
    has_valore = CAMPO_VALORE in cols
    total = len(incoming_up)
    for n, (cod_up, qta) in enumerate(incoming_up.items()):
        idxs = idx_by_cod.get(cod_up)
        if not idxs:
            report.append({'codice': cod_up, 'stato': 'non_in_magazzino',
                           'entrante': qta})
            continue
        # tutte le righe duplicate hanno la stessa esistenza: leggi dalla prima
        old = _esistenza({k: df.at[idxs[0], k] for k in
                          (CAMPO_ESISTENZA, CAMPO_CARICO, CAMPO_SCARICO)
                          if k in cols})
        new = nuova_esistenza(old, qta)
        for i in idxs:
            df.at[i, CAMPO_ESISTENZA] = _fmt_qta(new)
            # azzera i movimenti di periodo: l'esistenza ora è tutta in inventario
            if CAMPO_CARICO in cols:
                df.at[i, CAMPO_CARICO] = _fmt_qta(0)
            if CAMPO_SCARICO in cols:
                df.at[i, CAMPO_SCARICO] = _fmt_qta(0)
            if has_valore and cod_up in costo_map and costo_map[cod_up]:
                df.at[i, CAMPO_VALORE] = _fmt_qta(round(new * costo_map[cod_up], 2))
            righe_mod += 1
        report.append({'codice': cod_up, 'stato': 'aggiornato',
                       'vecchia': old, 'entrante': qta, 'nuova': new,
                       'nummag': nummag})
        if progress_cb and total:
            progress_cb(n + 1, total)

    if output_path:
        import csv
        df.to_csv(output_path, sep=';', encoding='latin-1', index=False,
                  quoting=csv.QUOTE_MINIMAL, quotechar='"', errors='replace')
        if log_cb:
            log_cb(f"✅ Scritto: {output_path}")
        logger.info(f"Carico magazzino: {righe_mod} righe anpr modificate "
                    f"(mag {nummag}), output {output_path}")

    non_trovati = [r for r in report if r['stato'] == 'non_in_magazzino']
    aggiornati = [r for r in report if r['stato'] == 'aggiornato']
    return {
        'report': report,
        'aggiornati': aggiornati,
        'non_trovati': non_trovati,
        'righe_modificate': righe_mod,
        'n_articoli': len(aggiornati),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Helper numeri (formato italiano: virgola decimale)
# ─────────────────────────────────────────────────────────────────────────────

def _parse_qta(val):
    if val is None:
        return None
    s = str(val).strip().replace('.', '').replace(',', '.') \
        if ',' in str(val) else str(val).strip()
    s = s.replace(' ', '')
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _fmt_qta(val) -> str:
    """Numero nel formato Mexal: 2 decimali con virgola. Es: 12.0 -> '12,00'."""
    try:
        return f"{float(val):.2f}".replace('.', ',')
    except (ValueError, TypeError):
        return str(val)
