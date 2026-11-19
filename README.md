# Galileo Sim

Laboratori di fisica interattivi in 3D, pensati per GitHub Pages: solo file statici, nessuna compilazione.

## Laboratori

I laboratori non sono numerati: la pagina iniziale li raggruppa per branca della fisica, con un filtro (anche dall'indirizzo, per esempio `index.html#ottica`) e due viste, a elenco o a griglia.

| Branca | Titolo | Tema | Cartella |
|--------|--------|------|----------|
| Meccanica | Il moto di caduta | Cinematica | `labs/caduta/` |
| Meccanica | Il piano inclinato | Dinamica | `labs/piano/` |
| Meccanica | Il moto di rotolamento | Rotazione | `labs/rotolamento/` |
| Meccanica | Il pendolo | Oscillazioni | `labs/pendolo/` |
| Meccanica | Il moto parabolico | Cinematica | `labs/parabolico/` |
| Meccanica | Il moto circolare | Dinamica | `labs/circolare/` |
| Meccanica | La guidovia | Dinamica e urti | `labs/guidovia/` |
| Fluidi | Caduta in un fluido viscoso | Viscosità | `labs/viscosita/` |
| Fluidi | La spinta di Archimede | Idrostatica | `labs/archimede/` |
| Onde | Le onde stazionarie | Corde e tubi sonori | `labs/onde/` |
| Onde | La vaschetta ondoscopica | Onde sull'acqua | `labs/vaschetta/` |
| Ottica | La macchina fotografica | Ottica geometrica | `labs/fotocamera/` |
| Ottica | Il prisma ottico | Ottica geometrica | `labs/prisma/` |
| Ottica | Lenti e immagini | Ottica geometrica | `labs/lenti/` |
| Ottica | Interferenza e diffrazione | Ottica ondulatoria | `labs/interferenza/` |
| Ottica | L'esperimento di Fizeau | Velocità della luce | `labs/fizeau/` |

## Provarlo in locale

I moduli JavaScript richiedono un server HTTP (aprire `index.html` con doppio clic non basta):

```bash
python -m http.server 8000
# poi apri http://localhost:8000/
```

## Pubblicarlo su GitHub Pages

1. Crea un repository su GitHub e carica il contenuto di questa cartella.
2. Nel repository: **Settings → Pages → Build and deployment → Deploy from a branch**, ramo `main`, cartella `/ (root)`.
3. Dopo un minuto il sito è su `https://<utente>.github.io/<repository>/`.

Tutti i percorsi sono relativi, quindi il sito funziona sia alla radice del dominio sia in una sottocartella. Il file `.nojekyll` dice a GitHub di servire i file così come sono.

## Struttura

```
index.html                 pagina iniziale: laboratori per branca, filtro, vista a elenco o a griglia
assets/                    icona e copertine
shared/                    codice comune a tutti i laboratori
  css/lab.css              stile: pannello, controlli, riquadri, etichette
  js/stage.js              renderer, luci da studio, pavimento a griglia, post-produzione, contorno degli oggetti in moto
  js/plotview.js           il grafico del riquadro si apre in grande (clic, tasto G, pulsante «Grafico» sui telefoni)
  js/geo.js                solidi di rivoluzione, sezioni, texture procedurali
  js/controls.js           cursori, interruttori e selettori del pannello
  js/tags.js               etichette agganciate alla scena 3D
  js/color.js              dalla lunghezza d'onda al colore (CIE 1931, sRGB)
  js/lines.js              linee "spesse" con buffer riutilizzabili (anche aggiornati solo nella parte nuova)

Meccanica
labs/caduta/               il moto di caduta
  js/fall.js               pianeti, oggetti, gravità + resistenza dell'aria + Archimede (Runge–Kutta 4)
  js/rig.js                asta graduata con piede a botte, sganci, oggetti, cronometro a LED
  js/ui.js, main.js
labs/piano/                il piano inclinato
  js/incline.js            carrello e blocco (attrito statico e dinamico), molla, respingente, fotocellule, campanelli
  js/rig.js                tavola incernierata con sostegno, goniometro, righello, fermo, fotocellule e cronometro, campanelli, dinamometro, corpi
  js/ui.js, main.js
labs/rotolamento/          il moto di rotolamento
  js/rolling.js            sfere, cilindro, anello, ruota su binari, pattino; rotolamento e strisciamento, effetto, velocità dei punti
  js/rig.js                tavola a cinque corsie con sostegno, lanciatori a molla, pioli a scomparsa, binari, traguardo con fotocellule, traiettorie
  js/ui.js, main.js
labs/pendolo/              il pendolo
  js/pendulum.js           pendolo semplice (sfera e filo) e fisico (asta, disco, anello); aria, perno, fotocellula, periodo esatto (agm)
  js/rig.js                sostegno con braccio, morsetti del filo e perno, goniometro, corpi forati, fotocellule a forcella, cronometro, confronti
  js/ui.js, main.js
labs/parabolico/           il moto parabolico
  js/proj.js               palline, aria, rimbalzi e rotolamento, urto col barattolo, mira, discesa sulla rampa di Galileo (Runge–Kutta 4)
  js/rig.js                lanciatore a molla con goniometro, pozzetto, metro, asta, bersagli
  js/galileo.js            il piano curvo in legno di Galileo: rampa intarsiata, tavola con la parabola, base
  js/ui.js, main.js
labs/circolare/            il moto circolare
  js/circ.js               motore, dischi (braccio, cuscino d'aria, volo, pavimento), fotocellula
  js/rig.js                piattaforma rotante, braccio con sensore, centralina, lampada e schermo
  js/ui.js, main.js
labs/guidovia/             la guidovia
  js/track.js              carrelli sul cuscino d'aria, urti molla–smorzatore e velcro, filo e carrucola, fotocellule (Runge–Kutta 4)
  js/rig.js                banco, rotaia triangolare con spessori, carrelli, fotocellule e cronometro, carrucola, soffiante
  js/ui.js, main.js

Fluidi
labs/viscosita/            caduta in un fluido viscoso
  js/viscous.js            fluidi (glicerina–acqua di Cheng, oli, miele) e sfere; Stokes con correzione di Reynolds, pareti (Francis), massa aggiunta
  js/rig.js                tubo di vetro col liquido, sostegno, segni del tratto di misura, termometro, sfere
  js/ui.js, main.js
labs/archimede/            la spinta di Archimede
  js/hydro.js              liquidi e materiali, volume immerso (esatto da dritti, tabulato da inclinati), molla, livello, vaso a sfioro, secchiello
  js/rig.js                sostegno, dinamometro a molla, corpi, becher graduato, vaso a sfioro su elevatore, becherino, bilancia elettronica
  js/ui.js, main.js

Onde
labs/onde/                 le onde stazionarie
  js/waves.js              equazione delle onde smorzata alle differenze finite (corda e colonna d'aria), soluzione a regime, stroboscopio
  js/rig.js                tavolo, vibratore, corda, carrucola e pesi, generatore di funzioni, stroboscopio; tubo a cannocchiale, altoparlante, particelle, polvere di sughero
  js/ui.js, main.js
labs/vaschetta/            la vaschetta ondoscopica
  js/ripple.js             dispersione delle increspature (gravità e tensione superficiale), interferenza e diffrazione di Huygens, Doppler
  js/tank.js               l'acqua nella scheda grafica: equazione delle onde su 400 × 400 celle, pareti, sorgenti, la luce sul foglio
  js/rig.js                vasca col fondo di vetro, vibratore a punte e ad asta, carrello, ostacoli, spiagge, lampada, foglio; specchio a 45° e schermo
  js/ui.js, main.js

Ottica
labs/fotocamera/           la macchina fotografica
  js/optics.js             prescrizioni ottiche, tracciamento reale dei raggi, analisi parassiale
  js/cameraModel.js        modello 3D procedurale della fotocamera e spaccato
  js/photo.js              la fotografia: campionamento della pupilla e del tempo di posa, sviluppo
  js/rays.js, subjects.js, overlays.js, ui.js, main.js
labs/prisma/               il prisma ottico
  js/prism.js              vetri (Sellmeier), righe delle lampade, tracciamento con Snell e Fresnel, spettro
  js/apparatus.js          lampada, piattaforma, schermo ad arco, spettroscopio
  js/beams.js              i fasci colorati nell'aria e le linee di costruzione
  js/ui.js, main.js
labs/lenti/                lenti e immagini
  js/optics.js             lenti vere (curvature, spessori, vetri BK7 e F2), matrici ABCD, punti cardinali, raggi esatti, fuoco migliore
  js/render.js             l'immagine sullo schermo seguendo i raggi nella GPU (accumulata), il vetro che mostra cosa c'è dietro
  js/bench.js              banco ottico, lampada con la F o collimatore, portalenti, diaframma, schermo
  js/rays.js               raggi principali, raggi veri, asse, fuochi, oggetto e immagine
  js/ui.js, main.js
labs/interferenza/         interferenza e diffrazione
  js/wave.js               ottica ondulatoria: integrale di Collins, FFT, funzioni di Bessel, colore
  js/solver.js             dalle soluzioni alle tabelle per la GPU; foglio di luce lungo il banco
  js/pattern.js            shader della figura sullo schermo e del foglio di luce
  js/bench.js              modello 3D del banco ottico
  js/ui.js, main.js
labs/fizeau/               l'esperimento di Fizeau
  js/fizeau.js             tempo di andata e ritorno, eclissi, luce che torna (serie di Fourier), misura di c
  js/rig.js                apparato del 1849 (legno e ottone) e versione moderna (laser, telecamera, tachimetro laser), fasci con gli impulsi
  js/ui.js, main.js

vendor/three/              three.js r187 (MIT), solo i moduli usati
vendor/fonts/              Fraunces, Geist, Geist Mono (SIL Open Font License)
```

## Aggiungere un laboratorio

Crea `labs/<nome>/index.html` con la stessa `importmap` verso `../../vendor/three/`, collega `../../shared/css/lab.css`, riusa i moduli di `shared/js/` e aggiungi una scheda in `index.html` dentro la sezione della sua branca (`<section class="branch" data-branch="…">`). I conteggi nei filtri si aggiornano da soli; per una branca nuova basta una sezione in più e un pulsante con lo stesso `data-f`.

Nei laboratori con qualcosa in moto ci sono anche:
- un pulsante `#pause` (tasto P) che ferma il tempo della simulazione, mentre la scena resta esplorabile;
- un interruttore «Contorno», spento all'avvio: a ogni fotogramma il laboratorio mette gli oggetti in moto in `stage.outlined` e il passaggio finale ne disegna il contorno;
- il grafico del riquadro, passato a `expandablePlot(canvas, { tools, redraw })` di `shared/js/plotview.js`, che si apre in grande.
