# Daily Plan Import

Source workbook:

```text
C:\Users\Aleksei Samosvat\Groo GmbH\Communication site - Documents\Groo Cargo Logistic\GC_Dispo\Dispo 2026 Wochenplanung_.xlsm
```

Confirmed structure:
- Each worksheet is one planning date.
- Date sheet names use `DD.MM`, for example `04.05`.
- The workbook also contains non-date sheets such as `Month` and `Sheet1`.
- Header row is row 1.

Confirmed columns in date sheets:
- `Nr.`
- `Wagen`
- `Aktiv`
- `PLZ`
- `Runde_1`
- `Runde_2`
- `Runde_3`
- `Land`
- `Info`
- `LKW gebraucht`

Example sheet `04.05`:
- 70 rows
- 25 columns
- first data row starts on row 2

## Import Rules

For each date sheet:
1. Parse the sheet name as a date in the workbook year.
2. Read row 1 as headers.
3. For each data row, resolve `Wagen` to LKW:
   - if value already matches an LKW number, use it directly.
   - if value is numeric/short, match by known alias.
   - examples:
     - `2206` -> `GR-OO2206`
     - `411` -> `KO-HH411`
     - `4295` -> `WI-QY4295`
4. Create one order per non-empty `Runde_*` cell.
5. Store `Info`, `PLZ`, `Land`, and raw row data.
6. Save unresolved aliases into import errors.
7. Save conflicts as `Problem`, but do not block import in MVP.

## Open Questions

- Confirm whether `Aktiv = 1` is green/OK and `0` or other values are Problem.
- Confirm whether `LKW gebraucht` is informational only or should create demand rows.
- Confirm whether future sheets can have `Runde_4` or more.

