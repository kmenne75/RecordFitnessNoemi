MISURE & PROGRESSI — PWA

CONTENUTO
- index.html: interfaccia principale
- styles.css: stile responsive per smartphone e desktop
- app.js: archivio locale, calcoli, grafico, importazione ed esportazione
- manifest.webmanifest: configurazione di installazione
- sw.js: funzionamento offline
- icons/icon.svg: icona dell'app

AVVIO
La PWA deve essere servita tramite HTTPS oppure in ambiente locale (localhost). Non aprire index.html direttamente con un doppio clic, perché i browser limitano service worker e installazione sulle pagine file://.

Esempio in una cartella locale con un server statico già disponibile:
1. Pubblicare tutti i file mantenendo la stessa struttura.
2. Aprire l'indirizzo HTTPS nel browser.
3. Usare “Installa app” quando proposto dal browser.

DATI
I dati sono salvati nel browser tramite IndexedDB. Al primo avvio l'archivio è vuoto e non contiene registrazioni di esempio: tutte le misure vengono inserite dall'utente oppure importate da un proprio backup.

BACKUP
Usare Archivio > Esporta JSON per il backup completo. Il pulsante “Condividi e salva backup” apre, quando supportato dal dispositivo, il menu nativo per scegliere File, servizi cloud o altre destinazioni disponibili; se la condivisione dei file non è supportata, l'app esegue il normale download JSON. Il CSV è pensato per consultazione e scambio con Excel. L'importazione accetta i backup JSON prodotti dall'app e i CSV con le stesse colonne dell'esportazione.

TREND MEDI
Nella sezione Andamento è disponibile una scheda aggiuntiva per analizzare una misura a scelta con raggruppamento settimanale o mensile. La finestra temporale può essere impostata liberamente tramite le date Dal e Al; ogni punto del grafico rappresenta la media delle rilevazioni disponibili nel relativo periodo.

CAMPI REGISTRATI
- Data
- Peso (kg)
- Plica addominale (mm)
- Glutei (cm)
- Vita ombellico (cm)
- Coscia sotto gluteo (cm)
- Note
