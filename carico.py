"""
carico.py - Genera un documento di CARICO di magazzino (testata mote + righe mori)
da reimportare in Mexal (Servizi → Trasferimento archivi → Caricamento ASCII/CSV →
Movimenti di magazzino). Importando il carico, Mexal aggiorna le GIACENZE (e, con i
parametri attivi, costo ultimo e listini).

Strategia sicura: usa come modello la struttura di un documento reale già esportato
(testata/righe), cambia la causale + intestatario + righe e azzera i campi contabili
(totali, pagamento, riferimenti). Le colonne restano identiche all'export Mexal.

⚠️ Crea documenti in Mexal: provare SEMPRE prima su un movimento/azienda di test.
"""
import csv
import datetime
import logging

logger = logging.getLogger(__name__)

MOTE_SRC = r"C:\mexal\dati\datiaz\idu\mote_idu.csv"
MORI_SRC = r"C:\mexal\dati\datiaz\idu\mori_idu.csv"

# Campi TESTATA da azzerare per un carico di solo magazzino (no contabilità)
_MOTE_CLEAR = {
    '_MMTOTVALID', '_MMTOTIVA', '_MMTOTDOC', '_MMTOTDAPAGARE', '_MMSCMERCE',
    '_MMPAG', 'DESPAG', '_MMTPS', '_MMVAS', '_MMACC', '_MMABB', '_MMNOT',
    '_MMMSI', '_MMMSE', '_MMMSAZ', '_MMMNU', '_MMMDA',
    '_MMOSI', '_MMOSE', '_MMOSAZ', '_MMONU', '_MMODA',
    '_MMSIGRE', '_MMNUMRE', '_MMDATRE', '_MMMSIRE', '_MMMNURE', '_MMMDARE',
    '_MMOSIRE', '_MMONURE', '_MMODARE',
    '_MMDATAREGPN', '_MMNUMPRGPN', '_MMDOCOLD', '_MMRIFSERI', '_MMRIFNUMI',
}
# Campi RIGA da azzerare (valori calcolati da Mexal: valore, costi, sconti riga)
_MORI_CLEAR = {
    'VALREAL', 'PRZREAL', '_MMULT', '_MMSTD', '_MMPON', '_MMCMR',
    '_MMCS1', '_MMCS2', '_MMSCO', '_MMPRO', 'QTAREAL',
}


def _load_template(path, sigla):
    """Carica intestazione colonne + una riga modello con la sigla data."""
    with open(path, encoding='latin-1', newline='') as f:
        rd = csv.DictReader(f, delimiter=';')
        cols = rd.fieldnames
        for row in rd:
            if (row.get('_MMSIG') or '').strip() == sigla:
                return cols, dict(row)
    return cols, None


def _fmt(val, dec=2):
    try:
        return f"{float(str(val).replace(',', '.')):.{dec}f}".replace('.', ',')
    except (ValueError, TypeError):
        return str(val)


def _write(path, cols, rows):
    with open(path, 'w', encoding='latin-1', newline='') as f:
        w = csv.DictWriter(f, fieldnames=cols, delimiter=';',
                           quoting=csv.QUOTE_MINIMAL, quotechar='"',
                           extrasaction='ignore')
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, '') for c in cols})


def genera_carico(items, fornitore_codice, fornitore_nome,
                  out_mote, out_mori, causale='CL', magazzino='1',
                  numero=None, data=None, template_sigla='FF'):
    """
    items: lista di dict {arcod, descrizione, um, qta, prezzo, iva}
    Genera out_mote (1 testata) e out_mori (N righe). Ritorna statistiche.
    """
    cols_mote, tmpl_mote = _load_template(MOTE_SRC, template_sigla)
    cols_mori, tmpl_mori = _load_template(MORI_SRC, template_sigla)
    if not tmpl_mote or not tmpl_mori:
        raise RuntimeError(f"Modello '{template_sigla}' non trovato in mote/mori.")

    data = data or datetime.datetime.now().strftime('%d%m%Y')
    numero = str(numero or datetime.datetime.now().strftime('%H%M%S'))

    # testata
    h = dict(tmpl_mote)
    for k in _MOTE_CLEAR:
        if k in h:
            h[k] = ''
    h.update({'_MMSIG': causale, '_MMSER': '1', '_MMSAZ': '1', '_MMNUM': numero,
              '_MMCLI': fornitore_codice, 'NUMTEST': '1', '_MMDAT': data,
              '_MMMAG': magazzino, 'DESCLI': (fornitore_nome or '')[:40]})

    # righe
    righe = []
    for i, it in enumerate(items, 1):
        r = dict(tmpl_mori)
        for k in _MORI_CLEAR:
            if k in r:
                r[k] = ''
        r.update({'_MMSIG': causale, '_MMSER': '1', '_MMSAZ': '1', '_MMNUM': numero,
                  '_MMCLI': fornitore_codice, 'NUMTEST': '1', '_MMDAT': data,
                  '_MMTPR': 'R', 'TIPART': '1',
                  'CODARTDES': it['arcod'], 'DESART': (it.get('descrizione') or '')[:40],
                  'DESUM': it.get('um') or 'PZ', 'QTA': _fmt(it['qta']),
                  '_MMPRZ': _fmt(it['prezzo'], 4), '_MMALI': it.get('iva') or ' 22  ',
                  '_MMNCRERIGA': str(i)})
        righe.append(r)

    _write(out_mote, cols_mote, [h])
    _write(out_mori, cols_mori, righe)
    logger.info(f"Carico generato: causale {causale}, {len(righe)} righe, "
                f"fornitore {fornitore_codice}")
    return {'mote': out_mote, 'mori': out_mori, 'righe': len(righe),
            'causale': causale, 'numero': numero}
