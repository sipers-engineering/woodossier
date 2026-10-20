# WooDossier

Lokale voorbereiding van Nederlandse Woo-verzoeken door The Dark Store. WooDossier is onafhankelijk van de overheid. Het stelt een verzoek op en exporteert het ter beoordeling door de gebruiker, met een optionele browser-lokale casusomgeving. Het verstuurt nooit een verzoek, authenticeert geen gebruiker, slaat geen casusinvoer op de server op en berekent geen definitieve wettelijke termijn.

Vereist Node.js 22 of nieuwer:

```powershell
npm ci
npm run typecheck
npm test
npm run build
npm start
```

Open `http://127.0.0.1:4320/`. De losstaande pagina heeft een invulformulier, een printweergave, platte-tekst export van het verzoek, draagbare JSON-dossierexport, een handmatige gebeurtenistentijdlijn en planningsonderdelen. `WOODOSSIER_PORT` overschrijft poort 4320. De service bindt alleen aan `127.0.0.1` en accepteert alleen loopback-hostnamen. Serverinvoer wordt per verzoek in het geheugen verwerkt; er zijn geen casuslogs, geen analytics, geen serveropslag en geen externe opzoekingen tijdens gebruik. Een casus opslaan is een expliciete browser-lokale actie.

## Volledige lokale casusflow

1. Vul organisatie, onderwerp en optionele verzoek-/contactvelden in en kies **Maak concept**. Beoordeel de brief en exporteer de tekst of print hem.
2. Geef het dossier een naam. Leg zelf status, referentie en optionele vervolgactie/datum vast. Deze velden bevestigen geen indiening, ontvangst of besluit door de overheid. Een eigen actiedatum wordt nooit als wettelijke termijn gepresenteerd.
3. Voer gedocumenteerde gebeurtenissen in, waaronder de verzenddatum van het verzoek en eventuele ontvangst/besluit. **Neem verzoek en gebeurtenissen over** kopieert die feiten en de contactgegevens van het verzoek naar het planningsformulier. De optionele modelcontactvelden zijn apart te beoordelen en te bewerken; geïmporteerde modelcontactgegevens blijven onafhankelijk van de verzoekcontactgegevens bewaard. Beoordeel de overige modelwaarden en maak het model; de beoordelingsdatum en onzekere juridische conclusies blijven expliciet. Vink **Neem de modelgegevens op in dit dossier** uit om het optionele model weg te laten.
4. Kies **Bewaar dossier in deze browser**. Heropen het later via de selectie voor opgeslagen casussen. Verzoek, contactvelden, handmatige gebeurtenissen, casusopvolging en optionele planningsinvoer blijven samen bewaard. Invoer wijzigen ruimt verouderde uitvoer op; opslaan genereert opnieuw de huidige brief, tijdlijn en het opgenomen model.
5. Gebruik **Exporteer heropenbaar dossier (.json)** voor een draagbare back-up. Importeer via **Heropen een dossierexport** om een kopie te openen en sla die vervolgens expliciet op. Tekstexports en oude JSON-resultaten van alleen de engine zijn geen heropenbare casuspakketten. **Exporteer eigen actie (.ics)** exporteert de eigen vervolgactiedatum apart van de modelagenda.

De opslagsleutel is `woodossier.cases.v1` in de lokale opslag van de browser voor exact die origin. Gebruik het stabiele adres `http://127.0.0.1:4320/`: `localhost`, een andere poort, een andere browser/profiel of privévenster heeft eigen opslag. Er is geen servergegevensmap nodig. Het verwijderen van browsergegevens kan de lokale lijst verwijderen; de geëxporteerde JSON is de back-up. Opgeslagen/geëxporteerde dossiers bevatten ingevoerde contactgegevens — gebruik een persoonlijk apparaat en beveilig back-ups. Casussen worden door deze app niet versleuteld.

`POST /api/dossier` valideert het versie-1 pakket `{product:"WooDossier", kind:"case", version:1, case:{...}}` en geeft opnieuw gegenereerde `outputs` terug met brief, tijdlijn, optioneel model en optionele eigen-actiekalender. Geïmporteerde outputs worden verworpen. Onbekende versies/velden, ongeldige geneste invoer en onmogelijke datums worden afgewezen. Het deelt de 64 KiB bodylimiet, same-origin-controles en no-store responses van de andere endpoints. Het schrijft niets naar schijf. Foutieve imports laten de geopende casus intact; onleesbare of geblokkeerde opslag wordt gemeld zonder bestaande records te vervangen, en een nieuwere opgeslagen kopie uit een ander tabblad wordt niet overschreven.

API: `POST /api/prepare` accepteert `intent` (`public_documents`, `personal_data`, `complaint`, `appeal`), plus `authority` en `topic` voor een Woo-concept. Optionele `documentTypes` en `keywords` zijn arrays; `dateFrom` en `dateTo` zijn ISO-datums; `contact` kan `name`, `email`, `postalAddress` en `phone` bevatten. Andere velden en ongeldige of omgekeerde datums worden afgewezen. `POST /api/timeline` accepteert een optionele `authority` en maximaal 30 handmatig ingevoerde `{type,date,note}` gebeurtenissen. Beide endpoints accepteren JSON met een limiet van 64 KiB.

MCP: verbind een Streamable HTTP-client met `http://127.0.0.1:4320/mcp`. Basistools zijn `prepare_woo_request` en `summarise_woo_dossier`; beide delen de HTTP-engine. `ui://woodossier/review.html` is de ingebedde beoordelingsresource. Bestandsexport vraagt de host om `ui/download-file` indien geadverteerd, anders toont het kopieerbare tekst. Officiële links gebruiken `ui/open-link` wanneer de host dat ondersteunt.

## Behouden planningsuitbreiding

De nieuwere `POST /api/escalation`, `POST /api/calendar` en MCP `evaluate_statutory_escalation` blijven lokale voorbereidingstools. Ze geven vaste kalenderdagsenario's, een illustratieve dwangsomstaffel, een beoordelingstemplate waar passend en iCalendar-export. Ze bepalen geen werkelijke wettelijke termijn, schuld of beroepsmogelijkheid. Zie `docs/RULES.md` voor de volledige model- en beperkingenspecificatie.

`requestDate` is de indieningsdatum. Optionele `receiptDate` en `ingebrekestellingReceiptDate` onderscheiden ontvangst van verzending; ontbrekende ontvangsten gebruiken expliciete modelaannames, geen geverifieerde feiten. Ontvangst van een ingebrekestelling vereist de verzenddatum. Onmogelijke chronologie en Woo-verlengingen boven 14 dagen worden afgewezen. De vaste 56 dagen van het generieke Awb-model zijn geen universele wettelijke termijn: zie de [Rijksoverheid-uitleg](https://www.rijksoverheid.nl/themas/overheid-en-democratie/bezwaar-en-beroep/vraag-en-antwoord/bezwaar-en-beroep/beslissing-aanvraag-bezwaar-te-laat) en de [officiële Woo-instructie](https://www.rijksoverheid.nl/site/binaries/site-content/collections/documents/2022/04/01/rijksbrede-instructie-voor-het-behandelen-van-woo-verzoeken/woo-instructie.pdf). Ontvangstbewijs, geldige verlengingen/opschortingen, feestdagen en de specifieke wet vereisen beoordeling per casus.

## Licentie

Apache-2.0 — zie [LICENSE](LICENSE).
