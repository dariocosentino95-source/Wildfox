"""
ocr.py - Lettura di DDT/fatture SCANSIONATI (immagini) tramite OCR.

Usato come fallback quando un PDF non ha testo (è una scansione) o quando si
carica un file immagine. Motore: RapidOCR (onnxruntime, offline, solo-pip).
Ricostruisce le righe della tabella dalla posizione dei box OCR e ne estrae
codice, prezzo unitario, sconto, importo → prezzo netto e quantità.

⚠️ L'OCR può sbagliare qualche cifra: i risultati vanno SEMPRE controllati in
anteprima prima di applicarli (l'app li mostra in tabella con Registrato/Diff).
"""
import re
import io
import logging

logger = logging.getLogger(__name__)

_OCR = None
_CODE = re.compile(r'^[A-Z]{2,4}\d{2,}$')   # SIF128, RUB1967, MID1250, …


def available() -> bool:
    """True se il motore OCR è installato."""
    try:
        import rapidocr_onnxruntime  # noqa: F401
        return True
    except Exception:
        return False


def _engine():
    global _OCR
    if _OCR is None:
        from rapidocr_onnxruntime import RapidOCR
        _OCR = RapidOCR()
    return _OCR


def pdf_has_text(path: str) -> bool:
    """True se il PDF ha del testo estraibile (quindi NON serve l'OCR)."""
    import pdfplumber
    try:
        with pdfplumber.open(path) as pdf:
            return any((pg.extract_text() or '').strip() for pg in pdf.pages)
    except Exception:
        return True   # nel dubbio non forziamo l'OCR


def _image_from(path: str):
    """Ritorna un ndarray RGB da un PDF scansionato (immagine incorporata) o
    da un file immagine (PNG/JPG)."""
    import numpy as np
    from PIL import Image
    p = path.lower()
    if p.endswith('.pdf'):
        import pdfplumber
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                for im in page.images:
                    st = im.get('stream')
                    for getter in (lambda: getattr(st, 'rawdata', None),
                                   lambda: st.get_data()):
                        try:
                            data = getter()
                            if data:
                                return np.array(Image.open(io.BytesIO(data)).convert('RGB'))
                        except Exception:
                            continue
        return None
    return np.array(Image.open(path).convert('RGB'))


def _num(s: str):
    """Converte un numero letto dall'OCR (separatore decimale . o ,)."""
    s = s.strip()
    if ',' in s and '.' in s:
        s = (s.replace('.', '').replace(',', '.')
             if s.rfind(',') > s.rfind('.') else s.replace(',', ''))
    else:
        s = s.replace(',', '.')
    try:
        return float(s)
    except ValueError:
        return None


def parse_document_ocr(path: str, progress_cb=None):
    """
    Legge un documento scansionato (layout tipo 'grafica': CODICE DESCR UM QTA
    PREZZO SCONTO IMPORTO IVA) e ritorna [{codice, qta, prezzo_netto, ...}].

    Strategia robusta: prezzo unitario = numero con 3 decimali; i numeri alla
    sua destra, in ordine, sono [sconto, (sconto2), importo]. Prezzo netto =
    prezzo × (1−sconto)(1−sconto2); quantità = importo / netto (così si recupera
    anche quando l'OCR salta la colonna quantità).
    """
    img = _image_from(path)
    if img is None:
        return []
    res, _ = _engine()(img)
    if not res:
        return []

    # ricostruisci le righe raggruppando i box per coordinata verticale
    boxes = sorted((sum(p[1] for p in b) / 4, min(p[0] for p in b), t)
                   for b, t, _c in res)
    rows, cur, ly = [], [], None
    for y, x, t in boxes:
        if ly is None or abs(y - ly) < 18:
            cur.append((x, t))
        else:
            rows.append(cur)
            cur = [(x, t)]
        ly = y
    if cur:
        rows.append(cur)

    items = []
    for row in rows:
        xt = sorted(row)
        cod = next((t.strip() for _x, t in xt if _CODE.match(t.strip())), None)
        if not cod:
            continue
        prezzo, after = None, []
        for _x, t in xt:
            t = t.strip()
            if _CODE.match(t):
                continue
            if prezzo is None and re.fullmatch(r'\d{1,3}[.,]\d{3}', t):
                prezzo = _num(t)
                continue
            if prezzo is not None and re.fullmatch(r'\d{1,3}[.,]\d{1,3}', t):
                v = _num(t)
                if v is not None:
                    after.append(v)
        if not (prezzo and after):
            continue
        sconto = after[0]
        importo = after[-1] if len(after) >= 2 else None
        sc2 = after[1] if len(after) >= 3 else None
        netto = round(prezzo * (1 - sconto / 100) * (1 - (sc2 or 0) / 100), 4)
        qta = round(importo / netto) if (importo and netto) else None
        # riga incerta: quantità non ricavabile o sconto non plausibile
        incerto = qta is None or not (10 <= sconto <= 90)
        items.append({
            'codice': cod,
            'qta': qta,
            'prezzo_lordo': prezzo,
            'prezzo_netto': netto,
            'sconto': f'{sconto:g}' + (f'+{sc2:g}' if sc2 else ''),
            'ocr': True,
            'ocr_incerto': incerto,
        })
    logger.info(f"OCR: {len(items)} righe lette da {path}")
    return items
