# Data files

Every country lives in `resources/countries/<id>/`:

| Path                                     | Contents                                                        |
|------------------------------------------|-----------------------------------------------------------------|
| `country.yaml`                           | The country's name in English and Dutch                         |
| `flag.svg`                               | The flag shown in the "Election data" selector                  |
| `elections/<id>/vote_totals.yaml`        | One election: date, electorate, turnout, votes per party        |
| `elections/<id>/voters_movement/*.yaml`  | Optional voter movements into each party (with a `source.yaml`) |
| `coalitions/*.yaml`                      | One cabinet or government: date, parties and seats              |
| `parties/*.yaml`                         | One party: name, colour and relations to other parties          |

An election id is its year, or `YYYY-MM` when a country held two elections in one year (`1974-02`).
The data tests (`npm run test:data`) check every file; see `tests/data/consistency.test.ts`.

## Cabinets and governments

```yaml
name: Rutte IV
inauguration: 2022-01-10
coalition: [vvd, d66, cda, christenunie]   # governing parties
support: []                                # parties supporting it from outside
seats: {vvd: 34, d66: 24, ...}             # seats from the election before it
```

The first cabinet after an election carries that election's seats. A technocratic government can have an empty
`coalition` and only `support`.

## Relations between parties

Party files can describe how parties relate over time. The parliament diagram draws them as lines between
cabinets: between the last cabinet before the change and the first one after it.

| Field            | Meaning                                                                                 | Example                                   |
|------------------|-----------------------------------------------------------------------------------------|-------------------------------------------|
| `previous_names` | The party continues, or merged, these parties.                                          | CDA: `[kvp, arp, chu]`                    |
| `split_off`      | The party split off from this party.                                                    | PVV: `[vvd]`                              |
| `alliance_of`    | The party is a temporary joint list or alliance of these parties, which may run separately again afterwards. | Unidas Podemos: `[podemos, iu]` |
| `rejoined`       | When the party ended, it went back into this party.                                     | KNP: `[kvp]` (split 1948, back 1955)      |

Lines are drawn whenever a party appears, reappears or disappears, not only the first time. A temporary split and
return, or an alliance that forms, breaks up and forms again, is therefore shown each time. A member that keeps
running on its own next to an alliance (the PP next to Navarra Suma) is not drawn into it.
