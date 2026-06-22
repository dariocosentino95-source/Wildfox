# IDU Price Manager

App desktop per la gestione automatica dei listini fornitori su Mexal.

---

## Installazione

**Requisiti:** Python 3.10+ installato e nel PATH.

1. Estrai la cartella `idu_price_manager` dove preferisci (es. `C:\IDU\`)
2. Doppio clic su **`installa.bat`** → installa le dipendenze Python automaticamente
3. Avvia l'app con **`avvia.bat`** (oppure `python main.py`)

---

## Flusso di lavoro consigliato

### Prima configurazione

1. **Tab "Importa CSV Mexal"** → carica `anar_idu.csv`
   - Importa tutti gli articoli e i fornitori (codici Mexal)
   - Operazione una-tantum; ripetila ogni volta che esporti un nuovo CSV da Mexal
2. **Tab "Fornitori"** → per ogni fornitore nella lista:
   - Inserisci il **nome** leggibile (es. "CARGRO", "Dianflex")
   - Inserisci l'**URL del portale** (es. `https://www.cargro.it`)
   - (Opzionale) Inserisci la **Config JSON** con i selettori CSS per lo scraping preciso

---

## Funzionalità

### 📥 Importa CSV Mexal
Carica o aggiorna l'anagrafica articoli da `anar_idu.csv`.
Rileva automaticamente tutti i fornitori associati e i loro prezzi.

> 🔗 **Collegamento automatico a Mexal:** all'avvio l'app cerca da sola i file
> in `C:\mexal\dati\datiaz\<azienda>\` e **precompila** i percorsi di `anar` (import/export)
> e `anpr` (carico magazzino). Se le aziende sono più d'una usa la più recente.
> Puoi sempre cambiare percorso a mano. L'originale non viene mai modificato.

### 🔍 Articoli
Ricerca full-text su codice o descrizione.
Mostra tutti i fornitori dell'articolo con i rispettivi prezzi.
Include storico completo delle variazioni di prezzo.

### 🧾 Documenti Fornitore
Aggiorna **codici, prezzi e giacenze in un colpo solo** da una fattura o conferma
d'ordine del fornitore (PDF). Flusso:

1. **Sfoglia PDF** + **Analizza** → l'app riconosce il fornitore (es. Cardinale),
   estrae per ogni riga **codice + quantità + prezzo netto** (gestisce lo sconto, es. `60+14`).
2. Abbina ogni codice all'articolo Mexal cercando il **codice fornitore in qualunque
   slot 1..9** (non deve stare nella stessa colonna). L'anteprima mostra 3 stati:
   - **già collegato** → aggiorna prezzo e quantità
   - **auto-collega** → il codice è già un articolo Mexal, lo collega da solo
   - **NUOVO** → non riconosciuto: lo colleghi tu (collegamento guidato)
3. Per i NUOVI: **Precompila codici nuovi** e scrivi accanto il codice Mexal
   (`CODICE_DOC = CODICE_MEXAL`).
4. **✅ Applica**: aggiorna nel database il codice fornitore (`_ARCOF`, se mancante)
   e il prezzo (`_ARFPR` + regola prezzo base); se spuntato **"Genera carico
   magazzino"**, crea anche un **documento di carico** (`carico_mote.csv` +
   `carico_mori.csv`, causale `CL`) nella cartella Mexal.
5. **Importa in Mexal:**
   - i **codici/prezzi** → genera l'`anar` da **📥 Importa / Esporta Mexal** e reimportalo;
   - le **quantità** → importa il **carico** (Trasferimento archivi → Caricamento
     ASCII/CSV → Movimenti di magazzino). Il carico aggiorna le giacenze (e, con i
     parametri di magazzino attivi, costo e listini).

> **Perché un carico e non l'anpr:** in Mexal le giacenze si ricavano dai
> *movimenti*, non si impostano importando i progressivi. Per questo l'app genera
> un documento di carico (causale `CL`, `MMGCONDOC=NCF`, `MMPRGMAG=C+`) — formato
> validato con import reale.

> **Fornitori riconosciuti:**
> - **Cardinale** — auto-rilevato dal PDF.
> - **Spolzino, Aqualif** — stesso formato DDT (gestionale "Grafica").
> - **EM.CI.DI (Finocchiaro)** — formato proprio (`CODICE … UM QTA PREZZO SC.% TOTALE IVA`).
>   Spolzino, Aqualif ed EM.CI.DI non sono rilevabili dal testo: selezionali a
>   mano dal menu *Fornitore* prima di premere Analizza.
>
> Un fornitore deve esistere nel database per essere selezionabile. Se è nuovo
> (non collegato ad alcun articolo nell'anar), aggiungilo dal tab **🏭 Fornitori
> → Aggiungi nuovo fornitore** (codice Mexal + nome). IdroFerrara e Bonardi si
> aggiungono quando disponibili i loro documenti di esempio.

### 💰 Listini di vendita (BASE / INSTALL / APPALTI / INGROSS)
I 4 listini di vendita (`_ARPRZ(1..4)`) si calcolano dal **costo × ricarico della
categoria prezzi** dell'articolo (campo `_ARLIS`, 1–27). I ricarichi sono in
[listini.py](listini.py) (presi dalla stampa "Elenco listini" di Mexal).

Nel tab **📥 Importa / Esporta Mexal**, spunta **"Ricalcola anche i listini di
vendita"** prima di *Genera CSV aggiornato*: l'app scrive `_ARPRZ(1..4)` per ogni
articolo con categoria. I prezzi scritti sono **netti** (senza IVA); l'IVA 22% la
applica Mexal in vendita.

> Se cambi i ricarichi delle categorie in Mexal, aggiorna la tabella in `listini.py`.

### ➕ Crea nuovo articolo
Per un prodotto **non ancora in Mexal**: tab **🔍 Articoli → Crea nuovo articolo**
(codice, descrizione, UM, IVA, categoria prezzi, costo, e facoltativo fornitore +
codice + prezzo). L'articolo viene aggiunto come **riga nuova** nell'anar al
prossimo *Genera CSV aggiornato*, pronto da reimportare in Mexal — così non devi
crearlo prima in Mexal e ri-esportare.

> ⚠️ I nuovi articoli vanno **verificati in Mexal** dopo la prima importazione.

### 💾 Upload Listino
Carica un listino aggiornato dal fornitore (CSV o PDF) e applica le regole:

| Condizione | Azione |
|---|---|
| Nuovo prezzo fornitore ≤ prezzo base | Prezzo base **invariato**, prezzo fornitore aggiornato |
| Nuovo prezzo fornitore > prezzo base | Prezzo base = nuovo prezzo × **1,05** (+5%), prezzo fornitore aggiornato |
| Codice esistente in Mexal ma non associato al fornitore | **Collegamento creato automaticamente** con codice e prezzo del listino (disattivabile con la casella sopra il pulsante Avvia) |

I collegamenti creati automaticamente occupano il primo slot fornitore libero (1..9)
dell'articolo e vengono inclusi nell'export CSV per Mexal (colonne `_ARFOR`, `_ARFPR`, `_ARCOF`).

**Per CSV:** specifica le colonne "codice" e "prezzo" nel form (i nomi dipendono dal file del fornitore).
Il campo codice può essere sia il codice Mexal che il codice fornitore.

**Per PDF:** estrazione automatica tramite pattern su ogni riga del documento.

### 📄 Ordine PDF
Carica un PDF con elenco merce (codici Mexal + descrizioni).
L'app trova ogni articolo nel database e mostra una tabella comparativa con:
- Tutti i fornitori disponibili per quell'articolo
- Prezzo fornitore e prezzo base per ognuno
- ⭐ evidenzia il fornitore più conveniente

Esportabile in CSV per condivisione.

### 🌐 Ricerca Portali
Per un articolo selezionato:
1. Individua i fornitori che hanno già un codice registrato
2. Usa quel codice come termine di ricerca sui portali degli altri fornitori (scraping automatico)
3. Mostra codice trovato e prezzo per ogni fornitore
4. Con "Salva risultati" aggiorna il DB con i nuovi codici e prezzi

### 🏭 Fornitori
Anagrafica completa dei fornitori importati da Mexal.
Per ogni fornitore si può configurare:

```json
{
  "search_param": "q",
  "search_url_template": "https://portale.fornitore.it/cerca?q={TERM}",
  "selector_prezzo": ".product-price .amount",
  "selector_codice": ".product-sku span"
}
```

- `search_param`: parametro GET usato dal motore di ricerca del portale
- `search_url_template`: URL completo con `{TERM}` come segnaposto
- `selector_prezzo`: selettore CSS dell'elemento prezzo
- `selector_codice`: selettore CSS dell'elemento codice prodotto

Se non configurati, l'app usa euristica generica (funziona su molti portali standard).

### 🕐 Pianificazione
Configura l'aggiornamento settimanale automatico:
- Seleziona giorno e ora
- Al prossimo avvio dell'app nel giorno configurato, lo scraping parte in automatico
- Visualizza data/ora dell'ultimo aggiornamento
- Bottone "Avvia aggiornamento ora" per esecuzione manuale immediata

---

## Struttura del progetto

```
idu_price_manager/
├── main.py            — interfaccia desktop (Tkinter)
├── db.py              — database SQLite, import CSV Mexal, query
├── documents.py       — elaborazione fatture/DDT fornitore (codici+prezzi+giacenze)
├── price_engine.py    — regole prezzi, upload listini CSV/PDF, ordine PDF
├── scraper.py         — scraping portali fornitori (Playwright/requests)
├── scheduler.py       — aggiornamento settimanale automatico
├── export_mexal.py    — generazione CSV anar aggiornato per Mexal
├── listini.py         — ricarichi per categoria prezzi → calcolo listini vendita
├── stock_engine.py    — carico magazzino: aggiorna le giacenze (file anpr)
├── requirements.txt   — dipendenze Python
├── installa.bat       — installa dipendenze + browser + DB
├── avvia.bat          — avvia l'app
└── data/              — DATI (separati dal codice)
    ├── idu_prices.db        — database SQLite con tutti i dati
    ├── idu_price_manager.log — log operazioni e errori
    └── anar_idu.csv         — (eventuale) copia dell'anagrafica Mexal
```

> I dati stanno tutti nella cartella **`data/`**: per fare un backup basta
> copiare quella cartella; per ripartire da zero basta cancellarla
> (verrà ricreata vuota al prossimo avvio).

## File generati

| File | Contenuto |
|---|---|
| `data/idu_prices.db` | Database SQLite con tutti i dati |
| `data/idu_price_manager.log` | Log operazioni e errori |

---

## Struttura del database

```
articoli          — anagrafica articoli (da CSV Mexal)
fornitori         — fornitori con URL portale e config selettori
articolo_fornitore — relazione articolo↔fornitore con prezzi
storico_prezzi    — ogni variazione di prezzo registrata con data e motivo
config            — impostazioni app (pianificazione, ecc.)
```

---

## Note tecniche

- **Prezzo base** (`prezzo_base`) corrisponde a `_ARCUL` (ultimo costo acquisto) del CSV Mexal.
  Non scende mai automaticamente: può essere aggiornato solo manualmente dal tab Articoli.
- **Prezzo fornitore** (`prezzo_fornitore`) corrisponde a `_ARFPR(n)` e viene sempre aggiornato al valore reale del listino.
- Lo scraping usa `requests` + `BeautifulSoup`; per portali con JavaScript pesante (SPA/React)
  potrebbe non funzionare: in quel caso configura `search_url_template` con l'URL diretto della
  pagina prodotto o della API REST del fornitore.

---

## Configurazione portali specifici

### 🔐 Credenziali (tab "Credenziali Portali")
Prima di usare lo scraping automatico:
1. Vai sul tab **Credenziali Portali**
2. Seleziona il fornitore dalla lista
3. Inserisci username e password del tuo account sul portale
4. Clicca **Salva credenziali** → vengono salvate nel DB locale, mai trasmesse esternamente
5. Clicca **Testa login** per verificare che funzioni

---

### Cardinale Group — `shop.cardinalegroup.it`

| Campo | Valore da inserire nel tab Fornitori |
|---|---|
| Nome | Cardinale Group |
| URL Portale | `http://shop.cardinalegroup.it` |
| Config JSON | *(lascia vuoto, l'handler è dedicato)* |

**Note tecniche:** il portale è una SPA che blocca gli IP server → lo scraper usa Playwright
(browser Chromium locale). La ricerca avviene tramite il campo "Codice" della barra di ricerca.
I prezzi sono visibili solo dopo il login.

---

### Spolzino — `www.spolzino.com`

| Campo | Valore |
|---|---|
| Nome | Spolzino |
| URL Portale | `https://www.spolzino.com` |
| Config JSON | *(lascia vuoto)* |

**Note tecniche:** blocca i robot con `robots.txt`. Lo scraper usa Playwright con login
sull'area `/il-mio-account`. Catalogo navigabile sotto `/catalogo/prodotti`.

---

### IdroFerrara — `aziende.idroferrara.com`

| Campo | Valore |
|---|---|
| Nome | IdroFerrara |
| URL Portale | `https://aziende.idroferrara.com` |
| Config JSON | *(lascia vuoto)* |

**Note tecniche:** piattaforma **Magento 2** — lo scraper prova prima la **REST API**
(`/rest/V1/products`) che è più veloce e precisa. Se l'API restituisce 403 (token non
autorizzato per i prezzi B2B), usa Playwright con login standard Magento
(`/customer/account/login/`).

---

### Portale generico (qualsiasi altro fornitore)

Se aggiungi un fornitore non riconosciuto, configura la Config JSON nel tab Fornitori:

```json
{
  "search_url_template": "https://portale.fornitore.it/cerca?q={TERM}",
  "selector_prezzo": ".price .amount",
  "selector_codice": ".product-sku",
  "login_url": "https://portale.fornitore.it/login",
  "login_field_user": "email",
  "login_field_pass": "password"
}
```

Tutti i campi sono opzionali: se non specificati, l'app usa euristica generica.

---

## Risoluzione problemi

| Problema | Soluzione |
|---|---|
| "Playwright not installed" | Esegui `python -m playwright install chromium` |
| Login fallito su Cardinale/Spolzino | Verifica credenziali nel tab 🔐; prova "Testa login" |
| Prezzi sempre 0 su IdroFerrara | Il tuo account potrebbe non avere i prezzi B2B attivi — contatta IdroFerrara |
| Scraping lento | Normale: ogni ricerca apre un browser reale (~10-20s per portale) |
| 403 Forbidden su tutti i portali | I portali bloccano gli IP server; Playwright usa il tuo IP locale, non avrai questo problema |

---

## 📤 Esportazione CSV per Mexal

Nel tab **Importa / Esporta Mexal**, sezione "Esporta CSV aggiornato":

1. Indica il file `anar_idu.csv` originale (serve a mantenere la struttura esatta delle 431 colonne)
2. Clicca **📤 Genera CSV aggiornato**
3. Scegli dove salvarlo

Il file generato:
- Ha **lo stesso identico formato** di anar_idu.csv (431 colonne, separatore `;`, encoding latin-1, decimali con virgola)
- Contiene **tutti gli articoli** con i prezzi fornitore aggiornati nei campi `_ARFPR(n)`, i codici fornitore in `_ARCOF(n)` e il costo ultimo in `_ARCUL`
- Tutte le altre colonne restano **identiche all'originale**

È pronto da **reimportare direttamente in Mexal**.

**Importante:** il programma genera solo un file. Non effettua acquisti, ordini o
modifiche sui portali dei fornitori — lo scraping è in sola lettura.
