MISUREFITNESS — PWA v1.0.0

DESCRIZIONE
MisureFitness è una PWA offline-first per registrare e analizzare nove misure corporee:
1. Peso (kg)
2. Plica addominale (mm)
3. Plica interno coscia (mm)
4. Spalle (cm)
5. Torace (cm)
6. Bicipite (cm)
7. Vita (cm)
8. Fianchi (cm)
9. Coscia (cm)

COMPATIBILITÀ E MIGRAZIONE
- Il database resta “misure-progressi-db”, versione 1, per aggiornare l’installazione esistente senza perdere i dati.
- Peso e Plica addominale restano invariati.
- Glutei viene copiato in Fianchi.
- Vita ombellico viene copiata in Vita.
- Coscia sotto gluteo viene copiata in Coscia.
- Plica interno coscia, Spalle, Torace e Bicipite iniziano vuoti per i record precedenti.
- I campi legacy vengono conservati nei record esistenti e nei backup JSON: nessun valore precedente viene cancellato.
- L’importazione accetta sia backup MisureFitness sia JSON/CSV prodotti dalla precedente Misure & Progressi.

FUNZIONI
- Una registrazione per data, modificabile e aggiornabile.
- Validazione delle misure e note fino a 500 caratteri.
- Medie del periodo, variazioni, numero di rilevazioni e media mobile 7 giorni.
- Trend medi settimanali e mensili per tutte le nove misure.
- Storico completo con modifica della data selezionata.
- Esportazione JSON, CSV completo e CSV del periodo filtrato.
- Condivisione del backup JSON con fallback al download.
- Importazione JSON/CSV con merge per data.
- Installazione PWA e uso offline dopo il primo caricamento HTTPS.

CONFERME DI CANCELLAZIONE
Tutte le funzioni che cancellano dati richiedono una conferma aggiuntiva:
- eliminazione della singola registrazione: dialogo + digitazione di CANCELLA;
- cancellazione completa dell’archivio: dialogo + digitazione di CANCELLA.
“Svuota campi” non elimina dati salvati e non richiede la conferma distruttiva.

PUBBLICAZIONE
Pubblicare tutti i file mantenendo la struttura, tramite HTTPS o localhost. Non aprire index.html direttamente con file:// perché service worker e installazione PWA possono essere limitati.

DATI E BACKUP
I dati sono salvati localmente in IndexedDB. Eseguire regolarmente un backup JSON. Il CSV usa separatore punto e virgola e codifica UTF-8 con BOM.

CONTENUTO
- index.html — interfaccia
- styles.css — layout responsive
- app.js — dati, migrazione, analisi, grafici, import/export
- sw.js — funzionamento offline
- manifest.webmanifest — installazione PWA
- icons/ — icone applicazione
