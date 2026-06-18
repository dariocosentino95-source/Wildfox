"""
listini.py - Calcolo dei prezzi di vendita (listini) per categoria prezzi.

I 4 listini di vendita IDU:
    1 = BASE, 2 = INSTALL, 3 = APPALTI, 4 = INGROSS  (campo Mexal _ARPRZ(1..4))

Ogni articolo ha una "categoria prezzi" 1..27 nel campo Mexal **_ARLIS**.
Il prezzo di ogni listino = costo × (1 + ricarico% / 100), dove il ricarico
dipende da (listino, categoria). I ricarichi qui sotto provengono dalla stampa
"Elenco listini" di Mexal (categorie 28..99 = 0 → nessun listino).

⚠️ Se in Mexal cambi i ricarichi delle categorie, aggiorna questa tabella.
"""

NOMI_LISTINI = {1: 'BASE', 2: 'INSTALL', 3: 'APPALTI', 4: 'INGROSS'}

# categoria → (ricarico BASE, INSTALL, APPALTI, INGROSS) in percentuale
RICARICHI = {
    1:  (80, 55, 45, 35),
    2:  (80, 50, 40, 35),
    3:  (80, 40, 30, 25),
    4:  (80, 40, 40, 35),
    5:  (80, 50, 45, 40),
    6:  (80, 50, 40, 35),
    7:  (80, 50, 45, 40),
    8:  (80, 50, 40, 35),
    9:  (80, 60, 50, 40),
    10: (80, 60, 50, 40),
    11: (80, 50, 40, 30),
    12: (80, 40, 30, 25),
    13: (80, 40, 30, 25),
    14: (80, 50, 45, 40),
    15: (80, 50, 40, 35),
    16: (80, 50, 40, 35),
    17: (80, 50, 40, 35),
    18: (80, 60, 50, 40),
    19: (80, 50, 40, 40),
    20: (80, 40, 30, 25),
    21: (80, 40, 35, 30),
    22: (80, 50, 45, 40),
    23: (80, 50, 40, 35),
    24: (80, 60, 50, 40),
    25: (80, 50, 40, 35),
    26: (80, 50, 40, 35),
    27: (80, 50, 40, 35),
}


def calcola_listini(costo, categoria):
    """
    Ritorna {1: prezzo_BASE, 2: INSTALL, 3: APPALTI, 4: INGROSS} dato il costo
    e la categoria prezzi (1..27). Vuoto se costo o categoria mancanti/senza
    ricarico configurato.
    """
    try:
        cat = int(float(str(categoria).strip()))
    except (ValueError, TypeError):
        return {}
    if not costo or costo <= 0:
        return {}
    ric = RICARICHI.get(cat)
    if not ric:
        return {}
    return {i + 1: round(costo * (1 + ric[i] / 100.0), 4) for i in range(4)}
