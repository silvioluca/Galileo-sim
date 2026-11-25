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
| Meccanica | Il pendolo di Foucault | Rotazione della Terra | `labs/foucault/` |
| Meccanica | La guidovia | Dinamica e urti | `labs/guidovia/` |
| Fluidi | Caduta in un fluido viscoso | Viscosità | `labs/viscosita/` |
| Fluidi | La spinta di Archimede | Idrostatica | `labs/archimede/` |
| Fluidi | Il principio di Bernoulli | Fluidi in moto | `labs/bernoulli/` |
| Onde | Le onde stazionarie | Corde e tubi sonori | `labs/onde/` |
| Onde | La vaschetta ondoscopica | Onde sull'acqua | `labs/vaschetta/` |
| Onde | Le figure di Chladni | Lamine vibranti | `labs/chladni/` |
| Ottica | La macchina fotografica | Ottica geometrica | `labs/fotocamera/` |
| Ottica | Il prisma ottico | Ottica geometrica | `labs/prisma/` |
| Ottica | Lenti e immagini | Ottica geometrica | `labs/lenti/` |
| Ottica | Il kit di ottica | Raggi luminosi | `labs/kit-ottica/` |
| Ottica | La rifrazione della luce | Rifrazione | `labs/rifrazione/` |
| Ottica | La polarizzazione della luce | Polarizzazione | `labs/polarizzazione/` |
| Ottica | Interferenza e diffrazione | Ottica ondulatoria | `labs/interferenza/` |
| Ottica | L'esperimento di Fizeau | Velocità della luce | `labs/fizeau/` |
| Elettricità | Le leggi di Ohm | Circuiti | `labs/ohm/` |
| Magnetismo | Il campo magnetico | Campo magnetico | `labs/campo-magnetico/` |
| Magnetismo | Le esperienze di Ampère e di Faraday | Forze magnetiche | `labs/ampere-faraday/` |

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
labs/foucault/             il pendolo di Foucault
  js/pendulum.js           pendolo sferico nel riferimento della Terra (Coriolis con Ω intero, g(φ), aria), spinta, anello di Charron, piano misurato
  js/rig.js                quadrante con rosa dei venti, peso d'ottone, filo, travi e anello in alto, paletto col filo da bruciare, birilli, traccia
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
labs/bernoulli/            il principio di Bernoulli
  js/flow.js               tubo di Venturi (continuità, bilancio dell'energia con attrito di Darcy e perdite localizzate, portata), getto d'aria e pallina
  js/rig.js                pannello con la scala, serbatoio a livello costante, tubo trasparente, tubicini e tubi di Pitot, valvola, becher, aspiratore; asciugacapelli, pallina, fumo, asta
  js/ui.js, main.js

Onde
labs/onde/                 le onde stazionarie
  js/waves.js              equazione delle onde smorzata alle differenze finite (corda e colonna d'aria), soluzione a regime, stroboscopio
  js/rig.js                tavolo, vibratore, corda, carrucola e pesi, generatore di funzioni, stroboscopio; tubo a cannocchiale, altoparlante, particelle, polvere di sughero
  js/ui.js, main.js
labs/vaschetta/            la vaschetta ondoscopica
  js/ripple.js             dispersione delle increspature (gravità e tensione superficiale), interferenza e diffrazione di Huygens, Doppler
  js/tank.js               l'acqua nella scheda grafica: equazione delle onde su 400 × 400 celle, pareti, sorgenti, la luce sul foglio
  js/rig.js                vasca col fondo di vetro, generatore di vibrazioni su sostegno con braccio, punte e barra, carrello, ostacoli, spiagge, lampada, foglio; specchio a 45° e schermo
  js/ui.js, main.js
labs/chladni/              le figure di Chladni
  js/plate.js              lamine (forme, materiali), modi propri con il metodo di Ritz (polinomi di Legendre, quadratura di Gauss), morsetto
  js/eigen.js              autovalori di matrici simmetriche (Householder e QL)
  js/worker.js             il calcolo dei modi in un thread a parte
  js/field.js              risposta forzata al vibratore, sintesi del campo sulla griglia, scelta del modo che suona con l'archetto e il dito
  js/sand.js               i granelli: salti dove la lamina accelera più di g, strisciamento verso i nodi, frane, licopodio verso i ventri, caduta dal bordo
  js/rig.js                lamina deformabile, vibratore, generatore con display, cavi, sostegno con morsetto, archetto, dito, granelli, linee nodali
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
labs/kit-ottica/           il kit di ottica da lavagna
  js/shapes.js             i pezzi del kit (segmenti e archi), indice dell'acrilico (Sellmeier), focali nominali
  js/trace.js              raggi in 2D: Snell, Fresnel, riflessione totale, specchi, fuoco dei raggi usciti
  js/board.js              lavagna su cavalletto, foglio goniometrico, laser magnetico, pezzi di acrilico, manopola
  js/beams.js              i raggi laser sul foglio, normali, angoli, prolungamenti
  js/ui.js, main.js
labs/rifrazione/           la rifrazione della luce
  js/optics.js             mezzi (Cauchy), Snell e Fresnel, tracciamento del fascio con i riflessi parziali e la riflessione totale
  js/scenes.js             la vasca (pareti di vetro, liquido, olio, getto della fontana di Torricelli) e il disco ottico di Hartl
  js/rig.js                acquario su sollevatore, laser su sostegno, goniometro sul vetro, disco graduato con il mezzo cilindro, fasci e macchie di luce
  js/ui.js, main.js
labs/polarizzazione/       la polarizzazione della luce
  js/optics.js             vettori di Stokes e matrici di Mueller, luce bianca per lunghezze d'onda, zucchero, Fresnel e Brewster, sforzi nel disco compresso, tabella dei colori del polariscopio
  js/rig.js                banco ottico con montature graduate, lamine, tubo dello zucchero, schermo e fotometro; piatto girevole con la lastra e il laser; scatola luminosa, pressa e finestra dell'analizzatore (shader); fasci e frecce del campo elettrico
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

Elettricità
labs/ohm/                  le leggi di Ohm
  js/circuit.js            alimentatore CV/CC, amperometro e voltmetro con le resistenze interne (a monte e a valle), resistori che scaldano e bruciano, lampadina a filamento (bilancio σT⁴), LED (legge del diodo), fili R = ρL/S
  js/rig.js                alimentatore con i display, multimetri sul cavalletto, resistore assiale e LED presi con le pinze a coccodrillo, lampadina E10 nel portalampada sulla basetta con i morsetti, filo teso fra due isolatori su asta e banco a sei fili con la pinza che scorre e il metro, cavi con spine a banana, corrente, fumo
  js/ui.js, main.js

Magnetismo
labs/campo-magnetico/      il campo magnetico
  js/field.js              magneti (cariche magnetiche sulle facce polari), filo (Biot–Savart per segmenti), spire (integrali ellittici), campo terrestre, griglia sulla lastra, linee di campo ugualmente spaziate (Jobard–Lefer) e linee nello spazio (Runge–Kutta)
  js/filings.js            la limatura: sparsa, poi a ogni colpo girata lungo il campo e messa in catene lungo le linee; i granelli si rizzano sopra i poli
  js/rig.js                lastra di plexiglas su piedini o su gambe, magneti di ferrite, filo, spira e solenoide con le basette, alimentatore da 20 A, bussole, linee di campo sulla lastra e nello spazio con le frecce, teslametro con la sonda di Hall
  js/ui.js, main.js
labs/ampere-faraday/       le esperienze di Ampère e di Faraday
  js/physics.js            altalena di Faraday fra i poli (F = I L × B, pendolo smorzato), strisce di Ampère (corde tese con la forza μ0 I1 I2 / 2πd, contatto)
  js/rig.js                colonnine con i ganci, altalena d'ottone, magneti a U sul rialzo, goniometro; portale con le strisce di alluminio, mollette, ponticelli, righello, campo a metà altezza; alimentatore per correnti forti, cavi, frecce di I, B e F
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
