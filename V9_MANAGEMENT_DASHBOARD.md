# v9 — Management Dashboard

Dashboard priorities:
1. Total comenzi
2. În limite
3. Avertizări
4. Critice
5. Kg comandate / pregătite / lipsă
6. Listă rapidă a comenzilor critice și a avertizărilor
7. Acces direct la Detalii
8. Pragurile rămân configurabile în Management

Command severity remains the maximum product severity:
critical > warning > ok.

The shortage calculation remains:
missing_pct = (ordered - picked) / ordered * 100
